/**
 * Payfast's ITN - the server-to-server confirmation that a Payfast payment
 * happened - against a real database and a stand-in for Payfast's
 * validation endpoint.
 *
 * This handler had no test at all before settlement moved into a shared
 * module, and it is the only thing that turns a Payfast payment into a paid
 * order. Covered: a genuine ITN settles once however often Payfast retries
 * it, and every way an ITN can be wrong - signature, Payfast disowning it,
 * the wrong amount - leaves the order alone.
 *
 * Shares a database with the other handler tests; the suite runs files one
 * at a time.
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://meravo:change-me@localhost:5432/meravo_netlify_test";

const envMap: Record<string, string> = {};
// @ts-expect-error - the real Netlify runtime provides this global
globalThis.Netlify = { env: { get: (key: string) => envMap[key] } };

/** What the stand-in Payfast answers to a validation post-back. */
let payfastAnswer = "VALID";
let validateServer: http.Server;
let pool: pg.Pool;

before(async () => {
  validateServer = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(payfastAnswer);
    });
  });
  await new Promise<void>((resolve) => validateServer.listen(0, "127.0.0.1", resolve));
  const { port } = validateServer.address() as AddressInfo;

  Object.assign(envMap, {
    URL: "https://meravo.co.za",
    NETLIFY_DB_URL: TEST_DB_URL,
    PAYFAST_MODE: "sandbox",
    PAYFAST_MERCHANT_ID: "10054498",
    PAYFAST_MERCHANT_KEY: "wxp2y88nzu9z8",
    PAYFAST_PASSPHRASE: "",
    PAYFAST_VALIDATE_URL: `http://127.0.0.1:${port}/eng/query/validate`,
    PAYMENTS_ENABLED: "true",
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
  await new Promise<void>((resolve) => validateServer.close(() => resolve()));
});

const { buildSignature } = await import("./payfast.mts");
const notifyFn = (await import("../payfast-notify.mts")).default;
const checkoutFn = (await import("../checkout.mts")).default;
const cartItemsFn = (await import("../cart-items.mts")).default;
const productsFn = (await import("../products.mts")).default;

async function placeOrder() {
  const products = await (await productsFn(new Request("https://meravo.co.za/api/products"))).json();
  const product = products.items[0];
  const sessionKey = `itn-${crypto.randomUUID()}`;
  await cartItemsFn(
    new Request(`https://meravo.co.za/api/cart/${sessionKey}/items`, {
      method: "POST",
      body: JSON.stringify({ product_id: product.id, quantity: 1 }),
    }),
    { params: { sessionKey } } as any,
  );
  const res = await checkoutFn(
    new Request("https://meravo.co.za/api/orders/checkout", {
      method: "POST",
      body: JSON.stringify({
        session_key: sessionKey,
        customer_email: "buyer@example.com",
        customer_name: "Test Buyer",
        shipping_address: "1 Long Street",
        city: "Cape Town",
        postal_code: "8001",
        province: "Western Cape",
      }),
    }),
  );
  const body = await res.json();
  return { orderId: body.order_id as string, amount: body.fields.amount as string, product };
}

/** An ITN as Payfast would send it, correctly signed unless told otherwise. */
function itn(orderId: string, amount: string, status = "COMPLETE", overrides: Record<string, string> = {}) {
  const fields: Record<string, string> = {
    m_payment_id: orderId,
    pf_payment_id: String(1000000 + Math.floor(Math.random() * 999999)),
    payment_status: status,
    item_name: "MERAVO order",
    amount_gross: amount,
    amount_fee: "-5.00",
    amount_net: String(Number(amount) - 5),
    merchant_id: "10054498",
    ...overrides,
  };
  fields.signature = buildSignature(fields, "", false);
  return fields;
}

async function send(fields: Record<string, string>) {
  return notifyFn(
    new Request("https://meravo.co.za/api/payments/payfast/notify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
    }),
  );
}

async function row(orderId: string) {
  const { rows } = await pool.query(
    "SELECT status, payfast_payment_id, provider_reference FROM orders WHERE id = $1",
    [orderId],
  );
  return rows[0];
}

async function stockOf(productId: string): Promise<number> {
  const { rows } = await pool.query("SELECT stock FROM products WHERE id = $1", [productId]);
  return rows[0].stock;
}

test("a genuine ITN settles the order, records Payfast's id and takes the stock", async () => {
  payfastAnswer = "VALID";
  const { orderId, amount, product } = await placeOrder();
  const before = await stockOf(product.id);

  const message = itn(orderId, amount);
  const res = await send(message);
  assert.equal(res.status, 200, await res.text());

  const order = await row(orderId);
  assert.equal(order.status, "paid");
  assert.equal(order.payfast_payment_id, message.pf_payment_id);
  assert.equal(order.provider_reference, message.pf_payment_id);
  assert.equal(await stockOf(product.id), before - 1);
});

test("Payfast retrying the same ITN, even all at once, takes the stock once", async () => {
  payfastAnswer = "VALID";
  const { orderId, amount, product } = await placeOrder();
  const before = await stockOf(product.id);
  const message = itn(orderId, amount);

  await Promise.all([send(message), send(message), send(message), send(message)]);
  await send(message);

  assert.equal(await stockOf(product.id), before - 1, "a retried ITN took the stock again");
});

test("an ITN Payfast disowns changes nothing", async () => {
  payfastAnswer = "INVALID";
  const { orderId, amount, product } = await placeOrder();
  const before = await stockOf(product.id);

  const res = await send(itn(orderId, amount));
  assert.equal(res.status, 400);
  assert.equal((await row(orderId)).status, "pending");
  assert.equal(await stockOf(product.id), before);
  payfastAnswer = "VALID";
});

test("an ITN for less than the order costs changes nothing", async () => {
  payfastAnswer = "VALID";
  const { orderId, product } = await placeOrder();
  const before = await stockOf(product.id);

  const res = await send(itn(orderId, "1.00"));
  assert.equal(res.status, 400);
  assert.equal((await row(orderId)).status, "pending");
  assert.equal(await stockOf(product.id), before);
});

test("an ITN with a tampered signature is refused before Payfast is even asked", async () => {
  const { orderId, amount } = await placeOrder();
  const message: Record<string, string> = { ...itn(orderId, amount), signature: "0".repeat(32) };

  const res = await send(message);
  assert.equal(res.status, 400);
  assert.equal((await row(orderId)).status, "pending");
});

test("a failed payment can still be paid on retry, but a paid one is never failed", async () => {
  payfastAnswer = "VALID";
  const { orderId, amount } = await placeOrder();

  await send(itn(orderId, amount, "FAILED"));
  assert.equal((await row(orderId)).status, "failed");

  // The customer tried again and it went through.
  await send(itn(orderId, amount, "COMPLETE"));
  assert.equal((await row(orderId)).status, "paid");

  // A late, out-of-order failure notice must not undo the sale.
  await send(itn(orderId, amount, "FAILED"));
  assert.equal((await row(orderId)).status, "paid");
});

test("the validation address cannot be redirected on a live store", async () => {
  // On a live store a redirected validation would let a server that always
  // answers VALID approve forged payments. So the override is ignored.
  const { orderId, amount } = await placeOrder();
  payfastAnswer = "VALID";
  envMap.PAYFAST_MODE = "live";
  try {
    // With the override ignored, validation goes to Payfast's real live
    // address, which this machine cannot reach - so it is "not confirmed".
    const res = await send(itn(orderId, amount));
    assert.equal(res.status, 400);
    assert.equal((await row(orderId)).status, "pending");
  } finally {
    envMap.PAYFAST_MODE = "sandbox";
  }
});

test("an ITN for somebody else's Payfast merchant changes nothing", async () => {
  // The attack: register your own free Payfast sandbox merchant, "pay" it
  // with sandbox money while naming this shop's order and notify address.
  // Payfast genuinely sends that ITN and genuinely vouches for it - just
  // for the wrong merchant. Without a merchant check it settles the order.
  payfastAnswer = "VALID";
  const { orderId, amount, product } = await placeOrder();
  const before = await stockOf(product.id);

  const res = await send(itn(orderId, amount, "COMPLETE", { merchant_id: "10999999" }));
  assert.equal(res.status, 400);
  assert.equal((await row(orderId)).status, "pending", "another merchant's payment settled this order");
  assert.equal(await stockOf(product.id), before);
});

test("a Payfast ITN cannot settle an order taken through Stitch", async () => {
  // With Stitch live and Payfast left on sandbox, a sandbox ITN would
  // otherwise settle a real Stitch order for no money at all.
  payfastAnswer = "VALID";
  const { orderId, amount, product } = await placeOrder();
  await pool.query(
    "UPDATE orders SET payment_provider = 'stitch', provider_reference = 'cGF5cmVxL3JlYWw=' WHERE id = $1",
    [orderId],
  );
  const before = await stockOf(product.id);

  const res = await send(itn(orderId, amount));
  assert.equal(res.status, 400);
  const order = await row(orderId);
  assert.equal(order.status, "pending", "a Payfast ITN settled a Stitch order");
  assert.equal(order.provider_reference, "cGF5cmVxL3JlYWw=", "a Payfast ITN overwrote Stitch's reference");
  assert.equal(await stockOf(product.id), before);
});

test("once Stitch is taking payments, a sandbox Payfast settles nothing at all", async () => {
  // Even for an order that was taken through Payfast while it was being
  // tested: sandbox money is free, so a sandbox ITN that arrives while the
  // shop is live on Stitch can only be somebody gaming it.
  payfastAnswer = "VALID";
  const { orderId, amount, product } = await placeOrder();
  const before = await stockOf(product.id);

  envMap.STITCH_CLIENT_ID = "live-meravo";
  envMap.STITCH_CLIENT_SECRET = "secret";
  delete envMap.PAYMENTS_ENABLED;
  try {
    const res = await send(itn(orderId, amount));
    assert.equal(res.status, 400);
    assert.equal((await row(orderId)).status, "pending");
    assert.equal(await stockOf(product.id), before);
  } finally {
    delete envMap.STITCH_CLIENT_ID;
    delete envMap.STITCH_CLIENT_SECRET;
    envMap.PAYMENTS_ENABLED = "true";
  }
});
