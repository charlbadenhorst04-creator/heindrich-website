# MERAVO — go-live guide

Last updated 1 October.

## Where things stand

**The shop is live: https://meravo-store.netlify.app**

- Products, cart, shipping (R99 Aramex, free over R1 500), checkout and
  orders all work, on a real database.
- **Payments go through Stitch** (card and Pay by Bank). Payfast has been
  taken out. The moment the Stitch account is approved and its details are
  added, card payments switch on by themselves.
- Until then, checkout says so plainly and offers a **WhatsApp button with
  the customer's basket and total already written out**, so orders still
  come in.
- **Payment addresses follow the domain automatically.** When meravo.co.za
  goes live there is nothing to change — customers on meravo.co.za are
  returned to meravo.co.za.
- Status page any time: **https://meravo-store.netlify.app/api/health** —
  it says in plain words what works and what does not. For Stitch it
  actually logs in to check the credentials, rather than just looking for
  them.

---

## 1. The domain — the only thing on your list

`meravo.co.za`'s DNS is in **Tertius's Google account**. Two changes there,
nothing else:

| Type | Name | Change |
| --- | --- | --- |
| `A` | `@` (root) | change `23.227.38.66` → **`75.2.60.5`** |
| `CNAME` | `www` | add it → **`meravo-store.netlify.app.`** (with the full stop) |

**Leave every `MX` and `TXT` record alone** — those are email.

Then Netlify → **meravo-store → Domain management** → **Verify DNS
configuration**, then **Provision certificate** for the padlock.

Check progress at https://dnschecker.org/#A/meravo.co.za — when it shows
`75.2.60.5` instead of `23.227.38.66`, it has moved.

That's it. No payment settings need touching.

---

## 2. Stitch — when Meravo's Stitch account is approved

This is Heindrich's side: Stitch onboards businesses directly, and they
will ask for company and bank details. Stitch tends to work with
established businesses, so ask early what they need.

### What to ask Stitch for

Copy-paste this to them:

> We're integrating Stitch on our own website using the Stitch-hosted
> payment page (clientPaymentInitiationRequestCreate). Please could you:
>
> 1. Issue us a **test client** first, then a **live client** — client ID
>    and client secret for each, with the `client_paymentrequest` scope.
> 2. Enable **Card** and **Pay by Bank** on both clients.
> 3. Whitelist these redirect URIs:
>    - `https://meravo.co.za/order-success`
>    - `https://www.meravo.co.za/order-success`
>    - `https://meravo-store.netlify.app/order-success`
> 4. Confirm whether you hold our settlement account, or whether we pass
>    beneficiary bank details on each payment request.

### Then, in Stitch's dashboard

Add a **webhook** for the **`payment`** event, pointing at:

```
https://meravo-store.netlify.app/api/payments/stitch/webhook
```

Use the `netlify.app` address — it never changes, even after the domain
moves. Copy the webhook's **signing secret**.

### Then, in Netlify

**meravo-store → Environment variables**, scope **All**:

| Key | Value |
| --- | --- |
| `STITCH_CLIENT_ID` | from Stitch (test client first) |
| `STITCH_CLIENT_SECRET` | from Stitch |
| `STITCH_WEBHOOK_SECRET` | the webhook's signing secret |

Only if Stitch said to pass bank details on each payment:

| Key | Value |
| --- | --- |
| `STITCH_BENEFICIARY_NAME` | account holder name |
| `STITCH_BENEFICIARY_BANK_ID` | e.g. `fnb`, `absa`, `capitec`, `nedbank`, `standard_bank` |
| `STITCH_BENEFICIARY_ACCOUNT_NUMBER` | the account number |

**Trigger deploy → Clear cache and deploy site**, then open `/api/health`.
It should say **"Stitch, with a TEST client"** and **"Stitch accepted the
credentials."** If it shows a red line, it says what is wrong.

### Then prove it before taking real money

1. Put an order through on the test client, all the way to paying on
   Stitch's page.
2. You should land back on a **"Thank you for your order!"** page.
3. In Neon's SQL editor:
   ```sql
   SELECT created_at, customer_name, total_amount, status, payment_provider
   FROM orders ORDER BY created_at DESC LIMIT 5;
   ```
   The order should show `status = paid`, `payment_provider = stitch`.

Then swap `STITCH_CLIENT_ID` and `STITCH_CLIENT_SECRET` for the **live**
client's, redeploy, and the shop takes real money.

---

## 3. Order emails — optional, about 10 minutes

Nobody is emailed when an order is paid until this is set.

1. https://myaccount.google.com/security → 2-Step Verification on
2. https://myaccount.google.com/apppasswords → create one, copy the 16
   characters

Netlify → **meravo-store → Environment variables**, scope **All**:

| Key | Value |
| --- | --- |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USERNAME` | your Gmail address |
| `SMTP_PASSWORD` | the 16-character app password |
| `SHOP_OWNER_EMAIL` | `Heinrichcdoman@gmail.com` |

Redeploy. The "Order emails" line on `/api/health` turns green.

---

## Housekeeping, when there's time

- **Delete the old Payfast settings** in Netlify — every variable starting
  with `PAYFAST_` (`PAYFAST_MODE`, `PAYFAST_MERCHANT_ID`,
  `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE`, `PAYFAST_RETURN_URL`,
  `PAYFAST_CANCEL_URL`, `PAYFAST_NOTIFY_URL`), plus `STORE_URL` and
  `PAYMENT_PROVIDER` if they are there. The shop ignores them now.
- **Rotate the database password.** The current one was pasted into a chat.
  Neon → Reset password → paste the new connection string into
  `DATABASE_URL` → redeploy.
- **Delete the `meravo-shop` Netlify project** — an earlier attempt that
  never deployed.

## One honest caveat

The Stitch integration was written from Stitch's published documentation,
on a machine that could not reach Stitch to try it. It is tested against a
stand-in that speaks the same API, including every way a payment should be
refused — but **the first test-client payment is the real proof**. If
anything differs, `/api/health` and the checkout's error will say so, and
the likeliest causes are settings on Stitch's side (redirect URI not
whitelisted, Card not enabled on the client) rather than code.

## Seeing your orders

Neon → SQL Editor:

```sql
SELECT created_at, customer_name, customer_email, phone, total_amount,
       status, payment_provider
FROM orders ORDER BY created_at DESC LIMIT 20;
```

Only rows with `status = paid` are real sales.
