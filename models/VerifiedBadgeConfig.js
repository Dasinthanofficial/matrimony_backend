// ===== FILE: ./models/VerifiedBadgeConfig.js =====
import mongoose from 'mongoose';

const VerifiedBadgeConfigSchema = new mongoose.Schema(
  {
    isEnabled: { type: Boolean, default: false },

    // price stored in minor units (e.g., LKR cents)
    priceMinor: { type: Number, default: 0, min: 0 },

    currency: { type: String, default: 'LKR' },

    // 0 or null => lifetime
    durationDays: { type: Number, default: 365, min: 0 },
  },
  { timestamps: true }
);

export default mongoose.model('VerifiedBadgeConfig', VerifiedBadgeConfigSchema);