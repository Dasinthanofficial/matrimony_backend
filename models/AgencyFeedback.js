import mongoose from 'mongoose';

const { Schema } = mongoose;

const AgencyFeedbackSchema = new Schema(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: '', trim: true, maxlength: 1000 },

    status: { type: String, enum: ['published', 'hidden'], default: 'published', index: true },
  },
  { timestamps: true }
);

// one feedback per user per agency
AgencyFeedbackSchema.index({ agencyId: 1, userId: 1 }, { unique: true });

export default mongoose.model('AgencyFeedback', AgencyFeedbackSchema);