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
  'plink_1TG3P5KOBecpGmaFTV2GgNXO': {
    title:    'Your Crown',
    sku:      'GLOBAL-STI-5_5X5_5-G',
    imageUrl: () => `${FRONTEND_URL}/images/Your-Crown-Sticker-Sheet.png`,
  },
  'plink_1TG3TSKOBecpGmaFlJdbUarh': {
    title:    'Loved & Chosen',
    sku:      'GLOBAL-STI-5_5X5_5-G',
    imageUrl: () => `${FRONTEND_URL}/images/Loved-&-Chosen-Sticker-Sheet.png`,
  },
  'plink_1TG3RuKOBecpGmaFls0Z9TiA': {
    title:    'Affirmations',
    sku:      'GLOBAL-STI-5_5X5_5-G',
    imageUrl: () => `${FRONTEND_URL}/images/affirmations-sheet.png`,
  },
  'plink_1TG3QyKOBecpGmaFLI2AgUZt': {
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
  const shippingDetails = session.shipping_details || session.customer_details;
  const productKey = Object.keys(PRODUCT_MAP).find(key => paymentLinkId.includes(key));

  if (!productKey) {
    console.error('No product mapping found for:', paymentLinkId);
    return;
  }

  const product  = PRODUCT_MAP[productKey];
  const isBundle = productKey === 'plink_1TG3QyKOBecpGmaFLI2AgUZt';
  console.log('Matched product:', product.title);

  const items = isBundle
    ? [
        { sku: PRODUCT_MAP['plink_1TG3P5KOBecpGmaFTV2GgNXO'].sku, imageUrl: PRODUCT_MAP['plink_1TG3P5KOBecpGmaFTV2GgNXO'].imageUrl() },
        { sku: PRODUCT_MAP['plink_1TG3TSKOBecpGmaFlJdbUarh'].sku, imageUrl: PRODUCT_MAP['plink_1TG3TSKOBecpGmaFlJdbUarh'].imageUrl() },
        { sku: PRODUCT_MAP['plink_1TG3RuKOBecpGmaFls0Z9TiA'].sku, imageUrl: PRODUCT_MAP['plink_1TG3RuKOBecpGmaFls0Z9TiA'].imageUrl() },
      ]
    : [{ sku: product.sku, imageUrl: product.imageUrl() }];

  const prodigiOrder = {
    merchantReference: session.id,
    shippingMethod:    'Budget',
    recipient: {
      name:        shippingDetails?.name || customerDetails?.name || 'Customer',
      email:       customerDetails?.email || '',
      phoneNumber: customerDetails?.phone || '',
      address: {
        line1:           shippingDetails?.address?.line1 || '',
        ...(shippingDetails?.address?.line2 ? { line2: shippingDetails.address.line2 } : {}),
        postalOrZipCode: shippingDetails?.address?.postal_code || '',
        countryCode:     shippingDetails?.address?.country || 'CA',
        townOrCity:      shippingDetails?.address?.city || '',
        stateOrCounty:   shippingDetails?.address?.state || '',
      },
    },
    items: items.map(item => ({
      sku:     item.sku,
      copies:  1,
      sizing:  'fillPrintArea',
      assets:  [{ printArea: 'default', url: item.imageUrl }],
    })),
  };

  try {
    const response = await axios.post(
      `${PRODIGI_BASE_URL}/orders`,
      prodigiOrder,
      { headers: { 'X-API-Key': PRODIGI_API_KEY, 'Content-Type': 'application/json' } }
    );
    console.log('Prodigi order created:', response.data.order?.id);
  } catch (prodigiErr) {
    console.error('Prodigi error status:', prodigiErr.response?.status);
    console.error('Prodigi error data:', JSON.stringify(prodigiErr.response?.data));
    throw prodigiErr;
  }
}

app.use(express.json());

app.listen(PORT, () => {
  console.log(`Sticky Joys backend running on port ${PORT}`);
});
