// ===== FILE: ./models/AgencyEntitlementPayment.js =====
import mongoose from 'mongoose';

const AgencyEntitlementPaymentSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['post_marriage', 'verified_badge'], required: true },

    // IMPORTANT: in this project, "agencyId" should be the agency USER id (User._id)
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // payer user (for agencies this will equal agencyId)
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    currency: { type: String, default: 'LKR' },
    amountMinor: { type: Number, required: true, min: 0 },

    provider: { type: String, default: 'payhere' }, // payhere/manual/stripe etc
    providerRef: { type: String, required: true }, // typically PayHere order_id

    status: {
      type: String,
      enum: ['pending', 'processing', 'succeeded', 'failed', 'cancelled'],
      default: 'pending',
    },

    processedAt: { type: Date, default: null },

    metadata: { type: Object, default: {} },
  },
  { timestamps: true }
);

AgencyEntitlementPaymentSchema.index({ provider: 1, providerRef: 1 }, { unique: true });

export default mongoose.model('AgencyEntitlementPayment', AgencyEntitlementPaymentSchema);