// api/create-checkout-session.js
//
// Vercel serverless function that creates a Stripe Checkout Session
// from the cart items sent by the front end (cart.html on your site).
//
// Deploy this repo to Vercel, add STRIPE_SECRET_KEY as an environment
// variable in the Vercel project settings, then point your cart page
// at https://YOUR-VERCEL-PROJECT.vercel.app/api/create-checkout-session

const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Set this to your live site so Stripe knows where to send the customer back
const SITE_URL = process.env.SITE_URL || 'https://j-hinton.com';

module.exports = async (req, res) => {
  // CORS - allow your storefront to call this from the browser
  res.setHeader('Access-Control-Allow-Origin', SITE_URL);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    // Build Stripe line items from the cart. Uses dynamic price_data so you
    // don't need to pre-create a Stripe Price object for every product.
    const line_items = items.map((item) => {
      const unitAmount = Math.round(Number(item.price) * 100); // dollars -> cents

      if (!item.title || !unitAmount || unitAmount <= 0) {
        throw new Error(`Invalid cart item: ${JSON.stringify(item)}`);
      }

      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.size && item.size !== 'One Size'
              ? `${item.title} — Size ${item.size}`
              : item.title,
            images: item.img ? [item.img] : undefined,
          },
          unit_amount: unitAmount,
        },
        quantity: Math.max(1, parseInt(item.qty, 10) || 1),
      };
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items,
      shipping_address_collection: {
        allowed_countries: ['US', 'CA'],
      },
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 0, currency: 'usd' },
            display_name: 'Standard Shipping',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 3 },
              maximum: { unit: 'business_day', value: 7 },
            },
          },
        },
      ],
      success_url: `${SITE_URL}/order-status.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/cart.html`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe session creation failed:', err);
    return res.status(500).json({ error: err.message || 'Checkout session creation failed' });
  }
};
