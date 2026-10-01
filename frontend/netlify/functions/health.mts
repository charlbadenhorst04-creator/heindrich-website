/**
 * A plain-English status page for the live site.
 *
 * Launching this shop means setting a handful of environment variables in
 * a dashboard, and when one of them is missing the only symptom is a
 * shop page that says it could not load - which does not tell anyone
 * which variable, or even that a variable is the problem. This answers
 * that question directly: open /api/health in a browser and it says, in
 * words, what is configured and what is not.
 *
 * It deliberately reports only whether a setting is present, never its
 * value, so it is safe to leave reachable on a public site.
 */
import type { Config } from "@netlify/functions";

import { CONNECTION_STRING_VARIABLES, connectionString, readyDb } from "./_shared/db.mts";
import { env, hasEnv } from "./_shared/env.mts";
import { siteOrigin } from "./_shared/origin.mts";
import { paymentsStatus } from "./_shared/payments.mts";
import { clientToken, configuredBeneficiary, looksLikeTestClient } from "./_shared/stitch.mts";

interface Check {
  name: string;
  ok: boolean;
  detail: string;
  /** Set when the check is informational rather than a reason to block. */
  warning?: boolean;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function databaseChecks(): Promise<Check[]> {
  if (!connectionString()) {
    return [
      {
        name: "Database",
        ok: false,
        detail:
          "No database is connected. Add an environment variable named " +
          `${CONNECTION_STRING_VARIABLES[0]} with a Postgres connection ` +
          "string, then redeploy. Nothing else on the shop can work until " +
          "this is set.",
      },
    ];
  }

  try {
    const database = await readyDb();
    const rows = (await database.sql`SELECT count(*)::int AS n FROM products WHERE is_active`) as any[];
    const products = rows[0]?.n ?? 0;
    return [
      { name: "Database", ok: true, detail: "Connected, and the tables exist." },
      {
        name: "Catalogue",
        ok: products > 0,
        detail:
          products > 0
            ? `${products} product${products === 1 ? "" : "s"} on sale.`
            : "The database is connected but has no products in it yet.",
      },
    ];
  } catch (error) {
    return [
      {
        name: "Database",
        ok: false,
        detail:
          "A database is configured but could not be reached: " +
          `${message(error)}. Check that the connection string is complete ` +
          "and that the database still exists.",
      },
    ];
  }
}

async function paymentChecks(req: Request): Promise<Check[]> {
  const checks: Check[] = [];
  const status = paymentsStatus();

  // The single most expensive mistake available: going live on Payfast's
  // published demo merchant, so every "sale" is fake money. Checked first
  // and regardless of which provider is active.
  if (env("PAYFAST_MODE") === "live" && env("PAYFAST_MERCHANT_ID") === "10000100") {
    checks.push({
      name: "Payfast credentials",
      ok: false,
      detail:
        "PAYFAST_MODE is live but PAYFAST_MERCHANT_ID is still Payfast's " +
        "sandbox test account. Real money will not reach your bank until " +
        "you put your own merchant ID and key in.",
    });
  }

  if (!status.enabled) {
    checks.push({
      name: "Payments",
      ok: false,
      detail:
        "Not taking card payments yet - checkout offers WhatsApp instead. " +
        "Add STITCH_CLIENT_ID and STITCH_CLIENT_SECRET from Stitch (or real " +
        "Payfast credentials) and redeploy, and checkout opens by itself.",
    });
    return checks;
  }

  if (status.provider === "stitch") {
    checks.push({
      name: "Payments",
      ok: true,
      detail: looksLikeTestClient()
        ? "Stitch, with a TEST client - payments are simulated and no real money moves. Swap in the live client's id and secret to take real payments."
        : "Stitch - card and Pay by Bank on Stitch's secure page.",
    });

    // Actually asks Stitch, rather than only checking a variable exists:
    // a mistyped secret looks exactly like a correct one until a customer
    // tries to pay. The token is cached, so this is not a call per visit.
    try {
      await clientToken();
      checks.push({ name: "Stitch connection", ok: true, detail: "Stitch accepted the credentials." });
    } catch (error) {
      checks.push({
        name: "Stitch connection",
        ok: false,
        detail: `${message(error)}. Check STITCH_CLIENT_ID and STITCH_CLIENT_SECRET.`,
      });
    }

    try {
      const account = configuredBeneficiary();
      checks.push({
        name: "Settlement account",
        ok: true,
        detail: account
          ? // Never the whole number - this page is public.
            `Paid into the ${account.bankId.toUpperCase()} account ending ${account.accountNumber.slice(-4)}.`
          : "Paid into the account Stitch holds for the business.",
      });
    } catch (error) {
      checks.push({ name: "Settlement account", ok: false, detail: message(error) });
    }

    checks.push(
      hasEnv("STITCH_WEBHOOK_SECRET")
        ? { name: "Stitch webhook", ok: true, detail: "Set - payments are confirmed even if the customer closes the page before coming back." }
        : {
            name: "Stitch webhook",
            ok: false,
            warning: true,
            detail:
              "No STITCH_WEBHOOK_SECRET. Payments still settle when the customer " +
              "returns to the shop, but someone who pays and then closes the tab " +
              "stays 'pending' until you check. Add a webhook at Stitch for the " +
              `"payment" event pointing at ${siteOrigin(req)}/api/payments/stitch/webhook, ` +
              "and put its secret here.",
          },
    );
  } else {
    const live = env("PAYFAST_MODE", "sandbox") === "live";
    checks.push({
      name: "Payments",
      ok: true,
      detail: live
        ? "Payfast, live mode - real payments will be taken."
        : "Payfast, sandbox mode - test payments only. No real money moves.",
    });
  }

  checks.push({
    name: "Return address",
    ok: true,
    detail:
      "Customers are sent back to whichever address they are shopping on - " +
      `for this visit, ${siteOrigin(req)}. Nothing to change when the domain moves.`,
  });

  return checks;
}

function emailCheck(): Check {
  if (!hasEnv("SMTP_HOST")) {
    return {
      name: "Order emails",
      ok: false,
      warning: true,
      detail:
        "Off. Nobody is emailed when an order is paid. Set SMTP_HOST, " +
        "SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD and SHOP_OWNER_EMAIL to " +
        "turn this on. The shop still works without it.",
    };
  }
  if (!hasEnv("SMTP_USERNAME") || !hasEnv("SMTP_PASSWORD")) {
    return {
      name: "Order emails",
      ok: false,
      detail:
        `A mail server is set (${env("SMTP_HOST")}) but SMTP_USERNAME or ` +
        "SMTP_PASSWORD is missing, so sending will fail.",
    };
  }
  return {
    name: "Order emails",
    ok: true,
    detail: `Sending through ${env("SMTP_HOST")} to ${env("SHOP_OWNER_EMAIL", "(SHOP_OWNER_EMAIL not set)")}.`,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function htmlPage(checks: Check[], ready: boolean): string {
  const rows = checks
    .map((check) => {
      const mark = check.ok ? "&#10003;" : check.warning ? "!" : "&#10007;";
      const colour = check.ok ? "#2f7d4f" : check.warning ? "#96692b" : "#a3283c";
      return `<li style="display:flex;gap:12px;padding:14px 0;border-bottom:1px solid #f3e2e4;">
  <span style="color:${colour};font-weight:bold;font-size:18px;line-height:1.3;">${mark}</span>
  <span><strong style="color:#611c2b;">${escapeHtml(check.name)}</strong><br>
  <span style="color:#6b4450;">${escapeHtml(check.detail)}</span></span>
</li>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MERAVO status</title></head>
<body style="margin:0;background:#fdf6f3;font-family:Helvetica,Arial,sans-serif;">
<div style="max-width:620px;margin:0 auto;padding:28px 18px;">
  <p style="margin:0 0 4px;font-size:22px;font-weight:bold;color:#7a2436;letter-spacing:2px;">MERAVO</p>
  <h1 style="margin:0 0 18px;font-size:19px;color:#611c2b;">
    ${ready ? "The shop is ready to take orders." : "The shop is not ready yet."}
  </h1>
  <ul style="list-style:none;margin:0;padding:0;background:#fff;border-radius:14px;padding:6px 20px;">
    ${rows}
  </ul>
  <p style="margin:18px 0 0;font-size:12px;color:#8f2f40;">
    This page only says whether a setting exists - it never shows passwords or keys.
  </p>
</div></body></html>`;
}

export default async (req: Request) => {
  const checks = [...(await databaseChecks()), ...(await paymentChecks(req)), emailCheck()];
  // Warnings describe things the shop can run without, so they do not by
  // themselves mean it is broken.
  const ready = checks.every((check) => check.ok || check.warning);

  const wantsHtml = (req.headers.get("accept") ?? "").includes("text/html");
  const headers = { "Cache-Control": "no-store" };

  if (wantsHtml) {
    return new Response(htmlPage(checks, ready), {
      status: 200,
      headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return new Response(JSON.stringify({ ready, checks }, null, 2), {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json" },
  });
};

export const config: Config = {
  path: "/api/health",
};
