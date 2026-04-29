import { WhatsAppAccount } from '../models/number.js'
import { Agent } from '../models/flow.js'
import { Conversation } from '../models/conversation.js'
import {
  sendTextMessage,
  verifySignature,
  exchangeCodeForToken,
  getPhoneNumberDetails,
  subscribeToWebhooks,
} from '../services/meta-whatsapp.js'
import { processMessage } from '../services/agent-pipeline.js'

export async function whatsappRoutes(fastify) {

  // ── Meta Webhook Verification (GET) ────────────────────────────────────────
  fastify.get('/api/webhooks/whatsapp', async (request, reply) => {
    const mode      = request.query['hub.mode']
    const token     = request.query['hub.verify_token']
    const challenge = request.query['hub.challenge']

    const verifyToken = process.env.META_WHATSAPP_VERIFY_TOKEN || 'engageclient-verify'
    if (mode === 'subscribe' && token === verifyToken) {
      fastify.log.info('Meta webhook verified')
      return reply.code(200).send(challenge)
    }
    return reply.code(403).send('Forbidden')
  })

  // ── Meta Webhook: Incoming Messages (POST) ──────────────────────────────────
  fastify.post('/api/webhooks/whatsapp', { config: { rawBody: true } }, async (request, reply) => {
    // Always respond 200 first — Meta will retry if we don't
    reply.code(200).send({ received: true })

    // Verify signature in production
    if (process.env.NODE_ENV === 'production' && process.env.META_APP_SECRET) {
      const sig = request.headers['x-hub-signature-256']
      if (!verifySignature(request.rawBody, sig, process.env.META_APP_SECRET)) {
        fastify.log.warn('Invalid Meta webhook signature — dropping')
        return
      }
    }

    const body = request.body
    if (body?.object !== 'whatsapp_business_account') return

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue
        await handleMessagesChange(fastify, change.value)
      }
    }
  })

  // ── Get Connected WhatsApp Account ────────────────────────────────────────
  fastify.get('/api/whatsapp/account', { onRequest: [fastify.authenticate] }, async (request) => {
    const account = await WhatsAppAccount.findOne({ agencyId: request.user.agencyId })
    return { account: account || null }
  })

  // ── Embedded Signup: Connect WhatsApp Account ──────────────────────────────
  fastify.post('/api/whatsapp/connect', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!['owner', 'admin'].includes(request.user.role)) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const { code, wabaId, phoneNumberId } = request.body ?? {}
    if (!code || !wabaId || !phoneNumberId) {
      return reply.code(400).send({ error: 'code, wabaId, and phoneNumberId are required' })
    }

    // Exchange code → user access token
    const tokenData = await exchangeCodeForToken(code)
    const accessToken = tokenData.access_token

    // Fetch phone number display info
    const phoneDetails = await getPhoneNumberDetails(phoneNumberId, accessToken)

    // Subscribe this WABA to our app's webhook
    await subscribeToWebhooks(wabaId, accessToken)

    // Find the agency's agent to link
    const agent = await Agent.findOne({ agencyId: request.user.agencyId })

    const waAccount = await WhatsAppAccount.findOneAndUpdate(
      { agencyId: request.user.agencyId },
      {
        agencyId: request.user.agencyId,
        wabaId,
        phoneNumberId,
        accessToken,
        phoneNumber: phoneDetails.display_phone_number || phoneNumberId,
        displayName: phoneDetails.verified_name || '',
        status: 'active',
        webhookConfigured: true,
        ...(agent ? { agentId: agent._id } : {}),
      },
      { upsert: true, new: true }
    )

    fastify.log.info({ msg: 'WhatsApp account connected', agencyId: request.user.agencyId, wabaId })
    return { success: true, account: waAccount }
  })

  // ── Manual Send from Inbox (dashboard) ────────────────────────────────────
  fastify.post('/api/whatsapp/send', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { conversationId, body } = request.body ?? {}
    if (!conversationId || !body) {
      return reply.code(400).send({ error: 'conversationId and body are required' })
    }

    const conversation = await Conversation.findById(conversationId)
    if (!conversation) return reply.code(404).send({ error: 'Conversation not found' })

    const waAccount = await WhatsAppAccount.findOne({ agencyId: conversation.agencyId })
    if (!waAccount) return reply.code(404).send({ error: 'No WhatsApp account connected' })

    const sent = await sendTextMessage(waAccount.phoneNumberId, waAccount.accessToken, conversation.customerPhone, body)

    conversation.messages.push({
      direction: 'outbound',
      body,
      sender: 'agent',
      waMessageId: sent.messages?.[0]?.id,
      status: 'sent',
    })
    conversation.metadata.lastMessageAt = new Date()
    conversation.metadata.messageCount = conversation.messages.length
    await conversation.save()

    return { success: true }
  })
}

// ── Internal: process a "messages" change event ─────────────────────────────

async function handleMessagesChange(fastify, value) {
  // Status updates (delivered, read, failed, etc.)
  if (value.statuses?.length) {
    for (const s of value.statuses) {
      await Conversation.updateOne(
        { 'messages.waMessageId': s.id },
        { $set: { 'messages.$.status': s.status } }
      ).catch(() => {})
    }
    return
  }

  if (!value.messages?.length) return

  const phoneNumberId = value.metadata?.phone_number_id
  const msg          = value.messages[0]
  const contact      = value.contacts?.[0]

  // Skip non-text messages (images, audio, etc.) for now
  if (msg.type !== 'text') return

  const fromNumber   = msg.from
  const text         = msg.text?.body
  const waMessageId  = msg.id
  const customerName = contact?.profile?.name || 'Unknown'

  fastify.log.info({ msg: 'Inbound WhatsApp', from: fromNumber, phoneNumberId, text })

  // Resolve which agency owns this phone number
  const waAccount = await WhatsAppAccount.findOne({ phoneNumberId })
  if (!waAccount) {
    fastify.log.warn(`No WhatsAppAccount for phoneNumberId: ${phoneNumberId}`)
    return
  }

  const agencyId = waAccount.agencyId

  // Find or create conversation (re-open if previously closed > 24h ago)
  let conversation = await Conversation.findOne({
    agencyId,
    customerPhone: fromNumber,
    status: { $in: ['active', 'pending'] },
  })

  if (!conversation) {
    conversation = await Conversation.create({
      agencyId,
      wabaAccountId: waAccount._id,
      agentId: waAccount.agentId,
      customerPhone: fromNumber,
      customerName,
      status: 'active',
      messages: [],
    })
    waAccount.stats.totalConversations += 1
  }

  // Save inbound message
  conversation.messages.push({
    direction: 'inbound',
    body: text,
    sender: 'customer',
    waMessageId,
    status: 'delivered',
    timestamp: new Date(parseInt(msg.timestamp, 10) * 1000),
  })
  conversation.metadata.lastMessageAt = new Date()
  conversation.metadata.messageCount  = conversation.messages.length
  await conversation.save()

  waAccount.stats.messagesToday += 1
  waAccount.stats.totalMessages  += 1
  await waAccount.save()

  // Skip AI if a human has taken over
  if (conversation.metadata.isAiHandling === false) return

  // Resolve the agent (linked to account, or first for this agency)
  const agent = waAccount.agentId
    ? await Agent.findById(waAccount.agentId)
    : await Agent.findOne({ agencyId })

  if (!agent) {
    fastify.log.warn(`No agent configured for agencyId: ${agencyId}`)
    return
  }

  // Run AI pipeline
  const aiResult = await processMessage(agent, conversation)
  if (!aiResult?.text) return

  try {
    const sent = await sendTextMessage(phoneNumberId, waAccount.accessToken, fromNumber, aiResult.text)

    conversation.messages.push({
      direction: 'outbound',
      body: aiResult.text,
      sender: 'ai',
      waMessageId: sent.messages?.[0]?.id,
      status: 'sent',
    })
  } catch (sendErr) {
    fastify.log.error({ msg: 'Send failed', error: sendErr.message })
    conversation.messages.push({
      direction: 'outbound',
      body: aiResult.text,
      sender: 'ai',
      status: 'failed',
    })
  }

  if (aiResult.handoff) {
    conversation.metadata.isAiHandling = false
    conversation.status = 'handed_off'
  }

  conversation.metadata.lastMessageAt = new Date()
  conversation.metadata.messageCount  = conversation.messages.length
  await conversation.save()
}
