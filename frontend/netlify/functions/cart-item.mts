import type { Config, Context } from "@netlify/functions";
import { readyDb, errorResponse, jsonResponse } from "./_shared/db.mts";
import { getCartRead } from "./_shared/cart.mts";

export default async (req: Request, context: Context) => {
  const sessionKey = context.params.sessionKey;
  const itemId = context.params.itemId;
  const database = await readyDb();

  if (req.method === "PATCH") {
    const body = await req.json();
    const quantity = Number(body.quantity);
    if (!quantity || quantity <= 0) {
      return errorResponse("A positive quantity is required");
    }

    // Stock is enforced server-side; the UI's quantity controls can be
    // bypassed by calling the API directly.
    const rows = await database.sql`
      SELECT p.name, p.stock FROM cart_items ci JOIN products p ON p.id = ci.product_id
      WHERE ci.id = ${itemId}
    `;
    if (rows.length === 0) {
      return errorResponse("Cart item not found", 404);
    }
    const stock = Number(rows[0].stock);
    if (quantity > stock) {
      return errorResponse(`Only ${stock} of ${rows[0].name} left in stock`, 409);
    }

    await database.sql`UPDATE cart_items SET quantity = ${quantity} WHERE id = ${itemId}`;
  } else if (req.method === "DELETE") {
    await database.sql`DELETE FROM cart_items WHERE id = ${itemId}`;
  } else {
    return errorResponse("Method not allowed", 405);
  }

  return jsonResponse(await getCartRead(database, sessionKey));
};

export const config: Config = {
  path: "/api/cart/:sessionKey/items/:itemId",
};
