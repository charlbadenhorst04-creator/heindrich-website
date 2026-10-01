/**
 * Whether the shop offers to charge anyone.
 *
 * This exists because a shop whose checkout ends at Payfast's blank "400
 * Bad Request" page is worse than one that says plainly it is not taking
 * cards yet - and because the thing that decides it, whether there is a
 * real merchant account behind the site, is easy to get wrong in both
 * directions.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

const envMap: Record<string, string> = {};
// @ts-expect-error - the real Netlify runtime provides this global
globalThis.Netlify = { env: { get: (key: string) => envMap[key] } };

const { paymentsStatus } = await import("./payments.mts");

function configure(values: Record<string, string>) {
  for (const key of Object.keys(envMap)) delete envMap[key];
  Object.assign(envMap, values);
}

describe("whether payments are open", () => {
  beforeEach(() => configure({}));

  it("is closed on Payfast's shared demo credentials", () => {
    // The pair published in Payfast's own documentation. Anyone can read
    // them and nobody can take money with them, which is exactly the
    // situation that ended a real checkout at a 400 page.
    configure({ PAYFAST_MERCHANT_ID: "10000100", PAYFAST_MERCHANT_KEY: "46f0cd694581a" });

    const status = paymentsStatus();
    assert.equal(status.enabled, false);
    assert.match(status.message, /WhatsApp/);
  });

  it("is closed when no merchant account is configured at all", () => {
    configure({});
    assert.equal(paymentsStatus().enabled, false);

    configure({ PAYFAST_MERCHANT_ID: "20000123" });
    assert.equal(paymentsStatus().enabled, false, "a merchant id with no key cannot take payment");
  });

  it("opens by itself once real credentials are in place", () => {
    // The point of deciding this from the credentials rather than from a
    // separate switch: there is nothing left to remember to turn back on.
    configure({ PAYFAST_MERCHANT_ID: "20000123", PAYFAST_MERCHANT_KEY: "abc123def456" });

    const status = paymentsStatus();
    assert.equal(status.enabled, true);
    assert.equal(status.message, "");
  });

  it("lets an explicit setting win either way", () => {
    configure({
      PAYFAST_MERCHANT_ID: "20000123",
      PAYFAST_MERCHANT_KEY: "abc123def456",
      PAYMENTS_ENABLED: "false",
    });
    assert.equal(paymentsStatus().enabled, false, "an explicit close was ignored");

    configure({ PAYFAST_MERCHANT_ID: "10000100", PAYMENTS_ENABLED: "true" });
    assert.equal(paymentsStatus().enabled, true, "an explicit open was ignored");
  });

  it("uses the shop's own wording when one is configured", () => {
    configure({ PAYMENTS_CLOSED_MESSAGE: "Bel ons op 067 157 2670." });
    assert.equal(paymentsStatus().message, "Bel ons op 067 157 2670.");
  });
});

describe("which provider takes the payment", () => {
  beforeEach(() => configure({}));

  it("uses Stitch when Stitch's credentials are in place", () => {
    configure({ STITCH_CLIENT_ID: "test-meravo", STITCH_CLIENT_SECRET: "secret" });
    const status = paymentsStatus();
    assert.equal(status.enabled, true);
    assert.equal(status.provider, "stitch");
  });

  it("prefers Stitch when both accounts are set up", () => {
    configure({
      STITCH_CLIENT_ID: "test-meravo",
      STITCH_CLIENT_SECRET: "secret",
      PAYFAST_MERCHANT_ID: "20000123",
      PAYFAST_MERCHANT_KEY: "abc123def456",
    });
    assert.equal(paymentsStatus().provider, "stitch");
  });

  it("falls back to Payfast when only Payfast is configured", () => {
    configure({ PAYFAST_MERCHANT_ID: "20000123", PAYFAST_MERCHANT_KEY: "abc123def456" });
    assert.equal(paymentsStatus().provider, "payfast");
  });

  it("stays closed, rather than quietly switching, when the pinned provider is not configured", () => {
    // Someone who pins Stitch and forgets the secret should see checkout
    // close - not watch money route to an account they meant to retire.
    configure({
      PAYMENT_PROVIDER: "stitch",
      PAYFAST_MERCHANT_ID: "20000123",
      PAYFAST_MERCHANT_KEY: "abc123def456",
    });
    const status = paymentsStatus();
    assert.equal(status.enabled, false);
    assert.equal(status.provider, null);
  });

  it("honours a pin to Payfast even with Stitch configured", () => {
    configure({
      PAYMENT_PROVIDER: "payfast",
      STITCH_CLIENT_ID: "test-meravo",
      STITCH_CLIENT_SECRET: "secret",
      PAYFAST_MERCHANT_ID: "20000123",
      PAYFAST_MERCHANT_KEY: "abc123def456",
    });
    assert.equal(paymentsStatus().provider, "payfast");
  });

  it("needs both halves of Stitch's credentials", () => {
    configure({ STITCH_CLIENT_ID: "test-meravo" });
    assert.equal(paymentsStatus().enabled, false);
  });
});
