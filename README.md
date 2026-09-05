# MERAVO

*Your Style. Your Story.*

MERAVO is an e-commerce storefront for South African online shopping —
browse products, add them to a cart, and pay securely via Payfast. Built
as a decoupled FastAPI (Python) API and a React (TypeScript) frontend,
running entirely in Docker.

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
- Postgres: localhost:5432

If any of these ports are already used by something else on your machine, change
`FRONTEND_PORT` / `BACKEND_PORT` / `POSTGRES_PORT` in `.env` and re-run
`docker compose up --build`.

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

To go live: create a Payfast merchant account, link your bank account there,
set `PAYFAST_MODE=live` and your real `PAYFAST_MERCHANT_ID` /
`PAYFAST_MERCHANT_KEY` / `PAYFAST_PASSPHRASE` in `.env`.

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
- Product photography: the seed data ships with placeholder images
  (`image_url` per product). Replace them with real product photography
  by updating that column — no code changes required.

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
