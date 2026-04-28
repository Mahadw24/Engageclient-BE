import Twilio from 'twilio'

const client = new Twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)

const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL || 'https://engageclient.com'

// Search available phone numbers by country
export async function searchNumbers(countryCode = 'US', { areaCode, contains, limit = 10 } = {}) {
  const query = { limit, smsEnabled: true, voiceEnabled: true }
  if (areaCode) query.areaCode = areaCode
  if (contains) query.contains = contains

  const numbers = await client.availablePhoneNumbers(countryCode).local.list(query)

  return numbers.map((n) => ({
    phoneNumber: n.phoneNumber,
    friendlyName: n.friendlyName,
    locality: n.locality,
    region: n.region,
    country: countryCode,
    capabilities: {
      voice: n.capabilities.voice,
      sms: n.capabilities.sms,
      mms: n.capabilities.mms,
    },
  }))
}

// Purchase a phone number and configure webhook
export async function purchaseNumber(phoneNumber, agencyId) {
  const purchased = await client.incomingPhoneNumbers.create({
    phoneNumber,
    friendlyName: `EngageClient-${agencyId}`,
    smsUrl: `${WEBHOOK_BASE_URL}/api/whatsapp/webhook`,
    smsMethod: 'POST',
    statusCallback: `${WEBHOOK_BASE_URL}/api/whatsapp/status`,
    statusCallbackMethod: 'POST',
  })

  return {
    sid: purchased.sid,
    phoneNumber: purchased.phoneNumber,
    friendlyName: purchased.friendlyName,
    dateCreated: purchased.dateCreated,
  }
}

// Register number as WhatsApp sender via Twilio
export async function registerWhatsAppSender(phoneNumber) {
  // Twilio WhatsApp senders are managed via Messaging Service
  // Step 1: Create a messaging service for this number
  const service = await client.messaging.v1.services.create({
    friendlyName: `EngageClient-WA-${phoneNumber}`,
    usecase: 'notifications',
    inboundRequestUrl: `${WEBHOOK_BASE_URL}/api/whatsapp/webhook`,
    inboundMethod: 'POST',
    statusCallback: `${WEBHOOK_BASE_URL}/api/whatsapp/status`,
  })

  // Step 2: Add the phone number to the messaging service
  await client.messaging.v1.services(service.sid).phoneNumbers.create({
    phoneNumberSid: phoneNumber, // This should be the number SID
  })

  return {
    messagingServiceSid: service.sid,
  }
}

// Send a WhatsApp message
export async function sendWhatsAppMessage(from, to, body, { mediaUrl } = {}) {
  const params = {
    from: `whatsapp:${from}`,
    to: `whatsapp:${to}`,
    body,
  }
  if (mediaUrl) params.mediaUrl = [mediaUrl]

  const message = await client.messages.create(params)

  return {
    sid: message.sid,
    status: message.status,
    dateSent: message.dateSent,
  }
}

// Send a WhatsApp template message (for initiating conversations)
export async function sendTemplateMessage(from, to, contentSid, variables = {}) {
  const message = await client.messages.create({
    from: `whatsapp:${from}`,
    to: `whatsapp:${to}`,
    contentSid,
    contentVariables: JSON.stringify(variables),
  })

  return {
    sid: message.sid,
    status: message.status,
  }
}

// List all purchased numbers
export async function listPurchasedNumbers() {
  const numbers = await client.incomingPhoneNumbers.list()

  return numbers
    .filter((n) => n.friendlyName.startsWith('EngageClient-'))
    .map((n) => ({
      sid: n.sid,
      phoneNumber: n.phoneNumber,
      friendlyName: n.friendlyName,
      dateCreated: n.dateCreated,
      status: n.status,
    }))
}

// Release (delete) a phone number
export async function releaseNumber(numberSid) {
  await client.incomingPhoneNumbers(numberSid).remove()
}

// Get usage for a specific number
export async function getNumberUsage(phoneNumber, { startDate, endDate } = {}) {
  const query = { category: 'sms' }
  if (startDate) query.startDate = startDate
  if (endDate) query.endDate = endDate

  const records = await client.usage.records.list(query)

  return records.map((r) => ({
    category: r.category,
    count: r.count,
    usage: r.usage,
    price: r.price,
    priceUnit: r.priceUnit,
  }))
}

// Validate Twilio webhook signature (security)
export function validateWebhookSignature(url, params, signature) {
  return Twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    signature,
    url,
    params
  )
}
