# J.HINTON Stripe Checkout — GitHub + Vercel

This folder is the private server-side checkout API for `j-hinton.com`.

## 1. Create the GitHub repository

Create a new **private** GitHub repository, for example:

`jhinton-checkout-api`

Upload the contents of this `vercel-stripe-api` folder to the repository root.

Do **not** commit Stripe secret keys.

## 2. Import the GitHub repo into Vercel

In Vercel:

1. Add New → Project
2. Import the private GitHub repository
3. Framework preset: Other
4. Deploy

The API health route should become:

`https://YOUR-VERCEL-PROJECT.vercel.app/api/health`

It should return JSON showing the checkout service is running.

## 3. Add Vercel environment variables

Project → Settings → Environment Variables:

- `STRIPE_SECRET_KEY` = Stripe secret key (`sk_test_...` while testing)
- `STRIPE_WEBHOOK_SECRET` = Stripe webhook signing secret (`whsec_...`)
- `ALLOWED_SHIPPING_COUNTRIES` = `US`
- `STRIPE_AUTOMATIC_TAX` = `false` initially

Optional shipping rates:
- `STRIPE_SHIPPING_RATE_STANDARD` = a Stripe Shipping Rate ID (`shr_...`)
- `STRIPE_SHIPPING_RATE_EXPRESS` = a second Shipping Rate ID (`shr_...`)

Redeploy after adding or changing environment variables.

## 4. Connect the custom checkout API domain

In Vercel → Project → Settings → Domains, add:

`checkout.j-hinton.com`

Vercel will show the DNS record you must add at your DNS provider.

The included Hostinger `checkout.html` and `order-confirmation.html` are already configured to call:

`https://checkout.j-hinton.com`

## 5. Configure Stripe webhook

In Stripe Dashboard → Developers → Webhooks:

Endpoint:
`https://checkout.j-hinton.com/api/webhook`

Listen for:
- `checkout.session.completed`

Copy the webhook signing secret into Vercel as `STRIPE_WEBHOOK_SECRET`, then redeploy.

## 6. Test mode first

Use Stripe test keys first. Add products to the J.HINTON bag, continue to checkout, and complete a Stripe test payment.

Only after the full flow works should you replace the Vercel secret with the live Stripe secret key and configure the live webhook.

## Security design

The browser sends only product ID, size, and quantity. Prices are **not trusted from localStorage**. The Vercel API uses `catalog.json` as the server-side price authority before creating the Stripe Checkout Session.

This prevents a customer from editing the browser cart price before payment.

## Updating product prices

Whenever a website product price changes, update the matching `unit_amount` in `catalog.json`.

Stripe amounts are in cents:
- $75.00 = `7500`
- $150.00 = `15000`
- $350.00 = `35000`
