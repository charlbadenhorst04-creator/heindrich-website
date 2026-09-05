import type { Config, Context } from "@netlify/functions";
import { db, errorResponse, jsonResponse } from "./_shared/db.mts";
import { getCartRead } from "./_shared/cart.mts";

export default async (req: Request, context: Context) => {
  const sessionKey = context.params.sessionKey;
  const itemId = context.params.itemId;
  const database = db();

  if (req.method === "PATCH") {
    const body = await req.json();
    const quantity = Number(body.quantity);
    if (!quantity || quantity <= 0) {
      return errorResponse("A positive quantity is required");
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
