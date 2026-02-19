// ===== FILE: ./models/Agency.js =====
import mongoose from 'mongoose';
const { Schema } = mongoose;

const agencySchema = new Schema(
  {
    ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },

    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },

    stripeAccountId: { type: String, default: null, index: true },
    stripeOnboarding: {
      completed: { type: Boolean, default: false },
      lastLinkCreatedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

export default mongoose.model('Agency', agencySchema);