/**
 * Whether the shop can take a payment right now.
 *
 * Payment goes through Stitch (card and Pay by Bank on Stitch's hosted
 * page). Until Stitch's client credentials are configured, checkout says
 * so plainly and offers WhatsApp instead - a checkout that ends at a
 * payment provider's error page is worse than one that admits it is not
 * taking cards yet. Add the credentials and checkout opens by itself.
 */
import { env } from "./env.mts";
import { stitchConfigured } from "./stitch.mts";

export type PaymentProvider = "stitch";

export function activeProvider(): PaymentProvider | null {
  return stitchConfigured() ? "stitch" : null;
}

export interface PaymentsStatus {
  enabled: boolean;
  provider: PaymentProvider | null;
  /** Shown to the customer in place of the pay button. Empty when open. */
  message: string;
}

export function paymentsStatus(): PaymentsStatus {
  const closedMessage =
    env("PAYMENTS_CLOSED_MESSAGE") ||
    "Card payments open here shortly. In the meantime send us your order on " +
      "WhatsApp and we'll get it on its way.";

  // PAYMENTS_ENABLED can close checkout by hand (stock-take, a holiday),
  // but not force it open: with no Stitch account behind it, an open
  // checkout only sends customers to a payment that fails.
  const override = env("PAYMENTS_ENABLED").trim().toLowerCase();
  if (override === "false" || override === "0" || override === "no") {
    return { enabled: false, provider: null, message: closedMessage };
  }

  const provider = activeProvider();
  if (!provider) return { enabled: false, provider: null, message: closedMessage };
  return { enabled: true, provider, message: "" };
}
