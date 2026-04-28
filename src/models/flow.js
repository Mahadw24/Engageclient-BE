import mongoose from 'mongoose'

const stepSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['message', 'question', 'condition', 'api_call', 'delay', 'assign', 'end'],
    required: true,
  },
  label: { type: String, required: true },
  config: { type: mongoose.Schema.Types.Mixed, default: {} },
  order: { type: Number, default: 0 },
})

const flowSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true },
    name: { type: String, required: true },
    description: { type: String },
    industry: { type: String },
    active: { type: Boolean, default: false },

    // AI Configuration
    ai: {
      systemPrompt: { type: String, default: '' },
      welcomeMessage: { type: String, default: 'Hello! How can I help you today?' },
      fallbackMessage: { type: String, default: "I'm sorry, I didn't understand that. Let me connect you with a human agent." },
      model: { type: String, default: 'gpt-4o-mini' },
      temperature: { type: Number, default: 0.7 },
      maxTokens: { type: Number, default: 500 },
      knowledgeBase: { type: String, default: '' },
      // Structured KB: validated attributes, formatted into agent context
      knowledgeBaseData: {
        agency: {
          name: { type: String, default: '', maxlength: 200 },
          areas: { type: String, default: '', maxlength: 500 },
          contact: { type: String, default: '', maxlength: 50 },
        },
        listings: [{
          property: { type: String, default: '', maxlength: 200 },
          type: { type: String, enum: ['Buy', 'Rent'], default: 'Buy' },
          price: { type: String, default: '', maxlength: 50 },
          brief: { type: String, default: '', maxlength: 300 },
        }],
        siteVisit: {
          howToBook: { type: String, default: '', maxlength: 300 },
          slots: { type: String, default: '', maxlength: 200 },
        },
        handoff: {
          whenToTransfer: { type: String, default: '', maxlength: 300 },
        },
      },
      variables: [
        {
          name: { type: String },
          description: { type: String },
          defaultValue: { type: String },
        },
      ],
    },

    // Flow steps
    steps: [stepSchema],

    // Triggers
    triggers: {
      keywords: [{ type: String }],
      onNewMessage: { type: Boolean, default: true },
      onNewLead: { type: Boolean, default: false },
      schedules: [
        {
          type: { type: String, enum: ['before_appointment', 'no_response', 'recurring'] },
          delay: { type: String },
        },
      ],
    },

    // Settings
    settings: {
      businessHoursOnly: { type: Boolean, default: false },
      businessHoursStart: { type: String, default: '09:00' },
      businessHoursEnd: { type: String, default: '17:00' },
      handoffEnabled: { type: Boolean, default: true },
      handoffKeywords: [{ type: String }],
      maxFollowUps: { type: Number, default: 3 },
      followUpDelayHours: { type: Number, default: 24 },
    },

    // Stats
    stats: {
      conversations: { type: Number, default: 0 },
      successRate: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
)

export const Flow = mongoose.model('Flow', flowSchema)
