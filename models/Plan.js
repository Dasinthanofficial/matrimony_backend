import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const planSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, unique: true, index: true },

    description: { type: String, default: '' },
    currency: { type: String, default: 'LKR' },

    priceMinor: { type: Number, required: true, default: 0 }, // store minor units
    durationDays: { type: Number, default: 30 }, // 0 = lifetime

    isActive: { type: Boolean, default: true, index: true },

    features: [{ type: String, trim: true }],

    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default model('Plan', planSchema);