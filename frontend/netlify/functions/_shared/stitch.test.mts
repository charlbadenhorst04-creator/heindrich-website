/**
 * The Stitch module, driven over real HTTP against a stand-in Stitch.
 *
 * What matters most here is the negative space: a token that is not
 * re-fetched on every payment, a GraphQL error that is not mistaken for
 * success because it came back with a 200, and a webhook signature that a
 * changed byte, a wrong secret or a replay a week later all fail.
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";

import { signWebhook, startFakeStitch, type FakeStitch } from "./fake-stitch-server.mts";

const envMap: Record<string, string> = {};
// @ts-expect-error - the real Netlify runtime provides this global
globalThis.Netlify = { env: { get: (key: string) => envMap[key] } };

const stitch = await import("./stitch.mts");

let fake: FakeStitch;
const ORDER_ID = "7f9f4b0c-1111-4222-8333-444455556666";

function configure(extra: Record<string, string> = {}) {
  for (const key of Object.keys(envMap)) delete envMap[key];
  Object.assign(envMap, {
    STITCH_CLIENT_ID: "test-client-123",
    STITCH_CLIENT_SECRET: "s3cret-value",
    STITCH_TOKEN_URL: fake.tokenUrl,
    STITCH_API_URL: fake.apiUrl,
    ...extra,
  });
}

before(async () => {
  fake = await startFakeStitch();
});

after(async () => {
  await fake.close();
});

beforeEach(() => {
  configure();
  stitch.forgetStitchTokenForTests();
  fake.tokenRequests.length = 0;
  fake.graphqlCalls.length = 0;
  fake.failCreate = null;
  fake.rejectCredentials = null;
  fake.unauthorizedNext = 0;
});

describe("client token", () => {
  it("asks for client credentials with the payment-request scope", async () => {
    const token = await stitch.clientToken();
    assert.match(token, /^tok-/);

    assert.equal(fake.tokenRequests.length, 1);
    const form = fake.tokenRequests[0];
    assert.equal(form.get("grant_type"), "client_credentials");
    assert.equal(form.get("client_id"), "test-client-123");
    assert.equal(form.get("client_secret"), "s3cret-value");
    assert.equal(form.get("scope"), "client_paymentrequest");
  });

  it("reuses one token across payments instead of fetching one each time", async () => {
    const first = await stitch.clientToken();
    await stitch.clientToken();
    await stitch.clientToken();
    assert.equal(fake.tokenRequests.length, 1, "a token was fetched more than once");
    assert.equal(await stitch.clientToken(), first);
  });

  it("does not serve a token minted for a secret that has since changed", async () => {
    await stitch.clientToken();
    envMap.STITCH_CLIENT_SECRET = "rotated-secret";
    await stitch.clientToken();
    assert.equal(fake.tokenRequests.length, 2, "an old secret's token was reused");
  });

  it("throws a clear error, without the secret in it, when Stitch refuses", async () => {
    fake.rejectCredentials = "invalid_client";
    await assert.rejects(stitch.clientToken(), (error: Error) => {
      assert.ok(error instanceof stitch.StitchError);
      assert.match(error.message, /refused the client credentials/);
      assert.ok(!error.message.includes("s3cret-value"), "the client secret leaked into an error");
      return true;
    });
  });

  it("refuses to start with half the credentials", async () => {
    configure({ STITCH_CLIENT_SECRET: "" });
    assert.equal(stitch.stitchConfigured(), false);
    await assert.rejects(stitch.clientToken(), /not both set/);
  });

  it("asks again after Stitch rejects a token mid-session", async () => {
    // A revoked or rotated secret must not leave the shop failing for the
    // rest of the hour on a cached token Stitch no longer honours.
    await stitch.clientToken();
    fake.unauthorizedNext = 1;
    await assert.rejects(stitch.getPaymentRequest("anything"));
    await stitch.getPaymentRequest("anything");
    assert.equal(fake.tokenRequests.length, 2, "a rejected token was not dropped");
  });
});

describe("creating a payment request", () => {
  it("sends the order's amount in rand, with the order id as the external reference", async () => {
    const created = await stitch.createPaymentRequest({
      orderId: ORDER_ID,
      amount: 191,
      returnUrl: "https://meravo.co.za/order-success",
    });

    const stored = fake.requests.get(created.id)!;
    assert.deepEqual(stored.amount, { quantity: 191, currency: "ZAR" });
    assert.equal(stored.externalReference, ORDER_ID);
    // Bank statement references are short; Stitch rejects longer ones.
    assert.ok(stored.variables.payerReference.length <= 12);
    assert.ok(stored.variables.beneficiaryReference.length <= 20);
    assert.match(stored.variables.beneficiaryReference, /^MERAVO [0-9A-F]{8}$/);
  });

  it("rounds to cents so a float never sends R191.0000000001", async () => {
    const created = await stitch.createPaymentRequest({
      orderId: ORDER_ID,
      amount: 0.1 + 0.2 + 190.7,
      returnUrl: "https://meravo.co.za/order-success",
    });
    assert.equal(fake.requests.get(created.id)!.amount.quantity, 191);
  });

  it("sends the customer to Stitch's page with the return address encoded on it", async () => {
    const created = await stitch.createPaymentRequest({
      orderId: ORDER_ID,
      amount: 191,
      returnUrl: "https://meravo.co.za/order-success",
    });
    assert.ok(created.redirectUrl.startsWith(created.url));
    const url = new URL(created.redirectUrl);
    assert.equal(url.searchParams.get("redirect_uri"), "https://meravo.co.za/order-success");
  });

  it("names the settlement account only when all three parts are configured", async () => {
    const without = await stitch.createPaymentRequest({
      orderId: ORDER_ID,
      amount: 50,
      returnUrl: "https://meravo.co.za/order-success",
    });
    assert.ok(!fake.requests.get(without.id)!.query.includes("beneficiary:"));

    configure({
      STITCH_BENEFICIARY_NAME: "Meravo",
      STITCH_BENEFICIARY_BANK_ID: "FNB",
      STITCH_BENEFICIARY_ACCOUNT_NUMBER: "6200 0000 000",
    });
    const withAccount = await stitch.createPaymentRequest({
      orderId: ORDER_ID,
      amount: 50,
      returnUrl: "https://meravo.co.za/order-success",
    });
    const vars = fake.requests.get(withAccount.id)!.variables;
    assert.equal(vars.beneficiaryName, "Meravo");
    assert.equal(vars.beneficiaryBankId, "fnb");
    assert.equal(vars.beneficiaryAccountNumber, "62000000000", "spaces were not removed");
  });

  it("refuses a half-configured settlement account rather than guessing", async () => {
    configure({ STITCH_BENEFICIARY_NAME: "Meravo" });
    await assert.rejects(
      stitch.createPaymentRequest({ orderId: ORDER_ID, amount: 50, returnUrl: "https://meravo.co.za/x" }),
      /must be set together/,
    );
  });

  it("treats a GraphQL error as a failure even though it arrives with a 200", async () => {
    fake.failCreate = "Beneficiary account is not verified";
    await assert.rejects(
      stitch.createPaymentRequest({ orderId: ORDER_ID, amount: 50, returnUrl: "https://meravo.co.za/x" }),
      /Beneficiary account is not verified/,
    );
  });

  it("refuses a plain-http return address before Stitch has to", async () => {
    await assert.rejects(
      stitch.createPaymentRequest({ orderId: ORDER_ID, amount: 50, returnUrl: "http://meravo.co.za/x" }),
      /must be https/,
    );
  });
});

describe("reading a payment request's state", () => {
  it("reports each state Stitch documents", async () => {
    const created = await stitch.createPaymentRequest({
      orderId: ORDER_ID,
      amount: 191,
      returnUrl: "https://meravo.co.za/order-success",
    });

    assert.equal((await stitch.getPaymentRequest(created.id))!.state, "pending");

    for (const [typename, expected] of [
      ["PaymentInitiationRequestCompleted", "completed"],
      ["PaymentInitiationRequestCancelled", "cancelled"],
      ["PaymentInitiationRequestExpired", "expired"],
    ] as const) {
      fake.setState(created.id, typename);
      const request = await stitch.getPaymentRequest(created.id);
      assert.equal(request!.state, expected, typename);
      assert.equal(request!.externalReference, ORDER_ID);
      assert.equal(request!.amountCents, 19100);
    }
  });

  it("treats a state nobody recognises as not paid", () => {
    // Guessing "paid" for an unfamiliar state would mean shipping goods on
    // something nobody understood.
    assert.equal(stitch.mapStitchState("PaymentInitiationRequestSomethingNew"), "unknown");
    assert.notEqual(stitch.mapStitchState("PaymentInitiationRequestSomethingNew"), "completed");
  });

  it("reads Stitch's amount, and refuses one in another currency", () => {
    assert.equal(stitch.amountToCents({ quantity: 191, currency: "ZAR" }), 19100);
    assert.equal(stitch.amountToCents({ quantity: "191.00", currency: "ZAR" }), 19100);
    assert.equal(stitch.amountToCents({ quantity: 191, currency: "USD" }), null);
    assert.equal(stitch.amountToCents(null), null);
  });

  it("answers null for a request Stitch has never heard of", async () => {
    assert.equal(await stitch.getPaymentRequest("cGF5cmVxL25vbmU="), null);
  });
});

describe("webhook signatures", () => {
  const secret = `whsec_${crypto.randomBytes(24).toString("base64")}`;
  const body = JSON.stringify({ data: { externalReference: ORDER_ID } });

  function check(headers: Record<string, string>, bodyText = body, key = secret, nowSeconds?: number) {
    return stitch.verifyWebhookSignature({
      id: headers["svix-id"],
      timestamp: headers["svix-timestamp"],
      signature: headers["svix-signature"],
      body: bodyText,
      secret: key,
      nowSeconds,
    });
  }

  it("accepts a correctly signed webhook", () => {
    assert.equal(check(signWebhook(body, secret)), true);
  });

  it("rejects a body changed by a single byte", () => {
    const headers = signWebhook(body, secret);
    assert.equal(check(headers, body.replace(ORDER_ID, ORDER_ID.replace("7", "8"))), false);
  });

  it("rejects a signature made with another secret", () => {
    const other = `whsec_${crypto.randomBytes(24).toString("base64")}`;
    assert.equal(check(signWebhook(body, other)), false);
  });

  it("rejects a genuine webhook replayed later", () => {
    // The timestamp is inside the signature, so it cannot be refreshed.
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;
    assert.equal(check(signWebhook(body, secret, { timestamp: tenMinutesAgo })), false);
  });

  it("accepts the header when one of several signatures is valid", () => {
    // Svix sends more than one while a secret is being rotated.
    const good = signWebhook(body, secret);
    const headers = { ...good, "svix-signature": `v1,bm90LXRoaXMtb25l ${good["svix-signature"]}` };
    assert.equal(check(headers), true);
  });

  it("rejects anything missing a header", () => {
    const headers = signWebhook(body, secret);
    assert.equal(check({ ...headers, "svix-id": "" }), false);
    assert.equal(check({ ...headers, "svix-timestamp": "" }), false);
    assert.equal(check({ ...headers, "svix-signature": "" }), false);
  });

  it("ignores signature versions it does not know", () => {
    const good = signWebhook(body, secret);
    const headers = { ...good, "svix-signature": good["svix-signature"].replace("v1,", "v2,") };
    assert.equal(check(headers), false);
  });
});

describe("finding the order a webhook is about", () => {
  it("finds ids in Stitch's older nested format", () => {
    const payload = {
      data: {
        client: {
          paymentInitiationRequests: {
            node: { id: "cGF5cmVx", externalReference: ORDER_ID, state: { __typename: "x" } },
          },
        },
      },
    };
    const found = stitch.webhookCandidates(payload);
    assert.ok(found.ids.includes("cGF5cmVx"));
    assert.deepEqual(found.externalReferences, [ORDER_ID]);
  });

  it("finds them in a flat format too", () => {
    const found = stitch.webhookCandidates({ id: "abc", externalReference: ORDER_ID });
    assert.ok(found.ids.includes("abc"));
    assert.deepEqual(found.externalReferences, [ORDER_ID]);
  });

  it("caps what it collects, so a huge body cannot fan out into huge queries", () => {
    const payload = { items: Array.from({ length: 500 }, (_, i) => ({ id: `id-${i}` })) };
    assert.ok(stitch.webhookCandidates(payload).ids.length <= 20);
  });
});
