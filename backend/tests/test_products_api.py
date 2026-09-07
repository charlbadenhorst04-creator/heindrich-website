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


async def test_product_listing_order_is_total(client, seeded_products):
    """Products created in one transaction share a created_at, because
    PostgreSQL's now() is transaction-scoped. Ordering by that column alone
    leaves tied rows in no guaranteed order between queries, so a paginated
    listing can repeat one product on both pages and drop another entirely
    (reproduced directly in SQL). The guard is that the ORDER BY carries a
    unique tiebreaker, making the ordering total - assert that directly,
    since whether the planner actually reorders tied rows depends on the
    query plan and row count, and would make for a flaky test."""
    from app.api.routes.products import list_products_query

    compiled = str(list_products_query().compile(compile_kwargs={"literal_binds": True}))
    order_by = compiled.split("ORDER BY", 1)[1]
    assert "products.id" in order_by, f"ORDER BY has no unique tiebreaker: {order_by!r}"


async def test_pagination_covers_every_product_exactly_once(client, seeded_products):
    """The behaviour that tiebreaker exists to protect: paging through the
    catalogue returns every product once, with no page overlapping another."""
    category_slug = seeded_products["category"].slug

    seen: list[str] = []
    for page in (1, 2):
        resp = await client.get(
            "/api/products", params={"category": category_slug, "page": page, "page_size": 1}
        )
        assert resp.status_code == 200
        seen.extend(item["slug"] for item in resp.json()["items"])

    assert len(seen) == len(set(seen)), f"a product appeared on more than one page: {seen}"
    assert set(seen) == {
        seeded_products["product_a"].slug,
        seeded_products["product_b"].slug,
    }
