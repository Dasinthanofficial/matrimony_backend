// server/models/Payment.js
import mongoose from 'mongoose';
const { Schema } = mongoose;

const paymentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription', default: null },

    // Agency service payment
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', default: null, index: true },
    agencyServiceId: { type: Schema.Types.ObjectId, ref: 'AgencyService', default: null },

    // Gateway
    gateway: { type: String, enum: ['payhere', 'stripe', 'mock'], default: 'payhere', index: true },

    // PayHere fields
    payhere: {
      orderId: { type: String, default: '' },
      paymentId: { type: String, default: '' },
      statusCode: { type: Number, default: null },
      method: { type: String, default: '' },
      statusMessage: { type: String, default: '' },
    },

    // Stripe legacy fields (optional)
    stripePaymentIntentId: String,
    stripeChargeId: String,
    stripeInvoiceId: String,
    stripeReceiptUrl: String,
    stripeCheckoutSessionId: String,

    // Payment details
    amount: { type: Number, required: true }, // major units
    amountMinor: { type: Number, default: null },
    currency: { type: String, required: true, default: 'LKR', uppercase: true, trim: true },

    /**
     * ✅ IMPORTANT CHANGE:
     * plan is now a STRING (NOT enum) so you can store:
     * - subscription plan codes from SubscriptionPlan.code (e.g. "premium_monthly")
     * - "contact_unlock"
     * - "agency_service"
     * - legacy values "monthly"/"yearly"
     */
    plan: { type: String, required: true, index: true },

    status: {
      type: String,
      enum: ['pending', 'processing', 'succeeded', 'failed', 'refunded', 'cancelled'],
      default: 'pending',
      index: true,
    },

    // Marketplace commission + payout scheduling (agency_service)
    commission: {
      platformFeeMinor: { type: Number, default: 0 },
      agencyAmountMinor: { type: Number, default: 0 },
      commissionBps: { type: Number, default: 0 },
      holdDays: { type: Number, default: 0 },
    },

    payout: {
      applicable: { type: Boolean, default: false },
      status: {
        type: String,
        enum: ['not_applicable', 'scheduled', 'ready_for_manual', 'transferred', 'transfer_failed', 'canceled'],
        default: 'not_applicable',
        index: true,
      },
      releaseAt: { type: Date, index: true },
      transferredAt: { type: Date, default: null },
      transferRef: { type: String, default: '' },
      error: { type: String, default: '' },
    },

    description: { type: String, default: '' },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index({ plan: 1, status: 1, createdAt: -1 });
paymentSchema.index({ agencyId: 1, createdAt: -1 });
paymentSchema.index({ 'payout.status': 1, 'payout.releaseAt': 1 });

export default mongoose.model('Payment', paymentSchema);