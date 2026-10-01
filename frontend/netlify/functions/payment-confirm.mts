/**
 * Where the order-success page asks "did this actually get paid?".
 *
 * For a Stitch order this does the asking: it fetches the payment request's
 * real state from Stitch, server to server, and settles the order if Stitch
 * says it completed. The customer's browser arrives back with a status on
 * the URL, but Stitch's own documentation warns that status can be tampered
 * with - so it is never read here. Only the order id is taken from the
 * caller, and all that does is choose which order to go and check.
 */
import type { Config } from "@netlify/functions";

import { errorResponse, isUuid, jsonResponse, readyDb } from "./_shared/db.mts";
import { reconcileStitchOrder } from "./_shared/reconcile.mts";
import { stitchConfigured } from "./_shared/stitch.mts";

export default async (req: Request) => {
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  let orderId: unknown;
  try {
    ({ order_id: orderId } = await req.json());
  } catch {
    return errorResponse("Expected a JSON body with order_id");
  }
  if (typeof orderId !== "string" || !isUuid(orderId)) {
    return errorResponse("Order not found", 404);
  }

  const database = await readyDb();
  const orders = (await database.sql`SELECT * FROM orders WHERE id = ${orderId}`) as any[];
  if (orders.length === 0) return errorResponse("Order not found", 404);
  const order = orders[0];

  let status: string = order.status;
  // Orders from before Stitch (test orders) have no Stitch reference and
  // are simply reported as they stand.
  if (order.payment_provider === "stitch" && status !== "paid" && stitchConfigured()) {
    try {
      status = await reconcileStitchOrder(database, order);
    } catch (error) {
      // Stitch unreachable for a moment: report what is known and let the
      // page ask again. The webhook will settle it regardless.
      console.error(`Order ${orderId}: could not check with Stitch`, error);
    }
  }

  return jsonResponse({ order_id: orderId, status });
};

export const config: Config = {
  path: "/api/payments/confirm",
};
