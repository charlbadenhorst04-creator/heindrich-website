import crypto from "node:crypto";
import type { Config } from "@netlify/functions";
import { readyDb, errorResponse, jsonResponse } from "./_shared/db.mts";
import { env } from "./_shared/env.mts";
import { getOrCreateCart } from "./_shared/cart.mts";
import { buildCheckoutFields, PAYFAST_HOST } from "./_shared/payfast.mts";
import { COURIER_NAME, computeShippingFee } from "./_shared/shipping.mts";

export default async (req: Request) => {
  const body = await req.json();
  const {
    session_key: sessionKey,
    customer_email: customerEmail,
    customer_name: customerName,
    shipping_address: shippingAddress,
    city,
    postal_code: postalCode,
    province,
    phone = "",
  } = body;

  if (!sessionKey || !customerEmail || !customerName || !shippingAddress || !city || !postalCode || !province) {
    return errorResponse("Missing required checkout fields");
  }

  const database = await readyDb();
  const cartId = await getOrCreateCart(database, sessionKey);

  const itemRows = await database.sql`
    SELECT ci.product_id, ci.quantity, p.name, p.price, p.stock, p.is_active
    FROM cart_items ci JOIN products p ON p.id = ci.product_id
    WHERE ci.cart_id = ${cartId}
  `;

  if (itemRows.length === 0) {
    return errorResponse("Cart is empty");
  }

  // Mirrors the FastAPI backend: a cart can sit for days after passing the
  // add-to-cart stock check, so re-check at the point of sale rather than
  // take payment for goods that cannot be shipped.
  for (const row of itemRows as any[]) {
    if (!row.is_active) {
      return errorResponse(`${row.name} is no longer available. Please remove it from your cart.`, 409);
    }
    if (row.stock === 0) {
      return errorResponse(`${row.name} is out of stock. Please remove it from your cart.`, 409);
    }
    if (row.quantity > row.stock) {
      return errorResponse(`Only ${row.stock} of ${row.name} left in stock`, 409);
    }
  }

  const subtotal = itemRows.reduce((sum: number, row: any) => sum + Number(row.price) * row.quantity, 0);
  const shippingFee = computeShippingFee(subtotal);
  const total = subtotal + shippingFee;

  const orderId = crypto.randomUUID();
  await database.sql`
    INSERT INTO orders (
      id, customer_email, customer_name, shipping_address, city, postal_code, province, phone,
      subtotal_amount, shipping_fee, total_amount, courier
    ) VALUES (
      ${orderId}, ${customerEmail}, ${customerName}, ${shippingAddress}, ${city}, ${postalCode}, ${province}, ${phone},
      ${subtotal}, ${shippingFee}, ${total}, ${COURIER_NAME}
    )
  `;

  for (const row of itemRows) {
    const itemId = crypto.randomUUID();
    await database.sql`
      INSERT INTO order_items (id, order_id, product_id, product_name, unit_price, quantity)
      VALUES (${itemId}, ${orderId}, ${row.product_id}, ${row.name}, ${row.price}, ${row.quantity})
    `;
  }

  // PAYFAST_RETURN_URL / _CANCEL_URL / _NOTIFY_URL are what the setup
  // documents, what the FastAPI backend uses, and what has to change when
  // the shop moves to its own domain. This used to ignore them and build
  // the URLs from Netlify's own URL variable instead, so setting them did
  // nothing - and if that variable was not there at runtime, Payfast was
  // handed "/order-success" as a return address and refused the whole
  // payment with 400 Bad Request.
  const siteUrl = (env("STORE_URL") || env("URL")).replace(/\/+$/, "");
  const fields = buildCheckoutFields({
    orderId,
    amount: total,
    itemName: `MERAVO order ${orderId}`,
    customerEmail,
    customerName,
    returnUrl: env("PAYFAST_RETURN_URL") || `${siteUrl}/order-success`,
    cancelUrl: env("PAYFAST_CANCEL_URL") || `${siteUrl}/cart`,
    notifyUrl: env("PAYFAST_NOTIFY_URL") || `${siteUrl}/api/payments/payfast/notify`,
  });

  return jsonResponse({ order_id: orderId, action_url: `${PAYFAST_HOST}/eng/process`, fields });
};

export const config: Config = {
  path: "/api/orders/checkout",
};
