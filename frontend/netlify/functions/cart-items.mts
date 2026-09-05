import crypto from "node:crypto";
import type { Config, Context } from "@netlify/functions";
import { db, errorResponse, jsonResponse } from "./_shared/db.mts";
import { getOrCreateCart, getCartRead } from "./_shared/cart.mts";

export default async (req: Request, context: Context) => {
  const sessionKey = context.params.sessionKey;
  const body = await req.json();
  const productId = body.product_id as string;
  const quantity = Number(body.quantity ?? 1);

  if (!productId || quantity <= 0) {
    return errorResponse("product_id and a positive quantity are required");
  }

  const database = db();

  const product = await database.sql`SELECT id FROM products WHERE id = ${productId} AND is_active = true`;
  if (product.length === 0) {
    return errorResponse("Product not found", 404);
  }

  const cartId = await getOrCreateCart(database, sessionKey);

  const existing = await database.sql`
    SELECT id, quantity FROM cart_items WHERE cart_id = ${cartId} AND product_id = ${productId}
  `;

  if (existing.length > 0) {
    await database.sql`
      UPDATE cart_items SET quantity = ${existing[0].quantity + quantity} WHERE id = ${existing[0].id}
    `;
  } else {
    const id = crypto.randomUUID();
    await database.sql`
      INSERT INTO cart_items (id, cart_id, product_id, quantity) VALUES (${id}, ${cartId}, ${productId}, ${quantity})
    `;
  }

  return jsonResponse(await getCartRead(database, sessionKey));
};

export const config: Config = {
  path: "/api/cart/:sessionKey/items",
};
