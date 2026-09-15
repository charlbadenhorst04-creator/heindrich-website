/**
 * Whether the shop can actually take a payment right now.
 *
 * Payfast will not process anything without a real merchant account, and
 * a shop whose checkout ends at Payfast's blank "400 Bad Request" page is
 * worse than one that says plainly it is not taking card payments yet. So
 * the storefront asks this before offering to charge anyone.
 *
 * It defaults to working this out rather than being told: the shared demo
 * merchant id Payfast publishes in its documentation cannot complete a
 * payment, and neither can a missing one. Put real credentials in and
 * checkout comes back on its own, with nothing to remember to switch.
 */
import { env } from "./env.mts";

/** Payfast's public sample credentials. Anyone can read them; nobody can
 * take money with them. */
const DEMO_MERCHANT_IDS = new Set(["10000100"]);

export interface PaymentsStatus {
  enabled: boolean;
  /** Shown to the customer in place of the pay button. Empty when open. */
  message: string;
}

export function paymentsStatus(): PaymentsStatus {
  const closedMessage =
    env("PAYMENTS_CLOSED_MESSAGE") ||
    "Card payments open here shortly. In the meantime send us your order on " +
      "WhatsApp and we'll get it on its way.";

  // An explicit setting always wins, in either direction.
  const override = env("PAYMENTS_ENABLED").trim().toLowerCase();
  if (override === "false" || override === "0" || override === "no") {
    return { enabled: false, message: closedMessage };
  }
  if (override === "true" || override === "1" || override === "yes") {
    return { enabled: true, message: "" };
  }

  const merchantId = env("PAYFAST_MERCHANT_ID").trim();
  const merchantKey = env("PAYFAST_MERCHANT_KEY").trim();
  if (!merchantId || !merchantKey || DEMO_MERCHANT_IDS.has(merchantId)) {
    return { enabled: false, message: closedMessage };
  }

  return { enabled: true, message: "" };
}
