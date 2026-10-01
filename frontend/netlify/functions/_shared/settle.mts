/**
 * What happens when a payment is confirmed.
 *
 * Stitch confirms the same payment down two independent paths at once: the customer's
 * browser coming back from the payment page, and Stitch's own webhook. Those
 * routinely arrive within milliseconds of each other.
 *
 * So "mark paid" is a single conditional UPDATE rather than a read followed
 * by a write. Postgres lets exactly one of any number of concurrent callers
 * move the row from not-paid to paid, and only that caller goes on to draw
 * down stock and send the emails. A read-then-write lets two callers both
 * see "pending", both mark it paid, and both take the stock - selling the
 * last vacuum cleaner twice.
 */
import { sendOrderEmails } from "./email.mts";

/**
 * Mark an order paid. Returns true only for the caller that actually made
 * the change; every other caller, concurrent or later, gets false and does
 * nothing further.
 *
 * Only an order that has not been paid yet can move. An order the shop has
 * since marked shipped or complete is past "paid", and a late webhook for
 * it must not take the stock again or re-send the emails.
 */
export async function settlePaid(database: any, orderId: string): Promise<boolean> {
  const changed = (await database.sql`
    UPDATE orders SET status = 'paid'
    WHERE id = ${orderId} AND status IN ('pending', 'failed', 'cancelled')
    RETURNING id
  `) as any[];

  if (changed.length === 0) return false;

  await database.sql`
    UPDATE products p
    SET stock = GREATEST(0, p.stock - oi.quantity)
    FROM order_items oi
    WHERE oi.order_id = ${orderId} AND oi.product_id = p.id
  `;

  // Awaited rather than left running: a serverless instance is frozen the
  // moment it answers, so a background send would simply never happen.
  await notify(database, orderId);
  return true;
}

/**
 * Record a payment that definitively did not happen.
 *
 * Only a pending order can fail. A paid order is never walked back - a late
 * or out-of-order "failed" notification must not undo a real sale.
 */
export async function settleFailed(database: any, orderId: string): Promise<boolean> {
  const changed = (await database.sql`
    UPDATE orders SET status = 'failed'
    WHERE id = ${orderId} AND status = 'pending'
    RETURNING id
  `) as any[];
  return changed.length > 0;
}

/**
 * Tell the shop owner and the customer about a paid order.
 *
 * Swallows everything: letting a mail or database hiccup escape would turn
 * a confirmed payment into an error response, and the provider would retry
 * a sale that is already settled.
 */
async function notify(database: any, orderId: string): Promise<void> {
  try {
    const orders = (await database.sql`SELECT * FROM orders WHERE id = ${orderId}`) as any[];
    if (orders.length === 0) return;
    const items = await database.sql`
      SELECT product_name, unit_price, quantity FROM order_items WHERE order_id = ${orderId}
    `;
    await sendOrderEmails({ ...orders[0], items });
  } catch (error) {
    console.error(`Order ${orderId}: could not send notifications`, error);
  }
}
