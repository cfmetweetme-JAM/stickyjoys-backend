require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'stickyjoys-backend' });
});

// ONE-TIME PAYMENTS
app.post('/api/checkout/once', async (req, res) => {
  try {
    const { priceId, successUrl, cancelUrl, customerEmail } = req.body;
    const sessionConfig = {
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl || process.env.FRONTEND_URL + '/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: cancelUrl || process.env.FRONTEND_URL + '/cancel',
    };
    if (customerEmail) sessionConfig.customer_email = customerEmail;
    const session = await stripe.checkout.sessions.create(sessionConfig);
    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Checkout error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// SUBSCRIPTIONS
app.post('/api/checkout/subscribe', async (req, res) => {
  try {
    const { priceId, successUrl, cancelUrl, customerEmail, trialDays } = req.body;
    const sessionConfig = {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl || process.env.FRONTEND_URL + '/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: cancelUrl || process.env.FRONTEND_URL + '/cancel',
    };
    if (customerEmail) sessionConfig.customer_email = customerEmail;
    if (trialDays && trialDays > 0) {
      sessionConfig.subscription_data = { trial_period_days: trialDays };
    }
    const session = await stripe.checkout.sessions.create(sessionConfig);
    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Subscription error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// CUSTOMER PORTAL
app.post('/api/portal', async (req, res) => {
  try {
    const { customerId, returnUrl } = req.body;
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl || process.env.FRONTEND_URL,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Portal error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// WEBHOOKS
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).send('Webhook Error: ' + err.message);
  }
  switch (event.type) {
    case 'checkout.session.completed':
      console.log('Payment completed:', event.data.object.id);
      console.log('Mode:', event.data.object.mode);
      console.log('Customer:', event.data.object.customer);
      break;
    case 'customer.subscription.created':
      console.log('Subscription created:', event.data.object.id);
      break;
    case 'customer.subscription.updated':
      console.log('Subscription updated:', event.data.object.id);
      break;
    case 'customer.subscription.deleted':
      console.log('Subscription cancelled:', event.data.object.id);
      break;
    case 'invoice.payment_succeeded':
      console.log('Invoice paid:', event.data.object.id);
      break;
    case 'invoice.payment_failed':
      console.log('Invoice failed:', event.data.object.id);
      break;
    default:
      console.log('Unhandled event:', event.type);
  }
  res.json({ received: true });
});

// SESSION DETAILS
app.get('/api/session/:id', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.id);
    res.json({
      id: session.id,
      status: session.payment_status,
      mode: session.mode,
      customerEmail: session.customer_details && session.customer_details.email,
      amountTotal: session.amount_total,
      currency: session.currency,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log('stickyjoys-backend running on port ' + PORT);
});
