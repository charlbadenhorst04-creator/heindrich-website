# MERAVO

*Your Style. Your Story.*

MERAVO is an e-commerce storefront for South African online shopping —
browse products, add them to a cart, pay securely via Payfast, and get
nationwide delivery via Aramex. Built as a decoupled FastAPI (Python) API
and a React (TypeScript) frontend, running entirely in Docker.

## Tech stack

| Layer      | Technology                                              |
|------------|----------------------------------------------------------|
| Backend    | FastAPI, SQLAlchemy 2.0 (async), Alembic, PostgreSQL 17   |
| Frontend   | React 18, TypeScript, Vite, Tailwind CSS, Framer Motion   |
| State      | Zustand (cart), guest session key (no forced login)      |
| Payments   | Payfast (South African gateway — card, EFT, Instant EFT)  |
| Infra      | Docker, Docker Compose, Nginx (frontend static + API proxy)|

## Project structure

```
backend/
  app/
    core/        # settings, database engine, security (JWT, hashing)
    models/       # SQLAlchemy ORM models
    schemas/     # Pydantic request/response models
    api/routes/  # FastAPI routers (products, categories, cart, orders, auth, payments)
    services/    # Payfast integration
    seed.py      # idempotent demo data
  alembic/       # database migrations
frontend/
  src/
    api/         # typed API client
    store/       # Zustand cart store
    components/  # Navbar, Footer, ProductCard
    pages/       # Home, Shop, ProductDetail, Cart, Checkout, OrderSuccess, About, Contact
docker-compose.yml
```

## Running it

```bash
cp .env.example .env   # edit values as needed
docker compose up --build
```

- Frontend: http://localhost:8090
- Backend API: http://localhost:8000/api (interactive docs at http://localhost:8000/docs)

If either port is already used by something else on your machine, change
`FRONTEND_PORT` / `BACKEND_PORT` in `.env` and re-run
`docker compose up --build`.

Postgres is intentionally not published to your machine — the backend reaches
it over Docker's internal network, so it is never exposed to the outside
world. To look inside the database:

```bash
docker compose exec db psql -U meravo -d meravo
```

On first boot the backend automatically runs Alembic migrations and seeds
demo categories/products (see `backend/app/seed.py`) so the site isn't
empty. Seeding is idempotent — safe to restart the stack.

## Pages

1. **Home** — hero, animated highlights, featured products
2. **Shop** — full catalogue with search + category filters
3. **Product Detail** — gallery, quantity picker, add to cart
4. **Cart** — line-item editing, live totals
5. **Checkout** — shipping details, redirects to Payfast's hosted payment page
6. **Order Success** — confirmation + order summary
7. **About** / **Contact** — brand + support info

All pages are responsive from mobile (390px) up through desktop, and use
Framer Motion for entrance/hover/tap animations on product cards, the
hero section, and cart interactions.

## Payments — how money actually reaches your bank account

Card numbers are **never** sent to or stored by this application. Checkout
posts an order total to Payfast's hosted payment page (`build_checkout_fields`
in `backend/app/services/payfast.py`), which handles card capture on its own
PCI-compliant infrastructure. Payfast then:

1. Notifies our backend via a signed server-to-server callback
   (`POST /api/payments/payfast/notify`), which verifies the signature,
   re-confirms the payload with Payfast's own servers, checks the amount,
   and marks the order paid.
2. Settles funds into whatever South African bank account is linked on
   your own Payfast merchant dashboard (https://www.payfast.co.za) —
   there is nothing to configure in this codebase besides your merchant
   ID/key/passphrase (`PAYFAST_*` env vars).

### Going live — checklist

1. Create a Payfast merchant account and link your bank account there.
2. In `.env`, set `PAYFAST_MODE=live` plus your real
   `PAYFAST_MERCHANT_ID` / `PAYFAST_MERCHANT_KEY` / `PAYFAST_PASSPHRASE`.
3. **Point the three Payfast URLs at your real domain**, not `localhost`:
   `PAYFAST_RETURN_URL`, `PAYFAST_CANCEL_URL` and — most importantly —
   `PAYFAST_NOTIFY_URL`. Payfast calls the notify URL from its own
   servers, so it must be publicly reachable over the internet. If it is
   left as `localhost`, customers can still pay but **no order will ever
   be marked paid**, because the confirmation can never arrive.
4. Set a long random `SECRET_KEY` — for example the output of
   `python -c "import secrets; print(secrets.token_urlsafe(48))"`. With
   `PAYFAST_MODE=live` the backend refuses to start while `SECRET_KEY` is
   still one of the placeholder values, so this cannot be forgotten
   silently.
5. Set a strong `POSTGRES_PASSWORD` and keep `.env` out of version
   control (it is already listed in `.gitignore`).
6. Serve the site over HTTPS, and add your live domain to
   `BACKEND_CORS_ORIGINS`.

## Seeing incoming orders

There is **no automatic email** to you or the customer when an order is
placed — sending mail needs an email provider and credentials, which is a
decision for the shop owner (see "Not built yet" below). Until that is
added, check for new orders directly:

```bash
docker compose exec db psql -U meravo -d meravo -c \
  "SELECT created_at, customer_name, customer_email, phone, total_amount, status
     FROM orders ORDER BY created_at DESC LIMIT 20;"
```

Only orders with `status = PAID` have actually been paid for. `PENDING`
means the customer started checkout but Payfast has not confirmed payment
(they may have abandoned it). Note the status is stored in **capitals** in
the database (`PENDING`, `PAID`, `FAILED`, `CANCELLED`, `SHIPPED`,
`COMPLETE`) even though the website shows it in lowercase — SQL below must
use the capitalised form.

To see what a specific order contained:

```bash
docker compose exec db psql -U meravo -d meravo -c \
  "SELECT product_name, quantity, unit_price FROM order_items
     WHERE order_id = 'PASTE-ORDER-ID-HERE';"
```

To record a tracking number so it shows on the customer's order page:

```bash
docker compose exec db psql -U meravo -d meravo -c \
  "UPDATE orders SET tracking_number = 'AWB123456', status = 'SHIPPED'
     WHERE id = 'PASTE-ORDER-ID-HERE';"
```

## Not built yet

Deliberately left out, because each needs a decision or credentials from
the shop owner rather than a code change:

- **Order notification emails** (to the customer and to the shop). Needs an
  email provider (e.g. SendGrid, Mailgun, or plain SMTP) and a verified
  sender address. Until this exists, the site does not promise customers an
  email — it asks them to keep their order reference and get in touch.
- **An admin dashboard.** Orders and stock are managed with the SQL above,
  or any Postgres GUI.
- **Customer accounts.** Registration and login endpoints exist
  (`/api/auth/*`) but nothing in the storefront uses them — shopping is
  guest-only via a session key, which is the simpler flow for a small shop.

## Scaling & maintainability notes

- **Backend** is a standard layered FastAPI app (routes → schemas →
  models → services), so a team can add a new resource (e.g. reviews,
  wishlists) by adding one file per layer without touching existing code.
- **Migrations** are managed by Alembic — never hand-edit the schema;
  run `alembic revision --autogenerate -m "..."` after changing models.
- **Frontend** state is centralized in a small Zustand store and a typed
  API client (`src/api/client.ts`), so new pages/components consume the
  same typed contracts instead of re-implementing fetch logic.
- Both services are independently containerized and stateless (session
  state lives in Postgres via a `session_key`, not in server memory), so
  either can be horizontally scaled behind a load balancer as traffic grows.
- Product photography lives in `frontend/public/images/products/`, named
  after each product's slug, and is referenced by the `image_url` column
  (see `backend/app/seed.py`). To swap a photo, drop a new file in that
  folder under the same name — no code changes required. Re-running the
  seed updates `image_url` on existing products, so photo changes don't
  need a database reset.
- Stock is enforced server-side on every cart add/update (the UI's
  quantity controls can be bypassed by calling the API directly), and
  again at checkout — a cart can sit for days, so the last unit may have
  sold since it was added. It is drawn down once, when Payfast confirms
  payment — not at checkout, so an abandoned payment never eats stock.
- The Shop page loads the catalogue a page at a time with a "Load more"
  button, so adding products never pushes older ones out of reach.

## Local development (without Docker)

Backend:
```bash
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

## Testing

Backend (unit tests + real integration tests against Postgres — cart,
checkout/shipping math, auth, Payfast notify):
```bash
cd backend
createdb meravo_test   # once, if it doesn't exist yet
pip install -e ".[dev]"
pytest
```

Frontend:
```bash
cd frontend
npm run lint      # ESLint
npm run build     # type-checks (tsc -b) then builds
```

Netlify functions (see "Netlify preview deployment" below) have their own
real-execution test suite — they run raw SQL directly against Postgres, so
type-checking alone can't catch bugs like a column name collision:
```bash
cd frontend
createdb meravo_netlify_test   # once, if it doesn't exist yet
npm run test:functions
```

## Netlify preview deployment

`netlify.toml` and `frontend/netlify/` configure an optional, independent
deployment target: a Node/TypeScript mirror of the same API (same schema,
same Payfast flow, same shipping rules) backed by Netlify DB (Postgres via
Neon), for teams who want a shareable preview link without standing up
their own server. It's kept in sync by hand with the FastAPI backend — the
backend in `backend/` remains the source of truth and the one intended for
production. To deploy: create a Netlify site, link this repository, and
set the `PAYFAST_*` environment variables in the Netlify UI; the build
picks up `netlify.toml` automatically.
