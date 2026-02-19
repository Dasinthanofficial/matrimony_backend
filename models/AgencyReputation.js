import mongoose from 'mongoose';

const agencyReputationSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, index: true },

    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },

    agencyLevel: { type: Number, default: 1, index: true },

    stats: {
      postMarriagePaymentsCount: { type: Number, default: 0 },
      postMarriageRevenueMinor: { type: Number, default: 0 },
      currency: { type: String, default: 'LKR' },
    },

    verifiedBadge: {
      isActive: { type: Boolean, default: false, index: true },
      purchasedAt: { type: Date },
      expiresAt: { type: Date }, // null => lifetime
      lastPaymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgencyEntitlementPayment' },
    },
  },
  { timestamps: true }
);

export default mongoose.model('AgencyReputation', agencyReputationSchema);