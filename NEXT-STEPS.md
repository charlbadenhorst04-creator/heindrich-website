# Launching meravo.co.za

## Already done

- Site built and live at **https://meravo-shop.netlify.app**
- Netlify project **`meravo-shop`** (the URL is
  `meravo-shop.netlify.app` — plain `meravo.netlify.app` is a different,
  non-existent site and will 404), deploying from GitHub (branch
  `claude/meravo-ecommerce-site-w82s0m`) — every push redeploys automatically
- All six `PAYFAST_*` environment variables set, in sandbox mode
- The site now **creates its own database tables and loads the 7 products on
  its first visit**, so there is no SQL to run by hand
- Order emails are built in — off until you add the mail settings below

---

## Step 1 — a database (about 1 minute)

The Neon database extension is already installed on the project, so this
may be a single button:

1. Open **https://app.netlify.com/projects/meravo-shop**
2. **Extensions** in the left sidebar → **Neon** → create a database
   (the free tier is plenty)

Netlify sets the connection string for you — there is nothing to copy or
paste.

### If you cannot find that button

Do it the manual way instead. It takes a few minutes longer and the result
is identical — any Postgres connection string works here.

> The variable has to be called **`DATABASE_URL`**, exactly. Not
> `NETLIFY_DATABASE_URL` — Netlify reserves names beginning with
> `NETLIFY_` for its own extensions, so one typed in by hand is ignored
> and the shop comes up with no database and no error to explain it.

1. Go to **neon.tech** → sign up (free) → **Create project**
   - Region: pick **Frankfurt / eu-central-1** (closest to South Africa)
2. Copy the **connection string** it shows you. It looks like:
   ```
   postgresql://neondb_owner:xxxx@ep-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```
3. **https://app.netlify.com/projects/meravo-shop** → **Environment
   variables** → **Add a variable** → **Add a single variable**
   - Key: `DATABASE_URL`
   - Value: the connection string
   - Scope: **All**

## Step 2 — rebuild

Netlify → **Deploys** → **Trigger deploy** → **Clear cache and deploy site**

Wait for it to go green, then open **https://meravo-shop.netlify.app**.

The first page load creates the tables and loads the catalogue by itself —
it can take a few seconds. Refresh once if the shop looks empty at first.

## Step 3 — check it

Open **https://meravo-shop.netlify.app/api/health**.

It is a plain status page that tells you, in words, what is working and
what is not — no guessing, no logs. It says either *"The shop is ready to
take orders"* or exactly which setting is missing. Open it any time
something looks wrong; it is safe to leave up, because it never shows a
password or a key.

Then check the shop itself:

- Shop page lists 7 products with photos
- Add one to the cart → cart shows R99 Aramex shipping
- Checkout → button reads "Pay R … with Payfast"

**If those work, the store is ready.**

---

## Step 4 — the domain (only once step 3 passes)

Repointing DNS takes the existing Shopify store offline, so do this last.

1. Netlify → **Domain management** → **Add a domain** → `meravo.co.za`
2. Netlify shows you the DNS records to create. At your registrar:
   **delete the existing Shopify records for `@` and `www`**, then add
   Netlify's
3. HTTPS is issued automatically once DNS resolves — minutes to an hour
4. Update these three environment variables, then redeploy:
   - `PAYFAST_RETURN_URL` → `https://meravo.co.za/order-success`
   - `PAYFAST_CANCEL_URL` → `https://meravo.co.za/cart`
   - `PAYFAST_NOTIFY_URL` → `https://meravo.co.za/api/payments/payfast/notify`

---

## Before taking real money

`PAYFAST_MODE` is `sandbox`. No real payment can happen until you change it.

1. Put a test order all the way through using Payfast's sandbox card details
2. Then set `PAYFAST_MODE=live` and add your real
   `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE`
3. Redeploy

---

## Order emails (optional, about 5 minutes)

The site can email Heindrich the moment someone pays — what was bought,
what was paid, and the customer's name, phone and delivery address — and
email the customer a receipt at the same time. Replying to either message
reaches the other person.

Nothing is sent for an unpaid order, and a payment is never lost because of
a mail problem: if the mail settings are wrong, the order is still recorded
and paid, and the failure just shows up in the logs.

**Until you set this up, nobody is notified when an order comes in** — you
have to go and look (see "Seeing your orders" below).

### 1. Get a Gmail App password

Gmail will not accept the normal account password here.

1. Turn on 2-Step Verification: https://myaccount.google.com/security
2. Create an app password: https://myaccount.google.com/apppasswords
3. Copy the 16 characters it gives you.

### 2. Add six variables in Netlify

Netlify → project **meravo-shop** → **Environment variables**, scope **All**:

| Key | Value |
| --- | --- |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USERNAME` | the Gmail address sending the mail |
| `SMTP_PASSWORD` | the 16-character app password |
| `SHOP_OWNER_EMAIL` | `Heinrichcdoman@gmail.com` |
| `STORE_URL` | `https://meravo.co.za` |

### 3. Redeploy, then test

Trigger a deploy, then put a sandbox order all the way through. Both inboxes
should have mail within a few seconds. If they don't, check
**Netlify → Logs → Functions** — the reason is written there in plain words.

No WhatsApp on this deployment. That exists only in the Docker backend, and
it needs a message template approved by Meta before it can send anything.

---

## Seeing your orders

Any time, in the Neon SQL editor:

```sql
SELECT created_at, customer_name, customer_email, phone, total_amount, status
FROM orders ORDER BY created_at DESC LIMIT 20;
```

Only rows with `status = paid` are real sales.
