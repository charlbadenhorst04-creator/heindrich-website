import type { Config } from "@netlify/functions";
import { readyDb, jsonResponse } from "./_shared/db.mts";

export default async () => {
  const database = await readyDb();
  const rows = await database.sql`SELECT id, name, slug FROM categories ORDER BY name`;
  return jsonResponse(rows);
};

export const config: Config = {
  path: "/api/categories",
};
