// ===== FILE: ./controllers/chatController.js =====
import mongoose from 'mongoose';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import Profile from '../models/Profile.js';
import { hasPremiumAccess } from '../utils/entitlements.js';
import { handleControllerError } from '../utils/errors.js';
import { parsePagination, formatPaginationResponse } from '../utils/pagination.js';
import { LIMITS } from '../utils/constants.js';

const getUnreadForUser = (unreadCount, userId) => {
  if (!unreadCount || !userId) return 0;

  const key = userId.toString();

  // Mongoose Map on non-lean docs
  if (typeof unreadCount?.get === 'function') return Number(unreadCount.get(key) || 0);

  // Lean object
  if (typeof unreadCount === 'object') return Number(unreadCount[key] || 0);

  // If it ever comes as number
  if (typeof unreadCount === 'number') return unreadCount;

  return 0;
};

const pickOtherUserId = (participants = [], me) => {
  const meStr = me?.toString?.();
  const other = participants.find((p) => p?.toString?.() !== meStr);
  return other || null;
};

// Get conversations
export const getConversations = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page, limit, skip } = parsePagination(req.query);

    const [conversations, total] = await Promise.all([
      Conversation.find({ participants: userId })
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Conversation.countDocuments({ participants: userId }),
    ]);

    // Batch fetch profiles for "other" participants (avoids N+1)
    const otherUserIds = conversations
      .map((c) => pickOtherUserId(c.participants, userId))
      .filter(Boolean);

    const uniqueOtherIds = [...new Set(otherUserIds.map((x) => x.toString()))].map(
      (id) => new mongoose.Types.ObjectId(id)
    );

    const profiles = uniqueOtherIds.length
      ? await Profile.find({ userId: { $in: uniqueOtherIds } })
          .select('userId fullName photos photoUrl profileId city country')
          .lean()
      : [];

    const profileByUserId = new Map(profiles.map((p) => [p.userId.toString(), p]));

    const formatted = conversations.map((conv) => {
      const otherUserId = pickOtherUserId(conv.participants, userId);
      const profile = otherUserId ? profileByUserId.get(otherUserId.toString()) : null;

      const unreadForMe = getUnreadForUser(conv.unreadCount, userId);

      return {
        ...conv,
        otherUser: profile || (otherUserId ? { userId: otherUserId } : null),
        unreadCount: unreadForMe, // ✅ keep frontend compatibility (number)
        unreadForMe, // ✅ nicer alias for newer frontend
      };
    });

    res.json({
      conversations: formatted,
      pagination: formatPaginationResponse(total, page, limit),
    });
  } catch (e) {
    handleControllerError(res, e, 'Get conversations');
  }
};

// Get or create conversation
export const getOrCreateConversation = async (req, res) => {
  try {
    const userId = req.user._id;
    const { participantId } = req.params;

    if (!participantId || !mongoose.Types.ObjectId.isValid(participantId)) {
      return res.status(400).json({ message: 'Valid participant ID required' });
    }

    if (participantId.toString() === userId.toString()) {
      return res.status(400).json({ message: 'Cannot create conversation with yourself' });
    }

    let conversation = await Conversation.findOne({
      participants: { $all: [userId, participantId] },
    });

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [userId, participantId],
        unreadCount: new Map([
          [userId.toString(), 0],
          [participantId.toString(), 0],
        ]),
      });
    } else if (!conversation.unreadCount) {
      conversation.unreadCount = new Map([
        [userId.toString(), 0],
        [participantId.toString(), 0],
      ]);
      await conversation.save();
    }

    const profile = await Profile.findOne({ userId: participantId })
      .select('userId fullName photos photoUrl profileId city country')
      .lean();

    res.json({
      conversation: {
        ...conversation.toObject(),
        otherUser: profile || { userId: participantId },
        unreadCount: getUnreadForUser(conversation.unreadCount, userId),
        unreadForMe: getUnreadForUser(conversation.unreadCount, userId),
      },
    });
  } catch (e) {
    handleControllerError(res, e, 'Get/create conversation');
  }
};

// Get single conversation
export const getConversation = async (req, res) => {
  try {
    const userId = req.user._id;
    const { conversationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: 'Invalid conversationId' });
    }

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
    });

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    const otherUserId = pickOtherUserId(conversation.participants, userId);

    const profile = otherUserId
      ? await Profile.findOne({ userId: otherUserId })
          .select('userId fullName photos photoUrl profileId city country')
          .lean()
      : null;

    res.json({
      conversation: {
        ...conversation.toObject(),
        otherUser: profile || (otherUserId ? { userId: otherUserId } : null),
        unreadCount: getUnreadForUser(conversation.unreadCount, userId),
        unreadForMe: getUnreadForUser(conversation.unreadCount, userId),
      },
    });
  } catch (e) {
    handleControllerError(res, e, 'Get conversation');
  }
};

// Get messages
export const getMessages = async (req, res) => {
  try {
    const userId = req.user._id;
    const { conversationId } = req.params;
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50 });

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: 'Invalid conversationId' });
    }

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
    });

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    const [messages, total] = await Promise.all([
      Message.find({ conversationId, isDeleted: false })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Message.countDocuments({ conversationId, isDeleted: false }),
    ]);

    res.json({
      messages: messages.reverse(),
      pagination: formatPaginationResponse(total, page, limit),
    });
  } catch (e) {
    handleControllerError(res, e, 'Get messages');
  }
};

// Send message (HTTP fallback; your frontend can be socket-only)
export const sendMessage = async (req, res) => {
  try {
    const userId = req.user._id;
    const { conversationId, receiverId, content, messageType = 'text' } = req.body;

    const trimmed = typeof content === 'string' ? content.trim() : '';
    if (!trimmed) return res.status(400).json({ message: 'Content is required' });
    if (trimmed.length > LIMITS.MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        message: `Message too long (max ${LIMITS.MAX_MESSAGE_LENGTH} characters)`,
      });
    }

    if (!hasPremiumAccess(req.user)) {
      return res.status(403).json({ message: 'Premium subscription required', code: 'PREMIUM_REQUIRED' });
    }

    let conversation;

    if (conversationId) {
      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        return res.status(400).json({ message: 'Invalid conversationId' });
      }

      conversation = await Conversation.findOne({ _id: conversationId, participants: userId });
    } else {
      if (!receiverId || !mongoose.Types.ObjectId.isValid(receiverId)) {
        return res.status(400).json({ message: 'Valid receiverId required' });
      }
      if (receiverId.toString() === userId.toString()) {
        return res.status(400).json({ message: 'Cannot message yourself' });
      }

      conversation = await Conversation.findOne({
        participants: { $all: [userId, receiverId] },
      });

      if (!conversation) {
        conversation = await Conversation.create({ participants: [userId, receiverId] });
      }
    }

    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
    if (conversation.isBlocked) return res.status(403).json({ message: 'Conversation is blocked' });

    const actualReceiverId = pickOtherUserId(conversation.participants, userId);

    const message = await Message.create({
      conversationId: conversation._id,
      senderId: userId,
      receiverId: actualReceiverId,
      content: trimmed,
      messageType,
    });

    conversation.lastMessage = {
      content: trimmed,
      senderId: userId,
      timestamp: new Date(),
      messageType,
    };

    if (!conversation.unreadCount) conversation.unreadCount = new Map();
    const curr = conversation.unreadCount.get(actualReceiverId.toString()) || 0;
    conversation.unreadCount.set(actualReceiverId.toString(), curr + 1);

    await conversation.save();

    res.status(201).json({ message });
  } catch (e) {
    handleControllerError(res, e, 'Send message');
  }
};

// Mark as read
export const markAsRead = async (req, res) => {
  try {
    const userId = req.user._id;
    const { conversationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: 'Invalid conversationId' });
    }

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
    });

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    await Message.updateMany(
      { conversationId, receiverId: userId, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    // ✅ works whether unreadCount exists or not
    await Conversation.updateOne(
      { _id: conversationId, participants: userId },
      { $set: { [`unreadCount.${userId.toString()}`]: 0 } }
    );

    res.json({ message: 'Marked as read' });
  } catch (e) {
    handleControllerError(res, e, 'Mark as read');
  }
};

// Delete message
export const deleteMessage = async (req, res) => {
  try {
    const userId = req.user._id;
    const { messageId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ message: 'Invalid messageId' });
    }

    const message = await Message.findOne({ _id: messageId, senderId: userId });
    if (!message) return res.status(404).json({ message: 'Message not found' });

    message.isDeleted = true;
    message.deletedAt = new Date();
    await message.save();

    res.json({ message: 'Message deleted' });
  } catch (e) {
    handleControllerError(res, e, 'Delete message');
  }
};

// Delete conversation
export const deleteConversation = async (req, res) => {
  try {
    const userId = req.user._id;
    const { conversationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: 'Invalid conversationId' });
    }

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
    });

    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

    await Message.updateMany({ conversationId }, { isDeleted: true, deletedAt: new Date() });
    await conversation.deleteOne();

    res.json({ message: 'Conversation deleted' });
  } catch (e) {
    handleControllerError(res, e, 'Delete conversation');
  }
};

// Get unread count (total)
export const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user._id;

    const conversations = await Conversation.find({ participants: userId }).select('unreadCount').lean();

    let total = 0;
    for (const conv of conversations) {
      total += getUnreadForUser(conv.unreadCount, userId);
    }

    res.json({ unreadCount: total });
  } catch (e) {
    handleControllerError(res, e, 'Get unread count');
  }
};

// Block user
export const blockUser = async (req, res) => {
  try {
    const userId = req.user._id;
    const { userId: targetUserId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    const conversation = await Conversation.findOne({
      participants: { $all: [userId, targetUserId] },
    });

    if (conversation) {
      conversation.isBlocked = true;
      conversation.blockedBy = userId;
      await conversation.save();
    }

    res.json({ message: 'User blocked' });
  } catch (e) {
    handleControllerError(res, e, 'Block user');
  }
};

// Unblock user
export const unblockUser = async (req, res) => {
  try {
    const userId = req.user._id;
    const { userId: targetUserId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    const conversation = await Conversation.findOne({
      participants: { $all: [userId, targetUserId] },
      blockedBy: userId,
    });

    if (conversation) {
      conversation.isBlocked = false;
      conversation.blockedBy = undefined;
      await conversation.save();
    }

    res.json({ message: 'User unblocked' });
  } catch (e) {
    handleControllerError(res, e, 'Unblock user');
  }
};

// Get blocked users
export const getBlockedUsers = async (req, res) => {
  try {
    const userId = req.user._id;

    const conversations = await Conversation.find({
      participants: userId,
      isBlocked: true,
      blockedBy: userId,
    });

    const blockedUserIds = conversations
      .map((conv) => pickOtherUserId(conv.participants, userId))
      .filter(Boolean);

    const profiles = await Profile.find({ userId: { $in: blockedUserIds } })
      .select('fullName photos photoUrl profileId userId')
      .lean();

    res.json({ blockedUsers: profiles });
  } catch (e) {
    handleControllerError(res, e, 'Get blocked users');
  }
};