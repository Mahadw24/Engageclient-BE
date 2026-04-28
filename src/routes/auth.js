import { User } from '../models/user.js'
import { Agency } from '../models/agency.js'

export async function authRoutes(fastify) {
  // --- Signup (creates user + agency) ---
  fastify.post('/api/auth/signup', async (request, reply) => {
    const { name, email, password, agencyName, industry, phone } = request.body

    if (!name || !email || !password || !agencyName) {
      return reply.code(400).send({ error: 'name, email, password, and agencyName are required' })
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return reply.code(409).send({ error: 'Email already registered' })
    }

    // Create agency with 14-day free trial
    const now = new Date()
    const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
    const agency = await Agency.create({
      name: agencyName,
      email,
      phone,
      industry: industry || 'Other',
      plan: 'trial',
      subscriptionStatus: 'trialing',
      trialStartedAt: now,
      trialEndsAt: trialEnd,
    })

    // Create user as owner of this agency
    const user = await User.create({
      name,
      email,
      password,
      role: 'owner',
      agencyId: agency._id,
      phone,
    })

    // Generate JWT
    const token = fastify.jwt.sign(
      { id: user._id, agencyId: agency._id, role: user.role },
      { expiresIn: '7d' }
    )

    return reply.code(201).send({
      token,
      user: user.toJSON(),
      agency,
    })
  })

  // --- Login ---
  fastify.post('/api/auth/login', async (request, reply) => {
    const { email, password } = request.body

    if (!email || !password) {
      return reply.code(400).send({ error: 'email and password are required' })
    }

    const user = await User.findOne({ email }).populate('agencyId')
    if (!user) {
      return reply.code(401).send({ error: 'Invalid email or password' })
    }

    const isMatch = await user.comparePassword(password)
    if (!isMatch) {
      return reply.code(401).send({ error: 'Invalid email or password' })
    }

    if (user.status !== 'active') {
      return reply.code(403).send({ error: 'Account is suspended or inactive' })
    }

    // Update last login
    user.lastLoginAt = new Date()
    await user.save()

    const token = fastify.jwt.sign(
      { id: user._id, agencyId: user.agencyId._id, role: user.role, isSuperAdmin: user.isSuperAdmin || false },
      { expiresIn: '7d' }
    )

    return {
      token,
      user: user.toJSON(),
      agency: user.agencyId,
    }
  })

  // --- Get current user ---
  fastify.get('/api/auth/me', { onRequest: [fastify.authenticate] }, async (request) => {
    const user = await User.findById(request.user.id).populate('agencyId')
    if (!user) return { error: 'User not found' }
    return { user: user.toJSON(), agency: user.agencyId }
  })

  // --- Update profile ---
  fastify.put('/api/auth/me', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { name, phone, avatar } = request.body
    const user = await User.findByIdAndUpdate(
      request.user.id,
      { name, phone, avatar },
      { new: true }
    )
    if (!user) return reply.code(404).send({ error: 'User not found' })
    return { user: user.toJSON() }
  })

  // --- Change password ---
  fastify.put('/api/auth/password', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { currentPassword, newPassword } = request.body

    if (!currentPassword || !newPassword) {
      return reply.code(400).send({ error: 'currentPassword and newPassword are required' })
    }

    const user = await User.findById(request.user.id)
    const isMatch = await user.comparePassword(currentPassword)
    if (!isMatch) {
      return reply.code(401).send({ error: 'Current password is incorrect' })
    }

    user.password = newPassword
    await user.save()

    return { success: true, message: 'Password updated' }
  })
}
