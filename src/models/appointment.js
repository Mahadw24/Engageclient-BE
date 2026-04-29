import mongoose from 'mongoose'

const appointmentSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' },

    customerName: { type: String, required: true },
    customerPhone: { type: String, required: true },

    serviceName: { type: String, required: true },
    serviceDuration: { type: Number }, // minutes

    scheduledAt: { type: Date, required: true },

    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'],
      default: 'pending',
    },
    source: {
      type: String,
      enum: ['ai_booked', 'manual'],
      default: 'ai_booked',
    },

    notes: { type: String },
    reminderSentAt: { type: Date },
  },
  { timestamps: true }
)

appointmentSchema.index({ agencyId: 1, scheduledAt: 1 })
appointmentSchema.index({ agencyId: 1, status: 1 })

export const Appointment = mongoose.model('Appointment', appointmentSchema)
