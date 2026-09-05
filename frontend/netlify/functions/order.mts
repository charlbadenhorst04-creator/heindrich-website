import type { Config, Context } from "@netlify/functions";
import { db, errorResponse, jsonResponse } from "./_shared/db.mts";
import { toOrderRead } from "./_shared/serializers.mts";

export default async (req: Request, context: Context) => {
  const orderId = context.params.id;
  const database = db();

  const orders = await database.sql`SELECT * FROM orders WHERE id = ${orderId}`;
  if (orders.length === 0) {
    return errorResponse("Order not found", 404);
  }

  const items = await database.sql`SELECT * FROM order_items WHERE order_id = ${orderId}`;
  return jsonResponse(toOrderRead(orders[0], items));
};

export const config: Config = {
  path: "/api/orders/:id",
};
