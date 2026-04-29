import Anthropic from '@anthropic-ai/sdk'

let client = null
function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return client
}

/**
 * Process an incoming message with the Claude AI agent.
 * @param {Object} agent - Agent document from MongoDB
 * @param {Object} conversation - Conversation document with messages array
 * @returns {{ text: string|null, handoff: boolean }}
 */
export async function processMessage(agent, conversation) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[agent-pipeline] ANTHROPIC_API_KEY not set — returning fallback')
    return { text: agent.ai?.fallbackMessage || null, handoff: false }
  }

  const systemPrompt = buildSystemPrompt(agent)
  const messages = buildMessages(conversation)

  if (!messages.length) return null

  try {
    const response = await getClient().messages.create({
      model: agent.ai?.model || 'claude-haiku-4-5-20251001',
      max_tokens: agent.ai?.maxTokens || 500,
      system: systemPrompt,
      messages,
    })

    let text = response.content[0]?.text?.trim() || ''
    const handoff = agent.handoff?.enabled && text.includes('[HANDOFF]')
    text = text.replace('[HANDOFF]', '').trim()

    return {
      text: text || agent.ai?.fallbackMessage || null,
      handoff,
    }
  } catch (err) {
    console.error('[agent-pipeline] Anthropic error:', err.message)
    return {
      text: agent.ai?.fallbackMessage || "I'm having trouble right now. A team member will assist you shortly.",
      handoff: false,
    }
  }
}

function buildSystemPrompt(agent) {
  let prompt = agent.ai?.systemPrompt?.trim()

  if (!prompt) {
    prompt = `You are a helpful AI assistant for a dental clinic. Always be warm, professional, and concise.`
  }

  const kb = agent.knowledgeBase
  if (kb?.businessContext?.trim()) {
    prompt += `\n\n## About the Clinic\n${kb.businessContext}`
  }

  if (kb?.services?.length) {
    const lines = kb.services
      .filter(s => s.name?.trim())
      .map(s => `- ${s.name}${s.duration ? ` (${s.duration} min)` : ''}${s.price ? ` — ${s.price}` : ''}`)
    if (lines.length) prompt += `\n\n## Services\n${lines.join('\n')}`
  }

  if (kb?.faqs?.length) {
    const lines = kb.faqs
      .filter(f => f.question?.trim() && f.answer?.trim())
      .map(f => `Q: ${f.question}\nA: ${f.answer}`)
    if (lines.length) prompt += `\n\n## FAQs\n${lines.join('\n\n')}`
  }

  if (kb?.appointmentInstructions?.trim()) {
    prompt += `\n\n## Appointment Booking\n${kb.appointmentInstructions}`
  }

  if (agent.handoff?.enabled) {
    prompt += `\n\nIf the patient explicitly asks to speak with a human or you cannot help, append [HANDOFF] at the end of your message.`
  }

  return prompt
}

function buildMessages(conversation) {
  return conversation.messages
    .slice(-20)
    .filter(m => m.body && (m.sender === 'customer' || m.sender === 'ai'))
    .map(m => ({
      role: m.sender === 'customer' ? 'user' : 'assistant',
      content: m.body,
    }))
}
