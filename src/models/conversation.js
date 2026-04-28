import mongoose from 'mongoose'

const messageSchema = new mongoose.Schema({
  direction: { type: String, enum: ['inbound', 'outbound'], required: true },
  body: { type: String, required: true },
  twilioSid: { type: String },
  status: {
    type: String,
    enum: ['queued', 'sent', 'delivered', 'read', 'failed'],
    default: 'queued',
  },
  sender: {
    type: String,
    enum: ['customer', 'ai', 'agent'],
    default: 'customer',
  },
  mediaUrls: [{ type: String }],
  timestamp: { type: Date, default: Date.now },
})

const conversationSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true },
    numberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Number' },
    flowId: { type: mongoose.Schema.Types.ObjectId, ref: 'Flow' },
    customerPhone: { type: String, required: true },
    customerName: { type: String, default: 'Unknown' },
    status: {
      type: String,
      enum: ['active', 'closed', 'pending', 'handed_off'],
      default: 'active',
    },
    type: {
      type: String,
      enum: ['inquiry', 'booking', 'support', 'lead', 'follow_up'],
      default: 'inquiry',
    },
    messages: [messageSchema],
    metadata: {
      lastMessageAt: { type: Date },
      messageCount: { type: Number, default: 0 },
      isAiHandling: { type: Boolean, default: true },
      handedOffTo: { type: String },
      // Structured lead (real estate): one-line summary + parsed fields for inbox/export
      leadSummary: { type: String },
      leadData: {
        name: { type: String },
        need: { type: String }, // buy | rent
        area: { type: String },
        budget: { type: String },
        timeline: { type: String },
      },
    },
  },
  { timestamps: true }
)

conversationSchema.index({ agencyId: 1, customerPhone: 1 })
conversationSchema.index({ agencyId: 1, status: 1 })

export const Conversation = mongoose.model('Conversation', conversationSchema)
