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
| Infra      | Docker, Docker Compose, Nginx (static + API proxy)        |
| HTTPS      | Caddy, with automatic Let's Encrypt certificates          |
| Notifications | Order email (SMTP) and WhatsApp (Meta Cloud API or Twilio) |

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
- Backend API: http://localhost:8000/api

Both are published on `127.0.0.1` only, so they work on your own machine but
are never reachable from outside it. The interactive API docs (Swagger) are
off by default, because they publish a complete map of the API; to browse
them locally, set `ENABLE_API_DOCS=true` in `.env` and restart, then open
http://localhost:8000/docs.

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

### Going live — the quick way

On a fresh Ubuntu server, from inside this repository:

```bash
sudo bash deploy/setup-server.sh meravo.co.za
```

That installs Docker, writes a `.env` with a freshly generated database
password and secret key, opens ports 80 and 443, builds everything, and
waits until `https://meravo.co.za` answers. It checks your DNS first and
tells you exactly which records to create if it isn't pointing at the
server yet, and it never overwrites an existing `.env`, so it doubles as
the redeploy command.

It deliberately starts in **Payfast sandbox mode** — no real money moves
until you put your live merchant details in `.env` and set
`PAYFAST_MODE=live`.

The rest of this section is the same thing done by hand, and explains what
each part is for.

### Going live — the whole checklist

Everything below happens on the server that will host the site. Work
through it in order; the guards described at the end will stop you booting
if something important is still a placeholder.

**1. Point the domain at the server.** Create an `A` record for your domain
pointing at the server's public IP, and a second one for `www` so both
addresses work. Give DNS a few minutes, then check from the server:

```bash
dig +short your-domain.co.za
dig +short www.your-domain.co.za
```

Both must print your server's IP before HTTPS can be issued. If you would
rather not have a `www` address at all, delete the `www.{$SITE_DOMAIN}`
block from the `Caddyfile` — left in place without a matching DNS record,
Caddy keeps retrying a certificate it can never get.

**2. Open only ports 80 and 443** on the server's firewall. Nothing else
needs to be reachable — the database is never published, and the site and
API are bound to `127.0.0.1`, so Caddy is the only thing listening publicly.

```bash
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw enable
```

**3. Fill in `.env`.** Start from the example and edit:

```bash
cp .env.example .env
```

| Setting | Value |
|---|---|
| `SITE_DOMAIN` | `your-domain.co.za` — no `https://`, no trailing slash |
| `POSTGRES_PASSWORD` | a long random password |
| `DATABASE_URL` | the same password, e.g. `postgresql+asyncpg://meravo:THAT_PASSWORD@db:5432/meravo` |
| `SECRET_KEY` | output of `python3 -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `BACKEND_CORS_ORIGINS` | `https://your-domain.co.za` |
| `STORE_URL` | `https://your-domain.co.za` |
| `PAYFAST_MODE` | `live` |
| `PAYFAST_MERCHANT_ID` / `_KEY` / `_PASSPHRASE` | from your Payfast dashboard |
| `PAYFAST_RETURN_URL` | `https://your-domain.co.za/order-success` |
| `PAYFAST_CANCEL_URL` | `https://your-domain.co.za/cart` |
| `PAYFAST_NOTIFY_URL` | `https://your-domain.co.za/api/payments/payfast/notify` |

`PAYFAST_NOTIFY_URL` is the one people get wrong. Payfast calls it from its
own servers, so it must be your public domain. Left as `localhost`,
customers can still pay but **no order is ever marked paid** — and no
confirmation email or WhatsApp is ever sent, because both are triggered by
that callback.

**4. Start it with HTTPS:**

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Caddy requests a free Let's Encrypt certificate for `SITE_DOMAIN` on first
boot and renews it automatically. Watch it happen:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f caddy
```

**5. Check it.** From your own machine:

```bash
curl -I https://your-domain.co.za
```

Expect `HTTP/2 200`, and confirm `http://your-domain.co.za` redirects to
`https://`. Then open the site, add something to the cart, and go through a
real checkout with a small amount to confirm the whole loop — payment,
order marked paid, confirmation email.

**6. Set up backups** before you take real orders — see the next section.

### What the code refuses to let you get wrong

With `PAYFAST_MODE=live`, the backend will not start if:

- `SECRET_KEY` is still a placeholder from the repo,
- the database password is still `change-me` (or another obvious default),
- `BACKEND_CORS_ORIGINS` contains a plain `http://` domain, since a live
  store taking payments must be served over HTTPS.

Each refusal names the setting and what to do. This is deliberate: these
are silent problems otherwise.

### What is exposed, and what is not

| Thing | Reachable from the internet |
|---|---|
| Caddy (ports 80, 443) | yes — this is the site |
| Storefront + `/api` proxy | only through Caddy |
| Backend API (port 8000) | no — bound to `127.0.0.1` |
| PostgreSQL | no — not published at all |
| Swagger / ReDoc / OpenAPI | no — off unless `ENABLE_API_DOCS=true` |
| Registration / login endpoints | no — unmounted unless `ENABLE_ACCOUNTS=true` |

Responses carry `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy`, `Permissions-Policy`, HSTS (from Caddy) and a Content
Security Policy. The CSP allows exactly what the site needs — Google Fonts,
and form submissions to Payfast. **If you ever change the payment provider,
its domain has to be added to `form-action` in
`frontend/security-headers.conf`, or checkout will silently stop working.**

Checkout is rate limited to 20 requests a minute per IP, and the account
routes to 10. Browsing and cart traffic are deliberately not limited:
mobile networks here put many customers behind one IP, so a shared limit
would eventually lock real shoppers out of their own carts. The Payfast
callback is never limited.

### Backups

Orders live in a Docker volume. Take a copy somewhere off the server:

```bash
docker compose exec -T db pg_dump -U meravo meravo | gzip > meravo-$(date +%F).sql.gz
```

To restore into an empty database:

```bash
gunzip -c meravo-2026-09-08.sql.gz | docker compose exec -T db psql -U meravo -d meravo
```

Worth running daily from cron once you are taking orders:

```
0 2 * * * cd /path/to/heindrich-website && docker compose exec -T db pg_dump -U meravo meravo | gzip > /backups/meravo-$(date +\%F).sql.gz
```

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
- **Customer accounts.** Registration and login are implemented
  (`/api/auth/*`) but nothing in the storefront uses them — shopping is
  guest-only via a session key, which is the simpler flow for a small shop.
  The routes are therefore left unmounted, so they are not exposed on the
  internet for nothing; set `ENABLE_ACCOUNTS=true` if you build on them.

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
