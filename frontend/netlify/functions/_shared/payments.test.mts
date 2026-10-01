/**
 * Whether the shop offers to charge anyone.
 *
 * This exists because a checkout that ends at a payment provider's error
 * page is worse than one that says plainly it is not taking cards yet -
 * and because the thing that decides it, whether there is a real Stitch
 * account behind the site, is easy to get wrong in both directions.
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

const STITCH = { STITCH_CLIENT_ID: "test-meravo", STITCH_CLIENT_SECRET: "secret" };

describe("whether payments are open", () => {
  beforeEach(() => configure({}));

  it("is closed when no Stitch account is configured", () => {
    const status = paymentsStatus();
    assert.equal(status.enabled, false);
    assert.equal(status.provider, null);
    assert.match(status.message, /WhatsApp/);
  });

  it("needs both halves of Stitch's credentials", () => {
    configure({ STITCH_CLIENT_ID: "test-meravo" });
    assert.equal(paymentsStatus().enabled, false, "a client id with no secret cannot take payment");

    configure({ STITCH_CLIENT_SECRET: "secret" });
    assert.equal(paymentsStatus().enabled, false, "a secret with no client id cannot take payment");
  });

  it("opens by itself, on Stitch, once the credentials are in place", () => {
    // The point of deciding this from the credentials rather than from a
    // separate switch: there is nothing left to remember to turn back on.
    configure(STITCH);
    const status = paymentsStatus();
    assert.equal(status.enabled, true);
    assert.equal(status.provider, "stitch");
    assert.equal(status.message, "");
  });

  it("ignores old Payfast settings left behind in Netlify", () => {
    // Payfast was removed. Its variables lingering in the dashboard must
    // neither open checkout nor send anyone anywhere.
    configure({ PAYFAST_MERCHANT_ID: "20000123", PAYFAST_MERCHANT_KEY: "abc123def456" });
    assert.equal(paymentsStatus().enabled, false);

    configure({ ...STITCH, PAYMENT_PROVIDER: "payfast" });
    assert.equal(paymentsStatus().provider, "stitch");
  });

  it("can be closed by hand even with Stitch configured", () => {
    configure({ ...STITCH, PAYMENTS_ENABLED: "false" });
    assert.equal(paymentsStatus().enabled, false, "an explicit close was ignored");
  });

  it("will not open by hand with no Stitch account to take the money", () => {
    // Forcing it open would only send customers to a payment that fails.
    configure({ PAYMENTS_ENABLED: "true" });
    assert.equal(paymentsStatus().enabled, false);
  });

  it("uses the shop's own wording when one is configured", () => {
    configure({ PAYMENTS_CLOSED_MESSAGE: "Bel ons op 067 157 2670." });
    assert.equal(paymentsStatus().message, "Bel ons op 067 157 2670.");
  });
});
