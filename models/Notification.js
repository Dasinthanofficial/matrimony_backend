// ===== FILE: ./models/Notification.js =====
import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'interest_received',
        'interest_accepted',
        'interest_declined',
        'new_message',
        'profile_view',
        'match',
        'subscription',
        'system',
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 100,
    },
    message: {
      type: String,
      required: true,
      maxlength: 500,
    },
    read: {
      type: Boolean,
      default: false,
    },
    readAt: Date,
    
    // Related entity references
    relatedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    relatedProfileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Profile',
    },
    relatedInterestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Interest',
    },
    relatedConversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
    },
    
    // Action URL
    actionUrl: String,
    
    // Extra data
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
notificationSchema.index({ userId: 1, read: 1 });
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ type: 1 });

// Auto-delete old notifications (optional - run via cron)
notificationSchema.statics.cleanOldNotifications = async function (daysOld = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  return this.deleteMany({
    createdAt: { $lt: cutoffDate },
    read: true,
  });
};

export default mongoose.model('Notification', notificationSchema);