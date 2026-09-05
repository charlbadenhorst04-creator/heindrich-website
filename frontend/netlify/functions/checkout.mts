import crypto from "node:crypto";
import type { Config } from "@netlify/functions";
import { db, errorResponse, jsonResponse } from "./_shared/db.mts";
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

  const database = db();
  const cartId = await getOrCreateCart(database, sessionKey);

  const itemRows = await database.sql`
    SELECT ci.product_id, ci.quantity, p.name, p.price
    FROM cart_items ci JOIN products p ON p.id = ci.product_id
    WHERE ci.cart_id = ${cartId}
  `;

  if (itemRows.length === 0) {
    return errorResponse("Cart is empty");
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

  const siteUrl = Netlify.env.get("URL") ?? "";
  const fields = buildCheckoutFields({
    orderId,
    amount: total,
    itemName: `MERAVO order ${orderId}`,
    customerEmail,
    customerName,
    returnUrl: `${siteUrl}/order-success`,
    cancelUrl: `${siteUrl}/cart`,
    notifyUrl: `${siteUrl}/api/payments/payfast/notify`,
  });

  return jsonResponse({ order_id: orderId, action_url: `${PAYFAST_HOST}/eng/process`, fields });
};

export const config: Config = {
  path: "/api/orders/checkout",
};
