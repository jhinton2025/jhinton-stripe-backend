# J.Hinton Stripe Checkout Backend

A single serverless function that turns your cart into a Stripe Checkout Session.
Your Stripe secret key never touches the browser — it lives only on this backend.

## How it works

1. Your storefront (`cart.html`) sends the cart items to this backend.
2. This backend creates a Stripe Checkout Session and returns Stripe's hosted checkout URL.
3. Your storefront redirects the customer to that URL.
4. Stripe collects payment + shipping address, then sends the customer back to
   `order-status.html` on your site.

## Deploy it (GitHub + Vercel, free tier)

1. **Create a new GitHub repo** (e.g. `jhinton-stripe-backend`) and push this folder to it:
   ```bash
   git init
   git add .
   git commit -m "Stripe checkout backend"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/jhinton-stripe-backend.git
   git push -u origin main
   ```

2. **Go to [vercel.com](https://vercel.com)** and sign in with your GitHub account.

3. Click **Add New Project**, select the `jhinton-stripe-backend` repo, and click **Import**.
   Vercel auto-detects the `api/` folder as serverless functions — no extra config needed.

4. Before deploying, add environment variables under **Project Settings → Environment Variables**:
   - `STRIPE_SECRET_KEY` — your Stripe secret key (starts with `sk_live_` or `sk_test_`)
   - `SITE_URL` — `https://j-hinton.com` (your live site, no trailing slash)

5. Click **Deploy**. You'll get a URL like:
   ```
   https://jhinton-stripe-backend.vercel.app
   ```

6. Your live endpoint is:
   ```
   https://jhinton-stripe-backend.vercel.app/api/create-checkout-session
   ```

## Connect it to your site

Open `cart.html` and find this line near the top of the `<script>` block:

```js
const STRIPE_BACKEND_URL = 'PASTE_YOUR_VERCEL_URL_HERE/api/create-checkout-session';
```

Replace it with your real Vercel URL from step 5, re-upload `cart.html` to Hostinger, done.

## Testing

- Use Stripe's test secret key (`sk_test_...`) and test card `4242 4242 4242 4242`
  with any future expiry date and any CVC to confirm the flow works end to end.
- Switch to your live secret key (`sk_live_...`) in Vercel's environment variables
  when you're ready to accept real payments.

## Updating later

Any time you push a change to the `main` branch on GitHub, Vercel automatically
redeploys — no manual steps needed.
