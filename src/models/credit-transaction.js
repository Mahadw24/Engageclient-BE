import mongoose from 'mongoose'

const creditTransactionSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true },

    type: { type: String, enum: ['debit', 'credit'], required: true },
    category: {
      type: String,
      enum: ['message_sent', 'llm_call', 'trial_grant', 'stripe_purchase', 'manual'],
      required: true,
    },

    amount: { type: Number, required: true }, // USD, e.g. 0.002
    balanceAfter: { type: Number, required: true },

    description: { type: String },
    referenceId: { type: String }, // conversationId or stripeInvoiceId
  },
  { timestamps: true }
)

creditTransactionSchema.index({ agencyId: 1, createdAt: -1 })

export const CreditTransaction = mongoose.model('CreditTransaction', creditTransactionSchema)
