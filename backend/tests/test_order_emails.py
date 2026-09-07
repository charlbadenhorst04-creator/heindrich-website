"""Order notification emails, tested against a real local SMTP server.

The messages are delivered over an actual socket and read back from the
receiving end, so these cover the parts a mock would not: that the address
headers are formed correctly, that both messages are actually accepted by a
server, and that the body carries what the shop owner needs to ship.
"""

import email
import email.policy
import smtplib
import socket
from email.message import EmailMessage

import pytest
from aiosmtpd.controller import Controller

from app.core.config import settings
from app.services import email as email_service
from app.services.payfast import build_signature

CHECKOUT_ADDRESS = {
    "customer_email": "buyer@example.com",
    "customer_name": "Thandi Mokoena",
    "shipping_address": "12 Long Street",
    "city": "Cape Town",
    "postal_code": "8001",
    "province": "Western Cape",
    "phone": "0821234567",
}


class _Collector:
    """Minimal SMTP handler that keeps every message it is handed."""

    def __init__(self) -> None:
        self.messages: list[EmailMessage] = []

    async def handle_DATA(self, server, session, envelope):  # noqa: N802 - aiosmtpd API
        # policy=default gives the modern EmailMessage API (get_body), rather
        # than the legacy Message the compat32 default would return.
        self.messages.append(
            email.message_from_bytes(envelope.content, policy=email.policy.default)
        )
        return "250 Message accepted"


class _FakeOrderItem:
    def __init__(self, name: str, quantity: int, unit_price: float) -> None:
        self.product_name, self.quantity, self.unit_price = name, quantity, unit_price


class _FakeOrder:
    """A stand-in order for tests that exercise the mail layer on its own,
    without going through cart -> checkout -> ITN."""

    id = "11111111-2222-3333-4444-555555555555"
    customer_name = "Thandi Mokoena"
    customer_email = "buyer@example.com"
    phone = "0821234567"
    shipping_address = "12 Long Street"
    city = "Cape Town"
    province = "Western Cape"
    postal_code = "8001"
    courier = "Aramex"
    subtotal_amount = 499.00
    shipping_fee = 99.00
    total_amount = 598.00
    items = [_FakeOrderItem("Test Product A", 1, 499.00)]


def _free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


@pytest.fixture
def smtp_server(monkeypatch):
    """A real SMTP server on a free port, with settings pointed at it."""
    collector = _Collector()
    port = _free_port()
    controller = Controller(collector, hostname="127.0.0.1", port=port)
    controller.start()

    monkeypatch.setattr(settings, "SMTP_HOST", "127.0.0.1")
    monkeypatch.setattr(settings, "SMTP_PORT", port)
    monkeypatch.setattr(settings, "SMTP_USE_TLS", False)
    monkeypatch.setattr(settings, "SMTP_USERNAME", "")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "")
    monkeypatch.setattr(settings, "MAIL_FROM", "shop@meravo.test")
    monkeypatch.setattr(settings, "SHOP_OWNER_EMAIL", "heinrich@meravo.test")

    yield collector
    controller.stop()


async def _paid_order(client, unique_session_key, seeded_products, monkeypatch):
    """Take a product through cart -> checkout -> a confirmed Payfast ITN."""
    product_a = seeded_products["product_a"]  # R499 + R99 shipping
    await client.post(
        f"/api/cart/{unique_session_key}/items",
        json={"product_id": str(product_a.id), "quantity": 1},
    )
    checkout = await client.post(
        "/api/orders/checkout", json={"session_key": unique_session_key, **CHECKOUT_ADDRESS}
    )
    assert checkout.status_code == 200
    order_id = checkout.json()["order_id"]

    async def fake_verify_itn(_data):
        return True

    from app.api.routes import payments as payments_route

    monkeypatch.setattr(payments_route, "verify_itn_with_payfast", fake_verify_itn)

    fields = {
        "m_payment_id": order_id,
        "pf_payment_id": "PF-EMAIL-TEST",
        "payment_status": "COMPLETE",
        "amount_gross": "598.00",
    }
    fields["signature"] = build_signature(fields)
    return order_id, fields


async def test_paid_order_emails_both_the_shop_and_the_customer(
    client, unique_session_key, seeded_products, monkeypatch, smtp_server
):
    order_id, fields = await _paid_order(client, unique_session_key, seeded_products, monkeypatch)

    resp = await client.post("/api/payments/payfast/notify", data=fields)
    assert resp.status_code == 200

    assert len(smtp_server.messages) == 2, "expected one email to the shop and one to the customer"

    by_recipient = {m["To"]: m for m in smtp_server.messages}
    assert set(by_recipient) == {"heinrich@meravo.test", "buyer@example.com"}

    owner = by_recipient["heinrich@meravo.test"]
    customer = by_recipient["buyer@example.com"]

    # Both must come from the configured sender.
    for message in (owner, customer):
        assert "shop@meravo.test" in message["From"]

    # The shop owner's copy has to be enough to actually pack and ship.
    owner_body = owner.get_body(preferencelist=("plain",)).get_content()
    assert order_id in owner_body
    assert "Thandi Mokoena" in owner_body
    assert "buyer@example.com" in owner_body
    assert "0821234567" in owner_body
    assert "12 Long Street" in owner_body
    assert "Cape Town" in owner_body
    assert "Test Product A" in owner_body
    assert "R 598.00" in owner_body
    # Replying should reach the customer, not the shop's own inbox.
    assert owner["Reply-To"] == "buyer@example.com"

    # The customer's copy is their receipt.
    customer_body = customer.get_body(preferencelist=("plain",)).get_content()
    assert order_id in customer_body
    assert "Thandi Mokoena" in customer_body
    assert "R 598.00" in customer_body
    assert "Aramex" in customer_body
    assert customer["Reply-To"] == "heinrich@meravo.test"

    # Both carry an HTML alternative as well as plain text.
    for message in (owner, customer):
        assert message.get_body(preferencelist=("html",)) is not None


async def test_repeated_notification_does_not_email_twice(
    client, unique_session_key, seeded_products, monkeypatch, smtp_server
):
    """Payfast retries an ITN until it gets a 200, so the same confirmation
    arrives more than once. The customer must not be emailed each time."""
    _, fields = await _paid_order(client, unique_session_key, seeded_products, monkeypatch)

    first = await client.post("/api/payments/payfast/notify", data=fields)
    second = await client.post("/api/payments/payfast/notify", data=fields)

    assert first.status_code == 200
    assert second.status_code == 200
    assert len(smtp_server.messages) == 2, "the retry sent a duplicate set of emails"


async def test_mail_failure_never_costs_a_confirmed_order(
    client, unique_session_key, seeded_products, monkeypatch, smtp_server
):
    """A broken mail server must not turn a paid order into a failed
    callback: Payfast retries anything that isn't a 200, and an order that
    someone has genuinely paid for would be left unconfirmed."""
    order_id, fields = await _paid_order(client, unique_session_key, seeded_products, monkeypatch)

    def explode(*_args, **_kwargs):
        raise smtplib.SMTPException("mail server is down")

    monkeypatch.setattr(email_service, "_send", explode)

    resp = await client.post("/api/payments/payfast/notify", data=fields)

    assert resp.status_code == 200
    order = await client.get(f"/api/orders/{order_id}")
    assert order.json()["status"] == "paid"


async def test_sending_is_skipped_when_smtp_is_not_configured(
    client, unique_session_key, seeded_products, monkeypatch, smtp_server
):
    """Local and sandbox setups have no mail server; that must be a no-op
    rather than an error on every paid order."""
    monkeypatch.setattr(settings, "SMTP_HOST", "")
    order_id, fields = await _paid_order(client, unique_session_key, seeded_products, monkeypatch)

    resp = await client.post("/api/payments/payfast/notify", data=fields)

    assert resp.status_code == 200
    assert smtp_server.messages == []
    order = await client.get(f"/api/orders/{order_id}")
    assert order.json()["status"] == "paid"


async def test_authenticated_smtp_login_is_used(monkeypatch, seeded_products):
    """The shop sends through Gmail, which requires a username and an app
    password. Exercise that branch against a server that refuses unauthenticated
    mail, so a broken login shows up here rather than as silence in production."""
    from aiosmtpd.smtp import AuthResult, LoginPassword

    collector = _Collector()
    seen_credentials: list[LoginPassword] = []

    def authenticator(_server, _session, _envelope, mechanism, auth_data):
        seen_credentials.append(auth_data)
        ok = auth_data.login == b"shop@meravo.test" and auth_data.password == b"app-password-123"
        return AuthResult(success=ok)

    port = _free_port()
    controller = Controller(
        collector,
        hostname="127.0.0.1",
        port=port,
        authenticator=authenticator,
        auth_require_tls=False,
    )
    controller.start()
    try:
        monkeypatch.setattr(settings, "SMTP_HOST", "127.0.0.1")
        monkeypatch.setattr(settings, "SMTP_PORT", port)
        monkeypatch.setattr(settings, "SMTP_USE_TLS", False)
        monkeypatch.setattr(settings, "SMTP_USERNAME", "shop@meravo.test")
        monkeypatch.setattr(settings, "SMTP_PASSWORD", "app-password-123")
        monkeypatch.setattr(settings, "MAIL_FROM", "")  # falls back to SMTP_USERNAME
        monkeypatch.setattr(settings, "SHOP_OWNER_EMAIL", "heinrich@meravo.test")

        order = _FakeOrder()
        email_service.send_order_emails(order)

        assert len(collector.messages) == 2
        assert seen_credentials, "the client never authenticated"
        assert seen_credentials[0].login == b"shop@meravo.test"
        # MAIL_FROM was blank, so the sender falls back to the SMTP username.
        assert "shop@meravo.test" in collector.messages[0]["From"]
    finally:
        controller.stop()
