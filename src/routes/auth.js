import { User } from '../models/user.js'
import { Agency } from '../models/agency.js'
import { CreditTransaction } from '../models/credit-transaction.js'

export async function authRoutes(fastify) {
  // --- Signup ---
  fastify.post('/api/auth/signup', async (request, reply) => {
    const { name, email, password, clinicName } = request.body

    if (!name || !email || !password || !clinicName) {
      return reply.code(400).send({ error: 'name, email, password, and clinicName are required' })
    }

    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return reply.code(409).send({ error: 'Email already registered' })
    }

    const agency = await Agency.create({
      name: clinicName,
      email,
      plan: 'free_trial',
      subscriptionStatus: 'trialing',
      onboardingStep: 1,
      credits: { balance: 10.0, totalUsed: 0 },
    })

    await CreditTransaction.create({
      agencyId: agency._id,
      type: 'credit',
      category: 'trial_grant',
      amount: 10.0,
      balanceAfter: 10.0,
      description: 'Free trial credit on signup',
    })

    const user = await User.create({
      name,
      email,
      password,
      role: 'owner',
      agencyId: agency._id,
    })

    const token = fastify.jwt.sign(
      { id: user._id, agencyId: agency._id, role: user.role },
      { expiresIn: '7d' }
    )

    return reply.code(201).send({ token, user: user.toJSON(), agency })
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

    user.lastLoginAt = new Date()
    await user.save()

    const token = fastify.jwt.sign(
      { id: user._id, agencyId: user.agencyId._id, role: user.role, isSuperAdmin: user.isSuperAdmin || false },
      { expiresIn: '7d' }
    )

    return { token, user: user.toJSON(), agency: user.agencyId }
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

    return { success: true }
  })
}
