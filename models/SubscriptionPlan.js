import mongoose from 'mongoose';

const SubscriptionPlanSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true }, // e.g. premium_monthly
    name: { type: String, required: true, trim: true },              // e.g. Premium
    description: { type: String, default: '' },

    interval: { type: String, enum: ['month', 'year', 'lifetime'], required: true },
    intervalCount: { type: Number, default: 1, min: 1 },

    currency: { type: String, default: 'LKR' },
    price: { type: Number, required: true, min: 0 },      // major units
    priceMinor: { type: Number, required: true, min: 0 },  // minor units

    features: [{ type: String }], // shown on pricing page
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

SubscriptionPlanSchema.index({ isActive: 1, sortOrder: 1 });

export default mongoose.model('SubscriptionPlan', SubscriptionPlanSchema);