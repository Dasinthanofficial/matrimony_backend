import mongoose from 'mongoose';

const adminLogSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: {
      type: String,
      enum: [
        'user_suspended',
        'user_unsuspended',
        'user_deleted',
        'profile_approved',
        'profile_rejected',
        'profile_deleted',
        'report_resolved',
        'report_rejected', // ADDED: New action for rejecting reports
        'fake_profile_marked',
        'inappropriate_content_removed',
        'user_warned',
        'feature_toggled',

        // plans
        'plan_created',
        'plan_updated',
        // 'plan_deleted', // REMOVED: Use 'plan_deleted_soft' instead
        'plan_activated',
        'plan_deactivated',
        'plan_deleted_soft',
        'plans_reordered',
      ],
      required: true,
    },
    targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    targetProfileId: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile' },
    reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'Report' },
    reason: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    ipAddress: String,
    userAgent: String,
  },
  { timestamps: true }
);

adminLogSchema.index({ adminId: 1, createdAt: -1 });
adminLogSchema.index({ action: 1, createdAt: -1 });
adminLogSchema.index({ targetUserId: 1 });

export default mongoose.model('AdminLog', adminLogSchema);