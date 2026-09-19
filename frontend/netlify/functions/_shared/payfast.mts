/**
 * Payfast integration - Netlify mirror of backend/app/services/payfast.py.
 *
 * Card details never touch this function; Payfast's own hosted page
 * captures them, and funds settle to whatever South African bank account
 * is linked on the merchant's own Payfast dashboard.
 */
import crypto from "node:crypto";

import { env } from "./env.mts";

/**
 * Read per call, not once at import.
 *
 * These used to be module constants with Payfast's demo credentials as
 * their fallback, which hid a real misconfiguration: when the merchant id
 * was not reachable at runtime the site quietly used the demo account
 * instead, and the only symptom was Payfast rejecting every payment with
 * a blank 400 page. There is no fallback now - an unset variable reads as
 * empty, which the shop treats as "no merchant account", closes checkout
 * and says so.
 */
function merchantId(): string {
  return env("PAYFAST_MERCHANT_ID");
}

function merchantKey(): string {
  return env("PAYFAST_MERCHANT_KEY");
}

function passphrase(): string {
  return env("PAYFAST_PASSPHRASE");
}

export function payfastMode(): string {
  return env("PAYFAST_MODE", "sandbox");
}

export function payfastHost(): string {
  return payfastMode() === "live"
    ? "https://www.payfast.co.za"
    : "https://sandbox.payfast.co.za";
}

function phpStyleEncode(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, "+");
}

/**
 * Payfast's own samples differ between the two directions: the checkout
 * example omits empty fields, while the ITN example signs every field as
 * received. `skipEmpty` selects which convention to use.
 */
export function signatureSource(
  fields: Record<string, string>,
  passphrase = "",
  skipEmpty = true,
): string {
  const pairs = Object.entries(fields)
    .filter(([key, value]) => key !== "signature" && !(skipEmpty && value === ""))
    .map(([key, value]) => `${key}=${phpStyleEncode(value)}`);
  let query = pairs.join("&");
  if (passphrase) {
    query += `&passphrase=${phpStyleEncode(passphrase)}`;
  }
  return query;
}

export function buildSignature(
  fields: Record<string, string>,
  passphrase = "",
  skipEmpty = true,
): string {
  return crypto
    .createHash("md5")
    .update(signatureSource(fields, passphrase, skipEmpty), "utf-8")
    .digest("hex");
}

/** Whether a passphrase is configured, without revealing it. */
export function hasPassphrase(): boolean {
  return passphrase() !== "";
}

export function payfastCredentials() {
  return { merchantId: merchantId(), merchantKey: merchantKey(), mode: payfastMode() };
}

/**
 * Validates an incoming ITN signature, accepting either Payfast
 * convention so a genuine notification is never rejected - and an order
 * never left unpaid - over a formatting difference. Authenticity itself
 * is established by posting the payload back to Payfast.
 */
export function signatureMatches(data: Record<string, string>, passphrase = ""): boolean {
  const received = data.signature ?? "";
  if (!received) return false;
  return [false, true].some((skipEmpty) => received === buildSignature(data, passphrase, skipEmpty));
}

export function buildCheckoutFields(opts: {
  orderId: string;
  amount: number;
  itemName: string;
  customerEmail: string;
  customerName: string;
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
}): Record<string, string> {
  const [firstName, ...rest] = opts.customerName.trim().split(" ");
  const lastName = rest.join(" ");

  const candidate: Record<string, string> = {
    merchant_id: merchantId(),
    merchant_key: merchantKey(),
    return_url: opts.returnUrl,
    cancel_url: opts.cancelUrl,
    notify_url: opts.notifyUrl,
    name_first: firstName ?? "",
    name_last: lastName ?? "",
    email_address: opts.customerEmail,
    m_payment_id: opts.orderId,
    amount: opts.amount.toFixed(2),
    item_name: opts.itemName.slice(0, 100),
  };

  // Blank fields are dropped rather than posted empty. The signature is
  // built over the non-empty fields (Payfast's own convention), so posting
  // a blank one as well means Payfast signs a different set than we did
  // and rejects the whole thing with "400 Bad Request" - which is what a
  // customer with a one-word name, or a missing URL setting, would hit.
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(candidate)) {
    if (value !== "") fields[key] = value;
  }

  fields.signature = buildSignature(fields, passphrase());
  return fields;
}

export async function verifyItnWithPayfast(rawBody: Record<string, string>): Promise<boolean> {
  const response = await fetch(`${payfastHost()}/eng/query/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(rawBody).toString(),
  });
  const text = await response.text();
  return text.trim() === "VALID";
}
