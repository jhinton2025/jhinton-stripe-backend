import Stripe from 'stripe';
import crypto from 'node:crypto';
import catalog from '../catalog.json' with { type: 'json' };
import { applyCors } from '../cors.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function safeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function buildShippingOptions() {
  const ids = [
    process.env.STRIPE_SHIPPING_RATE_STANDARD,
    process.env.STRIPE_SHIPPING_RATE_EXPRESS
  ].filter(Boolean);

  return ids.map(id => ({ shipping_rate: id }));
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Stripe is not configured.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const incomingItems = Array.isArray(body.items) ? body.items : [];
    const customerEmail = safeEmail(body.customerEmail);

    if (!customerEmail) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }
    if (!incomingItems.length || incomingItems.length > 50) {
      return res.status(400).json({ error: 'Your bag is empty or contains too many line items.' });
    }

    const line_items = incomingItems.map(item => {
      const id = String(item.id || '');
      const product = catalog[id];
      if (!product) throw new Error(`Unavailable product: ${id}`);

      const qty = Math.max(1, Math.min(10, Number(item.qty) || 1));
      const size = String(item.size || '').trim();

      if (product.sizes.length && !product.sizes.includes(size)) {
        throw new Error(`Please select a valid size for ${product.name}.`);
      }

      return {
        quantity: qty,
        price_data: {
          currency: 'usd',
          unit_amount: product.unit_amount,
          product_data: {
            name: product.name,
            images: product.image ? [product.image] : [],
            description: size ? `Size: ${size}` : undefined,
            metadata: {
              product_id: id,
              size: size || 'N/A'
            }
          }
        }
      };
    });

    const orderNumber = `JH-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const shippingOptions = buildShippingOptions();

    const allowedCountries = (process.env.ALLOWED_SHIPPING_COUNTRIES || 'US')
      .split(',')
      .map(v => v.trim().toUpperCase())
      .filter(Boolean);

    const sessionParams = {
      mode: 'payment',
      line_items,
      customer_email: customerEmail,
      client_reference_id: orderNumber,
      success_url: 'https://j-hinton.com/order-confirmation.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://j-hinton.com/checkout.html?cancelled=1',
      billing_address_collection: 'auto',
      shipping_address_collection: {
        allowed_countries: allowedCountries
      },
      allow_promotion_codes: true,
      phone_number_collection: { enabled: true },
      metadata: {
        order_number: orderNumber,
        source: 'j-hinton.com'
      }
    };

    if (shippingOptions.length) {
      sessionParams.shipping_options = shippingOptions;
    }

    if (String(process.env.STRIPE_AUTOMATIC_TAX || '').toLowerCase() === 'true') {
      sessionParams.automatic_tax = { enabled: true };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return res.status(200).json({
      url: session.url,
      sessionId: session.id,
      orderNumber
    });
  } catch (error) {
    console.error('Checkout session error:', error);
    return res.status(400).json({
      error: error?.message || 'Unable to create checkout session.'
    });
  }
}
