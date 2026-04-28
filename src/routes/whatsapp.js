import { validateWebhookSignature, sendWhatsAppMessage } from '../services/twilio.js'
import { processWithAI } from '../services/ai-agent.js'
import { NumberModel } from '../models/number.js'
import { Conversation } from '../models/conversation.js'
import { Flow } from '../models/flow.js'

export async function whatsappRoutes(fastify) {
  // --- Webhook: Receive incoming WhatsApp messages ---
  fastify.post('/api/whatsapp/webhook', async (request, reply) => {
    const { Body, From, To, MessageSid, NumMedia, ProfileName } = request.body

    // Validate Twilio signature in production
    if (process.env.NODE_ENV === 'production') {
      const signature = request.headers['x-twilio-signature']
      const url = `${process.env.WEBHOOK_BASE_URL}/api/whatsapp/webhook`
      if (!validateWebhookSignature(url, request.body, signature)) {
        return reply.code(403).send({ error: 'Invalid signature' })
      }
    }

    // Strip "whatsapp:" prefix
    const fromNumber = From.replace('whatsapp:', '')
    const toNumber = To.replace('whatsapp:', '')

    fastify.log.info({ msg: 'Incoming WhatsApp', from: fromNumber, to: toNumber, body: Body })

    // Find which agency owns this number
    const numberDoc = await NumberModel.findOne({ phoneNumber: toNumber }).populate('flowId')

    // --- Sandbox mode: use SANDBOX_FLOW_ID when no number is mapped ---
    const isSandbox = !numberDoc && process.env.SANDBOX_FLOW_ID
    let sandboxFlow = null

    if (!numberDoc && !isSandbox) {
      fastify.log.warn(`No agency mapped to number: ${toNumber}`)
      reply.type('text/xml').send('<Response></Response>')
      return
    }

    if (isSandbox) {
      sandboxFlow = await Flow.findById(process.env.SANDBOX_FLOW_ID)
      if (!sandboxFlow) {
        fastify.log.error(`Sandbox flow not found: ${process.env.SANDBOX_FLOW_ID}`)
        reply.type('text/xml').send('<Response></Response>')
        return
      }
      fastify.log.info({ msg: 'Sandbox mode', flowId: process.env.SANDBOX_FLOW_ID })
    }

    const agencyId = isSandbox ? sandboxFlow.agencyId : numberDoc.agencyId
    const activeFlow = isSandbox ? sandboxFlow : numberDoc.flowId

    // Find or create conversation
    let conversation = await Conversation.findOne({
      agencyId,
      customerPhone: fromNumber,
      status: { $in: ['active', 'pending'] },
    })

    if (!conversation) {
      conversation = await Conversation.create({
        agencyId,
        numberId: numberDoc?._id,
        flowId: activeFlow?._id,
        customerPhone: fromNumber,
        customerName: ProfileName || 'Unknown',
        status: 'active',
        messages: [],
      })
    }

    // Save incoming message
    conversation.messages.push({
      direction: 'inbound',
      body: Body,
      sender: 'customer',
      twilioSid: MessageSid,
      status: 'delivered',
    })
    conversation.metadata.lastMessageAt = new Date()
    conversation.metadata.messageCount = conversation.messages.length
    await conversation.save()

    // Update number stats (skip for sandbox)
    if (numberDoc) {
      numberDoc.stats.messagesToday += 1
      numberDoc.stats.totalMessages += 1
      await numberDoc.save()
    }

    // Process with AI if flow exists (sandbox always uses AI, normal checks isAiHandling)
    const shouldProcessAI = isSandbox
      ? !!activeFlow
      : conversation.metadata.isAiHandling && activeFlow

    if (shouldProcessAI) {
      const aiResult = await processWithAI(activeFlow, conversation)

      if (aiResult) {
        const isHandoff = typeof aiResult === 'object' && aiResult.handoff
        const responseText = typeof aiResult === 'object' ? aiResult.text : aiResult

        if (responseText) {
          try {
            const result = await sendWhatsAppMessage(toNumber, fromNumber, responseText)

            conversation.messages.push({
              direction: 'outbound',
              body: responseText,
              sender: 'ai',
              twilioSid: result.sid,
              status: result.status,
            })
            conversation.metadata.lastMessageAt = new Date()
            conversation.metadata.messageCount = conversation.messages.length
          } catch (sendErr) {
            fastify.log.error({ msg: 'Failed to send WhatsApp message', error: sendErr.message, code: sendErr.code })
            // Save AI response even if send failed
            conversation.messages.push({
              direction: 'outbound',
              body: responseText,
              sender: 'ai',
              status: 'failed',
            })
          }
        }

        if (isHandoff) {
          conversation.metadata.isAiHandling = false
          conversation.status = 'handed_off'
        }

        if (typeof aiResult === 'object' && aiResult.leadData) {
          conversation.metadata.leadSummary = aiResult.leadSummary || null
          conversation.metadata.leadData = aiResult.leadData
        }

        await conversation.save()
      }
    }

    reply.type('text/xml').send('<Response></Response>')
  })

  // --- Webhook: Message status updates ---
  fastify.post('/api/whatsapp/status', async (request, reply) => {
    const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = request.body

    fastify.log.info({
      msg: 'Status update',
      sid: MessageSid,
      status: MessageStatus,
    })

    // Update message status in conversation
    await Conversation.updateOne(
      { 'messages.twilioSid': MessageSid },
      { $set: { 'messages.$.status': MessageStatus } }
    )

    reply.code(200).send({ received: true })
  })

  // --- Send a message (from dashboard) ---
  fastify.post('/api/whatsapp/send', async (request, reply) => {
    const { conversationId, body, mediaUrl } = request.body

    if (!conversationId || !body) {
      return reply.code(400).send({ error: 'conversationId and body are required' })
    }

    const conversation = await Conversation.findById(conversationId).populate('numberId')
    if (!conversation) {
      return reply.code(404).send({ error: 'Conversation not found' })
    }

    const fromNumber = conversation.numberId?.phoneNumber
    if (!fromNumber) {
      return reply.code(400).send({ error: 'No number assigned to this conversation' })
    }

    const result = await sendWhatsAppMessage(fromNumber, conversation.customerPhone, body, { mediaUrl })

    conversation.messages.push({
      direction: 'outbound',
      body,
      sender: 'agent',
      twilioSid: result.sid,
      status: result.status,
    })
    conversation.metadata.lastMessageAt = new Date()
    conversation.metadata.messageCount = conversation.messages.length
    await conversation.save()

    return result
  })
}
