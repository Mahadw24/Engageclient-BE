import { Agency } from '../models/agency.js'
import { Agent } from '../models/flow.js'

function buildSystemPrompt(agency, services) {
  const city = agency.businessInfo?.city ? ` in ${agency.businessInfo.city}` : ''
  const about = agency.businessInfo?.description ? `\nAbout the clinic: ${agency.businessInfo.description}` : ''
  const serviceLines = (services || [])
    .filter(s => s.name)
    .map(s => `- ${s.name}${s.duration ? ` (${s.duration} min)` : ''}${s.price ? `, ${s.price}` : ''}`)
    .join('\n')

  return `You are a helpful AI assistant for ${agency.name}, a dental clinic${city}.

Your role is to:
1. Answer questions about services, pricing, and the clinic in general
2. Help patients book appointments by collecting their preferred date, time, and service
3. Provide working hours and contact information
4. Politely hand off to a human when the patient asks or when you cannot help
${serviceLines ? `\nServices offered:\n${serviceLines}` : ''}
${about}

Always be warm, professional, and concise. Respond in Albanian (shqip) by default unless the patient writes in another language.`
}

export async function agencyRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate)

  // --- Get my agency ---
  fastify.get('/api/agency', async (request, reply) => {
    const agency = await Agency.findById(request.user.agencyId)
    if (!agency) return reply.code(404).send({ error: 'Agency not found' })
    return agency
  })

  // --- Get my agency's agent ---
  fastify.get('/api/agency/agent', async (request) => {
    const agent = await Agent.findOne({ agencyId: request.user.agencyId })
    return { agent: agent || null }
  })

  // --- Update agency settings (owner/admin only) ---
  fastify.put('/api/agency', async (request, reply) => {
    if (!['owner', 'admin'].includes(request.user.role)) {
      return reply.code(403).send({ error: 'Only owners and admins can update agency settings' })
    }

    const { name, phone, businessInfo } = request.body

    const agency = await Agency.findByIdAndUpdate(
      request.user.agencyId,
      {
        ...(name && { name }),
        ...(phone !== undefined && { phone }),
        ...(businessInfo && { businessInfo }),
      },
      { new: true }
    )
    if (!agency) return reply.code(404).send({ error: 'Agency not found' })
    return agency
  })

  // --- Update agent configuration ---
  fastify.patch('/api/agency/agent', async (request, reply) => {
    if (!['owner', 'admin'].includes(request.user.role)) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const { name, ai, knowledgeBase, appointmentBooking, handoff } = request.body

    const agent = await Agent.findOne({ agencyId: request.user.agencyId })
    if (!agent) return reply.code(404).send({ error: 'Agent not found' })

    if (name !== undefined) agent.name = name
    if (ai) {
      if (ai.language !== undefined)        agent.ai.language        = ai.language
      if (ai.model !== undefined)           agent.ai.model           = ai.model
      if (ai.welcomeMessage !== undefined)  agent.ai.welcomeMessage  = ai.welcomeMessage
      if (ai.fallbackMessage !== undefined) agent.ai.fallbackMessage = ai.fallbackMessage
      if (ai.systemPrompt !== undefined)    agent.ai.systemPrompt    = ai.systemPrompt
    }
    if (knowledgeBase) {
      if (knowledgeBase.businessContext !== undefined)
        agent.knowledgeBase.businessContext = knowledgeBase.businessContext
      if (knowledgeBase.appointmentInstructions !== undefined)
        agent.knowledgeBase.appointmentInstructions = knowledgeBase.appointmentInstructions
      if (knowledgeBase.services !== undefined)
        agent.knowledgeBase.services = knowledgeBase.services
      if (knowledgeBase.faqs !== undefined)
        agent.knowledgeBase.faqs = knowledgeBase.faqs
    }
    if (appointmentBooking !== undefined) agent.appointmentBooking = appointmentBooking
    if (handoff !== undefined) agent.handoff = handoff

    await agent.save()
    return agent
  })

  // --- Onboarding step completion ---
  fastify.patch('/api/agency/complete-step/:step', async (request, reply) => {
    if (!['owner', 'admin'].includes(request.user.role)) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const stepNum = parseInt(request.params.step)
    if (![1, 2, 3].includes(stepNum)) {
      return reply.code(400).send({ error: 'Invalid step' })
    }

    if (stepNum === 1) {
      const { name, phone, businessInfo } = request.body

      if (!businessInfo?.city || !name) {
        return reply.code(400).send({ error: 'Clinic name and city are required' })
      }

      const agency = await Agency.findByIdAndUpdate(
        request.user.agencyId,
        {
          name,
          ...(phone && { phone }),
          businessInfo,
          onboardingStep: 2,
        },
        { new: true }
      )

      const agentName = `${agency.name} AI Agent`
      const services = businessInfo?.services || []
      const systemPrompt = buildSystemPrompt(agency, services)

      const agentData = {
        name: agentName,
        status: 'active',
        ai: {
          provider: 'anthropic',
          model: 'claude-haiku-4-5-20251001',
          systemPrompt,
          welcomeMessage: `Mirë se vini në ${agency.name}! Si mund t'ju ndihmoj sot?`,
          language: 'sq',
          temperature: 0.7,
          maxTokens: 500,
        },
        knowledgeBase: {
          businessContext: businessInfo?.description || '',
          services,
          appointmentInstructions: 'To book an appointment, ask for the patient\'s preferred date, time, and service.',
        },
        appointmentBooking: { enabled: true },
        handoff: { enabled: true },
      }

      const existing = await Agent.findOne({ agencyId: agency._id })
      const agent = existing
        ? await Agent.findByIdAndUpdate(existing._id, agentData, { new: true })
        : await Agent.create({ agencyId: agency._id, ...agentData })

      return { agency, agent }
    }

    if (stepNum === 2) {
      const agency = await Agency.findByIdAndUpdate(
        request.user.agencyId,
        { onboardingStep: 3 },
        { new: true }
      )
      return { agency }
    }

    if (stepNum === 3) {
      const agency = await Agency.findByIdAndUpdate(
        request.user.agencyId,
        { onboardingStep: 4 },
        { new: true }
      )
      return { agency }
    }
  })
}
