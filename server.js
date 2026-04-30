const express = require('express');
const Stripe = require('stripe');
const axios = require('axios');

const app = express();

const STRIPE_SECRET_KEY     = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const PRINTFUL_API_KEY      = process.env.PRINTFUL_API_KEY;
const FRONTEND_URL          = process.env.FRONTEND_URL;
const PORT                  = process.env.PORT || 3000;

const PRINTFUL_BASE_URL = 'https://api.printful.com';

// Printful product template IDs (from dashboard URLs)
const PRODUCT_MAP = {
  'plink_1TG3P5KOBecpGmaFTV2GgNXO': {
    title:      'Your Crown',
    templateId: '102044794',
    imageUrl:   () => `${FRONTEND_URL}/images/Your-Crown-Sticker-Sheet.png`,
  },
  'plink_1TG3TSKOBecpGmaFlJdbUarh': {
    title:      'Loved & Chosen',
    templateId: '102044621',
    imageUrl:   () => `${FRONTEND_URL}/images/Loved-&-Chosen-Sticker-Sheet.png`,
  },
  'plink_1TG3RuKOBecpGmaFls0Z9TiA': {
    title:      'Affirmations',
    templateId: '102044431',
    imageUrl:   () => `${FRONTEND_URL}/images/affirmations-sheet.png`,
  },
  'plink_1TG3QyKOBecpGmaFLI2AgUZt': {
    title:      'Full Joy Bundle',
    templateId: null, // bundle — handled separately
    imageUrl:   null,
  },
};

const BUNDLE_PLINKS = [
  'plink_1TG3P5KOBecpGmaFTV2GgNXO',
  'plink_1TG3TSKOBecpGmaFlJdbUarh',
  'plink_1TG3RuKOBecpGmaFls0Z9TiA',
];

const printfulHeaders = {
  'Authorization': `Bearer ${PRINTFUL_API_KEY}`,
  'Content-Type': 'application/json',
  'X-PF-Store-Type': 'manual_order',
};

const stripe = new Stripe(STRIPE_SECRET_KEY);

// Fetch the first variant ID from a Printful product template
async function getVariantId(templateId) {
  const res = await axios.get(
    `${PRINTFUL_BASE_URL}/v2/product-templates/${templateId}`,
    { headers: printfulHeaders }
  );
  const products = res.data?.data?.products;
  if (!products || products.length === 0) throw new Error(`No products in template ${templateId}`);
  const variantId = products[0]?.variant_id;
  if (!variantId) throw new Error(`No variant_id in template ${templateId}`);
  return variantId;
}

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

  // Build list of { templateId, imageUrl } to order
  const itemDefs = isBundle
    ? BUNDLE_PLINKS.map(k => ({ templateId: PRODUCT_MAP[k].templateId, imageUrl: PRODUCT_MAP[k].imageUrl() }))
    : [{ templateId: product.templateId, imageUrl: product.imageUrl() }];

  // Resolve variant IDs
  const items = await Promise.all(
    itemDefs.map(async ({ templateId, imageUrl }) => {
      const variantId = await getVariantId(templateId);
      return { variantId, imageUrl };
    })
  );

  const address = shippingDetails?.address || customerDetails?.address || {};

  const printfulOrder = {
    recipient: {
      name:         shippingDetails?.name || customerDetails?.name || 'Customer',
      email:        customerDetails?.email || '',
      phone:        customerDetails?.phone || '',
      address1:     address.line1 || '',
      ...(address.line2 ? { address2: address.line2 } : {}),
      zip:          address.postal_code || '',
      country_code: address.country || 'CA',
      city:         address.city || '',
      state_code:   address.state || '',
    },
    items: items.map(({ variantId, imageUrl }) => ({
      variant_id: variantId,
      quantity:   1,
      files: [
        {
          type: 'default',
          url:  imageUrl,
        },
      ],
    })),
    retail_costs: {
      currency: 'CAD',
    },
  };

  console.log('Submitting Printful order:', JSON.stringify(printfulOrder, null, 2));

  try {
    const response = await axios.post(
      `${PRINTFUL_BASE_URL}/orders`,
      printfulOrder,
      { headers: printfulHeaders }
    );
    console.log('Printful order created:', response.data?.result?.id);
  } catch (printfulErr) {
    console.error('Printful error status:', printfulErr.response?.status);
    console.error('Printful error data:', JSON.stringify(printfulErr.response?.data));
    throw printfulErr;
  }
}

app.use(express.json());

app.listen(PORT, () => {
  console.log(`Sticky Joys backend running on port ${PORT}`);
});
