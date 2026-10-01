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
const PAYFAST_MERCHANT_KEY = "wxp2y88nzu9z8";
const STITCH_SECRET = "super-secret-stitch-client-secret";
const ACCOUNT_NUMBER = "62001234567";

const envMap: Record<string, string> = {
  URL: "https://meravo.co.za",
  PAYFAST_MODE: "sandbox",
  // A real sandbox merchant rather than Payfast's published demo one, which
  // the shop treats as "no account" and closes checkout for.
  PAYFAST_MERCHANT_ID: "10054498",
  PAYFAST_MERCHANT_KEY,
  PAYFAST_PASSPHRASE,
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
  assert.match(byName.Payments.detail, /Payfast, sandbox mode/);
  assert.match(byName["Return address"].detail, /https:\/\/meravo\.co\.za/);
});

test("never prints a password, a key or a passphrase", async () => {
  // The whole point of leaving this reachable is that it is safe to.
  const html = await (await healthFn(request("text/html"))).text();
  const json = await (await healthFn(request())).text();

  for (const body of [html, json]) {
    assert.ok(!body.includes(SMTP_PASSWORD), "an SMTP password reached the status page");
    assert.ok(!body.includes(PAYFAST_PASSPHRASE), "a Payfast passphrase reached the status page");
    assert.ok(!body.includes(PAYFAST_MERCHANT_KEY), "a Payfast merchant key reached the status page");
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
  delete envMap.SMTP_HOST;
  try {
    const body = await (await healthFn(request())).json();
    assert.equal(body.ready, false);

    const byName = Object.fromEntries(body.checks.map((c: any) => [c.name, c]));
    assert.equal(byName.Database.ok, false);
    assert.match(byName.Database.detail, /DATABASE_URL/);
    // Email is optional, so its absence is flagged without blocking launch.
    assert.equal(byName["Order emails"].warning, true);
  } finally {
    Object.assign(envMap, previous);
  }
});

test("warns when live mode is still pointed at Payfast's test account", async () => {
  // Going live with the sandbox merchant means every sale is fake money.
  const previous = envMap.PAYFAST_MODE;
  const previousId = envMap.PAYFAST_MERCHANT_ID;
  envMap.PAYFAST_MODE = "live";
  envMap.PAYFAST_MERCHANT_ID = "10000100";
  try {
    const body = await (await healthFn(request())).json();
    const credentials = body.checks.find((c: any) => c.name === "Payfast credentials");
    assert.ok(credentials, "no warning about the sandbox merchant id in live mode");
    assert.equal(credentials.ok, false);
    assert.equal(body.ready, false);
  } finally {
    envMap.PAYFAST_MODE = previous;
    envMap.PAYFAST_MERCHANT_ID = previousId;
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

test("the Payfast test bench refuses to run in live mode", async () => {
  // It prints the exact string a payment is signed from, which is all
  // someone would need to forge one against a real merchant account.
  const previous = envMap.PAYFAST_MODE;
  try {
    const { default: payfastCheck } = await import("../payfast-check.mts");

    const sandbox = await payfastCheck(new Request("https://meravo.co.za/api/payfast-check"));
    assert.equal(sandbox.status, 200);
    const body = await sandbox.text();
    assert.ok(!body.includes(PAYFAST_PASSPHRASE), "the passphrase was printed");
    assert.match(body, /merchant_id/);

    envMap.PAYFAST_MODE = "live";
    // PAYFAST_MODE is read when the module first loads, so a fresh copy is
    // needed to see the change - the same as a new deploy would be.
    const { default: liveCheck } = await import(`../payfast-check.mts?live=${Date.now()}`);
    const live = await liveCheck(new Request("https://meravo.co.za/api/payfast-check"));
    assert.equal(live.status, 404, "the test bench was reachable on a live store");
  } finally {
    envMap.PAYFAST_MODE = previous;
  }
});

test("with Stitch configured, it actually asks Stitch whether the credentials work", async () => {
  // A mistyped secret looks exactly like a correct one until a customer
  // tries to pay. This is the check that catches it first.
  const { startFakeStitch } = await import("./fake-stitch-server.mts");
  const { forgetStitchTokenForTests } = await import("./stitch.mts");
  const fake = await startFakeStitch();
  const previous = { ...envMap };
  Object.assign(envMap, {
    STITCH_CLIENT_ID: "test-meravo",
    STITCH_CLIENT_SECRET: STITCH_SECRET,
    STITCH_TOKEN_URL: fake.tokenUrl,
    STITCH_API_URL: fake.apiUrl,
    STITCH_BENEFICIARY_NAME: "Meravo",
    STITCH_BENEFICIARY_BANK_ID: "fnb",
    STITCH_BENEFICIARY_ACCOUNT_NUMBER: ACCOUNT_NUMBER,
  });
  try {
    forgetStitchTokenForTests();
    let body = await (await healthFn(request())).json();
    let byName = Object.fromEntries(body.checks.map((c: any) => [c.name, c]));
    assert.match(byName.Payments.detail, /Stitch, with a TEST client/);
    assert.equal(byName["Stitch connection"].ok, true);
    assert.equal(fake.tokenRequests.length, 1, "Stitch was not actually asked");
    assert.match(byName["Settlement account"].detail, /FNB account ending 4567/);
    // No secret yet: payments work, but a closed tab is not caught.
    assert.equal(byName["Stitch webhook"].warning, true);
    assert.match(byName["Stitch webhook"].detail, /\/api\/payments\/stitch\/webhook/);

    // Neither the client secret nor the full account number is printed.
    const html = await (await healthFn(request("text/html"))).text();
    for (const text of [html, JSON.stringify(body)]) {
      assert.ok(!text.includes(STITCH_SECRET), "the Stitch client secret reached the status page");
      assert.ok(!text.includes(ACCOUNT_NUMBER), "the full account number reached the status page");
    }

    // A wrong secret is reported in plain words.
    forgetStitchTokenForTests();
    fake.rejectCredentials = "invalid_client";
    body = await (await healthFn(request())).json();
    byName = Object.fromEntries(body.checks.map((c: any) => [c.name, c]));
    assert.equal(byName["Stitch connection"].ok, false);
    assert.match(byName["Stitch connection"].detail, /STITCH_CLIENT_SECRET/);
    assert.equal(body.ready, false);
  } finally {
    for (const key of Object.keys(envMap)) delete envMap[key];
    Object.assign(envMap, previous);
    forgetStitchTokenForTests();
    await fake.close();
  }
});

test("with no payment account at all, it says checkout is closed and how to open it", async () => {
  const previous = { ...envMap };
  envMap.PAYFAST_MERCHANT_ID = "";
  envMap.PAYFAST_MERCHANT_KEY = "";
  try {
    const body = await (await healthFn(request())).json();
    const payments = body.checks.find((c: any) => c.name === "Payments");
    assert.equal(payments.ok, false);
    assert.match(payments.detail, /STITCH_CLIENT_ID/);
    assert.match(payments.detail, /WhatsApp/);
  } finally {
    Object.assign(envMap, previous);
  }
});
