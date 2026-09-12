import { getDatabase } from "@netlify/database";

import { ensureSchema } from "./schema.mts";

export function db() {
  return getDatabase();
}

/**
 * The database, with its tables guaranteed to exist.
 *
 * Serverless functions have no startup step, so the first request after a
 * database is connected creates the schema and seeds the catalogue. After
 * that it is a no-op. Use this anywhere a handler touches the database.
 */
export async function readyDb() {
  const database = getDatabase();
  await ensureSchema(database);
  return database;
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ detail: message }, status);
}
