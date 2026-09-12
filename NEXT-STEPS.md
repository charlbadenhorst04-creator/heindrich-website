# Launching meravo.co.za

## Already done

- Site built and live at **https://meravo.netlify.app**
- Netlify project `meravo`, deploying from GitHub (branch
  `claude/meravo-ecommerce-site-w82s0m`) — every push redeploys automatically
- All six `PAYFAST_*` environment variables set, in sandbox mode
- The site now **creates its own database tables and loads the 7 products on
  its first visit**, so there is no SQL to run by hand

---

## Step 1 — a database (about 3 minutes)

1. Go to **neon.tech** → sign up (free) → **Create project**
   - Region: pick **Frankfurt / eu-central-1** (closest to South Africa)
2. It shows you a **connection string**. Copy it. It looks like:
   ```
   postgresql://neondb_owner:xxxx@ep-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```

## Step 2 — give it to Netlify (1 minute)

Netlify → project **meravo** → **Environment variables** → **Add a variable**
→ **Add a single variable**

- Key: `NETLIFY_DATABASE_URL`
- Value: the connection string from step 1
- Scope: **All**

## Step 3 — rebuild (1 minute)

Netlify → **Deploys** → **Trigger deploy** → **Clear cache and deploy site**

Wait for it to go green, then open **https://meravo.netlify.app**.

The first page load creates the tables and loads the catalogue by itself —
it can take a few seconds. Refresh once if the shop looks empty at first.

## Step 4 — check it

- Shop page lists 7 products with photos
- Add one to the cart → cart shows R99 Aramex shipping
- Checkout → button reads "Pay R … with Payfast"

**If all three work, the store is ready.**

---

## Step 5 — the domain (only once step 4 passes)

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

## Known gap on the Netlify version

**No order emails and no WhatsApp.** Those exist in the FastAPI backend
only. Here, a customer can pay and nobody is notified. Until that is added,
check for orders in the Neon SQL editor:

```sql
SELECT created_at, customer_name, customer_email, phone, total_amount, status
FROM orders ORDER BY created_at DESC LIMIT 20;
```

Only rows with `status = PAID` are real sales.
