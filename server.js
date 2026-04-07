const express = require('express');
const Stripe = require('stripe');
const axios = require('axios');

const app = express();

const STRIPE_SECRET_KEY     = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const PRODIGI_API_KEY       = process.env.PRODIGI_API_KEY;
const FRONTEND_URL          = process.env.FRONTEND_URL;
const PORT                  = process.env.PORT || 3000;
const PRODIGI_BASE_URL      = 'https://api.prodigi.com/v4.0';

const PRODUCT_MAP = {
  'aFa00k8ZLb4IcGd5qIbwk04': {
    title:    'Your Crown',
    sku:      'GLOBAL-STI-5_5X5_5-G',
    imageUrl: () => `${FRONTEND_URL}/images/your-crown.jpg`,
  },
  'aFa14oek55KoeOl3iAbwk07': {
    title:    'Loved & Chosen',
    sku:      'GLOBAL-STI-5_5X5_5-G',
    imageUrl: () => `${FRONTEND_URL}/images/loved-and-chosen.jpg`,
  },
  '8x25kEcbX8WA0Xv4mEbwk06': {
    title:    'Affirmations',
    sku:      'GLOBAL-STI-5_5X5_5-G',
    imageUrl: () => `${FRONTEND_URL}/images/affirmations-sheet.png`,
  },
  'fZu7sM7VH6OsgWt3iAbwk05': {
    title:    'Full Joy Bundle',
    sku:      'GLOBAL-STI-5_5X5_5-G',
    imageUrl: null,
  },
};

const stripe = new Stripe(STRIPE_SECRET_KEY);

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'stickyjoys-backend' });
});

app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log('Payment received:', session.id);
    try {
      await handleSuccessfulPayment(session);
    } catch (err) {
      console.error('Order processing error:', err.message);
    }
  }

  res.json({ received: true });
});

async function handleSuccessfulPayment(session) {
  const paymentLinkId   = session.payment_link || '';
  const customerDetails = session.customer_details;
  const productKey = Object.keys(PRODUCT_MAP).find(key => paymentLinkId.includes(key));

  if (!productKey) {
    console.error('No product mapping found for:', paymentLinkId);
    return;
  }

  const product  = PRODUCT_MAP[productKey];
  const isBundle = productKey === 'fZu7sM7VH6OsgWt3iAbwk05';
  console.log('Matched product:', product.title);

  const items = isBundle
    ? [
        { sku: PRODUCT_MAP['aFa00k8ZLb4IcGd5qIbwk04'].sku, imageUrl: PRODUCT_MAP['aFa00k8ZLb4IcGd5qIbwk04'].imageUrl() },
        { sku: PRODUCT_MAP['aFa14oek55KoeOl3iAbwk07'].sku, imageUrl: PRODUCT_MAP['aFa14oek55KoeOl3iAbwk07'].imageUrl() },
        { sku: PRODUCT_MAP['8x25kEcbX8WA0Xv4mEbwk06'].sku, imageUrl: PRODUCT_MAP['8x25kEcbX8WA0Xv4mEbwk06'].imageUrl() },
      ]
    : [{ sku: product.sku, imageUrl: product.imageUrl() }];

  const prodigiOrder = {
    merchantReference: session.id,
    shippingMethod:    'Budget',
    recipient: {
      name:        customerDetails?.name || 'Customer',
      email:       customerDetails?.email || '',
      phoneNumber: customerDetails?.phone || '',
      address: {
        line1:           customerDetails?.address?.line1 || '',
        line2:           customerDetails?.address?.line2 || '',
        postalOrZipCode: customerDetails?.address?.postal_code || '',
        countryCode:     customerDetails?.address?.country || 'CA',
        townOrCity:      customerDetails?.address?.city || '',
        stateOrCounty:   customerDetails?.address?.state || '',
      },
    },
    items: items.map(item => ({
      sku:     item.sku,
      copies:  1,
      sizing:  'fillPrintArea',
      assets:  [{ printArea: 'default', url: item.imageUrl }],
    })),
  };

  const response = await axios.post(
    `${PRODIGI_BASE_URL}/orders`,
    prodigiOrder,
    { headers: { 'X-API-Key': PRODIGI_API_KEY, 'Content-Type': 'application/json' } }
  );
  console.log('Prodigi order created:', response.data.order?.id);
}

app.use(express.json());

app.listen(PORT, () => {
  console.log(`Sticky Joys backend running on port ${PORT}`);
});
