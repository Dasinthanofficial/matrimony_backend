// ===== FILE: ./models/Interest.js =====

import mongoose from 'mongoose';
const { Schema } = mongoose;

const interestSchema = new Schema({
  senderId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Sender ID is required'],
  },
  receiverId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Receiver ID is required'],
  },
  senderProfileId: {
    type: Schema.Types.ObjectId,
    ref: 'Profile',
  },
  receiverProfileId: {
    type: Schema.Types.ObjectId,
    ref: 'Profile',
  },
  status: {
    type: String,
    enum: {
      values: ['pending', 'accepted', 'declined', 'blocked', 'withdrawn'],
      message: 'Status must be: pending, accepted, declined, blocked, or withdrawn',
    },
    default: 'pending',
  },
  message: {
    type: String,
    maxlength: [200, 'Message cannot exceed 200 characters'],
    trim: true,
  },
  declineReason: {
    type: String,
    maxlength: [500, 'Decline reason cannot exceed 500 characters'],
    trim: true,
  },

  respondedAt: Date,

  createdAt: { type: Date, default: Date.now },
  updatedAt: Date,
});

// Prevent duplicate interests (compound unique index)
interestSchema.index({ senderId: 1, receiverId: 1 }, { unique: true });

// Indexes for common queries
interestSchema.index({ receiverId: 1, status: 1 });
interestSchema.index({ senderId: 1, status: 1 });
interestSchema.index({ createdAt: -1 });
interestSchema.index({ status: 1, respondedAt: -1 });

// Pre-save middleware
interestSchema.pre('save', function (next) {
  // Prevent self-interest at database level
  if (this.senderId && this.receiverId) {
    if (this.senderId.toString() === this.receiverId.toString()) {
      const error = new Error('Cannot send interest to yourself');
      error.name = 'ValidationError';
      return next(error);
    }
  }

  this.updatedAt = new Date();
  next();
});

// Pre-validate middleware (runs before save)
interestSchema.pre('validate', function (next) {
  // Ensure senderId and receiverId are different
  if (this.senderId && this.receiverId) {
    if (this.senderId.equals(this.receiverId)) {
      this.invalidate('receiverId', 'Cannot send interest to yourself');
    }
  }
  next();
});

// Static method to check if interest exists between two users
interestSchema.statics.existsBetween = async function (userA, userB) {
  const interest = await this.findOne({
    $or: [
      { senderId: userA, receiverId: userB },
      { senderId: userB, receiverId: userA },
    ],
  });
  return interest;
};

// Static method to check if mutual interest (both accepted)
interestSchema.statics.isMutualMatch = async function (userA, userB) {
  const interests = await this.find({
    $or: [
      { senderId: userA, receiverId: userB, status: 'accepted' },
      { senderId: userB, receiverId: userA, status: 'accepted' },
    ],
  });

  // Both directions must be accepted for mutual match
  return interests.length === 2;
};

// Instance method to check if interest can be modified
interestSchema.methods.canBeModifiedBy = function (userId) {
  const userIdStr = userId.toString();
  const isReceiver = this.receiverId.toString() === userIdStr;
  const isSender = this.senderId.toString() === userIdStr;

  return {
    canAccept: isReceiver && this.status === 'pending',
    canDecline: isReceiver && this.status === 'pending',
    canBlock: isReceiver,
    canWithdraw: isSender && this.status === 'pending',
  };
};

// Virtual for age of interest
interestSchema.virtual('ageInDays').get(function () {
  if (!this.createdAt) return 0;
  const now = new Date();
  const diffMs = now - this.createdAt;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
});

// Virtual for response time (if responded)
interestSchema.virtual('responseTimeHours').get(function () {
  if (!this.respondedAt || !this.createdAt) return null;
  const diffMs = this.respondedAt - this.createdAt;
  return Math.round(diffMs / (1000 * 60 * 60));
});

interestSchema.set('toJSON', { virtuals: true });
interestSchema.set('toObject', { virtuals: true });

export default mongoose.model('Interest', interestSchema);