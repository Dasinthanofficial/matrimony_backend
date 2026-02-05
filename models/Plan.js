import mongoose from 'mongoose';

const PlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: '' },

    // multi-currency
    price: { type: Object, required: true },         // ex: { INR: 999, USD: 12 }
    discountPrice: { type: Object, default: undefined },

    duration: {
      value: { type: Number, required: true },
      unit: { type: String, required: true, enum: ['days', 'months', 'years'] },
    },

    features: { type: Object, default: {} },

    recommended: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model('Plan', PlanSchema);