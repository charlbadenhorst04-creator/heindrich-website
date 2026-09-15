# MERAVO — where things stand

Last updated the night of 15 September.

## The shop is live and working

**https://meravo-store.netlify.app**

- Netlify project **`meravo-store`**, deploying from GitHub (branch
  `claude/meravo-ecommerce-site-w82s0m`) — every push redeploys by itself
- Neon database connected (Frankfurt), all 7 products loaded
- Cart, shipping (R99 Aramex, free over R1500), orders all working
- Status page any time: **https://meravo-store.netlify.app/api/health**
  It says in plain words what is working and what is not.

## What is not done, in the order it matters

### 1. Payfast — nobody can pay by card yet

There is **no Payfast merchant account** for Meravo. That is the whole
reason checkout was failing with "400 Bad Request": the shop was using
Payfast's published demo credentials, which Payfast no longer honours.

Until an account exists, the checkout says so and offers the customer a
**WhatsApp button with their basket and total already written out**, so
orders still come in. It reopens by itself the moment real credentials are
set — there is nothing to switch back.

- **Heindrich** registers at **payfast.io**. Needs ID, bank details,
  business details. Verification takes a day or a few.
- **Meanwhile**, register a free sandbox account at
  **sandbox.payfast.co.za** with your own email. It issues your own
  sandbox Merchant ID and Key. Put those in Netlify as
  `PAYFAST_MERCHANT_ID` and `PAYFAST_MERCHANT_KEY`, redeploy, and the whole
  payment flow can be proven end to end before his account is approved.

### 2. The domain — blocked on a Google login

`meravo.co.za` is registered (expires 2026-11-03) and its DNS is hosted at
**Google** — the nameservers are `ns-cloud-a1…a4.googledomains.com`.

It is **not** on Shopify. The Shopify store was never connected to the
domain at all, so pointing it breaks nothing.

To finish it you need the Google account that holds the DNS zone. It will
be in one of:

- **domains.squarespace.com** (Google Domains accounts moved there)
- **console.cloud.google.com → Network Services → Cloud DNS**

Then: Netlify → **meravo-store → Domain management → Add a domain** →
`meravo.co.za`. Netlify shows two records. In Google DNS change:

| Type | Name | Value |
| --- | --- | --- |
| `A` | `@` (root) | the IP Netlify shows you |
| `CNAME` | `www` | `meravo-store.netlify.app` |

**Leave every `MX` and `TXT` record alone** — those are email.

Afterwards update these four in Netlify and redeploy:

- `PAYFAST_RETURN_URL` → `https://meravo.co.za/order-success`
- `PAYFAST_CANCEL_URL` → `https://meravo.co.za/cart`
- `PAYFAST_NOTIFY_URL` → `https://meravo.co.za/api/payments/payfast/notify`
- `STORE_URL` → `https://meravo.co.za`

### 3. Order emails — 10 minutes, optional

Nobody is emailed when an order comes in. To turn it on:

1. https://myaccount.google.com/security → 2-Step Verification on
2. https://myaccount.google.com/apppasswords → create one, copy the 16
   characters

Then in Netlify → **meravo-store → Environment variables**, scope **All**:

| Key | Value |
| --- | --- |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USERNAME` | your Gmail address |
| `SMTP_PASSWORD` | the 16-character app password |
| `SHOP_OWNER_EMAIL` | `Heinrichcdoman@gmail.com` |
| `STORE_URL` | `https://meravo-store.netlify.app` |

Redeploy, then check `/api/health` — that line turns green.

## Housekeeping when there is time

- **Rotate the database password.** The current one was pasted into a chat.
  Neon → Reset password → paste the new connection string into
  `DATABASE_URL` in Netlify → redeploy.
- **Delete the `meravo-shop` Netlify project.** It was an earlier attempt
  that never deployed and only causes confusion.
- **No WhatsApp order confirmations** on this deployment. That exists only
  in the Docker backend and needs a message template approved by Meta.

## Useful links

- Shop: https://meravo-store.netlify.app
- Status: https://meravo-store.netlify.app/api/health
- Payfast handover check (sandbox only):
  https://meravo-store.netlify.app/api/payfast-check
- Netlify: https://app.netlify.com/projects/meravo-store
- Database: https://console.neon.tech
