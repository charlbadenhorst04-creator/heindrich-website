async def test_get_cart_creates_empty_cart(client, unique_session_key):
    resp = await client.get(f"/api/cart/{unique_session_key}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["session_key"] == unique_session_key
    assert data["items"] == []
    assert data["total"] == 0


async def test_add_item_creates_cart_item(client, unique_session_key, seeded_products):
    product_a = seeded_products["product_a"]
    resp = await client.post(
        f"/api/cart/{unique_session_key}/items",
        json={"product_id": str(product_a.id), "quantity": 2},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 1
    assert data["items"][0]["quantity"] == 2
    assert data["total"] == float(product_a.price) * 2


async def test_add_same_product_twice_merges_quantity(client, unique_session_key, seeded_products):
    product_a = seeded_products["product_a"]
    await client.post(
        f"/api/cart/{unique_session_key}/items",
        json={"product_id": str(product_a.id), "quantity": 1},
    )
    resp = await client.post(
        f"/api/cart/{unique_session_key}/items",
        json={"product_id": str(product_a.id), "quantity": 2},
    )
    data = resp.json()
    assert len(data["items"]) == 1
    assert data["items"][0]["quantity"] == 3


async def test_add_nonexistent_product_404s(client, unique_session_key):
    resp = await client.post(
        f"/api/cart/{unique_session_key}/items",
        json={"product_id": "00000000-0000-0000-0000-000000000000", "quantity": 1},
    )
    assert resp.status_code == 404


async def test_update_item_quantity(client, unique_session_key, seeded_products):
    product_a = seeded_products["product_a"]
    add_resp = await client.post(
        f"/api/cart/{unique_session_key}/items",
        json={"product_id": str(product_a.id), "quantity": 1},
    )
    item_id = add_resp.json()["items"][0]["id"]

    resp = await client.patch(
        f"/api/cart/{unique_session_key}/items/{item_id}", json={"quantity": 5}
    )
    assert resp.status_code == 200
    assert resp.json()["items"][0]["quantity"] == 5


async def test_update_item_rejects_zero_quantity(client, unique_session_key, seeded_products):
    product_a = seeded_products["product_a"]
    add_resp = await client.post(
        f"/api/cart/{unique_session_key}/items",
        json={"product_id": str(product_a.id), "quantity": 1},
    )
    item_id = add_resp.json()["items"][0]["id"]

    resp = await client.patch(
        f"/api/cart/{unique_session_key}/items/{item_id}", json={"quantity": 0}
    )
    assert resp.status_code == 422


async def test_remove_item_actually_removes_it(client, unique_session_key, seeded_products):
    """Regression test: removing an item used to report success while
    silently leaving the deleted item in the response (and in a second,
    already-open session it would resurface). The parent Cart.items
    collection must be kept in sync with the database on delete."""
    product_a = seeded_products["product_a"]
    product_b = seeded_products["product_b"]

    await client.post(
        f"/api/cart/{unique_session_key}/items",
        json={"product_id": str(product_a.id), "quantity": 1},
    )
    add_b = await client.post(
        f"/api/cart/{unique_session_key}/items",
        json={"product_id": str(product_b.id), "quantity": 1},
    )
    items_before = add_b.json()["items"]
    assert len(items_before) == 2
    item_b_id = next(i["id"] for i in items_before if i["product"]["id"] == str(product_b.id))

    delete_resp = await client.delete(f"/api/cart/{unique_session_key}/items/{item_b_id}")
    assert delete_resp.status_code == 200
    delete_data = delete_resp.json()
    assert len(delete_data["items"]) == 1
    assert delete_data["items"][0]["product"]["id"] == str(product_a.id)

    # Also confirm it's gone via a completely fresh request (different
    # session/session-key lookup), not just reflected in the same response.
    fresh = await client.get(f"/api/cart/{unique_session_key}")
    assert len(fresh.json()["items"]) == 1


async def test_remove_nonexistent_item_404s(client, unique_session_key):
    resp = await client.delete(
        f"/api/cart/{unique_session_key}/items/00000000-0000-0000-0000-000000000000"
    )
    assert resp.status_code == 404
