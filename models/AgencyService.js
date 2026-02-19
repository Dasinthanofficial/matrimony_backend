// ===== FILE: ./models/AgencyService.js =====
import mongoose from 'mongoose';

const { Schema } = mongoose;

const agencyServiceSchema = new Schema(
  {
    // IMPORTANT: this stores Agency._id (not agency user's _id)
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },

    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },

    price: { type: Number, required: true, min: 0 },

    // computed before save (and can also be set by controller)
    priceMinor: { type: Number, default: 0, min: 0 },

    currency: { type: String, default: 'LKR', uppercase: true, trim: true },

    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

// Compute priceMinor if needed
agencyServiceSchema.pre('save', function (next) {
  const priceChanged = this.isModified('price');
  const priceMinorMissing = typeof this.priceMinor !== 'number';

  if (priceChanged || priceMinorMissing) {
    this.priceMinor = Math.round((Number(this.price) || 0) * 100);
  }

  next();
});

export default mongoose.model('AgencyService', agencyServiceSchema);