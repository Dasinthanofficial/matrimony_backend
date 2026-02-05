// ===== FILE: ./models/Payment.js =====
import mongoose from 'mongoose';
const { Schema } = mongoose;

const paymentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription' },

    // Stripe data
    stripePaymentIntentId: String,
    stripeChargeId: String,
    stripeInvoiceId: String,
    stripeReceiptUrl: String,

    // Payment details (store major units here: 9.99 USD, 1000 JPY, etc.)
    amount: { type: Number, required: true },
    // Store Stripe integer amount (minor units) when available
    amountMinor: { type: Number },

    currency: { type: String, required: true, default: 'USD' }, // uppercase recommended

    plan: { type: String, enum: ['free', 'monthly', 'yearly', 'contact_unlock'] },

    status: {
      type: String,
      enum: ['pending', 'processing', 'succeeded', 'failed', 'refunded', 'cancelled'],
      default: 'pending',
    },

    paymentMethod: {
      type: { type: String }, // card, upi, netbanking, etc.
      last4: String,
      brand: String,
      expiryMonth: Number,
      expiryYear: Number,
    },

    description: String,
    metadata: Schema.Types.Mixed,

    refundedAmount: { type: Number, default: 0 },
    refundReason: String,
    refundedAt: Date,

    failureCode: String,
    failureMessage: String,
  },
  { timestamps: true }
);

paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index({ stripePaymentIntentId: 1 });
paymentSchema.index({ stripeInvoiceId: 1 });
paymentSchema.index({ status: 1 });

export default mongoose.model('Payment', paymentSchema);