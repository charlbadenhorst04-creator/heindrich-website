-- MERAVO schema mirror for the Netlify-hosted preview deployment.
-- Mirrors backend/app/models/*.py so the storefront behaves identically
-- to the FastAPI + Postgres version in Docker.

CREATE TABLE categories (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
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

CREATE INDEX idx_products_name ON products (name);
CREATE INDEX idx_products_category ON products (category_id);

CREATE TABLE carts (
  id UUID PRIMARY KEY,
  session_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cart_items (
  id UUID PRIMARY KEY,
  cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cart_items_cart ON cart_items (cart_id);

CREATE TABLE orders (
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

CREATE TABLE order_items (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1
);

-- Seed data: same categories/products as backend/app/seed.py
INSERT INTO categories (id, name, slug) VALUES
  ('11111111-0000-0000-0000-000000000001', 'Tools & Hardware', 'tools-hardware'),
  ('11111111-0000-0000-0000-000000000002', 'Automotive', 'automotive'),
  ('11111111-0000-0000-0000-000000000003', 'Kids & Toys', 'kids-toys'),
  ('11111111-0000-0000-0000-000000000004', 'Home & Care', 'home-care');

INSERT INTO products (id, name, slug, description, price, image_url, stock, category_id) VALUES
  (
    '22222222-0000-0000-0000-000000000001',
    '101-Piece Magnetic Precision Screwdriver Set',
    '101-piece-magnetic-precision-screwdriver-set',
    'A complete 101-piece precision screwdriver set with magnetic bits and a sturdy storage rack - built for electronics, appliance and everyday repairs.',
    499.00,
    '/images/products/101-piece-magnetic-precision-screwdriver-set.png',
    50,
    '11111111-0000-0000-0000-000000000001'
  ),
  (
    '22222222-0000-0000-0000-000000000002',
    'Car Vacuum Cleaner',
    'car-vacuum-cleaner',
    'Compact, strong-suction handheld vacuum cleaner designed for quick interior car cleanups - crumbs, dust and debris, gone in minutes.',
    499.00,
    '/images/products/car-vacuum-cleaner.png',
    40,
    '11111111-0000-0000-0000-000000000002'
  ),
  (
    '22222222-0000-0000-0000-000000000003',
    'Interactive Plush Lion Hand Puppet',
    'interactive-plush-lion-hand-puppet',
    'A soft, huggable lion hand puppet that brings storytime to life - perfect for imaginative play and bonding time with little ones.',
    129.00,
    '/images/products/interactive-plush-lion-hand-puppet.png',
    80,
    '11111111-0000-0000-0000-000000000003'
  ),
  (
    '22222222-0000-0000-0000-000000000004',
    'Kids Drawing Tablet',
    'kids-drawing-tablet',
    'An LCD writing and drawing tablet for kids - screen-free, reusable, and great for sparking creativity on the go.',
    299.00,
    '/images/products/kids-drawing-tablet.png',
    60,
    '11111111-0000-0000-0000-000000000003'
  ),
  (
    '22222222-0000-0000-0000-000000000005',
    'Kids Hobby Horse or Unicorn with Galloping Neighing Sounds',
    'kids-hobby-horse-unicorn-galloping-sounds',
    'A playful hobby horse with realistic galloping and neighing sounds - hours of active, imaginative outdoor or indoor play.',
    349.00,
    'https://picsum.photos/seed/kids-hobby-horse-unicorn-galloping-sounds/600/600',
    35,
    '11111111-0000-0000-0000-000000000003'
  ),
  (
    '22222222-0000-0000-0000-000000000006',
    'Kids Mountain Bike Seat with Dual Handle',
    'kids-mountain-bike-seat-dual-handle',
    'A secure, comfortable rear bike seat with dual handles, so little riders can safely join the family adventure on the trail.',
    1199.00,
    '/images/products/kids-mountain-bike-seat-dual-handle.png',
    20,
    '11111111-0000-0000-0000-000000000003'
  ),
  (
    '22222222-0000-0000-0000-000000000007',
    'White Shoe Cleaner - Restore. Refresh. Shine.',
    'white-shoe-cleaner-restore-refresh-shine',
    'A dedicated whitening cream for sneakers and white shoes - restores, refreshes and shines in just a few wipes.',
    92.00,
    '/images/products/white-shoe-cleaner-restore-refresh-shine.png',
    100,
    '11111111-0000-0000-0000-000000000004'
  );
