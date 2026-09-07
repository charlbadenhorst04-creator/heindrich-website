CHECKOUT_ADDRESS = {
    "customer_email": "checkout-test@example.com",
    "customer_name": "Checkout Test",
    "shipping_address": "1 Main Road",
    "city": "Cape Town",
    "postal_code": "8001",
    "province": "Western Cape",
}


async def test_checkout_empty_cart_fails(client, unique_session_key):
    resp = await client.post(
        "/api/orders/checkout", json={"session_key": unique_session_key, **CHECKOUT_ADDRESS}
    )
    assert resp.status_code == 400


async def test_checkout_small_order_charges_shipping(client, unique_session_key, seeded_products):
    product_b = seeded_products["product_b"]  # R250, below the free-shipping threshold
    await client.post(
        f"/api/cart/{unique_session_key}/items",
        json={"product_id": str(product_b.id), "quantity": 1},
    )

    resp = await client.post(
        "/api/orders/checkout", json={"session_key": unique_session_key, **CHECKOUT_ADDRESS}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["action_url"].endswith("/eng/process")
    assert data["fields"]["amount"] == "349.00"  # 250 subtotal + 99 shipping
    assert "signature" in data["fields"]

    order = await client.get(f"/api/orders/{data['order_id']}")
    assert order.status_code == 200
    order_data = order.json()
    assert order_data["subtotal_amount"] == 250.0
    assert order_data["shipping_fee"] == 99.0
    assert order_data["total_amount"] == 349.0
    assert order_data["courier"] == "Aramex"
    assert order_data["status"] == "pending"


async def test_checkout_large_order_gets_free_shipping(client, unique_session_key, seeded_products):
    product_a = seeded_products["product_a"]  # R499
    await client.post(
        f"/api/cart/{unique_session_key}/items",
        json={"product_id": str(product_a.id), "quantity": 4},  # R1996, over R1500 threshold
    )

    resp = await client.post(
        "/api/orders/checkout", json={"session_key": unique_session_key, **CHECKOUT_ADDRESS}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["fields"]["amount"] == "1996.00"

    order = await client.get(f"/api/orders/{data['order_id']}")
    order_data = order.json()
    assert order_data["shipping_fee"] == 0.0
    assert order_data["total_amount"] == 1996.0


async def test_checkout_rejects_quantity_above_current_stock(
    client, unique_session_key, seeded_products
):
    """A cart can sit for days after passing the add-to-cart stock check.
    If the last units sell in the meantime, checkout must refuse rather
    than take payment for goods that cannot be shipped."""
    from sqlalchemy import update

    from app.models.product import Product
    from tests.conftest import TestSessionLocal

    product_a = seeded_products["product_a"]
    await client.post(
        f"/api/cart/{unique_session_key}/items",
        json={"product_id": str(product_a.id), "quantity": 5},
    )

    async with TestSessionLocal() as db:
        await db.execute(update(Product).where(Product.id == product_a.id).values(stock=1))
        await db.commit()

    resp = await client.post(
        "/api/orders/checkout", json={"session_key": unique_session_key, **CHECKOUT_ADDRESS}
    )
    assert resp.status_code == 409
    assert "Only 1" in resp.json()["detail"]


async def test_checkout_rejects_delisted_product(client, unique_session_key, seeded_products):
    from sqlalchemy import update

    from app.models.product import Product
    from tests.conftest import TestSessionLocal

    product_b = seeded_products["product_b"]
    await client.post(
        f"/api/cart/{unique_session_key}/items",
        json={"product_id": str(product_b.id), "quantity": 1},
    )

    async with TestSessionLocal() as db:
        await db.execute(update(Product).where(Product.id == product_b.id).values(is_active=False))
        await db.commit()

    resp = await client.post(
        "/api/orders/checkout", json={"session_key": unique_session_key, **CHECKOUT_ADDRESS}
    )
    assert resp.status_code == 409
    assert "no longer available" in resp.json()["detail"]


async def test_checkout_rejects_overlong_fields_with_422_not_500(
    client, unique_session_key, seeded_products
):
    """Each of these is longer than its database column. Without a length
    limit on the schema the value reaches PostgreSQL and blows up there,
    which the shopper sees as a 500 on the final step of the sale."""
    product_b = seeded_products["product_b"]
    await client.post(
        f"/api/cart/{unique_session_key}/items",
        json={"product_id": str(product_b.id), "quantity": 1},
    )

    too_long = {
        "customer_name": 201,
        "shipping_address": 501,
        "city": 121,
        "postal_code": 21,
        "province": 121,
        "phone": 31,
    }
    for field, length in too_long.items():
        payload = {"session_key": unique_session_key, **CHECKOUT_ADDRESS, field: "x" * length}
        resp = await client.post("/api/orders/checkout", json=payload)
        assert resp.status_code == 422, f"{field} of length {length} returned {resp.status_code}"


async def test_get_nonexistent_order_404s(client):
    resp = await client.get("/api/orders/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


async def test_shipping_config_endpoint(client):
    resp = await client.get("/api/shipping/config")
    assert resp.status_code == 200
    data = resp.json()
    assert data["courier"] == "Aramex"
    assert data["flat_fee"] == 99.0
    assert data["free_shipping_threshold"] == 1500.0
