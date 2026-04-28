import mongoose from 'mongoose'

const numberSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true },
    phoneNumber: { type: String, required: true, unique: true },
    twilioSid: { type: String, required: true },
    messagingServiceSid: { type: String },
    friendlyName: { type: String },
    country: { type: String, default: 'US' },
    status: {
      type: String,
      enum: ['active', 'pending', 'disconnected'],
      default: 'pending',
    },
    qualityRating: {
      type: String,
      enum: ['Green', 'Yellow', 'Red', 'N/A'],
      default: 'N/A',
    },
    flowId: { type: mongoose.Schema.Types.ObjectId, ref: 'Flow' },
    stats: {
      messagesToday: { type: Number, default: 0 },
      totalMessages: { type: Number, default: 0 },
      totalConversations: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
)

export const NumberModel = mongoose.model('Number', numberSchema)
