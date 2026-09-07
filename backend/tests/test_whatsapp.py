"""WhatsApp order confirmation.

The provider calls are exercised against a real local HTTP server rather
than a mock, so the tests see the exact request that would go to Meta or
Twilio - URL, auth header, and body.
"""

import json
import socket
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs

import httpx
import pytest

from app.core.config import settings
from app.services import whatsapp as wa
from app.services.whatsapp import normalise_msisdn


class _FakeOrderItem:
    def __init__(self, name: str, quantity: int, unit_price: float) -> None:
        self.product_name, self.quantity, self.unit_price = name, quantity, unit_price


class _FakeOrder:
    id = "11111111-2222-3333-4444-555555555555"
    customer_name = "Thandi Mokoena"
    customer_email = "buyer@example.com"
    phone = "082 123 4567"
    shipping_address = "12 Long Street"
    city = "Cape Town"
    province = "Western Cape"
    postal_code = "8001"
    courier = "Aramex"
    subtotal_amount = 499.00
    shipping_fee = 99.00
    total_amount = 598.00
    items = [_FakeOrderItem("Test Product A", 1, 499.00)]


# --- phone numbers ---------------------------------------------------------
# Everything a South African shopper might realistically type into the form.


@pytest.mark.parametrize(
    "typed,expected",
    [
        ("0821234567", "27821234567"),
        ("082 123 4567", "27821234567"),
        ("082-123-4567", "27821234567"),
        ("(082) 123 4567", "27821234567"),
        ("+27821234567", "27821234567"),
        ("+27 82 123 4567", "27821234567"),
        ("0027821234567", "27821234567"),
        ("27821234567", "27821234567"),
        ("067 157 2670", "27671572670"),
    ],
)
def test_local_numbers_become_international(typed, expected):
    assert normalise_msisdn(typed) == expected


@pytest.mark.parametrize(
    "typed",
    [
        "",
        "   ",
        "not a phone number",
        "12345",  # too short to be a real number
        "0821234567890123456",  # too long
        "821234567",  # no leading 0, no country code - genuinely ambiguous
    ],
)
def test_unusable_numbers_are_rejected_rather_than_guessed(typed):
    assert normalise_msisdn(typed) is None


def test_country_code_is_configurable():
    assert normalise_msisdn("0821234567", country_code="44") == "44821234567"


# --- provider requests -----------------------------------------------------


class _Capture(BaseHTTPRequestHandler):
    requests: list[dict] = []
    status = 200
    body = b'{"messages":[{"id":"wamid.TEST"}]}'

    def do_POST(self):  # noqa: N802 - http.server API
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        type(self).requests.append(
            {
                "path": self.path,
                "headers": dict(self.headers),
                "raw": raw,
            }
        )
        self.send_response(type(self).status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(type(self).body)

    def log_message(self, *_args):
        pass  # keep the test output clean


@pytest.fixture
def provider_server():
    """A real HTTP server standing in for the provider's API."""
    _Capture.requests = []
    _Capture.status = 200
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    server = HTTPServer(("127.0.0.1", port), _Capture)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{port}", _Capture
    server.shutdown()


async def test_meta_request_is_an_approved_template_with_the_right_values(
    monkeypatch, provider_server
):
    base_url, capture = provider_server
    monkeypatch.setattr(settings, "WHATSAPP_PROVIDER", "meta")
    monkeypatch.setattr(settings, "WHATSAPP_PHONE_NUMBER_ID", "PHONE_ID")
    monkeypatch.setattr(settings, "WHATSAPP_ACCESS_TOKEN", "SECRET_TOKEN")
    monkeypatch.setattr(settings, "WHATSAPP_TEMPLATE_NAME", "order_confirmation")
    # Point the Graph API call at the local server.
    real_post = httpx.AsyncClient.post

    async def redirected_post(self, url, **kwargs):
        return await real_post(self, url.replace("https://graph.facebook.com", base_url), **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "post", redirected_post)

    await wa.send_order_whatsapp(_FakeOrder())

    assert len(capture.requests) == 1
    request = capture.requests[0]
    assert "/PHONE_ID/messages" in request["path"]
    assert request["headers"]["Authorization"] == "Bearer SECRET_TOKEN"

    body = json.loads(request["raw"])
    assert body["messaging_product"] == "whatsapp"
    # Local "082 123 4567" must have been converted before sending.
    assert body["to"] == "27821234567"
    # Business-initiated, so it has to be a template, not free text.
    assert body["type"] == "template"
    assert body["template"]["name"] == "order_confirmation"

    values = [p["text"] for p in body["template"]["components"][0]["parameters"]]
    assert values == [
        "Thandi",
        "11111111-2222-3333-4444-555555555555",
        "R 598.00",
        "Aramex",
    ]


async def test_twilio_sandbox_request_sends_readable_text(monkeypatch, provider_server):
    base_url, capture = provider_server
    monkeypatch.setattr(settings, "WHATSAPP_PROVIDER", "twilio")
    monkeypatch.setattr(settings, "TWILIO_ACCOUNT_SID", "AC123")
    monkeypatch.setattr(settings, "TWILIO_AUTH_TOKEN", "twilio-token")
    monkeypatch.setattr(settings, "TWILIO_WHATSAPP_FROM", "+14155238886")
    monkeypatch.setattr(settings, "TWILIO_CONTENT_SID", "")  # sandbox: plain text

    real_post = httpx.AsyncClient.post

    async def redirected_post(self, url, **kwargs):
        return await real_post(self, url.replace("https://api.twilio.com", base_url), **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "post", redirected_post)

    await wa.send_order_whatsapp(_FakeOrder())

    assert len(capture.requests) == 1
    form = {k: v[0] for k, v in parse_qs(capture.requests[0]["raw"].decode()).items()}
    assert form["From"] == "whatsapp:+14155238886"
    assert form["To"] == "whatsapp:+27821234567"
    assert "Thandi" in form["Body"]
    assert "R 598.00" in form["Body"]
    assert "Aramex" in form["Body"]


async def test_twilio_uses_the_approved_template_when_one_is_configured(
    monkeypatch, provider_server
):
    base_url, capture = provider_server
    monkeypatch.setattr(settings, "WHATSAPP_PROVIDER", "twilio")
    monkeypatch.setattr(settings, "TWILIO_ACCOUNT_SID", "AC123")
    monkeypatch.setattr(settings, "TWILIO_AUTH_TOKEN", "twilio-token")
    monkeypatch.setattr(settings, "TWILIO_WHATSAPP_FROM", "+14155238886")
    monkeypatch.setattr(settings, "TWILIO_CONTENT_SID", "HX123")

    real_post = httpx.AsyncClient.post

    async def redirected_post(self, url, **kwargs):
        return await real_post(self, url.replace("https://api.twilio.com", base_url), **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "post", redirected_post)

    await wa.send_order_whatsapp(_FakeOrder())

    form = {k: v[0] for k, v in parse_qs(capture.requests[0]["raw"].decode()).items()}
    assert form["ContentSid"] == "HX123"
    assert json.loads(form["ContentVariables"]) == {
        "1": "Thandi",
        "2": "11111111-2222-3333-4444-555555555555",
        "3": "R 598.00",
        "4": "Aramex",
    }
    assert "Body" not in form


# --- it must never cost a sale --------------------------------------------


async def test_provider_rejection_is_swallowed(monkeypatch, provider_server, caplog):
    """An unapproved template or expired token returns a 4xx. That must be
    logged, not raised - the payment is already confirmed by this point."""
    base_url, capture = provider_server
    capture.status = 401
    capture.body = b'{"error":{"message":"Invalid OAuth access token"}}'

    monkeypatch.setattr(settings, "WHATSAPP_PROVIDER", "meta")
    monkeypatch.setattr(settings, "WHATSAPP_PHONE_NUMBER_ID", "PHONE_ID")
    monkeypatch.setattr(settings, "WHATSAPP_ACCESS_TOKEN", "expired")

    real_post = httpx.AsyncClient.post

    async def redirected_post(self, url, **kwargs):
        return await real_post(self, url.replace("https://graph.facebook.com", base_url), **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "post", redirected_post)

    await wa.send_order_whatsapp(_FakeOrder())  # must not raise

    assert "Invalid OAuth access token" in caplog.text


async def test_unreachable_provider_is_swallowed(monkeypatch):
    monkeypatch.setattr(settings, "WHATSAPP_PROVIDER", "meta")
    monkeypatch.setattr(settings, "WHATSAPP_PHONE_NUMBER_ID", "PHONE_ID")
    monkeypatch.setattr(settings, "WHATSAPP_ACCESS_TOKEN", "token")

    async def refuse(self, url, **kwargs):
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(httpx.AsyncClient, "post", refuse)

    await wa.send_order_whatsapp(_FakeOrder())  # must not raise


async def test_nothing_is_sent_when_disabled(monkeypatch):
    monkeypatch.setattr(settings, "WHATSAPP_PROVIDER", "")

    sent = False

    async def record(self, url, **kwargs):
        nonlocal sent
        sent = True

    monkeypatch.setattr(httpx.AsyncClient, "post", record)

    await wa.send_order_whatsapp(_FakeOrder())
    assert sent is False


async def test_order_without_a_phone_number_is_skipped(monkeypatch, provider_server):
    """The phone field is optional at checkout, so plenty of orders have none."""
    base_url, capture = provider_server
    monkeypatch.setattr(settings, "WHATSAPP_PROVIDER", "meta")
    monkeypatch.setattr(settings, "WHATSAPP_PHONE_NUMBER_ID", "PHONE_ID")
    monkeypatch.setattr(settings, "WHATSAPP_ACCESS_TOKEN", "token")

    class NoPhone(_FakeOrder):
        phone = ""

    await wa.send_order_whatsapp(NoPhone())
    assert capture.requests == []


# --- wired into the paid-order path ---------------------------------------


async def test_paid_order_triggers_a_whatsapp_message(
    client, unique_session_key, seeded_products, monkeypatch, provider_server
):
    """End to end: cart -> checkout -> confirmed Payfast ITN -> message sent
    to the number the shopper typed on the checkout form."""
    from app.api.routes import payments as payments_route
    from app.services.payfast import build_signature

    base_url, capture = provider_server
    monkeypatch.setattr(settings, "WHATSAPP_PROVIDER", "meta")
    monkeypatch.setattr(settings, "WHATSAPP_PHONE_NUMBER_ID", "PHONE_ID")
    monkeypatch.setattr(settings, "WHATSAPP_ACCESS_TOKEN", "token")

    # Redirect only the Graph API call - everything else, including this
    # test's own requests to the app, must go through untouched.
    real_post = httpx.AsyncClient.post

    async def redirected_post(self, url, **kwargs):
        return await real_post(self, str(url).replace("https://graph.facebook.com", base_url), **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "post", redirected_post)

    product_a = seeded_products["product_a"]
    await client.post(
        f"/api/cart/{unique_session_key}/items",
        json={"product_id": str(product_a.id), "quantity": 1},
    )
    checkout = await client.post(
        "/api/orders/checkout",
        json={
            "session_key": unique_session_key,
            "customer_email": "buyer@example.com",
            "customer_name": "Thandi Mokoena",
            "shipping_address": "12 Long Street",
            "city": "Cape Town",
            "postal_code": "8001",
            "province": "Western Cape",
            "phone": "082 123 4567",
        },
    )
    assert checkout.status_code == 200

    async def fake_verify_itn(_data):
        return True

    monkeypatch.setattr(payments_route, "verify_itn_with_payfast", fake_verify_itn)

    fields = {
        "m_payment_id": checkout.json()["order_id"],
        "pf_payment_id": "PF-WA-TEST",
        "payment_status": "COMPLETE",
        "amount_gross": "598.00",
    }
    fields["signature"] = build_signature(fields)

    resp = await client.post("/api/payments/payfast/notify", data=fields)
    assert resp.status_code == 200

    assert len(capture.requests) == 1, "no WhatsApp message was sent for a paid order"
    body = json.loads(capture.requests[0]["raw"])
    # The number typed on the form, converted to international form.
    assert body["to"] == "27821234567"
    assert body["template"]["name"] == settings.WHATSAPP_TEMPLATE_NAME
