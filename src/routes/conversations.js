import { Conversation } from '../models/conversation.js'

export async function conversationRoutes(fastify) {
  // All conversation routes require auth
  fastify.addHook('onRequest', fastify.authenticate)

  // List conversations (scoped to user's agency)
  fastify.get('/api/conversations', async (request) => {
    const { status, type, page = 1, limit = 20 } = request.query
    const filter = { agencyId: request.user.agencyId }
    if (status) filter.status = status
    if (type) filter.type = type

    const skip = (parseInt(page) - 1) * parseInt(limit)
    const [conversations, total] = await Promise.all([
      Conversation.find(filter)
        .select('-messages')
        .sort({ 'metadata.lastMessageAt': -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Conversation.countDocuments(filter),
    ])

    return { conversations, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) }
  })

  // Get single conversation with full messages
  fastify.get('/api/conversations/:id', async (request, reply) => {
    const conversation = await Conversation.findOne({
      _id: request.params.id,
      agencyId: request.user.agencyId,
    })
    if (!conversation) return reply.code(404).send({ error: 'Conversation not found' })
    return conversation
  })

  // Add message to conversation (agent sending from dashboard)
  fastify.post('/api/conversations/:id/messages', async (request, reply) => {
    const { body, sender = 'agent' } = request.body

    const conversation = await Conversation.findOne({
      _id: request.params.id,
      agencyId: request.user.agencyId,
    })
    if (!conversation) return reply.code(404).send({ error: 'Conversation not found' })

    conversation.messages.push({ direction: 'outbound', body, sender })
    conversation.metadata.lastMessageAt = new Date()
    conversation.metadata.messageCount = conversation.messages.length
    await conversation.save()

    return { success: true, messageCount: conversation.messages.length }
  })

  // Close a conversation
  fastify.patch('/api/conversations/:id/close', async (request, reply) => {
    const conversation = await Conversation.findOneAndUpdate(
      { _id: request.params.id, agencyId: request.user.agencyId },
      { status: 'closed' },
      { new: true }
    )
    if (!conversation) return reply.code(404).send({ error: 'Conversation not found' })
    return { success: true, status: 'closed' }
  })

  // Hand off to human agent
  fastify.patch('/api/conversations/:id/handoff', async (request, reply) => {
    const { agentName } = request.body
    const conversation = await Conversation.findOneAndUpdate(
      { _id: request.params.id, agencyId: request.user.agencyId },
      {
        status: 'handed_off',
        'metadata.isAiHandling': false,
        'metadata.handedOffTo': agentName,
      },
      { new: true }
    )
    if (!conversation) return reply.code(404).send({ error: 'Conversation not found' })
    return { success: true, handedOffTo: agentName }
  })
}
