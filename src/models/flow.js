import mongoose from 'mongoose'

const agentSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true },
    name: { type: String, required: true },
    status: {
      type: String,
      enum: ['draft', 'active', 'inactive'],
      default: 'draft',
    },

    // AI configuration
    ai: {
      provider: { type: String, enum: ['anthropic', 'openai'], default: 'anthropic' },
      model: { type: String, default: 'claude-haiku-4-5-20251001' },
      systemPrompt: { type: String, default: '' },
      welcomeMessage: {
        type: String,
        default: 'Hello! How can I help you today?',
      },
      fallbackMessage: {
        type: String,
        default: "I'm sorry, I didn't understand that. Let me connect you with a team member.",
      },
      language: { type: String, enum: ['en', 'sq', 'it'], default: 'sq' },
      temperature: { type: Number, default: 0.7 },
      maxTokens: { type: Number, default: 500 },
    },

    // Clinic-specific knowledge base
    knowledgeBase: {
      businessContext: { type: String, default: '' },
      services: [
        {
          name: { type: String },
          duration: { type: Number }, // minutes
          price: { type: String },
          description: { type: String },
        },
      ],
      faqs: [
        {
          question: { type: String },
          answer: { type: String },
        },
      ],
      appointmentInstructions: { type: String, default: '' },
      specialNotes: { type: String, default: '' },
    },

    // Appointment booking behaviour
    appointmentBooking: {
      enabled: { type: Boolean, default: true },
      confirmationMessage: {
        type: String,
        default: 'Your appointment has been confirmed! We look forward to seeing you.',
      },
      reminderEnabled: { type: Boolean, default: true },
      reminderHoursBeforeAppointment: { type: Number, default: 24 },
    },

    // Human handoff
    handoff: {
      enabled: { type: Boolean, default: true },
      triggerKeywords: [{ type: String }],
      message: {
        type: String,
        default: 'Let me connect you with a team member who can assist you further.',
      },
    },

    stats: {
      conversations: { type: Number, default: 0 },
      appointmentsBooked: { type: Number, default: 0 },
      successRate: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
)

// Keep model registered as 'Agent' but export under the old name too
// so existing route imports don't break until routes are updated
export const Agent = mongoose.model('Agent', agentSchema)
export const Flow = Agent
