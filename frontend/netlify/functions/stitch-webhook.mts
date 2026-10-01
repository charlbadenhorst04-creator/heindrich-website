/**
 * Stitch's webhook: the confirmation that does not depend on the customer.
 *
 * The return-page check settles most orders, but only if the customer's
 * browser makes it back. Someone who pays and then closes the tab, loses
 * signal, or has their phone die still paid - this is what catches them.
 *
 * Two layers, deliberately:
 *
 *   1. When STITCH_WEBHOOK_SECRET is set, the signature is checked first and
 *      anything that fails it is rejected outright. That keeps strangers
 *      from making this site call Stitch's API on their behalf.
 *   2. Even a correctly signed webhook is not believed. Its body only says
 *      which order to look at; the order's real state is fetched from
 *      Stitch, server to server, and only that decides anything. A forged,
 *      replayed or simply out-of-date webhook can therefore never mark an
 *      order paid - at worst it causes one extra question to Stitch.
 */
import type { Config } from "@netlify/functions";

import { isUuid, readyDb } from "./_shared/db.mts";
import { env } from "./_shared/env.mts";
import { reconcileStitchOrder } from "./_shared/reconcile.mts";
import { verifyWebhookSignature, webhookCandidates } from "./_shared/stitch.mts";

export default async (req: Request) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  // The signature covers the body byte for byte, so it has to be read raw.
  const body = await req.text();

  const secret = env("STITCH_WEBHOOK_SECRET").trim();
  if (secret) {
    const valid = verifyWebhookSignature({
      id: req.headers.get("svix-id") ?? req.headers.get("webhook-id"),
      timestamp: req.headers.get("svix-timestamp") ?? req.headers.get("webhook-timestamp"),
      signature: req.headers.get("svix-signature") ?? req.headers.get("webhook-signature"),
      body,
      secret,
    });
    if (!valid) return new Response("invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("expected JSON", { status: 400 });
  }

  const { ids, externalReferences } = webhookCandidates(payload);
  const orderIds = externalReferences.filter(isUuid);
  if (orderIds.length === 0 && ids.length === 0) {
    // Nothing that could name an order. Acknowledged so it is not retried.
    return new Response("OK", { status: 200 });
  }

  const database = await readyDb();
  // Only orders this shop created, found by our own id or by the Stitch
  // reference we stored when we created the request. An id that matches
  // neither is simply ignored.
  const orders = (await database.sql`
    SELECT * FROM orders
    WHERE payment_provider = 'stitch'
      AND (id::text = ANY(${orderIds}) OR (provider_reference <> '' AND provider_reference = ANY(${ids})))
    LIMIT 5
  `) as any[];

  try {
    for (const order of orders) {
      await reconcileStitchOrder(database, order);
    }
  } catch (error) {
    // Stitch's API unreachable right now. A 500 makes the webhook service
    // retry later, which is exactly what is wanted.
    console.error("Stitch webhook: could not reconcile", error);
    return new Response("retry", { status: 500 });
  }

  return new Response("OK", { status: 200 });
};

export const config: Config = {
  path: "/api/payments/stitch/webhook",
};
