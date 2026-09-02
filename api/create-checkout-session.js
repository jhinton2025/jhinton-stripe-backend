const Stripe = require('stripe');
const catalog = require('../catalog.json');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function normalizeCatalog(rawCatalog) {
  if (Array.isArray(rawCatalog)) return rawCatalog;

  if (rawCatalog && Array.isArray(rawCatalog.products)) {
    return rawCatalog.products;
  }

  if (rawCatalog && typeof rawCatalog === 'object') {
    return Object.entries(rawCatalog).map(([key, value]) => {
      if (value && typeof value === 'object') {
        return {
          id: value.id || value.slug || value.sku || key,
          slug: value.slug || key,
          ...value
        };
      }
      return null;
    }).filter(Boolean);
  }

  return [];
}

function findCatalogProduct(products, requestedItem) {
  const candidates = [
    requestedItem?.id,
    requestedItem?.productId,
    requestedItem?.product_id,
    requestedItem?.slug,
    requestedItem?.sku,
    requestedItem?.code
  ].filter(Boolean).map(String);

  return products.find((product) => {
    const productKeys = [
      product?.id,
      product?.productId,
      product?.product_id,
      product?.slug,
      product?.sku,
      product?.code
    ].filter(Boolean).map(String);

    return candidates.some((candidate) => productKeys.includes(candidate));
  });
}

function getProductName(product, requestedItem) {
  return (
    product?.name ||
    product?.title ||
    requestedItem?.name ||
    requestedItem?.title ||
    'J.HINTON Product'
  );
}

function getUnitAmount(product, requestedItem) {
  const raw =
    product?.unit_amount ??
    product?.unitAmount ??
    product?.price_cents ??
    product?.priceCents ??
    product?.price ??
    requestedItem?.unit_amount ??
    requestedItem?.unitAmount ??
    requestedItem?.price_cents ??
    requestedItem?.priceCents ??
    requestedItem?.price;

  if (raw === undefined || raw === null || raw === '') {
    throw new Error(`Missing price for ${getProductName(product, requestedItem)}.`);
  }

  let amount = Number(
    typeof raw === 'string'
      ? raw.replace(/[$,\s]/g, '')
      : raw
  );

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Invalid price for ${getProductName(product, requestedItem)}.`);
  }

  // If the source explicitly uses a cents field, keep it as cents.
  const explicitCents =
    product?.unit_amount !== undefined ||
    product?.unitAmount !== undefined ||
    product?.price_cents !== undefined ||
    product?.priceCents !== undefined ||
    requestedItem?.unit_amount !== undefined ||
    requestedItem?.unitAmount !== undefined ||
    requestedItem?.price_cents !== undefined ||
    requestedItem?.priceCents !== undefined;

  if (!explicitCents) {
    amount = Math.round(amount * 100);
  } else {
    amount = Math.round(amount);
  }

  return amount;
}

function getImage(product, requestedItem) {
  const image =
    product?.image ||
    product?.image_url ||
    product?.imageUrl ||
    product?.thumbnail ||
    (Array.isArray(product?.images) ? product.images[0] : null) ||
    requestedItem?.image ||
    requestedItem?.image_url ||
    requestedItem?.imageUrl ||
    requestedItem?.thumbnail;

  if (!image || typeof image !== 'string') return null;

  if (/^https?:\/\//i.test(image)) return image;

  const cleanPath = image.replace(/^\/+/, '');
  return `https://j-hinton.com/${cleanPath}`;
}

function makeOrderNumber() {
  const now = new Date();
  const yy = String(now.getUTCFullYear()).slice(-2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const random = String(Math.floor(1000 + Math.random() * 9000));
  return `JH-${yy}${mm}${dd}-${random}`;
}

function buildShippingOptions(subtotalCents) {
  const options = [];

  // Complimentary standard shipping for orders $150+
  if (subtotalCents >= 15000) {
    options.push({
      shipping_rate_data: {
        type: 'fixed_amount',
        fixed_amount: {
          amount: 0,
          currency: 'usd'
        },
        display_name: 'Complimentary Standard Shipping',
        delivery_estimate: {
          minimum: { unit: 'business_day', value: 2 },
          maximum: { unit: 'business_day', value: 5 }
        }
      }
    });
  } else {
    options.push({
      shipping_rate_data: {
        type: 'fixed_amount',
        fixed_amount: {
          amount: 1295,
          currency: 'usd'
        },
        display_name: 'Standard Shipping',
        delivery_estimate: {
          minimum: { unit: 'business_day', value: 2 },
          maximum: { unit: 'business_day', value: 5 }
        }
      }
    });
  }

  options.push({
    shipping_rate_data: {
      type: 'fixed_amount',
      fixed_amount: {
        amount: 2999,
        currency: 'usd'
      },
      display_name: 'Express Shipping',
      delivery_estimate: {
        minimum: { unit: 'business_day', value: 1 },
        maximum: { unit: 'business_day', value: 2 }
      }
    }
  });

  return options;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://j-hinton.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not configured.');
    }

    const body =
      typeof req.body === 'string'
        ? JSON.parse(req.body || '{}')
        : (req.body || {});

    const requestedItems =
      (Array.isArray(body.items) && body.items) ||
      (Array.isArray(body.cart) && body.cart) ||
      (Array.isArray(body.lineItems) && body.lineItems) ||
      [];

    if (!requestedItems.length) {
      return res.status(400).json({ error: 'Your cart is empty.' });
    }

    const products = normalizeCatalog(catalog);

    const lineItems = requestedItems.map((requestedItem) => {
      const product = findCatalogProduct(products, requestedItem);

      // Prefer server-side catalog data when a catalog match exists.
      const sourceProduct = product || requestedItem;

      const quantity = Math.max(
        1,
        Math.min(20, parseInt(requestedItem?.quantity ?? requestedItem?.qty ?? 1, 10) || 1)
      );

      const name = getProductName(sourceProduct, requestedItem);
      const unitAmount = getUnitAmount(sourceProduct, requestedItem);
      const image = getImage(sourceProduct, requestedItem);

      const productData = { name };

      const description =
        sourceProduct?.description ||
        requestedItem?.description;

      if (description && typeof description === 'string') {
        productData.description = description.slice(0, 500);
      }

      if (image) {
        productData.images = [image];
      }

      const size = requestedItem?.size ? String(requestedItem.size) : '';
      const color = requestedItem?.color ? String(requestedItem.color) : '';

      if (size || color) {
        productData.metadata = {};
        if (size) productData.metadata.size = size;
        if (color) productData.metadata.color = color;
      }

      return {
        price_data: {
          currency: 'usd',
          product_data: productData,
          unit_amount: unitAmount
        },
        quantity
      };
    });

    const subtotalCents = lineItems.reduce(
      (sum, item) => sum + (item.price_data.unit_amount * item.quantity),
      0
    );

    // Always initialize this as an array.
    const shippingOptions = buildShippingOptions(subtotalCents);

    const customerEmail =
      body.customerEmail ||
      body.customer_email ||
      body.email ||
      undefined;

    const orderNumber =
      body.orderNumber ||
      body.order_number ||
      makeOrderNumber();

    const configuredCountries = String(
      process.env.STRIPE_ALLOWED_COUNTRIES || 'US'
    )
      .split(',')
      .map((country) => country.trim().toUpperCase())
      .filter(Boolean);

    const allowedCountries = configuredCountries.length
      ? configuredCountries
      : ['US'];

    const sessionParams = {
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      client_reference_id: orderNumber,
      success_url:
        'https://j-hinton.com/order-confirmation.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url:
        'https://j-hinton.com/checkout.html?cancelled=1',
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

    if (customerEmail) {
      sessionParams.customer_email = customerEmail;
    }

    // FIX: Never read .length from an undefined shippingOptions value.
    if (Array.isArray(shippingOptions) && shippingOptions.length > 0) {
      sessionParams.shipping_options = shippingOptions;
    }

    if (
      String(process.env.STRIPE_AUTOMATIC_TAX || '').toLowerCase() === 'true'
    ) {
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
};
