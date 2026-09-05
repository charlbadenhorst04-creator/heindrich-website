// Runs the real Netlify function handlers directly in Node (bypassing the
// Netlify dev server, which this environment doesn't provide) against a
// real local Postgres database. This is what caught a serious bug during
// development: a raw-SQL column collision (cart_items.id vs products.id,
// both literally named "id" once `p.*` is expanded) silently made every
// cart item report its *product's* id instead of its own, so PATCH/DELETE
// against a cart item matched zero rows. Pure type-checking cannot catch
// this class of bug - only running the query for real can.
//
// Requires a local Postgres reachable at TEST_DATABASE_URL (or the
// default below) with an empty database the test can freely reset.
//
// Run with: npm run test:functions

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, before } from "node:test";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://meravo:change-me@localhost:5432/meravo_netlify_test";

const envMap: Record<string, string> = {
  URL: "http://localhost:8090",
  PAYFAST_MODE: "sandbox",
  PAYFAST_MERCHANT_ID: "10000100",
  PAYFAST_MERCHANT_KEY: "46f0cd694581a",
  PAYFAST_PASSPHRASE: "",
  NETLIFY_DB_URL: TEST_DB_URL,
};
// @ts-expect-error - the real Netlify runtime provides this global
globalThis.Netlify = { env: { get: (key: string) => envMap[key] } };

before(async () => {
  const migrationPath = path.join(
    __dirname,
    "../../database/migrations/20260905090000_init/migration.sql",
  );
  const migrationSql = await readFile(migrationPath, "utf-8");

  const client = new pg.Client({ connectionString: TEST_DB_URL });
  await client.connect();
  await client.query(
    "DROP TABLE IF EXISTS order_items, orders, cart_items, carts, products, categories CASCADE",
  );
  await client.query(migrationSql);
  await client.end();
});

const productsFn = (await import("../products.mts")).default;
const cartFn = (await import("../cart.mts")).default;
const cartItemsFn = (await import("../cart-items.mts")).default;
const cartItemFn = (await import("../cart-item.mts")).default;
const checkoutFn = (await import("../checkout.mts")).default;
const orderFn = (await import("../order.mts")).default;

async function seededProductIds() {
  const res = await productsFn(new Request("http://x/api/products"));
  const data = await res.json();
  return { a: data.items[0].id, b: data.items[1].id };
}

test("cart delete actually removes the item (regression: id column collision)", async () => {
  const { a, b } = await seededProductIds();
  const sessionKey = `test-${Date.now()}-${Math.random()}`;

  await cartItemsFn(
    new Request(`http://x/api/cart/${sessionKey}/items`, {
      method: "POST",
      body: JSON.stringify({ product_id: a, quantity: 1 }),
    }),
    { params: { sessionKey } } as any,
  );
  const addB = await cartItemsFn(
    new Request(`http://x/api/cart/${sessionKey}/items`, {
      method: "POST",
      body: JSON.stringify({ product_id: b, quantity: 1 }),
    }),
    { params: { sessionKey } } as any,
  );
  const addBData = await addB.json();
  assert.equal(addBData.items.length, 2);

  const itemB = addBData.items.find((i: any) => i.product.id === b);
  // The bug this test locks in: itemB.id must be the cart_item's own id,
  // never the product's id.
  assert.notEqual(itemB.id, b);

  const delRes = await cartItemFn(
    new Request(`http://x/api/cart/${sessionKey}/items/${itemB.id}`, { method: "DELETE" }),
    { params: { sessionKey, itemId: itemB.id } } as any,
  );
  const delData = await delRes.json();
  assert.equal(delData.items.length, 1);
  assert.equal(delData.items[0].product.id, a);

  const freshGet = await cartFn(new Request(`http://x/api/cart/${sessionKey}`), {
    params: { sessionKey },
  } as any);
  const freshData = await freshGet.json();
  assert.equal(freshData.items.length, 1, "delete must persist, not just reflect in one response");
});

test("cart item update changes quantity in place", async () => {
  const { a } = await seededProductIds();
  const sessionKey = `test-${Date.now()}-${Math.random()}`;

  const addRes = await cartItemsFn(
    new Request(`http://x/api/cart/${sessionKey}/items`, {
      method: "POST",
      body: JSON.stringify({ product_id: a, quantity: 1 }),
    }),
    { params: { sessionKey } } as any,
  );
  const addData = await addRes.json();
  const itemId = addData.items[0].id;

  const patchRes = await cartItemFn(
    new Request(`http://x/api/cart/${sessionKey}/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify({ quantity: 4 }),
    }),
    { params: { sessionKey, itemId } } as any,
  );
  const patchData = await patchRes.json();
  assert.equal(patchData.items[0].quantity, 4);
});

test("checkout computes shipping fee and matches Payfast amount field", async () => {
  const { a } = await seededProductIds();
  const sessionKey = `test-${Date.now()}-${Math.random()}`;

  await cartItemsFn(
    new Request(`http://x/api/cart/${sessionKey}/items`, {
      method: "POST",
      body: JSON.stringify({ product_id: a, quantity: 1 }),
    }),
    { params: { sessionKey } } as any,
  );

  const checkoutRes = await checkoutFn(
    new Request("http://x/api/orders/checkout", {
      method: "POST",
      body: JSON.stringify({
        session_key: sessionKey,
        customer_email: "test@example.com",
        customer_name: "Test User",
        shipping_address: "1 Main Road",
        city: "Cape Town",
        postal_code: "8001",
        province: "Western Cape",
      }),
    }),
  );
  assert.equal(checkoutRes.status, 200);
  const checkoutData = await checkoutRes.json();

  const orderRes = await orderFn(new Request(`http://x/api/orders/${checkoutData.order_id}`), {
    params: { id: checkoutData.order_id },
  } as any);
  const orderData = await orderRes.json();

  const expectedTotal = orderData.subtotal_amount + orderData.shipping_fee;
  assert.equal(orderData.total_amount, expectedTotal);
  assert.equal(checkoutData.fields.amount, expectedTotal.toFixed(2));
});
