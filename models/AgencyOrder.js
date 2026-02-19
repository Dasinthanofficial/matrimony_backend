// server/models/AgencyOrder.js
import mongoose from 'mongoose';

const AgencyOrderSchema = new mongoose.Schema(
  {
    buyerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgencyService', required: true, index: true },

    amount: { type: Number, required: true }, // major units (e.g., 2500)
    amountMinor: { type: Number, required: true }, // minor units (e.g., 250000)
    currency: { type: String, required: true, default: 'LKR' },

    payhereOrderId: { type: String, required: true, unique: true, index: true },
    paymentStatus: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending', index: true },

    status: {
      type: String,
      enum: ['pending_payment', 'paid', 'accepted', 'completed', 'cancelled'],
      default: 'pending_payment',
      index: true,
    },

    // audit fields from PayHere notifications
    payhere: { type: Object, default: {} },
  },
  { timestamps: true }
);

export default mongoose.model('AgencyOrder', AgencyOrderSchema);