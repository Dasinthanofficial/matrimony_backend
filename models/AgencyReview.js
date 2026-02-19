import mongoose from 'mongoose';

const agencyReviewSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, trim: true, maxlength: 120 },
    comment: { type: String, trim: true, maxlength: 2000 },

    status: { type: String, enum: ['published', 'hidden', 'pending'], default: 'published', index: true },
  },
  { timestamps: true }
);

agencyReviewSchema.index({ agencyId: 1, userId: 1 }, { unique: true });

export default mongoose.model('AgencyReview', agencyReviewSchema);