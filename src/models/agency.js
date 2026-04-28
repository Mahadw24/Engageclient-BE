import mongoose from 'mongoose'

const agencySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String },
    industry: {
      type: String,
      enum: ['Clinic', 'Real Estate', 'Education', 'Food', 'Other'],
      default: 'Other',
    },
    plan: {
      type: String,
      enum: ['trial', 'starter', 'professional', 'business'],
      default: 'trial',
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'inactive'],
      default: 'active',
    },

    // Stripe
    stripeCustomerId: { type: String },
    stripeSubscriptionId: { type: String },
    stripePriceId: { type: String },
    subscriptionStatus: {
      type: String,
      enum: ['trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete'],
      default: 'trialing',
    },

    // Trial
    trialEndsAt: { type: Date },
    trialStartedAt: { type: Date },

    // Billing
    currentPeriodStart: { type: Date },
    currentPeriodEnd: { type: Date },
    cancelAtPeriodEnd: { type: Boolean, default: false },

    // Plan limits
    settings: {
      maxConversationsPerMonth: { type: Number, default: 500 },
      aiEnabled: { type: Boolean, default: true },
      is24x7: { type: Boolean, default: false },
      appointmentBooking: { type: Boolean, default: false },
      autoFollowUp: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
)

export const Agency = mongoose.model('Agency', agencySchema)
