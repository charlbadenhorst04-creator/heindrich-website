import type { Config, Context } from "@netlify/functions";
import { db, errorResponse, jsonResponse } from "./_shared/db.mts";
import { toProductRead } from "./_shared/serializers.mts";

export default async (req: Request, context: Context) => {
  const slug = context.params.slug;
  const database = db();

  const rows = await database.sql`
    SELECT p.*, c.id AS c_id, c.name AS c_name, c.slug AS c_slug
    FROM products p JOIN categories c ON c.id = p.category_id
    WHERE p.slug = ${slug} AND p.is_active = true
  `;

  if (rows.length === 0) {
    return errorResponse("Product not found", 404);
  }

  return jsonResponse(toProductRead(rows[0]));
};

export const config: Config = {
  path: "/api/products/:slug",
};
