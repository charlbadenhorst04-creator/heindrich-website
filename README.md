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

## Order notification emails

The moment Payfast confirms a payment, two emails go out:

- **To the shop owner** (`SHOP_OWNER_EMAIL`, default
  `Heinrichcdoman@gmail.com`) — what was bought, what was paid, and the
  customer's name, email, phone and delivery address, so the order can be
  packed and shipped straight from the inbox. Hitting reply goes to the
  customer.
- **To the customer** — a receipt with their order reference, items,
  totals, delivery address and courier. Replying reaches the shop.

Nothing is emailed for an unpaid order, so abandoned checkouts don't fill
the inbox, and a Payfast retry of the same confirmation doesn't send twice.

### Turning it on

Sending is **off** until `SMTP_HOST` is set — local and sandbox work needs
no mail server. To send from the shop's Gmail address, put this in `.env`:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=Heinrichcdoman@gmail.com
SMTP_PASSWORD=your-16-character-app-password
SMTP_USE_TLS=true
SHOP_OWNER_EMAIL=Heinrichcdoman@gmail.com
STORE_URL=https://your-live-domain.co.za
```

Gmail will **not** accept your normal password here. You need an *App
password*:

1. Turn on 2-Step Verification: https://myaccount.google.com/security
2. Create an app password: https://myaccount.google.com/apppasswords
3. Paste the 16 characters into `SMTP_PASSWORD`.

Then `docker compose up --build`.

> **This depends on `PAYFAST_NOTIFY_URL` being publicly reachable.** Emails
> are triggered by Payfast's confirmation callback, so on a local setup
> where the notify URL is `localhost`, orders never reach paid and no email
> is ever sent — the same condition described in the go-live checklist
> above. Test emails on the deployed site, not on your laptop.

If the mail server is unreachable or the password is wrong, the order is
still recorded and marked paid — the failure is logged (`docker compose
logs backend`) and never costs a sale.

## WhatsApp order confirmation

When a payment is confirmed, the customer can also get a WhatsApp message
with their order reference, total and courier — sent to the phone number
they typed at checkout (local numbers like `082 123 4567` are converted to
international form automatically). It is off until `WHATSAPP_PROVIDER` is
set, and an order with no phone number is simply skipped.

### The one rule that shapes all of this

**WhatsApp does not let a business send a free-form message to someone who
has not messaged it in the last 24 hours.** An order confirmation is
business-initiated, so it must be sent as a **message template approved in
advance by Meta**. This is Meta's rule and applies whichever provider you
use — there is no way around it, and anything claiming otherwise (the
unofficial "WhatsApp Web" automation libraries) risks the number being
banned, which for a shop whose number is its customer line is not worth it.

So: create the template, wait for approval (usually a few hours, sometimes
a day), then switch it on.

### The template to submit

Category **Utility**. The code sends exactly four values, in this order, so
the body must use `{{1}}`–`{{4}}` exactly like this:

```
Hi {{1}}! Thanks for shopping with MERAVO. Your order {{2}} for {{3}} is
confirmed and we're getting it ready. We'll send your {{4}} tracking
number as soon as it ships.
```

| Placeholder | Value sent      | Example                                |
|-------------|-----------------|----------------------------------------|
| `{{1}}`     | First name      | `Thandi`                               |
| `{{2}}`     | Order reference | `3f2a1c9e-7b44-4d1a-9e60-2c5f8a1b0d33` |
| `{{3}}`     | Total paid      | `R 598.00`                             |
| `{{4}}`     | Courier         | `Aramex`                               |

If you reword the template, keep the same four placeholders in the same
order, or change `template_parameters()` in
`backend/app/services/whatsapp.py` to match.

### Option A — Meta WhatsApp Cloud API (no middleman, free tier)

1. Create a Meta Business account and a WhatsApp Business app at
   https://developers.facebook.com.
2. Add a phone number for the API. It must be a number **not currently
   active on the normal WhatsApp or WhatsApp Business app** — so not the
   067 157 2670 handset if that is in daily use. A second SIM is the usual
   answer.
3. Submit the template above under **Messaging → Message templates**.
4. Once approved, put the phone number ID and a permanent access token in
   `.env`:

```
WHATSAPP_PROVIDER=meta
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_ACCESS_TOKEN=EAAG...
WHATSAPP_TEMPLATE_NAME=order_confirmation
WHATSAPP_TEMPLATE_LANGUAGE=en
```

### Option B — Twilio (quickest to see working)

Twilio has a sandbox you can test in today, before any Meta approval: you
message a join code to their sandbox number from your own phone, and it can
then message you back in plain text.

```
WHATSAPP_PROVIDER=twilio
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=+14155238886
TWILIO_CONTENT_SID=
```

Leaving `TWILIO_CONTENT_SID` empty sends plain text, which **only works in
the sandbox and only to numbers that have joined it**. For real customers,
register the template with Twilio and set `TWILIO_CONTENT_SID` to its id.

### Notes

- Like email, this is triggered by Payfast's confirmation callback, so it
  needs `PAYFAST_NOTIFY_URL` to be publicly reachable — nothing sends on a
  localhost setup.
- A failure never costs a sale: the order stays paid and the reason is
  logged (`docker compose logs backend`). An unapproved template or expired
  token shows up there with the provider's own explanation.
- Messages cost money per conversation on both providers. Check current
  pricing before switching it on for a busy shop.

## Seeing incoming orders

You can also check orders directly in the database at any time:

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

Deliberately left out, because each needs a decision from the shop owner
rather than a code change:

- **An admin dashboard.** Orders and stock are managed with the SQL above,
  or any Postgres GUI.
- **Automatic tracking-number emails.** Recording a tracking number updates
  the customer's order page but does not email them; that is a manual
  message for now.
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
