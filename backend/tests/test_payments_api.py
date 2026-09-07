
from app.services import payfast as payfast_service


CHECKOUT_ADDRESS = {
    "customer_email": "notify-test@example.com",
    "customer_name": "Notify Test",
    "shipping_address": "1 Main Road",
    "city": "Cape Town",
    "postal_code": "8001",
    "province": "Western Cape",
}


async def _create_order(client, unique_session_key, seeded_products):
    product_a = seeded_products["product_a"]  # R499, below free-shipping threshold
    await client.post(
        f"/api/cart/{unique_session_key}/items",
        json={"product_id": str(product_a.id), "quantity": 1},
    )
    checkout_resp = await client.post(
        "/api/orders/checkout", json={"session_key": unique_session_key, **CHECKOUT_ADDRESS}
    )
    assert checkout_resp.status_code == 200
    return checkout_resp.json()


async def test_notify_rejects_invalid_signature(client, unique_session_key, seeded_products):
    order = await _create_order(client, unique_session_key, seeded_products)
    resp = await client.post(
        "/api/payments/payfast/notify",
        data={"m_payment_id": order["order_id"], "signature": "not-the-real-signature"},
    )
    assert resp.status_code == 400
    assert "invalid signature" in resp.text


async def test_notify_marks_order_paid_on_valid_complete_payment(
    client, unique_session_key, seeded_products, monkeypatch
):
    order = await _create_order(client, unique_session_key, seeded_products)

    async def fake_verify_itn(_data):
        return True

    monkeypatch.setattr(payfast_service, "verify_itn_with_payfast", fake_verify_itn)
    # payments.py imported the function directly, so patch that reference too.
    from app.api.routes import payments as payments_route

    monkeypatch.setattr(payments_route, "verify_itn_with_payfast", fake_verify_itn)

    fields = {
        "m_payment_id": order["order_id"],
        "pf_payment_id": "PF12345",
        "payment_status": "COMPLETE",
        "amount_gross": "598.00",  # 499 subtotal + 99 shipping
    }
    fields["signature"] = payfast_service.build_signature(fields)

    resp = await client.post("/api/payments/payfast/notify", data=fields)
    assert resp.status_code == 200

    order_resp = await client.get(f"/api/orders/{order['order_id']}")
    assert order_resp.json()["status"] == "paid"


async def test_notify_rejects_amount_mismatch(
    client, unique_session_key, seeded_products, monkeypatch
):
    order = await _create_order(client, unique_session_key, seeded_products)

    async def fake_verify_itn(_data):
        return True

    from app.api.routes import payments as payments_route

    monkeypatch.setattr(payments_route, "verify_itn_with_payfast", fake_verify_itn)

    fields = {
        "m_payment_id": order["order_id"],
        "payment_status": "COMPLETE",
        "amount_gross": "1.00",  # wrong amount
    }
    fields["signature"] = payfast_service.build_signature(fields)

    resp = await client.post("/api/payments/payfast/notify", data=fields)
    assert resp.status_code == 400
    assert "amount mismatch" in resp.text

    order_resp = await client.get(f"/api/orders/{order['order_id']}")
    assert order_resp.json()["status"] == "pending"


async def test_notify_unknown_order_404s(client, monkeypatch):
    async def fake_verify_itn(_data):
        return True

    from app.api.routes import payments as payments_route

    monkeypatch.setattr(payments_route, "verify_itn_with_payfast", fake_verify_itn)

    fields = {
        "m_payment_id": "00000000-0000-0000-0000-000000000000",
        "payment_status": "COMPLETE",
        "amount_gross": "100.00",
    }
    fields["signature"] = payfast_service.build_signature(fields)

    resp = await client.post("/api/payments/payfast/notify", data=fields)
    assert resp.status_code == 404


async def test_notify_rejects_malformed_order_id(client, monkeypatch):
    """A non-UUID m_payment_id must be a clean 400, not a 500 from the
    database driver choking on an unparseable id."""

    async def fake_verify_itn(_data):
        return True

    from app.api.routes import payments as payments_route

    monkeypatch.setattr(payments_route, "verify_itn_with_payfast", fake_verify_itn)

    fields = {
        "m_payment_id": "not-a-uuid",
        "payment_status": "COMPLETE",
        "amount_gross": "100.00",
    }
    fields["signature"] = payfast_service.build_signature(fields)

    resp = await client.post("/api/payments/payfast/notify", data=fields)
    assert resp.status_code == 400
    assert "malformed order id" in resp.text


async def test_notify_rejects_malformed_amount(
    client, unique_session_key, seeded_products, monkeypatch
):
    order = await _create_order(client, unique_session_key, seeded_products)

    async def fake_verify_itn(_data):
        return True

    from app.api.routes import payments as payments_route

    monkeypatch.setattr(payments_route, "verify_itn_with_payfast", fake_verify_itn)

    fields = {
        "m_payment_id": order["order_id"],
        "payment_status": "COMPLETE",
        "amount_gross": "R five hundred",
    }
    fields["signature"] = payfast_service.build_signature(fields)

    resp = await client.post("/api/payments/payfast/notify", data=fields)
    assert resp.status_code == 400
    assert "malformed amount" in resp.text


async def test_notify_accepts_itn_signature_including_empty_fields(
    client, unique_session_key, seeded_products, monkeypatch
):
    """Payfast's ITN sample signs every field as received, including the
    empty ones. Such a notification must be accepted, otherwise a real
    order would silently never be marked paid."""
    order = await _create_order(client, unique_session_key, seeded_products)

    async def fake_verify_itn(_data):
        return True

    from app.api.routes import payments as payments_route

    monkeypatch.setattr(payments_route, "verify_itn_with_payfast", fake_verify_itn)

    fields = {
        "m_payment_id": order["order_id"],
        "pf_payment_id": "PF-EMPTY-FIELDS",
        "payment_status": "COMPLETE",
        "amount_gross": "598.00",
        "custom_str1": "",  # empty field, signed rather than skipped
    }
    fields["signature"] = payfast_service.build_signature(fields, skip_empty=False)

    resp = await client.post("/api/payments/payfast/notify", data=fields)
    assert resp.status_code == 200

    order_resp = await client.get(f"/api/orders/{order['order_id']}")
    assert order_resp.json()["status"] == "paid"


async def test_paid_order_is_not_walked_back_by_a_later_failed_notification(
    client, unique_session_key, seeded_products, monkeypatch
):
    order = await _create_order(client, unique_session_key, seeded_products)

    async def fake_verify_itn(_data):
        return True

    from app.api.routes import payments as payments_route

    monkeypatch.setattr(payments_route, "verify_itn_with_payfast", fake_verify_itn)

    paid = {
        "m_payment_id": order["order_id"],
        "pf_payment_id": "PF12345",
        "payment_status": "COMPLETE",
        "amount_gross": "598.00",
    }
    paid["signature"] = payfast_service.build_signature(paid)
    assert (await client.post("/api/payments/payfast/notify", data=paid)).status_code == 200

    failed = {
        "m_payment_id": order["order_id"],
        "pf_payment_id": "PF12345",
        "payment_status": "FAILED",
        "amount_gross": "598.00",
    }
    failed["signature"] = payfast_service.build_signature(failed)
    assert (await client.post("/api/payments/payfast/notify", data=failed)).status_code == 200

    order_resp = await client.get(f"/api/orders/{order['order_id']}")
    assert order_resp.json()["status"] == "paid"


async def test_paid_order_reduces_stock_exactly_once(
    client, unique_session_key, seeded_products, monkeypatch
):
    product_a = seeded_products["product_a"]
    starting_stock = product_a.stock

    order = await _create_order(client, unique_session_key, seeded_products)

    async def fake_verify_itn(_data):
        return True

    from app.api.routes import payments as payments_route

    monkeypatch.setattr(payments_route, "verify_itn_with_payfast", fake_verify_itn)

    fields = {
        "m_payment_id": order["order_id"],
        "pf_payment_id": "PF12345",
        "payment_status": "COMPLETE",
        "amount_gross": "598.00",
    }
    fields["signature"] = payfast_service.build_signature(fields)

    # Payfast retries until it gets a 200, so the same ITN can arrive twice.
    assert (await client.post("/api/payments/payfast/notify", data=fields)).status_code == 200
    assert (await client.post("/api/payments/payfast/notify", data=fields)).status_code == 200

    product_resp = await client.get(f"/api/products/{product_a.slug}")
    assert product_resp.json()["stock"] == starting_stock - 1
