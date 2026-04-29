import { Conversation } from '../models/conversation.js'
import { Agent } from '../models/flow.js'
import { Appointment } from '../models/appointment.js'

export async function dashboardRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate)

  // Usage for sidebar (conversations this month vs plan limit)
  fastify.get('/api/dashboard/usage', async (request) => {
    const agencyId = request.user.agencyId
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const conversationsThisMonth = await Conversation.countDocuments({
      agencyId,
      createdAt: { $gte: startOfMonth },
    })

    return { conversationsThisMonth }
  })

  // Dashboard stats
  fastify.get('/api/dashboard/stats', async (request) => {
    const agencyId = request.user.agencyId
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const [
      totalConversations,
      activeConversations,
      appointmentsBooked,
      agentCount,
    ] = await Promise.all([
      Conversation.countDocuments({ agencyId }),
      Conversation.countDocuments({ agencyId, status: 'active' }),
      Appointment.countDocuments({ agencyId, createdAt: { $gte: startOfMonth } }),
      Agent.countDocuments({ agencyId }),
    ])

    return {
      totalConversations,
      activeConversations,
      appointmentsBooked,
      agentCount,
    }
  })

  // Recent conversations for dashboard table
  fastify.get('/api/dashboard/recent', async (request) => {
    const agencyId = request.user.agencyId

    const conversations = await Conversation.find({ agencyId })
      .select('-messages')
      .sort({ 'metadata.lastMessageAt': -1 })
      .limit(10)

    return { conversations }
  })
}
