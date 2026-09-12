/**
 * First-run database setup, against a real empty Postgres.
 *
 * These cover the things that decide whether someone's shop comes up on its
 * own: that an empty database gets a working schema and the full catalogue,
 * that running it again changes nothing, and that several functions
 * cold-starting at once don't race each other into a half-created schema.
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import pg from "pg";

import { ensureSchema, resetSchemaCacheForTests } from "./schema.mts";

const CONNECTION =
  process.env.SCHEMA_TEST_DATABASE_URL ??
  "postgresql://meravo:change-me@localhost:5432/meravo_autoinit";

let pool: pg.Pool;

/**
 * The slice of the @netlify/database surface schema.mts actually uses.
 *
 * node-postgres happily runs several statements sent as one string; Neon's
 * serverless driver - what the live site uses - rejects them outright. That
 * difference once let a broken first-run setup pass every test here and
 * then fail on the real database with "Failed query: CREATE TABLE ...".
 * So this stand-in is stricter than node-postgres on purpose: one
 * statement per call, exactly like production.
 */
function fakeDatabase(p: pg.Pool) {
  return {
    sql: {
      unsafe: async (text: string) => {
        const statements = text
          .split(";")
          .map((statement) => statement.trim())
          .filter(Boolean);
        if (statements.length > 1) {
          throw new Error(
            `cannot insert multiple commands into a prepared statement ` +
              `(${statements.length} statements in one query)`,
          );
        }
        const res = await p.query(text);
        return res.rows;
      },
    },
  };
}

async function tableNames(): Promise<string[]> {
  const { rows } = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name",
  );
  return rows.map((r) => r.table_name);
}

async function dropEverything() {
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
}

describe("first-run database setup", () => {
  before(async () => {
    pool = new pg.Pool({ connectionString: CONNECTION });
    await dropEverything();
  });

  after(async () => {
    await pool.end();
  });

  it("creates the whole schema and catalogue on a completely empty database", async () => {
    resetSchemaCacheForTests();
    assert.deepEqual(await tableNames(), [], "precondition: database should start empty");

    await ensureSchema(fakeDatabase(pool));

    assert.deepEqual(await tableNames(), [
      "cart_items",
      "carts",
      "categories",
      "order_items",
      "orders",
      "products",
    ]);

    const { rows: products } = await pool.query("SELECT count(*)::int AS n FROM products");
    assert.equal(products[0].n, 7, "all seven products should be seeded");

    const { rows: categories } = await pool.query("SELECT count(*)::int AS n FROM categories");
    assert.equal(categories[0].n, 4);

    // The catalogue has to arrive with real photos and prices, not blanks.
    const { rows: sample } = await pool.query(
      "SELECT name, price, image_url FROM products WHERE slug = 'car-vacuum-cleaner'",
    );
    assert.equal(sample[0].name, "Car Vacuum Cleaner");
    assert.equal(Number(sample[0].price), 499);
    assert.equal(sample[0].image_url, "/images/products/car-vacuum-cleaner.png");
  });

  it("is a no-op the second time, and never duplicates the catalogue", async () => {
    resetSchemaCacheForTests();
    await ensureSchema(fakeDatabase(pool));
    resetSchemaCacheForTests();
    await ensureSchema(fakeDatabase(pool));

    const { rows } = await pool.query("SELECT count(*)::int AS n FROM products");
    assert.equal(rows[0].n, 7, "re-running setup duplicated products");
  });

  it("never overwrites a price or stock level the shop has changed since", async () => {
    await pool.query(
      "UPDATE products SET price = 1.00, stock = 3 WHERE slug = 'car-vacuum-cleaner'",
    );

    resetSchemaCacheForTests();
    await ensureSchema(fakeDatabase(pool));

    const { rows } = await pool.query(
      "SELECT price, stock FROM products WHERE slug = 'car-vacuum-cleaner'",
    );
    assert.equal(Number(rows[0].price), 1, "setup clobbered an edited price");
    assert.equal(rows[0].stock, 3, "setup clobbered an edited stock level");

    await pool.query(
      "UPDATE products SET price = 499.00, stock = 40 WHERE slug = 'car-vacuum-cleaner'",
    );
  });

  it("survives several functions cold-starting against an empty database at once", async () => {
    // The real failure mode this guards: a first visit fans out to several
    // function instances simultaneously, and without the advisory lock one
    // of them trips over a table another is midway through creating.
    await dropEverything();

    const concurrent = 8;
    const results = await Promise.allSettled(
      Array.from({ length: concurrent }, () => {
        // A separate pool per caller, standing in for separate instances.
        const ownPool = new pg.Pool({ connectionString: CONNECTION, max: 2 });
        resetSchemaCacheForTests();
        return ensureSchema(fakeDatabase(ownPool)).finally(() => ownPool.end());
      }),
    );

    const failures = results.filter((r) => r.status === "rejected");
    assert.equal(
      failures.length,
      0,
      `concurrent setup failed: ${failures.map((f: any) => f.reason?.message).join("; ")}`,
    );

    const { rows } = await pool.query("SELECT count(*)::int AS n FROM products");
    assert.equal(rows[0].n, 7, "concurrent setup duplicated or lost products");
  });
});
