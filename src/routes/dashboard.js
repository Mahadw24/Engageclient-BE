import { Conversation } from '../models/conversation.js'
import { Flow } from '../models/flow.js'

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

    const [totalConversations, activeConversations, totalFlows, activeFlows] = await Promise.all([
      Conversation.countDocuments({ agencyId }),
      Conversation.countDocuments({ agencyId, status: 'active' }),
      Flow.countDocuments({ agencyId }),
      Flow.countDocuments({ agencyId, active: true }),
    ])

    const totalLeads = await Conversation.countDocuments({ agencyId, type: 'lead' })
    const totalBookings = await Conversation.countDocuments({ agencyId, type: 'booking' })

    return {
      totalConversations,
      activeConversations,
      totalLeads,
      totalBookings,
      activeFlows,
      totalFlows,
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
