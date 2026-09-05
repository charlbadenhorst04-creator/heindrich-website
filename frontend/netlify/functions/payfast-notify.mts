import type { Config } from "@netlify/functions";
import { db } from "./_shared/db.mts";
import { buildSignature, verifyItnWithPayfast } from "./_shared/payfast.mts";

const PAYFAST_PASSPHRASE = Netlify.env.get("PAYFAST_PASSPHRASE") ?? "";

export default async (req: Request) => {
  const raw = await req.text();
  const params = new URLSearchParams(raw);
  const data: Record<string, string> = {};
  for (const [key, value] of params.entries()) data[key] = value;

  const signature = data.signature ?? "";
  const expected = buildSignature(data, PAYFAST_PASSPHRASE);
  if (signature !== expected) {
    return new Response("invalid signature", { status: 400 });
  }

  if (!(await verifyItnWithPayfast(data))) {
    return new Response("not confirmed by payfast", { status: 400 });
  }

  const orderId = data.m_payment_id;
  const paymentStatus = data.payment_status ?? "";
  const amountGross = Number(data.amount_gross ?? "0");

  if (!orderId) {
    return new Response("missing order id", { status: 400 });
  }

  const database = db();
  const orders = await database.sql`SELECT total_amount FROM orders WHERE id = ${orderId}`;
  if (orders.length === 0) {
    return new Response("order not found", { status: 404 });
  }

  if (amountGross !== Number(orders[0].total_amount)) {
    return new Response("amount mismatch", { status: 400 });
  }

  const status = paymentStatus === "COMPLETE" ? "paid" : "failed";
  await database.sql`
    UPDATE orders SET status = ${status}, payfast_payment_id = ${data.pf_payment_id ?? ""} WHERE id = ${orderId}
  `;

  return new Response("OK", { status: 200 });
};

export const config: Config = {
  path: "/api/payments/payfast/notify",
};
