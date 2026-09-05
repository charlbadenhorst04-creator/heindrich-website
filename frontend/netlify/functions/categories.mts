import type { Config } from "@netlify/functions";
import { db, jsonResponse } from "./_shared/db.mts";

export default async () => {
  const database = db();
  const rows = await database.sql`SELECT id, name, slug FROM categories ORDER BY name`;
  return jsonResponse(rows);
};

export const config: Config = {
  path: "/api/categories",
};
