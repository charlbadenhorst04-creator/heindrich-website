/**
 * Whether the shop can take a payment right now, and through whom.
 *
 * Two providers are wired in: Stitch (card and Pay by Bank on Stitch's
 * hosted page) and Payfast. Whichever has real credentials configured is
 * used, Stitch first if both do - so the shop switches the moment either
 * account is approved, with nothing to remember to turn on.
 *
 * When neither is usable, checkout says so plainly and offers WhatsApp
 * instead. A checkout that ends at a payment provider's blank error page is
 * worse than one that admits it is not taking cards yet.
 */
import { env } from "./env.mts";
import { stitchConfigured } from "./stitch.mts";

export type PaymentProvider = "stitch" | "payfast";

/** Payfast's public sample credentials. Anyone can read them; nobody can
 * take money with them. */
const PAYFAST_DEMO_MERCHANT_IDS = new Set(["10000100"]);

export function payfastConfigured(): boolean {
  const merchantId = env("PAYFAST_MERCHANT_ID").trim();
  const merchantKey = env("PAYFAST_MERCHANT_KEY").trim();
  return Boolean(merchantId && merchantKey && !PAYFAST_DEMO_MERCHANT_IDS.has(merchantId));
}

/**
 * The provider checkout will use, or null when none can take money.
 *
 * PAYMENT_PROVIDER pins one explicitly. Pinned to a provider that is not
 * configured, the answer is null rather than a silent fall back to the
 * other: someone who pinned Stitch and forgot the secret should see
 * checkout close, not watch payments quietly route to an account they
 * meant to retire.
 */
export function activeProvider(): PaymentProvider | null {
  const pinned = env("PAYMENT_PROVIDER").trim().toLowerCase();
  if (pinned === "stitch") return stitchConfigured() ? "stitch" : null;
  if (pinned === "payfast") return payfastConfigured() ? "payfast" : null;
  if (stitchConfigured()) return "stitch";
  if (payfastConfigured()) return "payfast";
  return null;
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

  // An explicit setting always wins, in either direction.
  const override = env("PAYMENTS_ENABLED").trim().toLowerCase();
  if (override === "false" || override === "0" || override === "no") {
    return { enabled: false, provider: null, message: closedMessage };
  }
  if (override === "true" || override === "1" || override === "yes") {
    // Forced open: use whatever is configured, Payfast if nothing is, which
    // is how the test suite drives the Payfast path on demo credentials.
    return { enabled: true, provider: activeProvider() ?? "payfast", message: "" };
  }

  const provider = activeProvider();
  if (!provider) return { enabled: false, provider: null, message: closedMessage };
  return { enabled: true, provider, message: "" };
}
