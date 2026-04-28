import { Agency } from '../models/agency.js'

export async function agencyRoutes(fastify) {
  // All agency routes require auth
  fastify.addHook('onRequest', fastify.authenticate)

  // Get my agency
  fastify.get('/api/agency', async (request, reply) => {
    const agency = await Agency.findById(request.user.agencyId)
    if (!agency) return reply.code(404).send({ error: 'Agency not found' })
    return agency
  })

  // Update my agency
  fastify.put('/api/agency', async (request, reply) => {
    if (!['owner', 'admin'].includes(request.user.role)) {
      return reply.code(403).send({ error: 'Only owners and admins can update agency' })
    }

    const agency = await Agency.findByIdAndUpdate(
      request.user.agencyId,
      request.body,
      { new: true }
    )
    if (!agency) return reply.code(404).send({ error: 'Agency not found' })
    return agency
  })
}
