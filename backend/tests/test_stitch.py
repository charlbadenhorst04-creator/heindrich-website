"""A Stitch payment end to end: the real app, a real Postgres, and a
stand-in Stitch spoken to over real HTTP (tests/fake_stitch.py).

The cases worth the most are the ones where nothing should happen: a
webhook that claims "completed" while Stitch still says pending, a forged
signature, a payment for the wrong amount or bound to another order - and
the race that matters in practice, the customer's return and Stitch's
webhook arriving at the same moment, which must sell the stock once.
"""

import asyncio
import json
import time
import uuid

import pytest
from sqlalchemy import update

from app.core.config import settings
from app.models.order import Order, OrderStatus
from app.services import stitch as stitch_service
from conftest import WEBHOOK_SECRET, TestSessionLocal
from fake_stitch import sign_webhook

CHECKOUT_ADDRESS = {
    "customer_email": "stitch-test@example.com",
    "customer_name": "Thandi Nkosi",
    "shipping_address": "12 Kloof Street",
    "city": "Cape Town",
    "postal_code": "8001",
    "province": "Western Cape",
}

COMPLETED = "PaymentInitiationRequestCompleted"
CANCELLED = "PaymentInitiationRequestCancelled"
EXPIRED = "PaymentInitiationRequestExpired"


async def _checkout(client, session_key, seeded_products, quantity=1):
    product = seeded_products["product_a"]  # R499 + R99 shipping
    await client.post(
        f"/api/cart/{session_key}/items",
        json={"product_id": str(product.id), "quantity": quantity},
    )
    return await client.post("/api/orders/checkout", json={"session_key": session_key, **CHECKOUT_ADDRESS})


async def _order(client, session_key, seeded_products, stitch):
    resp = await _checkout(client, session_key, seeded_products)
    assert resp.status_code == 200, resp.text
    order_id = resp.json()["order_id"]
    return order_id, stitch.request_for(order_id)["id"]


async def _confirm(client, order_id):
    return await client.post("/api/payments/confirm", json={"order_id": order_id})


async def _webhook(client, payload, *, secret=WEBHOOK_SECRET, sign=True, timestamp=None):
    body = json.dumps(payload).encode()
    headers = sign_webhook(body, secret, timestamp=timestamp) if sign else {"Content-Type": "application/json"}
    return await client.post("/api/payments/stitch/webhook", content=body, headers=headers)


async def _status(client, order_id):
    return (await client.get(f"/api/orders/{order_id}")).json()["status"]


async def _stock(client, product):
    return (await client.get(f"/api/products/{product.slug}")).json()["stock"]


# --- checkout ---------------------------------------------------------------


async def test_checkout_hands_the_customer_to_stitch_and_records_the_request(
    client, unique_session_key, seeded_products, stitch
):
    resp = await _checkout(client, unique_session_key, seeded_products)
    assert resp.status_code == 200
    data = resp.json()
    request = stitch.request_for(data["order_id"])

    assert data["provider"] == "stitch"
    # Stitch's page, with the shop's return address on it.
    assert data["redirect_url"].startswith(f"{stitch.url}/pay/")
    assert "redirect_uri=http%3A%2F%2Flocalhost%3A8090%2Forder-success" in data["redirect_url"]
    # Exactly the order total, bound to the order by id.
    assert request["amount"] == {"quantity": 598.0, "currency": "ZAR"}
    assert request["variables"]["beneficiaryReference"].startswith("MERAVO ")
    assert len(request["variables"]["beneficiaryReference"]) <= 20
    assert len(request["variables"]["payerReference"]) <= 12

    async with TestSessionLocal() as db:
        order = await db.get(Order, uuid.UUID(data["order_id"]))
        assert order.provider_reference == request["id"]
        assert order.status == OrderStatus.PENDING


async def test_stitch_being_down_at_checkout_is_a_plain_message_and_records_nothing(
    client, unique_session_key, seeded_products, stitch
):
    stitch.fail_create = "Internal error"
    before = len(stitch.requests)
    resp = await _checkout(client, unique_session_key, seeded_products)

    assert resp.status_code == 502
    assert "secure payment page" in resp.json()["detail"]
    assert len(stitch.requests) == before


async def test_checkout_is_closed_without_a_stitch_account(
    client, unique_session_key, seeded_products, monkeypatch
):
    """Without a Stitch account nobody can pay, so no order is recorded."""
    monkeypatch.setattr(settings, "STITCH_CLIENT_SECRET", "")

    resp = await _checkout(client, unique_session_key, seeded_products)
    assert resp.status_code == 503
    assert "WhatsApp" in resp.json()["detail"]

    config = (await client.get("/api/shipping/config")).json()
    assert config["payments_enabled"] is False
    assert config["payments_provider"] is None
    assert "WhatsApp" in config["payments_message"]


async def test_shipping_config_says_payments_are_open(client):
    config = (await client.get("/api/shipping/config")).json()
    assert config["payments_enabled"] is True
    assert config["payments_provider"] == "stitch"
    assert config["payments_message"] == ""


async def test_payments_can_be_closed_by_hand(client, unique_session_key, seeded_products, monkeypatch):
    monkeypatch.setattr(settings, "PAYMENTS_ENABLED", False)
    resp = await _checkout(client, unique_session_key, seeded_products)
    assert resp.status_code == 503


# --- confirming -------------------------------------------------------------


async def test_an_order_is_not_paid_until_stitch_itself_says_so(
    client, unique_session_key, seeded_products, stitch
):
    order_id, request_id = await _order(client, unique_session_key, seeded_products, stitch)

    resp = await _confirm(client, order_id)
    assert resp.json() == {"order_id": order_id, "status": "pending"}

    stitch.set_state(request_id, COMPLETED)
    assert (await _confirm(client, order_id)).json()["status"] == "paid"
    assert await _status(client, order_id) == "paid"


async def test_confirming_repeatedly_takes_the_stock_once(
    client, unique_session_key, seeded_products, stitch
):
    product = seeded_products["product_a"]
    order_id, request_id = await _order(client, unique_session_key, seeded_products, stitch)
    stitch.set_state(request_id, COMPLETED)
    before = await _stock(client, product)

    for _ in range(3):
        await _confirm(client, order_id)

    assert await _stock(client, product) == before - 1


async def test_the_return_page_and_the_webhook_racing_sell_the_stock_once(
    client, unique_session_key, seeded_products, stitch
):
    product = seeded_products["product_a"]
    order_id, request_id = await _order(client, unique_session_key, seeded_products, stitch)
    stitch.set_state(request_id, COMPLETED)
    before = await _stock(client, product)

    results = await asyncio.gather(
        _confirm(client, order_id),
        _webhook(client, {"data": {"id": request_id, "externalReference": order_id}}),
        _confirm(client, order_id),
        _webhook(client, {"data": {"id": request_id}}),
    )

    assert all(r.status_code == 200 for r in results)
    assert await _status(client, order_id) == "paid"
    assert await _stock(client, product) == before - 1, "the race sold the stock twice"


async def test_a_payment_for_the_wrong_amount_does_not_settle(
    client, unique_session_key, seeded_products, stitch
):
    order_id, request_id = await _order(client, unique_session_key, seeded_products, stitch)
    stitch.set_state(request_id, COMPLETED)
    stitch.override_amount[request_id] = {"quantity": 1.0, "currency": "ZAR"}

    assert (await _confirm(client, order_id)).json()["status"] == "pending"


async def test_a_completed_payment_bound_to_another_order_does_not_settle_this_one(
    client, unique_session_key, seeded_products, stitch
):
    order_id, request_id = await _order(client, unique_session_key, seeded_products, stitch)
    stitch.set_state(request_id, COMPLETED)
    stitch.override_external_reference[request_id] = str(uuid.uuid4())

    assert (await _confirm(client, order_id)).json()["status"] == "pending"


@pytest.mark.parametrize("state", [CANCELLED, EXPIRED])
async def test_a_cancelled_or_expired_payment_fails_the_order_and_keeps_the_stock(
    client, unique_session_key, seeded_products, stitch, state
):
    product = seeded_products["product_a"]
    order_id, request_id = await _order(client, unique_session_key, seeded_products, stitch)
    before = await _stock(client, product)
    stitch.set_state(request_id, state)

    assert (await _confirm(client, order_id)).json()["status"] == "failed"
    assert await _stock(client, product) == before


async def test_a_paid_order_is_never_walked_back(client, unique_session_key, seeded_products, stitch):
    order_id, request_id = await _order(client, unique_session_key, seeded_products, stitch)
    stitch.set_state(request_id, COMPLETED)
    await _confirm(client, order_id)

    stitch.set_state(request_id, CANCELLED)
    await _confirm(client, order_id)
    await _webhook(client, {"data": {"id": request_id}})

    assert await _status(client, order_id) == "paid"


async def test_an_order_already_shipped_is_not_resold_by_a_late_webhook(
    client, unique_session_key, seeded_products, stitch
):
    """The shop marks orders shipped. A webhook retried after that must not
    move it back to paid, take the stock again or re-send emails."""
    product = seeded_products["product_a"]
    order_id, request_id = await _order(client, unique_session_key, seeded_products, stitch)
    stitch.set_state(request_id, COMPLETED)
    await _confirm(client, order_id)
    async with TestSessionLocal() as db:
        await db.execute(
            update(Order).where(Order.id == uuid.UUID(order_id)).values(status=OrderStatus.SHIPPED)
        )
        await db.commit()
    before = await _stock(client, product)

    await _webhook(client, {"data": {"id": request_id, "externalReference": order_id}})
    await _confirm(client, order_id)

    assert await _status(client, order_id) == "shipped"
    assert await _stock(client, product) == before


async def test_confirm_rejects_anything_that_is_not_an_order(client):
    assert (await client.post("/api/payments/confirm", json={"order_id": "nope"})).status_code == 422
    resp = await client.post("/api/payments/confirm", json={"order_id": str(uuid.uuid4())})
    assert resp.status_code == 404


async def test_confirm_ignores_the_status_on_the_return_url(
    client, unique_session_key, seeded_products, stitch
):
    """Anyone can edit a URL. Extra fields claiming success change nothing."""
    order_id, _ = await _order(client, unique_session_key, seeded_products, stitch)
    resp = await client.post(
        "/api/payments/confirm", json={"order_id": order_id, "status": "complete"}
    )
    assert resp.json()["status"] == "pending"


# --- webhook ----------------------------------------------------------------


async def test_a_signed_webhook_settles_an_order_whose_customer_never_came_back(
    client, unique_session_key, seeded_products, stitch
):
    order_id, request_id = await _order(client, unique_session_key, seeded_products, stitch)
    stitch.set_state(request_id, COMPLETED)

    resp = await _webhook(client, {"data": {"id": request_id}})
    assert resp.status_code == 200
    assert await _status(client, order_id) == "paid"


async def test_a_webhook_claiming_completed_is_not_believed(
    client, unique_session_key, seeded_products, stitch
):
    order_id, request_id = await _order(client, unique_session_key, seeded_products, stitch)
    resp = await _webhook(
        client,
        {"data": {"id": request_id, "externalReference": order_id, "status": "PaymentInitiationRequestCompleted"}},
    )
    assert resp.status_code == 200
    assert await _status(client, order_id) == "pending"


async def test_a_forged_webhook_is_rejected_before_anything_is_looked_up(
    client, unique_session_key, seeded_products, stitch
):
    order_id, request_id = await _order(client, unique_session_key, seeded_products, stitch)
    stitch.set_state(request_id, COMPLETED)
    calls = len(stitch.graphql_calls)

    wrong_secret = "whsec_" + "QUJDREVGR0hJSktMTU5PUFFSU1RVVldY"
    assert (await _webhook(client, {"data": {"id": request_id}}, secret=wrong_secret)).status_code == 401
    assert (await _webhook(client, {"data": {"id": request_id}}, sign=False)).status_code == 401
    stale = int(time.time()) - 3600
    assert (await _webhook(client, {"data": {"id": request_id}}, timestamp=stale)).status_code == 401

    assert len(stitch.graphql_calls) == calls, "a rejected webhook still made the shop call Stitch"
    assert await _status(client, order_id) == "pending"


async def test_webhooks_are_refused_when_no_secret_is_configured(client, monkeypatch):
    monkeypatch.setattr(settings, "STITCH_WEBHOOK_SECRET", "")
    resp = await _webhook(client, {"data": {"id": "x"}})
    assert resp.status_code == 401


async def test_a_webhook_about_an_order_this_shop_never_made_is_ignored(client, stitch):
    resp = await _webhook(client, {"data": {"id": "unknown", "externalReference": str(uuid.uuid4())}})
    assert resp.status_code == 200


async def test_a_webhook_retries_when_stitch_cannot_be_reached(
    client, unique_session_key, seeded_products, stitch, monkeypatch
):
    order_id, request_id = await _order(client, unique_session_key, seeded_products, stitch)
    monkeypatch.setattr(settings, "STITCH_API_URL", "http://127.0.0.1:9/graphql")

    resp = await _webhook(client, {"data": {"id": request_id}})
    assert resp.status_code == 500  # Stitch's webhook service retries later
    # The return page still answers with what is known.
    assert (await _confirm(client, order_id)).json()["status"] == "pending"


# --- the Stitch module on its own -------------------------------------------


async def test_the_client_token_is_reused_and_dropped_on_a_401(stitch):
    stitch_service.forget_token_for_tests()
    before = len(stitch.token_requests)
    first = await stitch_service.client_token()
    second = await stitch_service.client_token()
    assert first == second
    assert len(stitch.token_requests) == before + 1


async def test_wrong_credentials_are_reported_in_plain_words(stitch):
    stitch_service.forget_token_for_tests()
    stitch.reject_credentials = "invalid_client"
    with pytest.raises(stitch_service.StitchError, match="refused the client credentials"):
        await stitch_service.client_token()


async def test_a_return_address_must_be_https(stitch):
    with pytest.raises(stitch_service.StitchError, match="https"):
        await stitch_service.create_payment_request(
            order_id=str(uuid.uuid4()), amount=10, return_url="http://meravo.co.za/order-success"
        )


async def test_a_settlement_account_is_all_three_fields_or_none(stitch, monkeypatch):
    monkeypatch.setattr(settings, "STITCH_BENEFICIARY_NAME", "Meravo")
    with pytest.raises(stitch_service.StitchError, match="together"):
        stitch_service.configured_beneficiary()

    monkeypatch.setattr(settings, "STITCH_BENEFICIARY_BANK_ID", "FNB")
    monkeypatch.setattr(settings, "STITCH_BENEFICIARY_ACCOUNT_NUMBER", "6200 1234 567")
    created = await stitch_service.create_payment_request(
        order_id=str(uuid.uuid4()), amount=10, return_url="https://meravo.co.za/order-success"
    )
    variables = stitch.requests[created.id]["variables"]
    assert variables["beneficiaryBankId"] == "fnb"
    assert variables["beneficiaryAccountNumber"] == "62001234567"
    assert "beneficiary:" in stitch.requests[created.id]["query"]


def test_signature_verification():
    body = b'{"data":{"id":"x"}}'
    headers = sign_webhook(body, WEBHOOK_SECRET)
    args = dict(
        msg_id=headers["svix-id"],
        timestamp=headers["svix-timestamp"],
        signature=headers["svix-signature"],
        secret=WEBHOOK_SECRET,
    )
    assert stitch_service.verify_webhook_signature(body=body, **args)
    assert not stitch_service.verify_webhook_signature(body=body + b" ", **args)
    # Several signatures (during a secret rotation): any valid one is enough.
    rotated = dict(args, signature=f"v1,AAAA {headers['svix-signature']}")
    assert stitch_service.verify_webhook_signature(body=body, **rotated)
    assert not stitch_service.verify_webhook_signature(body=body, **dict(args, signature="v1,"))
    assert not stitch_service.verify_webhook_signature(body=body, **dict(args, timestamp="soon"))


def test_webhook_candidates_finds_ids_however_the_body_is_shaped():
    ids, refs = stitch_service.webhook_candidates(
        {"data": {"client": {"paymentInitiationRequests": {"node": {"id": "a", "externalReference": "b"}}}},
         "list": [{"id": "c"}]}
    )
    assert ids == ["a", "c"]
    assert refs == ["b"]


def test_unrecognised_states_count_as_not_paid():
    assert stitch_service.map_state("PaymentInitiationRequestCompleted") == "completed"
    assert stitch_service.map_state("SomethingNew") == "unknown"
    assert stitch_service.map_state(None) == "pending"


def test_amounts_are_read_in_cents():
    assert stitch_service.amount_to_cents({"quantity": 598, "currency": "ZAR"}) == 59800
    assert stitch_service.amount_to_cents({"quantity": "349.99", "currency": "ZAR"}) == 34999
    assert stitch_service.amount_to_cents({"quantity": 1, "currency": "USD"}) is None
    assert stitch_service.amount_to_cents({"quantity": "lots"}) is None
    assert stitch_service.amount_to_cents(None) is None
