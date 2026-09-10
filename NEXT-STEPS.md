# Where things stand, and the one step left

Last updated: 2026-09-10

## Done

- Site is built and live at **https://meravo.netlify.app**
- Netlify project `meravo`, deploying from GitHub, branch
  `claude/meravo-ecommerce-site-w82s0m` — every push redeploys automatically
- All six `PAYFAST_*` environment variables are set (sandbox mode)
- `meravo.co.za` is untouched and still on Shopify

## The one step left: a database

The site loads, but the Shop page will be empty until the API functions have
somewhere to read products from.

### 1. Get a free Postgres database

Go to **neon.tech** → sign up → **Create project** → pick a region near South
Africa (Frankfurt / `eu-central-1`).

Copy the **connection string** it gives you. It looks like:

```
postgresql://neondb_owner:xxxx@ep-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require
```

### 2. Tell Netlify about it

Netlify → project `meravo` → **Environment variables** → **Add a variable** →
**Add a single variable**:

- Key: `NETLIFY_DATABASE_URL`
- Value: the connection string from step 1
- Scope: **All**

### 3. Create the tables

Back in Neon → **SQL Editor**. Open this file, click **Raw**, select all, copy:

```
https://github.com/charlbadenhorst04-creator/heindrich-website/raw/claude/meravo-ecommerce-site-w82s0m/frontend/netlify/database/migrations/20260905090000_init/migration.sql
```

Paste it into the SQL Editor and **Run**. That creates the tables and inserts
the 7 products.

### 4. Rebuild

Netlify → **Deploys** → **Trigger deploy** → **Clear cache and deploy site**.

Environment variables only reach the functions on a fresh build.

### 5. Check

Open https://meravo.netlify.app

- Shop page lists 7 products with photos
- Add one to the cart → cart shows R99 Aramex shipping
- Checkout → button reads "Pay R … with Payfast"

## Only after that works: the domain

Do not change DNS before the Netlify site is working end to end. The moment
you repoint `meravo.co.za`, the Shopify store goes down.

1. Netlify → **Domain management** → **Add a domain** → `meravo.co.za`
2. At the registrar: delete the existing Shopify records for `@` and `www`,
   then add the records Netlify shows you
3. Update these three environment variables from `meravo.netlify.app` to
   `meravo.co.za`, then redeploy:
   - `PAYFAST_RETURN_URL`  → `https://meravo.co.za/order-success`
   - `PAYFAST_CANCEL_URL`  → `https://meravo.co.za/cart`
   - `PAYFAST_NOTIFY_URL`  → `https://meravo.co.za/api/payments/payfast/notify`

## Known gaps on this Netlify version

- **No order emails and no WhatsApp.** They exist in the FastAPI backend
  only. On Netlify, a customer can pay and nobody is notified — check for
  orders in the Neon SQL editor:

  ```sql
  SELECT created_at, customer_name, customer_email, phone, total_amount, status
  FROM orders ORDER BY created_at DESC LIMIT 20;
  ```

  Only `PAID` rows are real sales.

- Keep `PAYFAST_MODE=sandbox` until a test payment has gone all the way
  through. No real money moves in sandbox.
