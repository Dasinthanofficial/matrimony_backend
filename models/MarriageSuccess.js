// ===== FILE: ./models/MarriageSuccess.js =====
import mongoose from 'mongoose';

const { Schema } = mongoose;

const MarriageSuccessSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    userProfileId: { type: Schema.Types.ObjectId, ref: 'Profile' },

    agencyId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    agencyProfileId: { type: Schema.Types.ObjectId, ref: 'Profile' },

    successFee: { type: Number, required: true, default: 0 },
    currency: { type: String, default: 'LKR' },

    adminAmount: { type: Number, default: 0 },
    agencyAmount: { type: Number, default: 0 },

    status: { type: String, default: 'pending' },
    agencyPayoutReference: { type: String },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export default mongoose.model('MarriageSuccess', MarriageSuccessSchema);