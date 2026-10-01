import type { Config } from "@netlify/functions";
import { isUuid, readyDb } from "./_shared/db.mts";
import { env } from "./_shared/env.mts";
import { payfastMode, signatureMatches, verifyItnWithPayfast } from "./_shared/payfast.mts";
import { activeProvider, payfastConfigured } from "./_shared/payments.mts";
import { settleFailed, settlePaid } from "./_shared/settle.mts";

export default async (req: Request) => {
  const raw = await req.text();
  const params = new URLSearchParams(raw);
  const data: Record<string, string> = {};
  for (const [key, value] of params.entries()) data[key] = value;

  if (!signatureMatches(data, env("PAYFAST_PASSPHRASE"))) {
    return new Response("invalid signature", { status: 400 });
  }

  // The ITN must be for this shop's own Payfast merchant. Payfast vouches
  // for any genuine ITN - including one for somebody else's account. So
  // without this, anyone can register a free sandbox merchant, "pay" it
  // with sandbox money while naming one of this shop's orders and this
  // notify address, and Payfast would truthfully confirm a payment that
  // never reached this shop. The signature does not prevent that when
  // neither account uses a passphrase.
  // payfastConfigured() also refuses Payfast's published demo merchant,
  // which anyone can pay with sandbox money and so cannot vouch for anything.
  const ourMerchant = env("PAYFAST_MERCHANT_ID").trim();
  if (!payfastConfigured() || (data.merchant_id ?? "").trim() !== ourMerchant) {
    return new Response("not this merchant", { status: 400 });
  }

  // A sandbox Payfast that is not the provider in use has no business
  // settling anything: real orders are going through Stitch, and sandbox
  // money is free. A live Payfast keeps accepting ITNs after a switch, so a
  // real payment still in flight at the time is not stranded.
  if (payfastMode() !== "live" && activeProvider() !== "payfast") {
    return new Response("payfast sandbox is not in use", { status: 400 });
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
  if (!isUuid(orderId)) {
    return new Response("malformed order id", { status: 400 });
  }

  const amountGross = Number(data.amount_gross ?? "");
  if (!Number.isFinite(amountGross)) {
    return new Response("malformed amount", { status: 400 });
  }

  const database = await readyDb();
  const orders = await database.sql`
    SELECT status, total_amount, payment_provider FROM orders WHERE id = ${orderId}
  `;
  if (orders.length === 0) {
    return new Response("order not found", { status: 404 });
  }

  // Only orders taken through Payfast can be settled by Payfast. With
  // Stitch taking real payments and Payfast left on sandbox credentials,
  // a sandbox ITN would otherwise settle a real Stitch order for nothing -
  // and overwrite the Stitch reference that order is reconciled by.
  if (orders[0].payment_provider !== "payfast") {
    return new Response("not a Payfast order", { status: 400 });
  }

  // Compare in cents so no float rounding lets a short payment through.
  const toCents = (value: number) => Math.round(value * 100);
  if (toCents(amountGross) !== toCents(Number(orders[0].total_amount))) {
    return new Response("amount mismatch", { status: 400 });
  }

  // Payfast retries an ITN until it gets a 200, so the same notification
  // can legitimately arrive more than once. settlePaid lets exactly one of
  // them take the stock and send the emails; a "failed" notice can never
  // walk an already-paid order back.
  const paymentId = data.pf_payment_id ?? "";
  await database.sql`
    UPDATE orders SET payfast_payment_id = ${paymentId}, provider_reference = ${paymentId}
    WHERE id = ${orderId}
  `;

  if ((data.payment_status ?? "") === "COMPLETE") {
    await settlePaid(database, orderId);
  } else {
    await settleFailed(database, orderId);
  }

  return new Response("OK", { status: 200 });
};

export const config: Config = {
  path: "/api/payments/payfast/notify",
};
