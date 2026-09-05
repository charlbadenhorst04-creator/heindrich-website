
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
