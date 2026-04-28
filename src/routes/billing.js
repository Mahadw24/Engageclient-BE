import { Agency } from '../models/agency.js'
import {
  PLANS,
  createCustomer,
  createCheckoutSession,
  createBillingPortalSession,
  cancelSubscription,
  resumeSubscription,
  getSubscription,
  getCustomerSubscriptions,
  getInvoices,
  constructWebhookEvent,
} from '../services/stripe.js'

export async function billingRoutes(fastify) {
  // --- Get plans (public) ---
  fastify.get('/api/billing/plans', async () => {
    return {
      plans: Object.entries(PLANS).map(([key, plan]) => ({
        id: key,
        name: plan.name,
        price: plan.currency === 'PKR' ? plan.price : plan.price / 100,
        currency: plan.currency || 'USD',
        limits: plan.limits,
      })),
    }
  })

  // --- Get current subscription info (auto-syncs with Stripe) ---
  fastify.get('/api/billing', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    let agency = await Agency.findById(request.user.agencyId)
    if (!agency) return reply.code(404).send({ error: 'Agency not found' })

    // Auto-sync with Stripe
    if (agency.stripeSubscriptionId || agency.stripeCustomerId) {
      try {
        let sub = null

        if (agency.stripeSubscriptionId) {
          sub = await getSubscription(agency.stripeSubscriptionId)
        } else if (agency.stripeCustomerId) {
          // Discover subscription by customer ID (webhook may have missed saving it)
          const subs = await getCustomerSubscriptions(agency.stripeCustomerId)
          sub = subs.data[0] || null
        }

        if (sub) {
          const planEntry = Object.entries(PLANS).find(
            ([, p]) => p.priceId === sub.items.data[0]?.price?.id
          )
          const planKey = planEntry ? planEntry[0] : agency.plan

          const needsUpdate =
            !agency.stripeSubscriptionId ||
            agency.plan !== planKey ||
            agency.subscriptionStatus !== sub.status ||
            agency.cancelAtPeriodEnd !== sub.cancel_at_period_end

          if (needsUpdate) {
            agency.stripeSubscriptionId = sub.id
            agency.stripePriceId = sub.items.data[0]?.price?.id
            agency.plan = planKey
            agency.subscriptionStatus = sub.status
            agency.cancelAtPeriodEnd = sub.cancel_at_period_end
            if (sub.current_period_start) {
              agency.currentPeriodStart = new Date(sub.current_period_start * 1000)
            }
            if (sub.current_period_end) {
              agency.currentPeriodEnd = new Date(sub.current_period_end * 1000)
            }
            if (PLANS[planKey]) {
              agency.settings = { ...PLANS[planKey].limits, aiEnabled: true }
            }
            await agency.save()
          }
        }
      } catch (err) {
        fastify.log.warn(err, 'Failed to sync subscription from Stripe')
      }
    }

    const planConfig = PLANS[agency.plan] || null
    const now = new Date()
    const trialDaysLeft = agency.trialEndsAt
      ? Math.max(0, Math.ceil((agency.trialEndsAt - now) / (1000 * 60 * 60 * 24)))
      : 0

    return {
      plan: agency.plan,
      planName: planConfig?.name || 'Free Trial',
      price: planConfig ? (planConfig.currency === 'PKR' ? planConfig.price : planConfig.price / 100) : 0,
      currency: planConfig?.currency || 'PKR',
      subscriptionStatus: agency.subscriptionStatus,
      trialEndsAt: agency.trialEndsAt,
      trialDaysLeft,
      currentPeriodEnd: agency.currentPeriodEnd,
      cancelAtPeriodEnd: agency.cancelAtPeriodEnd,
      limits: agency.settings,
      stripeCustomerId: agency.stripeCustomerId,
    }
  })

  // --- Create checkout session (subscribe to a plan) ---
  fastify.post('/api/billing/checkout', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { plan } = request.body
    if (!plan || !PLANS[plan]) {
      return reply.code(400).send({ error: 'Invalid plan. Choose: starter, professional, or business' })
    }

    const agency = await Agency.findById(request.user.agencyId)
    if (!agency) return reply.code(404).send({ error: 'Agency not found' })

    // Create Stripe customer if not exists
    if (!agency.stripeCustomerId) {
      const customer = await createCustomer(agency.email, agency.name, agency._id)
      agency.stripeCustomerId = customer.id
      await agency.save()
    }

    const priceId = PLANS[plan].priceId
    if (!priceId) {
      return reply.code(500).send({ error: 'Stripe price not configured for this plan' })
    }

    const session = await createCheckoutSession(
      agency.stripeCustomerId,
      priceId,
      agency._id,
      `${process.env.CLIENT_URL || 'http://localhost:5173'}/billing?success=true`,
      `${process.env.CLIENT_URL || 'http://localhost:5173'}/billing?canceled=true`
    )

    return { url: session.url }
  })

  // --- Open Stripe billing portal (manage subscription, payment method, invoices) ---
  fastify.post('/api/billing/portal', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const agency = await Agency.findById(request.user.agencyId)
    if (!agency?.stripeCustomerId) {
      return reply.code(400).send({ error: 'No billing account found. Subscribe to a plan first.' })
    }

    const session = await createBillingPortalSession(
      agency.stripeCustomerId,
      `${process.env.CLIENT_URL || 'http://localhost:5173'}/billing`
    )

    return { url: session.url }
  })

  // --- Cancel subscription (at period end) ---
  fastify.post('/api/billing/cancel', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const agency = await Agency.findById(request.user.agencyId)
    if (!agency?.stripeSubscriptionId) {
      return reply.code(400).send({ error: 'No active subscription' })
    }

    await cancelSubscription(agency.stripeSubscriptionId)
    agency.cancelAtPeriodEnd = true
    await agency.save()

    return { success: true, message: 'Subscription will cancel at end of billing period' }
  })

  // --- Resume canceled subscription ---
  fastify.post('/api/billing/resume', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const agency = await Agency.findById(request.user.agencyId)
    if (!agency?.stripeSubscriptionId) {
      return reply.code(400).send({ error: 'No subscription to resume' })
    }

    await resumeSubscription(agency.stripeSubscriptionId)
    agency.cancelAtPeriodEnd = false
    await agency.save()

    return { success: true }
  })

  // --- Get invoices ---
  fastify.get('/api/billing/invoices', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const agency = await Agency.findById(request.user.agencyId)
    if (!agency?.stripeCustomerId) return { invoices: [] }

    const result = await getInvoices(agency.stripeCustomerId)
    const invoices = result.data.map((inv) => ({
      id: inv.id,
      number: inv.number,
      date: inv.created,
      amount: inv.amount_paid / 100,
      currency: inv.currency,
      status: inv.status,
      pdfUrl: inv.invoice_pdf,
      plan: inv.lines?.data?.[0]?.description || '',
    }))

    return { invoices }
  })

  // --- Stripe Webhook (no auth — Stripe calls this) ---
  fastify.post('/api/billing/webhook', {
    config: { rawBody: true },
  }, async (request, reply) => {
    const signature = request.headers['stripe-signature']
    let event

    try {
      // Fastify with formbody parses the body, but Stripe needs raw body
      const rawBody = request.rawBody || request.body
      event = constructWebhookEvent(
        typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody),
        signature
      )
    } catch (err) {
      fastify.log.error(err, 'Stripe webhook signature verification failed')
      return reply.code(400).send({ error: 'Invalid signature' })
    }

    const { type, data } = event

    switch (type) {
      case 'checkout.session.completed': {
        const session = data.object
        const agencyId = session.metadata?.agencyId
        if (agencyId && session.subscription) {
          const sub = await getSubscription(session.subscription)
          const planEntry = Object.entries(PLANS).find(
            ([, p]) => p.priceId === sub.items.data[0]?.price?.id
          )
          const planKey = planEntry ? planEntry[0] : 'starter'

          await Agency.findByIdAndUpdate(agencyId, {
            stripeSubscriptionId: sub.id,
            stripePriceId: sub.items.data[0]?.price?.id,
            plan: planKey,
            subscriptionStatus: sub.status,
            currentPeriodStart: new Date(sub.current_period_start * 1000),
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
            settings: { ...PLANS[planKey].limits, aiEnabled: true },
          })
        }
        break
      }

      case 'customer.subscription.updated': {
        const sub = data.object
        const agencyId = sub.metadata?.agencyId
        if (agencyId) {
          const planEntry = Object.entries(PLANS).find(
            ([, p]) => p.priceId === sub.items.data[0]?.price?.id
          )
          const planKey = planEntry ? planEntry[0] : 'starter'

          await Agency.findByIdAndUpdate(agencyId, {
            plan: planKey,
            subscriptionStatus: sub.status,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            currentPeriodStart: new Date(sub.current_period_start * 1000),
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
            settings: { ...PLANS[planKey].limits, aiEnabled: true },
          })
        }
        break
      }

      case 'customer.subscription.deleted': {
        const sub = data.object
        const agencyId = sub.metadata?.agencyId
        if (agencyId) {
          await Agency.findByIdAndUpdate(agencyId, {
            plan: 'trial',
            subscriptionStatus: 'canceled',
            stripeSubscriptionId: null,
            stripePriceId: null,
            settings: {
              maxConversationsPerMonth: 500,
              aiEnabled: true,
              is24x7: false,
              appointmentBooking: false,
              autoFollowUp: false,
            },
          })
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = data.object
        const subId = invoice.subscription
        if (subId) {
          const sub = await getSubscription(subId)
          const agencyId = sub.metadata?.agencyId
          if (agencyId) {
            await Agency.findByIdAndUpdate(agencyId, {
              subscriptionStatus: 'past_due',
            })
          }
        }
        break
      }
    }

    return { received: true }
  })
}
