import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const agencyProfileAccessSchema = new Schema(
  {
    profileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true, index: true },
    agencyId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    buyerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    amount: { type: Number, required: true },
    currency: { type: String, default: 'LKR' },

    paymentStatus: { type: String, default: 'pending' }, // pending | succeeded | failed
    status: { type: String, default: 'pending' }, // pending | accepted | completed | cancelled

    payhereOrderId: { type: String },
  },
  { timestamps: true }
);

agencyProfileAccessSchema.index({ profileId: 1, buyerUserId: 1 });

export default model('AgencyProfileAccess', agencyProfileAccessSchema);