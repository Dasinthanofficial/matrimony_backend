// ===== FILE: server/models/Subscription.js =====
import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const subscriptionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },

    /**
     * ✅ Store plan as STRING:
     * - 'free' (default)
     * - OR a Plan.slug like 'monthly', 'yearly', 'gold', etc.
     */
    plan: { type: String, default: 'free', index: true },

    status: {
      type: String,
      enum: ['active', 'past_due', 'cancelled'],
      default: 'active',
      index: true,
    },

    // Stripe
    stripeCustomerId: { type: String, default: null, index: true },
    stripeSubscriptionId: { type: String, default: null, index: true },

    // Billing metadata
    currency: { type: String, default: 'LKR' },
    amount: { type: Number, default: 0 }, // major units

    autoRenew: { type: Boolean, default: false },
    cancelledAt: { type: Date, default: null },

    startDate: { type: Date, default: Date.now },
    endDate: { type: Date, default: null },

    // Feature flags used by checkFeatureAccess
    features: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

subscriptionSchema.methods.isActive = function isActive() {
  // active means: status active AND (no endDate OR endDate in future)
  if (this.status !== 'active') return false;
  if (!this.endDate) return true;
  return new Date(this.endDate).getTime() > Date.now();
};

export default model('Subscription', subscriptionSchema);