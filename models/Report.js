import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema(
  {
    reportedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reportedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reportType: {
      type: String,
      enum: [
        'fake_profile','inappropriate_behavior','harassment','inappropriate_content',
        'scam','offensive_language','other',
      ],
      required: true,
    },
    description: { type: String, required: true, maxlength: 500 },
    evidence: { type: [String], default: [] },
    status: {
      type: String,
      enum: ['pending','under_review','resolved','rejected','dismissed'],
      default: 'pending',
    },
    resolutionNote: String,
    action: { type: String, enum: ['none','warning','suspension','deletion'], default: 'none' },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: Date,
  },
  { timestamps: true }
);

reportSchema.index({ reportedUserId: 1, status: 1 });
reportSchema.index({ reportedByUserId: 1 });
reportSchema.index({ reportType: 1 });
reportSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('Report', reportSchema);