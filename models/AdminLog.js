// server/models/AdminLog.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const adminLogSchema = new Schema(
  {
    // Backward compatible: keep adminId for admin actions, but NOT required (so user/system events can be logged)
    adminId: { type: Schema.Types.ObjectId, ref: 'User', required: false, default: null },

    // NEW: who performed the action
    actorType: {
      type: String,
      enum: ['admin', 'user', 'system'],
      required: true,
      default: 'admin',
    },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: false, default: null },
    actorRole: { type: String, default: null },

    action: {
      type: String,
      enum: [
        // user lifecycle/auth (NEW)
        'account_created',
        'user_login',
        'user_logout',
        'account_deleted_self',

        // admin user actions
        'user_suspended',
        'user_unsuspended',
        'user_deleted',
        'user_role_changed',

        // agency review
        'agency_approved',
        'agency_rejected',

        // profile
        'profile_approved',
        'profile_rejected',
        'profile_deleted',

        // reports/moderation
        'report_resolved',
        'report_rejected',
        'fake_profile_marked',
        'inappropriate_content_removed',
        'user_warned',
        'feature_toggled',

        // plans
        'plan_created',
        'plan_updated',
        'plan_activated',
        'plan_deactivated',
        'plan_deleted_soft',
        'plans_reordered',
      ],
      required: true,
    },

    targetUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    targetProfileId: { type: Schema.Types.ObjectId, ref: 'Profile', default: null },
    reportId: { type: Schema.Types.ObjectId, ref: 'Report', default: null },

    reason: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },

    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { timestamps: true }
);

adminLogSchema.index({ createdAt: -1 });
adminLogSchema.index({ action: 1, createdAt: -1 });
adminLogSchema.index({ adminId: 1, createdAt: -1 });
adminLogSchema.index({ actorType: 1, actorId: 1, createdAt: -1 });
adminLogSchema.index({ targetUserId: 1, createdAt: -1 });

export default mongoose.model('AdminLog', adminLogSchema);