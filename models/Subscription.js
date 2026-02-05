// ===== FILE: ./models/Subscription.js =====
import mongoose from 'mongoose';
const { Schema } = mongoose;

const subscriptionSchema = new Schema(
  {
    // -------------------------------------------------
    // Core relationship
    // -------------------------------------------------
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },

    // -------------------------------------------------
    // Plan & status
    // -------------------------------------------------
    plan: {
      type: String,
      enum: ['free', 'monthly', 'yearly'],
      default: 'free',
    },

    status: {
      type: String,
      enum: ['active', 'cancelled', 'expired', 'past_due', 'trialing'],
      default: 'active',
    },

    // -------------------------------------------------
    // Stripe identifiers (optional – only for paid plans)
    // -------------------------------------------------
    stripeCustomerId: String,
    stripeSubscriptionId: String,
    stripePriceId: String,
    stripePaymentMethodId: String,

    // -------------------------------------------------
    // Pricing info (mirrors Stripe for reporting)
    // -------------------------------------------------
    currency: { type: String, default: 'USD' },
    amount: { type: Number, default: 0 },

    // -------------------------------------------------
    // Dates
    // -------------------------------------------------
    startDate: { type: Date, default: Date.now },
    endDate: Date,          // calculated by Stripe or by us when we create the sub
    cancelledAt: Date,      // when user requested cancel‑at‑period‑end
    trialEndDate: Date,

    // -------------------------------------------------
    // Renewal control
    // -------------------------------------------------
    autoRenew: { type: Boolean, default: true }, // false → cancel_at_period_end
    renewalReminded: { type: Boolean, default: false },

    // -------------------------------------------------
    // Feature flags – always derived from `plan`
    // -------------------------------------------------
    features: {
      unlimitedMessages: { type: Boolean, default: false },
      seeWhoLikedYou: { type: Boolean, default: false },
      advancedFilters: { type: Boolean, default: false },
      prioritySupport: { type: Boolean, default: false },
      profileBoost: { type: Boolean, default: false },
      unlimitedLikes: { type: Boolean, default: false },
      readReceipts: { type: Boolean, default: false },
      noAds: { type: Boolean, default: false },
    },
  },
  {
    // Mongoose will automatically add `createdAt` and `updatedAt`
    timestamps: true,
  }
);

/* -----------------------------------------------------------------
   Indexes – keep look‑ups fast
   ----------------------------------------------------------------- */
subscriptionSchema.index({ userId: 1 });
subscriptionSchema.index({ stripeCustomerId: 1 });
subscriptionSchema.index({ stripeSubscriptionId: 1 });
subscriptionSchema.index({ status: 1 });
subscriptionSchema.index({ endDate: 1 });

/* -----------------------------------------------------------------
   Helper: set feature flags based on the current plan
   ----------------------------------------------------------------- */
subscriptionSchema.methods.setFeaturesByPlan = function () {
  if (this.plan === 'free') {
    this.features = {
      unlimitedMessages: false,
      seeWhoLikedYou: false,
      advancedFilters: false,
      prioritySupport: false,
      profileBoost: false,
      unlimitedLikes: false,
      readReceipts: false,
      noAds: false,
    };
  } else {
    // monthly & yearly get all features, with extra perks for yearly
    this.features = {
      unlimitedMessages: true,
      seeWhoLikedYou: true,
      advancedFilters: true,
      prioritySupport: this.plan === 'yearly',
      profileBoost: this.plan === 'yearly',
      unlimitedLikes: true,
      readReceipts: true,
      noAds: true,
    };
  }
};

/* -----------------------------------------------------------------
   Helper: is the subscription currently active?
   ----------------------------------------------------------------- */
subscriptionSchema.methods.isActive = function () {
  // Free plan is always active (no expiry)
  if (this.plan === 'free') return true;

  // Status must be active or trialing
  if (this.status !== 'active' && this.status !== 'trialing') return false;

  // If an endDate exists, it must be in the future
  if (this.endDate && new Date() > this.endDate) return false;

  // All other checks passed → active
  return true;
};

/* -----------------------------------------------------------------
   Pre‑save hook – keep feature flags in sync whenever the plan
   changes (or on first creation).
   ----------------------------------------------------------------- */
subscriptionSchema.pre('save', function (next) {
  // `isModified('plan')` catches both new docs and plan changes
  if (this.isNew || this.isModified('plan')) {
    this.setFeaturesByPlan();
  }
  next();
});

export default mongoose.model('Subscription', subscriptionSchema);