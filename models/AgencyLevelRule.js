import mongoose from 'mongoose';

const agencyLevelRuleSchema = new mongoose.Schema(
  {
    level: { type: Number, required: true, unique: true, min: 1 },
    name: { type: String, required: true },

    minPostMarriagePaymentsCount: { type: Number, default: 0 },
    minPostMarriageRevenueMinor: { type: Number, default: 0 },

    minAvgRating: { type: Number, default: 0 },
    minRatingCount: { type: Number, default: 0 },

    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

export default mongoose.model('AgencyLevelRule', agencyLevelRuleSchema);