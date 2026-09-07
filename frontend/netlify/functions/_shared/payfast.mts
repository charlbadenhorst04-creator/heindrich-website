/**
 * Payfast integration - Netlify mirror of backend/app/services/payfast.py.
 *
 * Card details never touch this function; Payfast's own hosted page
 * captures them, and funds settle to whatever South African bank account
 * is linked on the merchant's own Payfast dashboard.
 */
import crypto from "node:crypto";

const PAYFAST_MODE = Netlify.env.get("PAYFAST_MODE") ?? "sandbox";
const PAYFAST_MERCHANT_ID = Netlify.env.get("PAYFAST_MERCHANT_ID") ?? "10000100";
const PAYFAST_MERCHANT_KEY = Netlify.env.get("PAYFAST_MERCHANT_KEY") ?? "46f0cd694581a";
const PAYFAST_PASSPHRASE = Netlify.env.get("PAYFAST_PASSPHRASE") ?? "";

export const PAYFAST_HOST =
  PAYFAST_MODE === "live" ? "https://www.payfast.co.za" : "https://sandbox.payfast.co.za";

function phpStyleEncode(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, "+");
}

/**
 * Payfast's own samples differ between the two directions: the checkout
 * example omits empty fields, while the ITN example signs every field as
 * received. `skipEmpty` selects which convention to use.
 */
export function buildSignature(
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
  return crypto.createHash("md5").update(query, "utf-8").digest("hex");
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

  const fields: Record<string, string> = {
    merchant_id: PAYFAST_MERCHANT_ID,
    merchant_key: PAYFAST_MERCHANT_KEY,
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
  fields.signature = buildSignature(fields, PAYFAST_PASSPHRASE);
  return fields;
}

export async function verifyItnWithPayfast(rawBody: Record<string, string>): Promise<boolean> {
  const response = await fetch(`${PAYFAST_HOST}/eng/query/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(rawBody).toString(),
  });
  const text = await response.text();
  return text.trim() === "VALID";
}
