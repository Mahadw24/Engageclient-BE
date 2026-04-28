import { Flow } from '../models/flow.js'
import { processWithAI } from '../services/ai-agent.js'
import {
  GENERIC_REAL_ESTATE_SYSTEM_PROMPT,
  RECOMMENDED_VARIABLES,
  KNOWLEDGE_BASE_TEMPLATE,
  REAL_ESTATE_DEFAULT_WELCOME_MESSAGE,
  REAL_ESTATE_DEFAULT_FALLBACK_MESSAGE,
} from '../prompts/real-estate-agent.js'

function applyRealEstateDefaultsIfNeeded(body) {
  const industry = (body.industry || '').trim()
  const isRealEstate = industry.toLowerCase() === 'real estate'
  const ai = body.ai || {}
  const noPrompt = !(ai.systemPrompt && ai.systemPrompt.trim())
  if (!isRealEstate || !noPrompt) return

  body.ai = { ...ai }
  body.ai.systemPrompt = body.ai.systemPrompt?.trim() || GENERIC_REAL_ESTATE_SYSTEM_PROMPT
  body.ai.welcomeMessage = body.ai.welcomeMessage?.trim() || REAL_ESTATE_DEFAULT_WELCOME_MESSAGE
  body.ai.fallbackMessage = body.ai.fallbackMessage?.trim() || REAL_ESTATE_DEFAULT_FALLBACK_MESSAGE
}

export async function flowRoutes(fastify) {
  // All flow routes require auth
  fastify.addHook('onRequest', fastify.authenticate)

  // Real Estate default prompt, variables, and KB template (for new flow pre-fill)
  fastify.get('/api/flows/real-estate-defaults', async () => {
    return {
      systemPrompt: GENERIC_REAL_ESTATE_SYSTEM_PROMPT,
      recommendedVariables: RECOMMENDED_VARIABLES,
      knowledgeBaseTemplate: KNOWLEDGE_BASE_TEMPLATE,
    }
  })

  // List flows (scoped to user's agency)
  fastify.get('/api/flows', async (request) => {
    const { active } = request.query
    const filter = { agencyId: request.user.agencyId }
    if (active !== undefined) filter.active = active === 'true'

    const flows = await Flow.find(filter).sort({ createdAt: -1 })
    return { flows, count: flows.length }
  })

  // Test chat with flow's AI (for web testing)
  fastify.post('/api/flows/:id/test-chat', async (request, reply) => {
    const flow = await Flow.findOne({ _id: request.params.id, agencyId: request.user.agencyId })
    if (!flow) return reply.code(404).send({ error: 'Flow not found' })

    const { messages = [] } = request.body || {}
    const conversation = {
      messages: messages.map((m) => ({
        sender: m.role === 'user' ? 'customer' : 'ai',
        body: typeof m.content === 'string' ? m.content : '',
      })),
    }

    const result = await processWithAI(flow, conversation)
    const text = typeof result === 'object' && result?.text != null ? result.text : result
    const handoff = typeof result === 'object' && result?.handoff === true
    return { reply: text || '', handoff }
  })

  // Get single flow
  fastify.get('/api/flows/:id', async (request, reply) => {
    const flow = await Flow.findOne({ _id: request.params.id, agencyId: request.user.agencyId })
    if (!flow) return reply.code(404).send({ error: 'Flow not found' })
    return flow
  })

  // Create flow (auto-assign to user's agency)
  fastify.post('/api/flows', async (request, reply) => {
    const body = { ...request.body }
    applyRealEstateDefaultsIfNeeded(body)
    const flow = await Flow.create({ ...body, agencyId: request.user.agencyId })
    return reply.code(201).send(flow)
  })

  // Update flow
  fastify.put('/api/flows/:id', async (request, reply) => {
    const body = { ...request.body }
    applyRealEstateDefaultsIfNeeded(body)
    const flow = await Flow.findOneAndUpdate(
      { _id: request.params.id, agencyId: request.user.agencyId },
      body,
      { new: true }
    )
    if (!flow) return reply.code(404).send({ error: 'Flow not found' })
    return flow
  })

  // Update only the AI config
  fastify.patch('/api/flows/:id/ai', async (request, reply) => {
    const flow = await Flow.findOneAndUpdate(
      { _id: request.params.id, agencyId: request.user.agencyId },
      { $set: { ai: request.body } },
      { new: true }
    )
    if (!flow) return reply.code(404).send({ error: 'Flow not found' })
    return flow
  })

  // Toggle flow active/inactive
  fastify.patch('/api/flows/:id/toggle', async (request, reply) => {
    const flow = await Flow.findOne({ _id: request.params.id, agencyId: request.user.agencyId })
    if (!flow) return reply.code(404).send({ error: 'Flow not found' })

    flow.active = !flow.active
    await flow.save()
    return { active: flow.active }
  })

  // Delete flow
  fastify.delete('/api/flows/:id', async (request, reply) => {
    const flow = await Flow.findOneAndDelete({ _id: request.params.id, agencyId: request.user.agencyId })
    if (!flow) return reply.code(404).send({ error: 'Flow not found' })
    return { success: true }
  })
}
