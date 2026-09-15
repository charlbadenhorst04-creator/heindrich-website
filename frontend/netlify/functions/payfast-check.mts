/**
 * A test bench for the Payfast handover.
 *
 * Payfast answers a rejected payment with a bare "400 Bad Request" page
 * and no reason, which leaves guessing as the only way to debug it - and
 * guessing wasted a launch evening. This page shows exactly what the site
 * would send, including the precise string the signature is computed
 * from, and lets that payload be posted to Payfast by hand.
 *
 * Crucially it can post the same payload with and without the signature.
 * Payfast only requires a signature when the account has a passphrase
 * set, so if the unsigned attempt is accepted and the signed one is not,
 * the signature is the fault - which no amount of reading the code can
 * establish on its own.
 *
 * It refuses to run in live mode: the string it prints is exactly what an
 * attacker would need to forge a payment.
 */
import type { Config } from "@netlify/functions";

import { env } from "./_shared/env.mts";
import {
  PAYFAST_CREDENTIALS,
  PAYFAST_HOST,
  buildCheckoutFields,
  hasPassphrase,
  signatureSource,
} from "./_shared/payfast.mts";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export default async (req: Request) => {
  // Read at request time as well as at load: flipping PAYFAST_MODE to live
  // must close this page on the next request, not on the next cold start.
  if (env("PAYFAST_MODE", "sandbox") === "live" || PAYFAST_CREDENTIALS.mode === "live") {
    return new Response(
      "Not available in live mode - this page prints the exact string a payment is signed from.",
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const siteUrl = (env("STORE_URL") || env("URL")).replace(/\/+$/, "");
  const fields = buildCheckoutFields({
    orderId: "00000000-1111-2222-3333-444444444444",
    amount: 191,
    itemName: "MERAVO test order",
    customerEmail: "test@example.com",
    customerName: "Test Buyer",
    returnUrl: env("PAYFAST_RETURN_URL") || `${siteUrl}/order-success`,
    cancelUrl: env("PAYFAST_CANCEL_URL") || `${siteUrl}/cart`,
    notifyUrl: env("PAYFAST_NOTIFY_URL") || `${siteUrl}/api/payments/payfast/notify`,
  });

  const { signature, ...signed } = fields;
  // The passphrase is deliberately left out of what is printed. Its
  // presence is reported, its value never is.
  const source = signatureSource(signed, "");

  const rows = Object.entries(fields)
    .map(
      ([key, value]) =>
        `<tr><td style="padding:6px 14px 6px 0;font-family:monospace;color:#7a2436;white-space:nowrap;">${escapeHtml(key)}</td>` +
        `<td style="padding:6px 0;font-family:monospace;word-break:break-all;">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  const hidden = (withSignature: boolean) =>
    Object.entries(fields)
      .filter(([key]) => withSignature || key !== "signature")
      .map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}">`)
      .join("");

  const action = `${PAYFAST_HOST}/eng/process`;
  const button =
    "padding:12px 18px;border:0;border-radius:10px;background:#7a2436;color:#fff;font-size:15px;cursor:pointer;";

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Payfast check</title></head>
<body style="margin:0;background:#fdf6f3;font-family:Helvetica,Arial,sans-serif;color:#4a1520;">
<div style="max-width:760px;margin:0 auto;padding:28px 18px;">
  <h1 style="font-size:20px;color:#611c2b;margin:0 0 6px;">Payfast handover check</h1>
  <p style="margin:0 0 20px;font-size:13px;color:#8f2f40;">
    Mode: <strong>${escapeHtml(PAYFAST_CREDENTIALS.mode)}</strong> &middot;
    posting to <strong>${escapeHtml(action)}</strong> &middot;
    passphrase configured: <strong>${hasPassphrase() ? "yes" : "no"}</strong> &middot;
    build: <strong>${escapeHtml((env("COMMIT_REF") || "unknown").slice(0, 7))}</strong>
  </p>

  <h2 style="font-size:15px;color:#611c2b;">What would be posted</h2>
  <div style="background:#fff;border-radius:12px;padding:14px 18px;overflow-x:auto;">
    <table style="font-size:13px;border-collapse:collapse;">${rows}</table>
  </div>

  <h2 style="font-size:15px;color:#611c2b;">The exact string the signature is built from</h2>
  <div style="background:#fff;border-radius:12px;padding:14px 18px;font-family:monospace;font-size:12px;word-break:break-all;">
    ${escapeHtml(source)}${hasPassphrase() ? '<span style="color:#8f2f40;">&amp;passphrase=(set, not shown)</span>' : ""}
  </div>

  <h2 style="font-size:15px;color:#611c2b;">Send it to Payfast</h2>
  <p style="font-size:13px;color:#6b4450;margin:0 0 14px;">
    Try the signed one first. If it fails and the unsigned one works, the
    signature is wrong. If both fail, the fault is in the fields, not the
    signature.
  </p>
  <div style="display:flex;gap:12px;flex-wrap:wrap;">
    <form method="POST" action="${escapeHtml(action)}">${hidden(true)}
      <button type="submit" style="${button}">Post WITH signature</button>
    </form>
    <form method="POST" action="${escapeHtml(action)}">${hidden(false)}
      <button type="submit" style="${button}background:#96692b;">Post WITHOUT signature</button>
    </form>
  </div>
</div></body></html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
};

export const config: Config = {
  path: "/api/payfast-check",
};
