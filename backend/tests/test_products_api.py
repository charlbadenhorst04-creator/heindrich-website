async def test_list_products_includes_seeded(client, seeded_products):
    resp = await client.get("/api/products")
    assert resp.status_code == 200
    data = resp.json()
    slugs = {item["slug"] for item in data["items"]}
    assert seeded_products["product_a"].slug in slugs
    assert seeded_products["product_b"].slug in slugs


async def test_get_product_by_slug(client, seeded_products):
    product_a = seeded_products["product_a"]
    resp = await client.get(f"/api/products/{product_a.slug}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == product_a.name
    assert data["price"] == float(product_a.price)


async def test_get_product_nonexistent_slug_404s(client):
    resp = await client.get("/api/products/this-slug-does-not-exist")
    assert resp.status_code == 404


async def test_search_products_by_name(client, seeded_products):
    resp = await client.get("/api/products", params={"q": "Test Product A"})
    data = resp.json()
    assert any(item["slug"] == seeded_products["product_a"].slug for item in data["items"])


async def test_filter_products_by_category(client, seeded_products):
    category_slug = seeded_products["category"].slug
    resp = await client.get("/api/products", params={"category": category_slug})
    data = resp.json()
    assert data["total"] >= 2
    assert all(item["category"]["slug"] == category_slug for item in data["items"])


async def test_list_categories(client, seeded_products):
    resp = await client.get("/api/categories")
    assert resp.status_code == 200
    slugs = {c["slug"] for c in resp.json()}
    assert seeded_products["category"].slug in slugs
