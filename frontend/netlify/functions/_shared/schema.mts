/**
 * First-run database setup.
 *
 * The Docker deployment runs Alembic and the seed script from its entrypoint
 * before the API starts. Serverless functions have no equivalent boot step,
 * which previously meant someone had to paste a migration into a SQL console
 * by hand before the shop would show anything. This does that automatically
 * on the first request after a database is connected.
 *
 * Everything here is written to be safe to run repeatedly and concurrently:
 *
 * - CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS, so re-running is
 *   a no-op rather than an error.
 * - INSERT ... ON CONFLICT DO NOTHING, so the seed never duplicates rows and
 *   never overwrites a price or stock level the shop has since changed.
 * - A Postgres advisory lock around the whole thing. Several functions can
 *   cold-start at once on the first visit; without the lock they would race
 *   and one would fail on a half-created table.
 *
 * It mirrors database/migrations/20260905090000_init/migration.sql, which
 * remains the canonical schema for anyone setting the database up by hand.
 */

// Chosen arbitrarily; only has to be the same number in every instance.
const SETUP_LOCK_ID = 8410327;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  price NUMERIC(10, 2) NOT NULL,
  image_url TEXT NOT NULL DEFAULT '',
  stock INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  category_id UUID NOT NULL REFERENCES categories(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_name ON products (name);
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category_id);

CREATE TABLE IF NOT EXISTS carts (
  id UUID PRIMARY KEY,
  session_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cart_items (
  id UUID PRIMARY KEY,
  cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items (cart_id);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY,
  customer_email TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  shipping_address TEXT NOT NULL,
  city TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  province TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  subtotal_amount NUMERIC(10, 2) NOT NULL,
  shipping_fee NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payfast_payment_id TEXT NOT NULL DEFAULT '',
  courier TEXT NOT NULL DEFAULT 'Aramex',
  tracking_number TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1
);
`;

const SEED_SQL = `
INSERT INTO categories (id, name, slug) VALUES
  ('11111111-0000-0000-0000-000000000001', 'Tools & Hardware', 'tools-hardware'),
  ('11111111-0000-0000-0000-000000000002', 'Automotive', 'automotive'),
  ('11111111-0000-0000-0000-000000000003', 'Kids & Toys', 'kids-toys'),
  ('11111111-0000-0000-0000-000000000004', 'Home & Care', 'home-care')
ON CONFLICT (id) DO NOTHING;

INSERT INTO products (id, name, slug, description, price, image_url, stock, category_id) VALUES
  ('22222222-0000-0000-0000-000000000001',
   '101-Piece Magnetic Precision Screwdriver Set',
   '101-piece-magnetic-precision-screwdriver-set',
   'A complete 101-piece precision screwdriver set with magnetic bits and a sturdy storage rack - built for electronics, appliance and everyday repairs.',
   499.00, '/images/products/101-piece-magnetic-precision-screwdriver-set.png', 50,
   '11111111-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000002',
   'Car Vacuum Cleaner', 'car-vacuum-cleaner',
   'Compact, strong-suction handheld vacuum cleaner designed for quick interior car cleanups - crumbs, dust and debris, gone in minutes.',
   499.00, '/images/products/car-vacuum-cleaner.png', 40,
   '11111111-0000-0000-0000-000000000002'),
  ('22222222-0000-0000-0000-000000000003',
   'Interactive Plush Lion Hand Puppet', 'interactive-plush-lion-hand-puppet',
   'A soft, huggable lion hand puppet that brings storytime to life - perfect for imaginative play and bonding time with little ones.',
   129.00, '/images/products/interactive-plush-lion-hand-puppet.png', 80,
   '11111111-0000-0000-0000-000000000003'),
  ('22222222-0000-0000-0000-000000000004',
   'Kids Drawing Tablet', 'kids-drawing-tablet',
   'An LCD writing and drawing tablet for kids - screen-free, reusable, and great for sparking creativity on the go.',
   299.00, '/images/products/kids-drawing-tablet.png', 60,
   '11111111-0000-0000-0000-000000000003'),
  ('22222222-0000-0000-0000-000000000005',
   'Kids Hobby Horse or Unicorn with Galloping Neighing Sounds',
   'kids-hobby-horse-unicorn-galloping-sounds',
   'A playful hobby horse with realistic galloping and neighing sounds - hours of active, imaginative outdoor or indoor play.',
   349.00, '/images/products/kids-hobby-horse-unicorn-galloping-sounds.png', 35,
   '11111111-0000-0000-0000-000000000003'),
  ('22222222-0000-0000-0000-000000000006',
   'Kids Mountain Bike Seat with Dual Handle', 'kids-mountain-bike-seat-dual-handle',
   'A secure, comfortable rear bike seat with dual handles, so little riders can safely join the family adventure on the trail.',
   1199.00, '/images/products/kids-mountain-bike-seat-dual-handle.png', 20,
   '11111111-0000-0000-0000-000000000003'),
  ('22222222-0000-0000-0000-000000000007',
   'White Shoe Cleaner - Restore. Refresh. Shine.',
   'white-shoe-cleaner-restore-refresh-shine',
   'A dedicated whitening cream for sneakers and white shoes - restores, refreshes and shines in just a few wipes.',
   92.00, '/images/products/white-shoe-cleaner-restore-refresh-shine.png', 100,
   '11111111-0000-0000-0000-000000000004')
ON CONFLICT (id) DO NOTHING;
`;

// One attempt per cold start. Cached as a promise so concurrent requests on
// the same instance await the same run rather than each starting their own.
let setupPromise: Promise<void> | null = null;

async function runSetup(database: any): Promise<void> {
  // Serialise across instances: whoever gets the lock creates the tables,
  // everyone else waits and then finds the work already done.
  await database.sql.unsafe(`SELECT pg_advisory_lock(${SETUP_LOCK_ID})`);
  try {
    await database.sql.unsafe(SCHEMA_SQL);
    await database.sql.unsafe(SEED_SQL);
  } finally {
    await database.sql.unsafe(`SELECT pg_advisory_unlock(${SETUP_LOCK_ID})`);
  }
}

export function ensureSchema(database: any): Promise<void> {
  if (!setupPromise) {
    setupPromise = runSetup(database).catch((error) => {
      // Let the next request try again rather than caching the failure for
      // the life of the instance - a transient connection problem during the
      // very first request should not leave the shop permanently empty.
      setupPromise = null;
      throw error;
    });
  }
  return setupPromise;
}

/** Test hook: forget that setup already ran on this instance. */
export function resetSchemaCacheForTests(): void {
  setupPromise = null;
}
