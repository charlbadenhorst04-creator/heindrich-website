/**
 * A Stitch payment end to end: real handlers, a real Postgres, and a
 * stand-in Stitch spoken to over real HTTP.
 *
 * The cases worth the most are the ones where nothing should happen. A
 * webhook that claims "completed" while Stitch still says pending. A
 * webhook with a forged signature. A payment for the wrong amount, or
 * bound to another order. And the race that matters most in practice: the
 * customer's return and Stitch's webhook arriving at the same moment,
 * which must sell the stock once, not twice.
 *
 * Shares a database with cart.test.mts and health.test.mts; the suite runs
 * its files one at a time so they do not reset it under each other.
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, beforeEach, test } from "node:test";

import pg from "pg";

import { signWebhook, startFakeStitch, type FakeStitch } from "./fake-stitch-server.mts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://meravo:change-me@localhost:5432/meravo_netlify_test";

const WEBHOOK_SECRET = `whsec_${crypto.randomBytes(24).toString("base64")}`;
const envMap: Record<string, string> = {};
// @ts-expect-error - the real Netlify runtime provides this global
globalThis.Netlify = { env: { get: (key: string) => envMap[key] } };

let fake: FakeStitch;
let pool: pg.Pool;

before(async () => {
  fake = await startFakeStitch();
  Object.assign(envMap, {
    // Netlify's own: the primary domain and the permanent .netlify.app name.
    URL: "https://meravo.co.za",
    SITE_NAME: "meravo-store",
    NETLIFY_DB_URL: TEST_DB_URL,
    STITCH_CLIENT_ID: "test-meravo",
    STITCH_CLIENT_SECRET: "test-secret",
    STITCH_TOKEN_URL: fake.tokenUrl,
    STITCH_API_URL: fake.apiUrl,
    STITCH_WEBHOOK_SECRET: WEBHOOK_SECRET,
  });

  const migration = await readFile(
    path.join(__dirname, "../../database/migrations/20260905090000_init/migration.sql"),
    "utf-8",
  );
  pool = new pg.Pool({ connectionString: TEST_DB_URL });
  await pool.query(
    "DROP TABLE IF EXISTS order_items, orders, cart_items, carts, products, categories CASCADE",
  );
  await pool.query(migration);
});

after(async () => {
  await pool.end();
  await fake.close();
});

beforeEach(() => {
  fake.failCreate = null;
});

const checkoutFn = (await import("../checkout.mts")).default;
const confirmFn = (await import("../payment-confirm.mts")).default;
const webhookFn = (await import("../stitch-webhook.mts")).default;
const cartItemsFn = (await import("../cart-items.mts")).default;
const productsFn = (await import("../products.mts")).default;

async function firstProduct() {
  const res = await productsFn(new Request("https://meravo.co.za/api/products"));
  return (await res.json()).items[0];
}

async function stockOf(productId: string): Promise<number> {
  const { rows } = await pool.query("SELECT stock FROM products WHERE id = $1", [productId]);
  return rows[0].stock;
}

async function statusOf(orderId: string): Promise<string> {
  const { rows } = await pool.query("SELECT status FROM orders WHERE id = $1", [orderId]);
  return rows[0].status;
}

/** Puts one item in a fresh cart and checks out on the given host. */
async function checkout(host = "meravo.co.za", quantity = 1) {
  const product = await firstProduct();
  const sessionKey = `stitch-${crypto.randomUUID()}`;
  await cartItemsFn(
    new Request(`https://${host}/api/cart/${sessionKey}/items`, {
      method: "POST",
      body: JSON.stringify({ product_id: product.id, quantity }),
    }),
    { params: { sessionKey } } as any,
  );
  const res = await checkoutFn(
    new Request(`https://${host}/api/orders/checkout`, {
      method: "POST",
      body: JSON.stringify({
        session_key: sessionKey,
        customer_email: "thandi@example.com",
        customer_name: "Thandi Nkosi",
        shipping_address: "12 Kloof Street",
        city: "Cape Town",
        postal_code: "8001",
        province: "Western Cape",
      }),
    }),
  );
  return { res, body: await res.json(), product };
}

function requestIdFor(orderId: string): string {
  for (const request of fake.requests.values()) {
    if (request.externalReference === orderId) return request.id;
  }
  throw new Error(`no Stitch request for ${orderId}`);
}

async function confirm(orderId: string) {
  const res = await confirmFn(
    new Request("https://meravo.co.za/api/payments/confirm", {
      method: "POST",
      body: JSON.stringify({ order_id: orderId }),
    }),
  );
  return { status: res.status, body: await res.json() };
}

async function webhook(payload: unknown, opts: { sign?: boolean; secret?: string } = {}) {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.sign !== false) Object.assign(headers, signWebhook(body, opts.secret ?? WEBHOOK_SECRET));
  return webhookFn(
    new Request("https://meravo-store.netlify.app/api/payments/stitch/webhook", {
      method: "POST",
      headers,
      body,
    }),
  );
}

test("checkout hands the customer to Stitch's page and records the request", async () => {
  const { res, body } = await checkout();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.provider, "stitch");

  const redirect = new URL(body.redirect_url);
  assert.ok(body.redirect_url.startsWith(`${fake.url}/pay/`), "not sent to Stitch's page");
  assert.equal(redirect.searchParams.get("redirect_uri"), "https://meravo.co.za/order-success");

  const requestId = requestIdFor(body.order_id);
  const { rows } = await pool.query(
    "SELECT payment_provider, provider_reference, total_amount FROM orders WHERE id = $1",
    [body.order_id],
  );
  assert.equal(rows[0].payment_provider, "stitch");
  assert.equal(rows[0].provider_reference, requestId);

  // Stitch was asked for exactly what the order costs.
  const asked = fake.requests.get(requestId)!.amount;
  assert.equal(Math.round(asked.quantity * 100), Math.round(Number(rows[0].total_amount) * 100));
});

test("the return address follows the domain the customer is on", async () => {
  // So moving to meravo.co.za needs no setting changed - and a customer
  // on either address is returned to the one their basket lives on.
  const onNetlify = await checkout("meravo-store.netlify.app");
  assert.equal(
    new URL(onNetlify.body.redirect_url).searchParams.get("redirect_uri"),
    "https://meravo-store.netlify.app/order-success",
  );

  const onDomain = await checkout("meravo.co.za");
  assert.equal(
    new URL(onDomain.body.redirect_url).searchParams.get("redirect_uri"),
    "https://meravo.co.za/order-success",
  );
});

test("a forged host cannot point the return address at somebody else's site", async () => {
  const { body } = await checkout("evil.example");
  assert.equal(
    new URL(body.redirect_url).searchParams.get("redirect_uri"),
    "https://meravo.co.za/order-success",
    "an unrecognised host was trusted",
  );
});

test("an order is not paid until Stitch itself says so", async () => {
  const { body, product } = await checkout();
  const before = await stockOf(product.id);

  const pending = await confirm(body.order_id);
  assert.equal(pending.body.status, "pending");
  assert.equal(await stockOf(product.id), before, "stock moved on an unpaid order");

  fake.setState(requestIdFor(body.order_id), "PaymentInitiationRequestCompleted");
  const paid = await confirm(body.order_id);
  assert.equal(paid.body.status, "paid");
  assert.equal(await stockOf(product.id), before - 1);
});

test("confirming twice takes the stock once", async () => {
  const { body, product } = await checkout();
  fake.setState(requestIdFor(body.order_id), "PaymentInitiationRequestCompleted");
  const before = await stockOf(product.id);

  await confirm(body.order_id);
  await confirm(body.order_id);
  await confirm(body.order_id);

  assert.equal(await stockOf(product.id), before - 1, "stock was taken more than once");
});

test("the return page and the webhook racing each other sell the stock once", async () => {
  // The case that actually happens: the customer's browser and Stitch's
  // webhook land within milliseconds of each other.
  const { body, product } = await checkout();
  const requestId = requestIdFor(body.order_id);
  fake.setState(requestId, "PaymentInitiationRequestCompleted");
  const before = await stockOf(product.id);

  const payload = { data: { id: requestId, externalReference: body.order_id } };
  await Promise.all([
    confirm(body.order_id),
    confirm(body.order_id),
    confirm(body.order_id),
    webhook(payload),
    webhook(payload),
    webhook(payload),
  ]);

  assert.equal(await statusOf(body.order_id), "paid");
  assert.equal(await stockOf(product.id), before - 1, "concurrent confirmations double-sold stock");
});

test("a webhook claiming 'completed' is not believed when Stitch says otherwise", async () => {
  // Correctly signed, and the body even says completed - but the body only
  // says which order to look at. Stitch says pending, so pending it stays.
  const { body, product } = await checkout();
  const before = await stockOf(product.id);

  const res = await webhook({
    data: {
      id: requestIdFor(body.order_id),
      externalReference: body.order_id,
      state: { __typename: "PaymentInitiationRequestCompleted" },
    },
  });
  assert.equal(res.status, 200);
  assert.equal(await statusOf(body.order_id), "pending", "the webhook body was trusted");
  assert.equal(await stockOf(product.id), before);
});

test("a webhook with a forged signature is rejected before anything is looked up", async () => {
  const { body } = await checkout();
  fake.setState(requestIdFor(body.order_id), "PaymentInitiationRequestCompleted");
  const callsBefore = fake.graphqlCalls.length;

  const forged = await webhook(
    { data: { externalReference: body.order_id } },
    { secret: `whsec_${crypto.randomBytes(24).toString("base64")}` },
  );
  assert.equal(forged.status, 401);

  const unsigned = await webhook({ data: { externalReference: body.order_id } }, { sign: false });
  assert.equal(unsigned.status, 401);

  assert.equal(await statusOf(body.order_id), "pending");
  assert.equal(fake.graphqlCalls.length, callsBefore, "a forged webhook made us call Stitch");
});

test("a signed webhook settles an order whose customer never came back", async () => {
  // Paid, then closed the tab before the redirect.
  const { body, product } = await checkout();
  const requestId = requestIdFor(body.order_id);
  fake.setState(requestId, "PaymentInitiationRequestCompleted");
  const before = await stockOf(product.id);

  const res = await webhook({
    data: {
      client: {
        paymentInitiationRequests: { node: { id: requestId, externalReference: body.order_id } },
      },
    },
  });
  assert.equal(res.status, 200);
  assert.equal(await statusOf(body.order_id), "paid");
  assert.equal(await stockOf(product.id), before - 1);
});

test("a payment for the wrong amount does not settle the order", async () => {
  const { body, product } = await checkout();
  const requestId = requestIdFor(body.order_id);
  fake.setState(requestId, "PaymentInitiationRequestCompleted");
  fake.overrideAmount.set(requestId, { quantity: 1, currency: "ZAR" });
  const before = await stockOf(product.id);

  const result = await confirm(body.order_id);
  assert.equal(result.body.status, "pending", "a short payment settled the order");
  assert.equal(await stockOf(product.id), before);
});

test("a completed payment bound to a different order does not settle this one", async () => {
  const { body } = await checkout();
  const requestId = requestIdFor(body.order_id);
  fake.setState(requestId, "PaymentInitiationRequestCompleted");
  fake.overrideExternalReference.set(requestId, crypto.randomUUID());

  assert.equal((await confirm(body.order_id)).body.status, "pending");
});

test("a cancelled or expired payment fails the order and leaves the stock", async () => {
  for (const state of ["PaymentInitiationRequestCancelled", "PaymentInitiationRequestExpired"]) {
    const { body, product } = await checkout();
    const before = await stockOf(product.id);
    fake.setState(requestIdFor(body.order_id), state);

    assert.equal((await confirm(body.order_id)).body.status, "failed", state);
    assert.equal(await stockOf(product.id), before, state);
  }
});

test("a paid order is never walked back by a later 'cancelled'", async () => {
  const { body } = await checkout();
  const requestId = requestIdFor(body.order_id);
  fake.setState(requestId, "PaymentInitiationRequestCompleted");
  await confirm(body.order_id);

  fake.setState(requestId, "PaymentInitiationRequestCancelled");
  await confirm(body.order_id);
  await webhook({ data: { id: requestId, externalReference: body.order_id } });

  assert.equal(await statusOf(body.order_id), "paid");
});

test("an order already shipped is not re-sold by a late webhook", async () => {
  // The shop marks orders shipped by hand. A webhook retried after that
  // must not move it back to paid, take the stock again or re-send emails.
  const { body, product } = await checkout();
  const requestId = requestIdFor(body.order_id);
  fake.setState(requestId, "PaymentInitiationRequestCompleted");
  await confirm(body.order_id);
  await pool.query("UPDATE orders SET status = 'shipped' WHERE id = $1", [body.order_id]);
  const before = await stockOf(product.id);

  await webhook({ data: { id: requestId, externalReference: body.order_id } });
  await confirm(body.order_id);

  assert.equal(await statusOf(body.order_id), "shipped");
  assert.equal(await stockOf(product.id), before, "a shipped order's stock was taken again");
});

test("a webhook about an order this shop never made is acknowledged and ignored", async () => {
  const res = await webhook({ data: { id: "someone-else", externalReference: crypto.randomUUID() } });
  assert.equal(res.status, 200);
});

test("Stitch being unavailable at checkout is a plain message, not a crash", async () => {
  fake.failCreate = "Service unavailable";
  const { res, body } = await checkout();
  assert.equal(res.status, 502);
  assert.match(body.detail, /secure payment page/);
  assert.ok(!JSON.stringify(body).includes("Service unavailable"), "Stitch's internals reached the customer");
});

test("confirm rejects anything that is not an order id", async () => {
  assert.equal((await confirm("not-a-uuid")).status, 404);
  assert.equal((await confirm(crypto.randomUUID())).status, 404);

  const bad = await confirmFn(
    new Request("https://meravo.co.za/api/payments/confirm", { method: "POST", body: "{nope" }),
  );
  assert.equal(bad.status, 400);
});
