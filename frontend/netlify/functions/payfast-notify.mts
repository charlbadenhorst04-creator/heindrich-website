import type { Config } from "@netlify/functions";
import { readyDb } from "./_shared/db.mts";
import { signatureMatches, verifyItnWithPayfast } from "./_shared/payfast.mts";

const PAYFAST_PASSPHRASE = Netlify.env.get("PAYFAST_PASSPHRASE") ?? "";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async (req: Request) => {
  const raw = await req.text();
  const params = new URLSearchParams(raw);
  const data: Record<string, string> = {};
  for (const [key, value] of params.entries()) data[key] = value;

  if (!signatureMatches(data, PAYFAST_PASSPHRASE)) {
    return new Response("invalid signature", { status: 400 });
  }

  if (!(await verifyItnWithPayfast(data))) {
    return new Response("not confirmed by payfast", { status: 400 });
  }

  const orderId = data.m_payment_id ?? "";
  if (!orderId) {
    return new Response("missing order id", { status: 400 });
  }
  // Everything here arrives from the network: a malformed id must be a
  // clean 400, not a 500 from Postgres rejecting an unparseable uuid.
  if (!UUID_RE.test(orderId)) {
    return new Response("malformed order id", { status: 400 });
  }

  const amountGross = Number(data.amount_gross ?? "");
  if (!Number.isFinite(amountGross)) {
    return new Response("malformed amount", { status: 400 });
  }

  const database = await readyDb();
  const orders = await database.sql`SELECT status, total_amount FROM orders WHERE id = ${orderId}`;
  if (orders.length === 0) {
    return new Response("order not found", { status: 404 });
  }

  // Compare in cents so no float rounding lets a short payment through.
  const toCents = (value: number) => Math.round(value * 100);
  if (toCents(amountGross) !== toCents(Number(orders[0].total_amount))) {
    return new Response("amount mismatch", { status: 400 });
  }

  // Payfast retries an ITN until it gets a 200, so the same notification
  // can legitimately arrive more than once. Settle stock exactly once and
  // never walk an already-paid order back to a failed state.
  const alreadyPaid = orders[0].status === "paid";
  const paymentComplete = (data.payment_status ?? "") === "COMPLETE";
  const paymentId = data.pf_payment_id ?? "";

  if (paymentComplete && !alreadyPaid) {
    await database.sql`
      UPDATE orders SET status = 'paid', payfast_payment_id = ${paymentId} WHERE id = ${orderId}
    `;
    await database.sql`
      UPDATE products p
      SET stock = GREATEST(0, p.stock - oi.quantity)
      FROM order_items oi
      WHERE oi.order_id = ${orderId} AND oi.product_id = p.id
    `;
  } else if (!alreadyPaid) {
    await database.sql`
      UPDATE orders SET status = 'failed', payfast_payment_id = ${paymentId} WHERE id = ${orderId}
    `;
  } else {
    await database.sql`
      UPDATE orders SET payfast_payment_id = ${paymentId} WHERE id = ${orderId}
    `;
  }

  return new Response("OK", { status: 200 });
};

export const config: Config = {
  path: "/api/payments/payfast/notify",
};
