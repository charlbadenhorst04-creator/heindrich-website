import { getDatabase } from "@netlify/database";

import { env } from "./env.mts";
import { ensureSchema } from "./schema.mts";

/**
 * Names this deployment will accept a Postgres connection string under.
 *
 * @netlify/database only reads NETLIFY_DB_URL by itself, and Netlify
 * reserves the whole NETLIFY_ prefix for variables its own extensions
 * write - so a connection string added by hand under either of those
 * names is silently ignored, and the shop comes up with no database and
 * no explanation. DATABASE_URL is a plain name anyone can set in the
 * dashboard, and is what the documentation now tells people to use. The
 * two NETLIFY_ names stay supported so a database provisioned by the Neon
 * extension keeps working without any change here.
 */
const CONNECTION_STRING_VARIABLES = [
  "DATABASE_URL",
  "NETLIFY_DATABASE_URL",
  "NETLIFY_DB_URL",
] as const;

/** The connection string this deployment is configured with, if any. */
export function connectionString(): string {
  for (const name of CONNECTION_STRING_VARIABLES) {
    const value = env(name);
    if (value) return value;
  }
  return "";
}

export function configuredDatabaseVariable(): string | null {
  return CONNECTION_STRING_VARIABLES.find((name) => env(name)) ?? null;
}

export { CONNECTION_STRING_VARIABLES };

export function db() {
  const url = connectionString();
  // Passed explicitly rather than left to the library, which would only
  // look at NETLIFY_DB_URL.
  return url ? getDatabase({ connectionString: url }) : getDatabase();
}

/**
 * The database, with its tables guaranteed to exist.
 *
 * Serverless functions have no startup step, so the first request after a
 * database is connected creates the schema and seeds the catalogue. After
 * that it is a no-op. Use this anywhere a handler touches the database.
 */
export async function readyDb() {
  const database = db();
  await ensureSchema(database);
  return database;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ids reach these handlers straight from the URL. Postgres rejects
 * anything that is not a uuid with an error, which surfaces as a 500, so
 * every id taken off a path is checked before it is queried with - a
 * mistyped link should be a 404, not a crash.
 */
export function isUuid(value: string | undefined): boolean {
  return typeof value === "string" && UUID_RE.test(value);
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
