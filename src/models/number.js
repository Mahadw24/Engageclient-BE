import mongoose from 'mongoose'

// WhatsApp Business Account — connected via Meta embedded signup
const whatsAppAccountSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true },

    // From Meta embedded signup flow
    wabaId: { type: String, required: true },         // WhatsApp Business Account ID
    phoneNumberId: { type: String, required: true },   // Meta phone number ID
    accessToken: { type: String, required: true },     // store encrypted in production
    businessPortfolioId: { type: String },

    // Display info
    phoneNumber: { type: String, required: true, unique: true },
    displayName: { type: String },
    country: { type: String, default: 'AL' },

    // Status
    status: {
      type: String,
      enum: ['pending_verification', 'active', 'suspended', 'disconnected'],
      default: 'pending_verification',
    },
    qualityRating: {
      type: String,
      enum: ['green', 'yellow', 'red', 'unknown'],
      default: 'unknown',
    },

    // Meta verification state
    businessVerified: { type: Boolean, default: false },
    webhookConfigured: { type: Boolean, default: false },

    // Linked AI agent
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },

    stats: {
      messagesToday: { type: Number, default: 0 },
      totalMessages: { type: Number, default: 0 },
      totalConversations: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
)

export const WhatsAppAccount = mongoose.model('WhatsAppAccount', whatsAppAccountSchema)

// Backward-compat alias used in existing routes until they are updated
export const NumberModel = WhatsAppAccount
