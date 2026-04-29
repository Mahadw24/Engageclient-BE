import mongoose from 'mongoose'

const dayScheduleSchema = new mongoose.Schema(
  {
    open: { type: String, default: '09:00' },
    close: { type: String, default: '17:00' },
    isOpen: { type: Boolean, default: true },
  },
  { _id: false }
)

const agencySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String },

    // Business profile — collected in onboarding step 1
    businessInfo: {
      address: { type: String },
      city: { type: String },
      country: { type: String, default: 'Albania' },
      timezone: { type: String, default: 'Europe/Tirane' },
      website: { type: String },
      industry: {
        type: String,
        enum: ['Dental Clinic', 'Medical Clinic', 'Aesthetic Clinic', 'Other'],
        default: 'Dental Clinic',
      },
      description: { type: String },
      services: [
        {
          name: { type: String },
          duration: { type: Number }, // minutes
          price: { type: String },
        },
      ],
      workingHours: {
        monday: { type: dayScheduleSchema, default: () => ({}) },
        tuesday: { type: dayScheduleSchema, default: () => ({}) },
        wednesday: { type: dayScheduleSchema, default: () => ({}) },
        thursday: { type: dayScheduleSchema, default: () => ({}) },
        friday: { type: dayScheduleSchema, default: () => ({}) },
        saturday: { type: dayScheduleSchema, default: () => ({ isOpen: false }) },
        sunday: { type: dayScheduleSchema, default: () => ({ isOpen: false }) },
      },
    },

    // Tracks where the user is in the setup wizard
    onboardingStep: { type: Number, default: 1, min: 1, max: 4 },
    // 1 = business info, 2 = agent configured, 3 = meta/waba connected, 4 = complete

    // Subscription
    plan: {
      type: String,
      enum: ['free_trial', 'starter', 'growth', 'scale', 'enterprise'],
      default: 'free_trial',
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
    currentPeriodStart: { type: Date },
    currentPeriodEnd: { type: Date },
    cancelAtPeriodEnd: { type: Boolean, default: false },

    // Trial credit — $10 granted on signup
    credits: {
      balance: { type: Number, default: 10.0 },
      totalUsed: { type: Number, default: 0 },
    },

    // Hard limits for the active plan
    limits: {
      monthlyConversations: { type: Number, default: 100 },
      wabaAccounts: { type: Number, default: 1 },
    },

    // Rolling usage for the current billing period
    usage: {
      conversationsThisPeriod: { type: Number, default: 0 },
      messagesThisPeriod: { type: Number, default: 0 },
      periodResetsAt: { type: Date },
    },
  },
  { timestamps: true }
)

export const Agency = mongoose.model('Agency', agencySchema)
