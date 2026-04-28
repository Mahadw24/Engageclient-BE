import { Agency } from '../models/agency.js'
import { User } from '../models/user.js'
import { Flow } from '../models/flow.js'
import { Conversation } from '../models/conversation.js'
import { NumberModel } from '../models/number.js'

// Guard: superadmin only
async function requireSuperAdmin(request, reply) {
  if (!request.user?.isSuperAdmin) {
    return reply.code(403).send({ error: 'Superadmin access required' })
  }
}

export async function adminRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate)
  fastify.addHook('onRequest', requireSuperAdmin)

  // ── Stats ─────────────────────────────────────────────────────────────────
  fastify.get('/api/admin/stats', async () => {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const [
      totalAgencies, activeAgencies, trialAgencies,
      totalFlows, activeFlows,
      totalConversations, convsThisMonth,
      totalNumbers,
    ] = await Promise.all([
      Agency.countDocuments(),
      Agency.countDocuments({ plan: { $ne: 'trial' }, status: 'active' }),
      Agency.countDocuments({ plan: 'trial' }),
      Flow.countDocuments(),
      Flow.countDocuments({ active: true }),
      Conversation.countDocuments(),
      Conversation.countDocuments({ createdAt: { $gte: startOfMonth } }),
      NumberModel.countDocuments(),
    ])

    return {
      totalAgencies, activeAgencies, trialAgencies,
      totalFlows, activeFlows,
      totalConversations, convsThisMonth,
      totalNumbers,
    }
  })

  // ── Agencies ───────────────────────────────────────────────────────────────
  fastify.get('/api/admin/agencies', async (request) => {
    const { page = 1, limit = 50, plan, status } = request.query
    const filter = {}
    if (plan) filter.plan = plan
    if (status) filter.status = status

    const skip = (parseInt(page) - 1) * parseInt(limit)
    const [agencies, total] = await Promise.all([
      Agency.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      Agency.countDocuments(filter),
    ])
    return { agencies, total }
  })

  fastify.post('/api/admin/agencies', async (request, reply) => {
    const { name, email, phone, industry, plan = 'trial' } = request.body
    if (!name || !email) return reply.code(400).send({ error: 'name and email are required' })

    const existing = await Agency.findOne({ email })
    if (existing) return reply.code(409).send({ error: 'Email already registered' })

    const now = new Date()
    const agency = await Agency.create({
      name, email, phone,
      industry: industry || 'Other',
      plan,
      status: 'active',
      subscriptionStatus: plan === 'trial' ? 'trialing' : 'active',
      trialStartedAt: plan === 'trial' ? now : undefined,
      trialEndsAt: plan === 'trial' ? new Date(now.getTime() + 14 * 86400000) : undefined,
    })
    return reply.code(201).send(agency)
  })

  fastify.patch('/api/admin/agencies/:id/plan', async (request, reply) => {
    const { plan } = request.body
    const validPlans = ['trial', 'starter', 'professional', 'business']
    if (!validPlans.includes(plan)) return reply.code(400).send({ error: 'Invalid plan' })

    const agency = await Agency.findByIdAndUpdate(
      request.params.id,
      { plan, subscriptionStatus: plan === 'trial' ? 'trialing' : 'active' },
      { new: true }
    )
    if (!agency) return reply.code(404).send({ error: 'Agency not found' })
    return agency
  })

  fastify.patch('/api/admin/agencies/:id/status', async (request, reply) => {
    const { status } = request.body
    const validStatuses = ['active', 'suspended', 'inactive']
    if (!validStatuses.includes(status)) return reply.code(400).send({ error: 'Invalid status' })

    const agency = await Agency.findByIdAndUpdate(
      request.params.id, { status }, { new: true }
    )
    if (!agency) return reply.code(404).send({ error: 'Agency not found' })
    return agency
  })

  // ── Flows ──────────────────────────────────────────────────────────────────
  fastify.get('/api/admin/flows', async (request) => {
    const { agencyId } = request.query
    const filter = agencyId ? { agencyId } : {}
    const flows = await Flow.find(filter).sort({ createdAt: -1 })
    return { flows, count: flows.length }
  })

  fastify.post('/api/admin/flows', async (request, reply) => {
    const { agencyId, ...body } = request.body
    if (!agencyId) return reply.code(400).send({ error: 'agencyId is required' })

    const agency = await Agency.findById(agencyId)
    if (!agency) return reply.code(404).send({ error: 'Agency not found' })

    const flow = await Flow.create({ ...body, agencyId })
    return reply.code(201).send(flow)
  })

  fastify.put('/api/admin/flows/:id', async (request, reply) => {
    const flow = await Flow.findByIdAndUpdate(request.params.id, request.body, { new: true })
    if (!flow) return reply.code(404).send({ error: 'Flow not found' })
    return flow
  })

  fastify.patch('/api/admin/flows/:id/toggle', async (request, reply) => {
    const flow = await Flow.findById(request.params.id)
    if (!flow) return reply.code(404).send({ error: 'Flow not found' })
    flow.active = !flow.active
    await flow.save()
    return { active: flow.active }
  })

  fastify.delete('/api/admin/flows/:id', async (request, reply) => {
    const flow = await Flow.findByIdAndDelete(request.params.id)
    if (!flow) return reply.code(404).send({ error: 'Flow not found' })
    return { success: true }
  })

  // ── Numbers ────────────────────────────────────────────────────────────────
  fastify.get('/api/admin/numbers', async () => {
    const numbers = await NumberModel.find()
      .populate('agencyId', 'name')
      .populate('flowId', 'name')
      .sort({ createdAt: -1 })
    return { numbers, count: numbers.length }
  })

  fastify.post('/api/admin/numbers', async (request, reply) => {
    const { agencyId, phoneNumber, twilioSid, friendlyName, country, flowId } = request.body
    if (!agencyId || !phoneNumber || !twilioSid) {
      return reply.code(400).send({ error: 'agencyId, phoneNumber, and twilioSid are required' })
    }

    const existing = await NumberModel.findOne({ phoneNumber })
    if (existing) return reply.code(409).send({ error: 'Phone number already exists' })

    const number = await NumberModel.create({
      agencyId, phoneNumber, twilioSid, friendlyName,
      country: country || 'PK', flowId: flowId || undefined,
      status: 'active',
    })
    return reply.code(201).send(number)
  })

  fastify.patch('/api/admin/numbers/:id', async (request, reply) => {
    const number = await NumberModel.findByIdAndUpdate(
      request.params.id, request.body, { new: true }
    )
    if (!number) return reply.code(404).send({ error: 'Number not found' })
    return number
  })

  fastify.delete('/api/admin/numbers/:id', async (request, reply) => {
    const number = await NumberModel.findByIdAndDelete(request.params.id)
    if (!number) return reply.code(404).send({ error: 'Number not found' })
    return { success: true }
  })
}
