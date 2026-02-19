// ===== FILE: ./models/Conversation.js =====
import mongoose from 'mongoose';
const { Schema } = mongoose;

const conversationSchema = new Schema({
  participants: [
    {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  ],
  lastMessage: {
    content: String,
    senderId: { type: Schema.Types.ObjectId, ref: 'User' },
    timestamp: Date,
    messageType: { type: String, default: 'text' },
  },
  unreadCount: {
    type: Map,
    of: Number,
    default: new Map(),
  },
  isBlocked: { type: Boolean, default: false },
  blockedBy: { type: Schema.Types.ObjectId, ref: 'User' },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }, // ✅ ensure it exists for sorting
});

conversationSchema.index({ participants: 1 });
conversationSchema.index({ updatedAt: -1 });

conversationSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.model('Conversation', conversationSchema);