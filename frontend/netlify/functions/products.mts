import type { Config } from "@netlify/functions";
import { db, jsonResponse } from "./_shared/db.mts";
import { toProductRead } from "./_shared/serializers.mts";

export default async (req: Request) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  const category = url.searchParams.get("category");
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("page_size") ?? "12")));
  const offset = (page - 1) * pageSize;

  const database = db();
  const conditions: string[] = ["p.is_active = true"];
  const params: (string | number)[] = [];

  if (q) {
    params.push(`%${q}%`);
    conditions.push(`p.name ILIKE $${params.length}`);
  }
  if (category) {
    params.push(category);
    conditions.push(`c.slug = $${params.length}`);
  }

  const where = conditions.join(" AND ");

  const countRows = (await database.sql.unsafe(
    `SELECT COUNT(*)::int AS total FROM products p JOIN categories c ON c.id = p.category_id WHERE ${where}`,
    params,
    { rowMode: "object" },
  )) as any[];
  const total = countRows[0]?.total ?? 0;

  const listParams = [...params, pageSize, offset];
  const rows = (await database.sql.unsafe(
    `SELECT p.*, c.id AS c_id, c.name AS c_name, c.slug AS c_slug
     FROM products p JOIN categories c ON c.id = p.category_id
     WHERE ${where}
     ORDER BY p.created_at DESC, p.id
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
    { rowMode: "object" },
  )) as any[];

  const items = rows.map(toProductRead);

  return jsonResponse({ items, total, page, page_size: pageSize });
};

export const config: Config = {
  path: "/api/products",
};
