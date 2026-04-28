import { ChatOpenAI } from '@langchain/openai'
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages'
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts'
import { StringOutputParser } from '@langchain/core/output_parsers'
import { GENERIC_REAL_ESTATE_SYSTEM_PROMPT } from '../prompts/real-estate-agent.js'

let llm = null
function getLLM(model = 'gpt-4o-mini', temperature = 0.7, maxTokens = 500) {
  // Create a new instance if model/config differs or not yet created
  if (!process.env.OPENAI_API_KEY) return null
  llm = new ChatOpenAI({
    model,
    temperature,
    maxTokens,
    apiKey: process.env.OPENAI_API_KEY,
  })
  return llm
}

const LEAD_MARKER_REGEX = /\[LEAD:\s*([^\]]+)\]/i

/**
 * Parse [LEAD: name | need | area | budget | timeline] from AI response.
 * Returns { leadData, leadSummary } or null.
 */
function parseLeadFromResponse(response) {
  const match = response.match(LEAD_MARKER_REGEX)
  if (!match) return null
  const parts = match[1].split('|').map((s) => s.trim()).map((s) => (s === '-' || !s ? '' : s))
  const [name, need, area, budget, timeline] = parts
  const leadData = { name, need, area, budget, timeline }
  const leadSummary = [name, need, area, budget, timeline].filter(Boolean).join(' | ')
  return { leadData, leadSummary: leadSummary || null }
}

/**
 * Strip [LEAD: ...] from text so customer never sees it.
 */
function stripLeadMarker(text) {
  return text.replace(/\s*\[LEAD:[^\]]+\]\s*/gi, '').trim()
}

/**
 * Process an incoming message with AI using the flow's system prompt via LangChain
 * @param {Object} flow - The Flow document (with ai config)
 * @param {Object} conversation - The Conversation document (with messages)
 * @returns {string|{ text, handoff?, leadData?, leadSummary? }} AI response; may include structured lead for metadata
 */
export async function processWithAI(flow, conversation) {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('OPENAI_API_KEY not set, skipping AI processing')
    return flow.ai?.fallbackMessage || null
  }

  const model = getLLM(
    flow.ai?.model || 'gpt-4o-mini',
    flow.ai?.temperature ?? 0.7,
    flow.ai?.maxTokens || 500
  )

  const systemPrompt = buildSystemPrompt(flow)
  const chatHistory = buildChatHistory(conversation)

  try {
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', systemPrompt],
      new MessagesPlaceholder('history'),
    ])

    const chain = prompt.pipe(model).pipe(new StringOutputParser())

    let response = await chain.invoke({ history: chatHistory })

    if (!response) return flow.ai?.fallbackMessage || null

    const handoff = response.includes('[HANDOFF]')
    if (handoff) {
      response = response.replace('[HANDOFF]', '').trim()
    }

    const lead = parseLeadFromResponse(response)
    const text = stripLeadMarker(response).trim() || flow.ai?.fallbackMessage

    const result = { text: text || null, handoff }
    if (lead) {
      result.leadData = lead.leadData
      result.leadSummary = lead.leadSummary
    }
    return result
  } catch (error) {
    console.error('LangChain AI processing error:', error.message)
    return flow.ai?.fallbackMessage || "Sorry, I'm having trouble right now. A human agent will assist you shortly."
  }
}

/**
 * Get Knowledge Base text for agent context.
 * Prefer structured knowledgeBaseData (validated attributes), fallback to legacy knowledgeBase string.
 */
function getKnowledgeBaseText(ai) {
  const data = ai?.knowledgeBaseData
  if (data) {
    const parts = []
    const agency = data.agency
    if (agency && (agency.name || agency.areas || agency.contact)) {
      parts.push('## Agency')
      if (agency.name) parts.push(`- Name: ${agency.name}`)
      if (agency.areas) parts.push(`- Areas: ${agency.areas}`)
      if (agency.contact) parts.push(`- Contact: ${agency.contact}`)
    }
    const listings = data.listings
    if (listings?.length) {
      parts.push('## Current listings')
      listings.forEach((l, i) => {
        if (l.property || l.price) {
          const line = [l.property, l.type, l.price].filter(Boolean).join(' | ')
          parts.push(`- ${line}`)
          if (l.brief) parts.push(`  ${l.brief}`)
        }
      })
    }
    const siteVisit = data.siteVisit
    if (siteVisit && (siteVisit.howToBook || siteVisit.slots)) {
      parts.push('## Site visit')
      if (siteVisit.howToBook) parts.push(`- How to book: ${siteVisit.howToBook}`)
      if (siteVisit.slots) parts.push(`- Slots: ${siteVisit.slots}`)
    }
    const handoff = data.handoff
    if (handoff?.whenToTransfer) {
      parts.push('## Handoff')
      parts.push(`- When to transfer: ${handoff.whenToTransfer}`)
    }
    if (parts.length) return parts.join('\n')
    /* structured data present but empty → fall back to legacy string */
  }
  if (ai?.knowledgeBase?.trim()) return ai.knowledgeBase.trim()
  return ''
}

/**
 * Build the system prompt from flow config.
 * For Real Estate flows with no custom system prompt, use the generic real estate agent prompt.
 */
function buildSystemPrompt(flow) {
  const hasCustomPrompt = flow.ai?.systemPrompt?.trim()
  const isRealEstate = (flow.industry || '').toLowerCase() === 'real estate'
  const defaultPrompt = isRealEstate ? GENERIC_REAL_ESTATE_SYSTEM_PROMPT : 'You are a helpful AI assistant.'
  let prompt = hasCustomPrompt ? flow.ai.systemPrompt : defaultPrompt

  const kbText = getKnowledgeBaseText(flow.ai)
  if (kbText) {
    prompt += `\n\n## Knowledge Base\n${kbText}`
  }

  if (flow.ai?.variables?.length) {
    const vars = flow.ai.variables
      .filter((v) => v.defaultValue)
      .map((v) => `- ${v.name}: ${v.defaultValue}`)
      .join('\n')
    if (vars) {
      prompt += `\n\n## Variables\n${vars}`
    }
  }

  if (flow.settings) {
    const rules = []
    if (flow.settings.businessHoursOnly) {
      rules.push(`Business hours: ${flow.settings.businessHoursStart} - ${flow.settings.businessHoursEnd}`)
    }
    if (flow.settings.handoffEnabled) {
      rules.push('If the customer asks for a human agent or you cannot help, respond with [HANDOFF]')
    }
    if (rules.length) {
      prompt += `\n\n## Rules\n${rules.join('\n')}`
    }
  }

  return prompt
}

/**
 * Build chat history as LangChain message objects
 */
function buildChatHistory(conversation) {
  const recentMessages = conversation.messages.slice(-20)
  const messages = []

  for (const msg of recentMessages) {
    if (msg.sender === 'customer') {
      messages.push(new HumanMessage(msg.body))
    } else {
      messages.push(new AIMessage(msg.body))
    }
  }

  return messages
}
