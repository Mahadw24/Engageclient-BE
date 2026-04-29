import crypto from 'crypto'

const GRAPH = 'https://graph.facebook.com/v21.0'

export async function sendTextMessage(phoneNumberId, accessToken, to, text) {
  const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: text },
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'Failed to send WhatsApp message')
  return data // { messages: [{ id: 'wamid...' }] }
}

export async function exchangeCodeForToken(code) {
  const url = new URL(`${GRAPH}/oauth/access_token`)
  url.searchParams.set('client_id', process.env.META_APP_ID)
  url.searchParams.set('client_secret', process.env.META_APP_SECRET)
  url.searchParams.set('code', code)

  const res = await fetch(url.toString())
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'Token exchange failed')
  return data // { access_token, token_type }
}

export async function getPhoneNumberDetails(phoneNumberId, accessToken) {
  const url = new URL(`${GRAPH}/${phoneNumberId}`)
  url.searchParams.set('fields', 'display_phone_number,verified_name,quality_rating,status')
  url.searchParams.set('access_token', accessToken)

  const res = await fetch(url.toString())
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'Failed to get phone number details')
  return data
}

export async function subscribeToWebhooks(wabaId, accessToken) {
  const res = await fetch(`${GRAPH}/${wabaId}/subscribed_apps`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json()
  // Non-fatal: log but don't throw — webhook can also be configured in Meta Developer Console
  if (!res.ok) {
    console.warn('Webhook subscription warning:', data.error?.message)
  }
  return data
}

export function verifySignature(rawBody, signature, appSecret) {
  if (!signature || !appSecret) return false
  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}
