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
  buildCheckoutFields,
  hasPassphrase,
  payfastCredentials,
  payfastHost,
  signatureSource,
} from "./_shared/payfast.mts";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export default async (req: Request) => {
  // Read at request time as well as at load: flipping PAYFAST_MODE to live
  // must close this page on the next request, not on the next cold start.
  if (env("PAYFAST_MODE", "sandbox") === "live") {
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

  // Names only for the secret ones; presence is what matters here.
  const WATCHED: [string, boolean][] = [
    ["PAYFAST_MODE", true],
    ["PAYFAST_MERCHANT_ID", true],
    ["PAYFAST_MERCHANT_KEY", false],
    ["PAYFAST_PASSPHRASE", false],
    ["PAYFAST_RETURN_URL", true],
    ["PAYFAST_CANCEL_URL", true],
    ["PAYFAST_NOTIFY_URL", true],
    ["STORE_URL", true],
    ["DATABASE_URL", false],
    ["SMTP_HOST", true],
    ["URL", true],
  ];
  const settingsRows = WATCHED.map(([name, showValue]) => {
    const value = env(name);
    const shown = !value
      ? '<span style="color:#a3283c;">not set</span>'
      : showValue
        ? escapeHtml(value)
        : '<span style="color:#2f7d4f;">set</span>';
    return (
      `<tr><td style="padding:6px 14px 6px 0;font-family:monospace;color:#7a2436;white-space:nowrap;">${name}</td>` +
      `<td style="padding:6px 0;font-family:monospace;word-break:break-all;">${shown}</td></tr>`
    );
  }).join("");

  const rows = Object.entries(fields)
    .map(
      ([key, value]) =>
        `<tr><td style="padding:6px 14px 6px 0;font-family:monospace;color:#7a2436;white-space:nowrap;">${escapeHtml(key)}</td>` +
        `<td style="padding:6px 0;font-family:monospace;word-break:break-all;">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  const hidden = (keys: string[]) =>
    keys
      .filter((key) => key in fields)
      .map(
        (key) =>
          `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(fields[key])}">`,
      )
      .join("");

  const all = Object.keys(fields);
  const withoutSignature = all.filter((key) => key !== "signature");
  // Payfast's four required fields, and nothing else.
  const required = ["merchant_id", "merchant_key", "amount", "item_name"];
  const requiredPlusUrls = [...required, "return_url", "cancel_url", "notify_url"];

  /**
   * Each attempt narrows where the fault is. Payfast answers every
   * rejection identically, so the only way to find the offending field is
   * to keep removing fields until one gets through.
   */
  const attempts: { label: string; keys: string[]; note: string; colour: string }[] = [
    {
      label: "1. Everything, signed",
      keys: all,
      note: "What checkout actually sends today.",
      colour: "#7a2436",
    },
    {
      label: "2. Everything, unsigned",
      keys: withoutSignature,
      note: "Works only if the signature is the problem.",
      colour: "#96692b",
    },
    {
      label: "3. Required fields only",
      keys: required,
      note: "merchant id, key, amount, item name. Fails only if the account itself is rejected.",
      colour: "#4a6b52",
    },
    {
      label: "4. Required fields + the three URLs",
      keys: requiredPlusUrls,
      note: "If 3 works and this fails, one of the URLs is being refused.",
      colour: "#3f5a7a",
    },
  ];

  const action = `${payfastHost()}/eng/process`;
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
    Mode: <strong>${escapeHtml(payfastCredentials().mode)}</strong> &middot;
    posting to <strong>${escapeHtml(action)}</strong> &middot;
    passphrase configured: <strong>${hasPassphrase() ? "yes" : "no"}</strong> &middot;
    build: <strong>${escapeHtml((env("COMMIT_REF") || "unknown").slice(0, 7))}</strong>
  </p>

  <h2 style="font-size:15px;color:#611c2b;">What this site can actually see</h2>
  <p style="margin:0 0 10px;font-size:13px;color:#6b4450;">
    A setting saved in the dashboard but missing here means it was saved on
    another project, saved without the Functions scope, saved for a context
    this deploy is not in, or saved after the last deploy. Environment
    variables only take effect on a new deploy.
  </p>
  <div style="background:#fff;border-radius:12px;padding:14px 18px;overflow-x:auto;">
    <table style="font-size:13px;border-collapse:collapse;">${settingsRows}</table>
  </div>

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
    Try these <strong>in order</strong>, coming back here after each one.
    Note which ones reach a payment page and which give 400. The first one
    that works tells us what the broken one was carrying.
  </p>
  <div style="display:grid;gap:12px;">
    ${attempts
      .map(
        (attempt) => `<form method="POST" action="${escapeHtml(action)}"
      style="background:#fff;border-radius:12px;padding:14px 18px;">
      ${hidden(attempt.keys)}
      <button type="submit" style="${button}background:${attempt.colour};">${escapeHtml(attempt.label)}</button>
      <p style="margin:8px 0 0;font-size:12px;color:#6b4450;">${escapeHtml(attempt.note)}</p>
    </form>`,
      )
      .join("")}
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
