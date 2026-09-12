/**
 * The status page, run for real against a real database.
 *
 * This page exists to be trusted while launching, which makes two things
 * worth locking down: that "ready" actually means the shop can take an
 * order, and that a page safe to leave on a public site never prints a
 * password or a key.
 *
 * Shares a database with cart.test.mts and resets it, so the suite runs
 * its files one at a time (--test-concurrency=1 in package.json). Running
 * them in parallel has each dropping tables the other is using.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { before, test } from "node:test";

import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://meravo:change-me@localhost:5432/meravo_netlify_test";

const SMTP_PASSWORD = "super-secret-app-password";
const PAYFAST_PASSPHRASE = "super-secret-passphrase";

const envMap: Record<string, string> = {
  URL: "https://meravo.co.za",
  PAYFAST_MODE: "sandbox",
  PAYFAST_MERCHANT_ID: "10000100",
  PAYFAST_MERCHANT_KEY: "46f0cd694581a",
  PAYFAST_PASSPHRASE,
  PAYFAST_NOTIFY_URL: "https://meravo.co.za/api/payments/payfast/notify",
  DATABASE_URL: TEST_DB_URL,
  SMTP_HOST: "smtp.gmail.com",
  SMTP_USERNAME: "shop@meravo.co.za",
  SMTP_PASSWORD,
  SHOP_OWNER_EMAIL: "heindrich@example.com",
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

const healthFn = (await import("../health.mts")).default;

function request(accept?: string) {
  return new Request("https://meravo.co.za/api/health", {
    headers: accept ? { accept } : undefined,
  });
}

test("reports a working shop as ready, and counts the real catalogue", async () => {
  const res = await healthFn(request());
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.equal(body.ready, true, JSON.stringify(body.checks, null, 2));

  const byName = Object.fromEntries(body.checks.map((c: any) => [c.name, c]));
  assert.equal(byName.Database.ok, true);
  assert.equal(byName.Catalogue.ok, true);
  assert.match(byName.Catalogue.detail, /\d+ products on sale/);
  assert.match(byName.Payfast.detail, /Sandbox mode/);
});

test("never prints a password, a key or a passphrase", async () => {
  // The whole point of leaving this reachable is that it is safe to.
  const html = await (await healthFn(request("text/html"))).text();
  const json = await (await healthFn(request())).text();

  for (const body of [html, json]) {
    assert.ok(!body.includes(SMTP_PASSWORD), "an SMTP password reached the status page");
    assert.ok(!body.includes(PAYFAST_PASSPHRASE), "a Payfast passphrase reached the status page");
    assert.ok(!body.includes("46f0cd694581a"), "a Payfast merchant key reached the status page");
    assert.ok(!body.includes(TEST_DB_URL), "a database connection string reached the status page");
  }
});

test("answers a browser with a readable page and everything else with JSON", async () => {
  const browser = await healthFn(request("text/html,application/xhtml+xml"));
  assert.match(browser.headers.get("content-type") ?? "", /text\/html/);
  const html = await browser.text();
  assert.match(html, /The shop is ready to take orders/);
  assert.match(html, /Order emails/);

  const api = await healthFn(request("application/json"));
  assert.match(api.headers.get("content-type") ?? "", /application\/json/);
});

test("is never cached, so a redeploy is reflected immediately", async () => {
  const res = await healthFn(request());
  assert.equal(res.headers.get("cache-control"), "no-store");
});

test("says which variable is missing rather than just failing", async () => {
  // What someone launching actually needs: the name of the thing to set.
  const previous = { ...envMap };
  delete envMap.DATABASE_URL;
  delete envMap.PAYFAST_NOTIFY_URL;
  delete envMap.SMTP_HOST;
  try {
    const body = await (await healthFn(request())).json();
    assert.equal(body.ready, false);

    const byName = Object.fromEntries(body.checks.map((c: any) => [c.name, c]));
    assert.equal(byName.Database.ok, false);
    assert.match(byName.Database.detail, /DATABASE_URL/);
    assert.match(byName["Payment confirmation"].detail, /PAYFAST_NOTIFY_URL/);
    // Email is optional, so its absence is flagged without blocking launch.
    assert.equal(byName["Order emails"].warning, true);
  } finally {
    Object.assign(envMap, previous);
  }
});

test("warns when live mode is still pointed at Payfast's test account", async () => {
  // Going live with the sandbox merchant means every sale is fake money.
  const previous = envMap.PAYFAST_MODE;
  envMap.PAYFAST_MODE = "live";
  try {
    const body = await (await healthFn(request())).json();
    const credentials = body.checks.find((c: any) => c.name === "Payfast credentials");
    assert.ok(credentials, "no warning about the sandbox merchant id in live mode");
    assert.equal(credentials.ok, false);
    assert.equal(body.ready, false);
  } finally {
    envMap.PAYFAST_MODE = previous;
  }
});

test("accepts a connection string under any of the supported names", async () => {
  // The bug this locks in: the guide told people to add
  // NETLIFY_DATABASE_URL, @netlify/database only reads NETLIFY_DB_URL, and
  // Netlify reserves the NETLIFY_ prefix so neither can be set by hand.
  // A shop configured that way came up with no database and no clue why.
  const { CONNECTION_STRING_VARIABLES, connectionString } = await import("./db.mts");
  assert.equal(CONNECTION_STRING_VARIABLES[0], "DATABASE_URL", "the plain name must win");

  const previous = { ...envMap };
  try {
    for (const name of CONNECTION_STRING_VARIABLES) {
      for (const key of CONNECTION_STRING_VARIABLES) delete envMap[key];
      envMap[name] = "postgresql://someone@example.test/db";
      assert.equal(
        connectionString(),
        "postgresql://someone@example.test/db",
        `a connection string set as ${name} was ignored`,
      );
    }
  } finally {
    for (const key of CONNECTION_STRING_VARIABLES) delete envMap[key];
    Object.assign(envMap, previous);
  }
});
