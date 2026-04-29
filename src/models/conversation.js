import mongoose from 'mongoose'

const messageSchema = new mongoose.Schema(
  {
    direction: { type: String, enum: ['inbound', 'outbound'], required: true },
    body: { type: String, required: true },
    type: {
      type: String,
      enum: ['text', 'image', 'audio', 'document', 'template'],
      default: 'text',
    },
    mediaUrl: { type: String },
    waMessageId: { type: String }, // Meta message ID
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read', 'failed'],
      default: 'sent',
    },
    sender: {
      type: String,
      enum: ['customer', 'ai', 'agent'],
      default: 'customer',
    },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
)

const conversationSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true },
    wabaAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppAccount' },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },

    customerPhone: { type: String, required: true },
    customerName: { type: String, default: 'Unknown' },

    status: {
      type: String,
      enum: ['active', 'closed', 'pending', 'handed_off'],
      default: 'active',
    },
    intent: {
      type: String,
      enum: ['inquiry', 'booking', 'reschedule', 'cancellation', 'support', 'other'],
      default: 'inquiry',
    },

    messages: [messageSchema],

    metadata: {
      lastMessageAt: { type: Date },
      messageCount: { type: Number, default: 0 },
      isAiHandling: { type: Boolean, default: true },
      handedOffTo: { type: String },
      appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
      summary: { type: String },
    },
  },
  { timestamps: true }
)

conversationSchema.index({ agencyId: 1, customerPhone: 1 })
conversationSchema.index({ agencyId: 1, status: 1 })

export const Conversation = mongoose.model('Conversation', conversationSchema)
