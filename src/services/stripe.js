import Stripe from 'stripe'

let stripe = null
function getStripe() {
  if (!stripe && process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  }
  return stripe
}

// Plan config — Pakistan (PKR). Value-based pricing: full solution = premium.
export const PLANS = {
  starter: {
    name: 'Starter',
    price: 14990, // PKR/month — ~15k
    currency: 'PKR',
    priceId: process.env.STRIPE_PRICE_STARTER,
    limits: {
      maxConversationsPerMonth: 500,
      is24x7: false,
      appointmentBooking: false,
      autoFollowUp: false,
    },
  },
  professional: {
    name: 'Professional',
    price: 37990, // PKR/month — 35–40k
    currency: 'PKR',
    priceId: process.env.STRIPE_PRICE_PROFESSIONAL,
    limits: {
      maxConversationsPerMonth: 2000,
      is24x7: true,
      appointmentBooking: true,
      autoFollowUp: false,
    },
  },
  business: {
    name: 'Business',
    price: 77990, // PKR/month — 75–80k
    currency: 'PKR',
    priceId: process.env.STRIPE_PRICE_BUSINESS,
    limits: {
      maxConversationsPerMonth: 5000,
      is24x7: true,
      appointmentBooking: true,
      autoFollowUp: true,
    },
  },
}

export async function createCustomer(email, name, agencyId) {
  const s = getStripe()
  if (!s) throw new Error('Stripe not configured')

  return s.customers.create({
    email,
    name,
    metadata: { agencyId: agencyId.toString() },
  })
}

export async function createCheckoutSession(customerId, priceId, agencyId, successUrl, cancelUrl) {
  const s = getStripe()
  if (!s) throw new Error('Stripe not configured')

  return s.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    subscription_data: {
      metadata: { agencyId: agencyId.toString() },
    },
    metadata: { agencyId: agencyId.toString() },
  })
}

export async function createBillingPortalSession(customerId, returnUrl) {
  const s = getStripe()
  if (!s) throw new Error('Stripe not configured')

  return s.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  })
}

export async function cancelSubscription(subscriptionId) {
  const s = getStripe()
  if (!s) throw new Error('Stripe not configured')

  return s.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  })
}

export async function resumeSubscription(subscriptionId) {
  const s = getStripe()
  if (!s) throw new Error('Stripe not configured')

  return s.subscriptions.update(subscriptionId, {
    cancel_at_period_end: false,
  })
}

export async function getSubscription(subscriptionId) {
  const s = getStripe()
  if (!s) throw new Error('Stripe not configured')

  return s.subscriptions.retrieve(subscriptionId)
}

export async function getCustomerSubscriptions(customerId) {
  const s = getStripe()
  if (!s) throw new Error('Stripe not configured')

  return s.subscriptions.list({ customer: customerId, limit: 1, status: 'all' })
}

export async function getInvoices(customerId, limit = 10) {
  const s = getStripe()
  if (!s) throw new Error('Stripe not configured')

  return s.invoices.list({ customer: customerId, limit })
}

export function constructWebhookEvent(body, signature) {
  const s = getStripe()
  if (!s) throw new Error('Stripe not configured')

  return s.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET)
}
