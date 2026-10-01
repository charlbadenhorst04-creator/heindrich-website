import crypto from "node:crypto";
import type { Config } from "@netlify/functions";
import { readyDb, errorResponse, jsonResponse } from "./_shared/db.mts";
import { providerUrl } from "./_shared/origin.mts";
import { paymentsStatus } from "./_shared/payments.mts";
import { getOrCreateCart } from "./_shared/cart.mts";
import { StitchError, createPaymentRequest } from "./_shared/stitch.mts";
import { COURIER_NAME, computeShippingFee } from "./_shared/shipping.mts";

export default async (req: Request) => {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Expected a JSON body");
  }
  if (!body || typeof body !== "object") return errorResponse("Expected a JSON body");
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

  // Checked here as well as in the storefront. Without it, anyone posting
  // to this endpoint directly - or on a stale page - creates an order that
  // can never be paid for, which then sits in the database looking like a
  // lost sale.
  const payments = paymentsStatus();
  if (!payments.enabled) {
    return errorResponse(payments.message, 503);
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

  const provider = "stitch";
  const orderId = crypto.randomUUID();
  await database.sql`
    INSERT INTO orders (
      id, customer_email, customer_name, shipping_address, city, postal_code, province, phone,
      subtotal_amount, shipping_fee, total_amount, courier, payment_provider
    ) VALUES (
      ${orderId}, ${customerEmail}, ${customerName}, ${shippingAddress}, ${city}, ${postalCode}, ${province}, ${phone},
      ${subtotal}, ${shippingFee}, ${total}, ${COURIER_NAME}, ${provider}
    )
  `;

  for (const row of itemRows) {
    const itemId = crypto.randomUUID();
    await database.sql`
      INSERT INTO order_items (id, order_id, product_id, product_name, unit_price, quantity)
      VALUES (${itemId}, ${orderId}, ${row.product_id}, ${row.name}, ${row.price}, ${row.quantity})
    `;
  }

  // The order id goes back in as externalReference rather than on the
  // return address: Stitch matches redirect_uri against a whitelist, and a
  // query string per order would never match it.
  try {
    const request = await createPaymentRequest({
      orderId,
      amount: total,
      returnUrl: providerUrl(req, "/order-success"),
    });
    await database.sql`
      UPDATE orders SET provider_reference = ${request.id} WHERE id = ${orderId}
    `;
    return jsonResponse({ order_id: orderId, provider, redirect_url: request.redirectUrl });
  } catch (error) {
    // The order row stays (pending, no reference) so the attempt is on
    // record, but the customer gets a plain answer rather than a 500.
    console.error(`Order ${orderId}: could not create the Stitch payment`, error);
    const detail =
      error instanceof StitchError
        ? "We couldn't open the secure payment page just now. Please try again in a moment."
        : "Something went wrong preparing your payment. Please try again.";
    return errorResponse(detail, 502);
  }
};

export const config: Config = {
  path: "/api/orders/checkout",
};
