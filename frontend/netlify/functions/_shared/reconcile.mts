/**
 * Brings an order in line with what Stitch says actually happened.
 *
 * Called from two places that can fire at the same moment: the customer's
 * browser arriving back from Stitch's page, and Stitch's webhook. Neither
 * is believed. Both are only a prompt to go and ask Stitch, server to
 * server, what state the payment request is really in - and settlePaid
 * makes sure that however many of them arrive, the order is settled once.
 */
import { settleFailed, settlePaid } from "./settle.mts";
import { getPaymentRequest } from "./stitch.mts";

export type OrderOutcome = "paid" | "pending" | "failed";

const toCents = (value: number | string) => Math.round(Number(value) * 100);

export async function reconcileStitchOrder(database: any, order: any): Promise<OrderOutcome> {
  if (order.status === "paid") return "paid";
  if (!order.provider_reference) return order.status === "failed" ? "failed" : "pending";

  const request = await getPaymentRequest(order.provider_reference);
  if (!request) {
    console.warn(`Order ${order.id}: Stitch does not know payment request ${order.provider_reference}`);
    return order.status === "failed" ? "failed" : "pending";
  }

  // The request was created for this order, so these can only disagree if
  // something has gone badly wrong. Refuse to settle rather than guess.
  if (request.externalReference && request.externalReference !== order.id) {
    console.error(
      `Order ${order.id}: Stitch request ${request.id} belongs to ${request.externalReference}; not settling`,
    );
    return "pending";
  }

  if (request.state === "completed") {
    if (request.amountCents !== null && request.amountCents !== toCents(order.total_amount)) {
      console.error(
        `Order ${order.id}: Stitch reports ${request.amountCents} cents paid, order is ` +
          `${toCents(order.total_amount)}; not settling`,
      );
      return "pending";
    }
    if (request.amountCents === null) {
      // The request was created server-side with the order's own total and
      // is bound to it by id, so a missing amount in the answer is a format
      // surprise rather than a short payment. Logged so it gets noticed.
      console.warn(`Order ${order.id}: Stitch's answer carried no readable amount`);
    }
    await settlePaid(database, order.id);
    return "paid";
  }

  if (request.state === "cancelled" || request.state === "expired") {
    await settleFailed(database, order.id);
    return "failed";
  }

  if (request.state === "unknown") {
    console.warn(`Order ${order.id}: unrecognised Stitch state ${request.rawState}; left pending`);
  }
  return "pending";
}
