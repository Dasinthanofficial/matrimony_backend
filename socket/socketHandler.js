// ===== FIXED FILE: ./socket/socketHandler.js =====
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import { hasPremiumAccess } from '../utils/entitlements.js';
import { LIMITS, CLEANUP_INTERVAL } from '../utils/constants.js';

const socketHandler = (io) => {
  const onlineUsers = new Map();
  let cleanupInterval = null;

  const addSocket = (userIdStr, socketId) => {
    const set = onlineUsers.get(userIdStr) || new Set();
    set.add(socketId);
    onlineUsers.set(userIdStr, set);
    return set.size;
  };

  const removeSocket = (userIdStr, socketId) => {
    const set = onlineUsers.get(userIdStr);
    if (!set) return 0;
    set.delete(socketId);
    if (set.size === 0) onlineUsers.delete(userIdStr);
    return set.size;
  };

  io.use(async (socket, next) => {
    try {
      const rawToken =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization ||
        socket.handshake.headers?.Authorization;

      const token = rawToken?.startsWith?.('Bearer ') ? rawToken.slice(7) : rawToken;
      if (!token) return next(new Error('Authentication required'));

      const secret = process.env.JWT_SECRET;
      if (!secret) {
        console.error('CRITICAL: JWT_SECRET not configured for socket auth');
        return next(new Error('Server configuration error'));
      }

      const decoded = jwt.verify(token, secret);

      const user = await User.findById(decoded.id).select('isSuspended isActive').lean();
      if (!user) return next(new Error('User not found'));
      if (user.isSuspended) return next(new Error('Account suspended'));
      if (user.isActive === false) return next(new Error('Account inactive'));

      socket.userId = decoded.id;
      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') return next(new Error('Token expired'));
      if (error.name === 'JsonWebTokenError') return next(new Error('Invalid token'));
      console.error('Socket auth error:', error.message);
      next(new Error('Authentication failed'));
    }
  });

  const runCleanup = async () => {
    try {
      const disconnectedUsers = [];

      onlineUsers.forEach((set, userIdStr) => {
        const alive = new Set();
        set.forEach((socketId) => {
          const s = io.sockets.sockets.get(socketId);
          if (s && s.connected) alive.add(socketId);
        });

        if (alive.size === 0) {
          disconnectedUsers.push(userIdStr);
        } else {
          onlineUsers.set(userIdStr, alive);
        }
      });

      for (const userIdStr of disconnectedUsers) {
        onlineUsers.delete(userIdStr);
        try {
          await User.findByIdAndUpdate(userIdStr, {
            isOnline: false,
            lastActive: new Date(),
            socketId: null,
          });
        } catch (e) {
          console.error(`Cleanup update error for user ${userIdStr}:`, e.message);
        }
      }

      if (disconnectedUsers.length > 0) {
        console.log(`Cleaned up ${disconnectedUsers.length} orphaned connections`);
      }
    } catch (error) {
      console.error('Cleanup error:', error.message);
    }
  };

  cleanupInterval = setInterval(runCleanup, CLEANUP_INTERVAL);

  const cleanup = () => {
    console.log('Socket handler cleanup initiated');

    if (cleanupInterval) {
      clearInterval(cleanupInterval);
      cleanupInterval = null;
    }

    const offlinePromises = [];
    onlineUsers.forEach((_set, userIdStr) => {
      offlinePromises.push(
        User.findByIdAndUpdate(userIdStr, {
          isOnline: false,
          lastActive: new Date(),
          socketId: null,
        }).catch((e) => console.error(`Shutdown cleanup error for ${userIdStr}:`, e.message))
      );
    });

    Promise.all(offlinePromises).then(() => {
      onlineUsers.clear();
      console.log('Socket handler cleanup completed');
    });
  };

  // ✅ FIX: Removed process.once('SIGTERM/SIGINT') — server.js manages lifecycle

  io.on('connection', async (socket) => {
    const userId = socket.userId;

    if (!userId) {
      console.error('Socket connection without userId');
      socket.disconnect(true);
      return;
    }

    const userIdStr = userId.toString();
    const wasOnline = onlineUsers.has(userIdStr);

    addSocket(userIdStr, socket.id);

    try {
      await User.findByIdAndUpdate(userId, {
        isOnline: true,
        lastActive: new Date(),
      });
    } catch (e) {
      console.error('Error updating user online status:', e.message);
    }

    if (!wasOnline) {
      socket.broadcast.emit('user_status_change', { userId, isOnline: true });
    }

    socket.on('join_conversation', async (conversationId) => {
      try {
        if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
          return socket.emit('error', { message: 'Invalid conversation ID' });
        }

        const conv = await Conversation.findById(conversationId).select('participants').lean();
        if (!conv) return socket.emit('error', { message: 'Conversation not found' });

        const isParticipant = conv.participants.some((p) => p.toString() === userId.toString());
        if (!isParticipant) return socket.emit('error', { message: 'Not authorized to join this conversation' });

        socket.join(conversationId);
        socket.emit('joined_conversation', { conversationId });
      } catch (e) {
        console.error('join_conversation error:', e.message);
        socket.emit('error', { message: 'Failed to join conversation' });
      }
    });

    socket.on('leave_conversation', (conversationId) => {
      if (conversationId && mongoose.Types.ObjectId.isValid(conversationId)) {
        socket.leave(conversationId);
      }
    });

    socket.on('send_message', async (data) => {
      try {
        const { conversationId, receiverId, content, messageType, clientId } = data || {};
        const fail = (msg) => socket.emit('message_error', { error: msg, clientId });

        if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) return fail('Invalid conversation ID');
        if (!receiverId || !mongoose.Types.ObjectId.isValid(receiverId)) return fail('Invalid receiver ID');
        if (typeof content !== 'string') return fail('Content must be a string');

        const trimmed = content.trim();
        if (!trimmed) return fail('Message cannot be empty');
        if (trimmed.length > LIMITS.MAX_MESSAGE_LENGTH) return fail(`Message too long (max ${LIMITS.MAX_MESSAGE_LENGTH} characters)`);

        const sender = await User.findById(userId).select('isPremium subscription isSuspended isActive premiumExpiry').lean();
        if (!sender) return fail('User not found');
        if (sender.isSuspended) return fail('Account suspended');
        if (sender.isActive === false) return fail('Account inactive');
        if (!hasPremiumAccess(sender)) return fail('Premium subscription required');

        // ✅ FIX: Validate receiver status
        const receiver = await User.findById(receiverId).select('isSuspended isActive').lean();
        if (!receiver) return fail('Receiver not found');
        if (receiver.isSuspended || receiver.isActive === false) return fail('Cannot message this user');

        const conversation = await Conversation.findById(conversationId).select('participants isBlocked blockedBy');
        if (!conversation) return fail('Conversation not found');
        if (conversation.isBlocked) return fail('Conversation is blocked');

        const senderOk = conversation.participants.some((p) => p.toString() === userId.toString());
        const receiverOk = conversation.participants.some((p) => p.toString() === receiverId.toString());
        if (!senderOk || !receiverOk) return fail('Not authorized');

        const message = await Message.create({
          conversationId,
          senderId: userId,
          receiverId,
          content: trimmed,
          messageType: messageType || 'text',
        });

        await Conversation.findByIdAndUpdate(conversationId, {
          lastMessage: { content: trimmed, senderId: userId, timestamp: new Date() },
          updatedAt: new Date(),
          $inc: { [`unreadCount.${receiverId.toString()}`]: 1 },
        });

        io.to(conversationId).emit('new_message', { ...message.toObject(), conversationId, clientId });

        const receiverSockets = onlineUsers.get(receiverId.toString());
        if (receiverSockets) {
          for (const sid of receiverSockets) {
            io.to(sid).emit('message_notification', {
              conversationId,
              senderId: userId,
              content: trimmed.substring(0, 100),
            });
          }
        }
      } catch (error) {
        console.error('Send message error:', error.message);
        socket.emit('message_error', { error: 'Failed to send message', clientId: data?.clientId });
      }
    });

    socket.on('typing', ({ conversationId } = {}) => {
      if (conversationId && mongoose.Types.ObjectId.isValid(conversationId)) {
        socket.to(conversationId).emit('user_typing', { userId, conversationId });
      }
    });

    socket.on('stop_typing', ({ conversationId } = {}) => {
      if (conversationId && mongoose.Types.ObjectId.isValid(conversationId)) {
        socket.to(conversationId).emit('user_stop_typing', { userId, conversationId });
      }
    });

    socket.on('mark_read', async ({ conversationId }) => {
      try {
        if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
          return socket.emit('error', { message: 'Invalid conversation ID' });
        }

        const conversation = await Conversation.findOne({ _id: conversationId, participants: userId });
        if (!conversation) return socket.emit('error', { message: 'Conversation not found' });

        await Message.updateMany(
          { conversationId, receiverId: userId, isRead: false },
          { isRead: true, readAt: new Date() }
        );

        await Conversation.findByIdAndUpdate(conversationId, {
          [`unreadCount.${userId.toString()}`]: 0,
        });

        io.to(conversationId).emit('messages_read', { conversationId, userId });
      } catch (error) {
        console.error('Mark read error:', error.message);
        socket.emit('error', { message: 'Failed to mark as read' });
      }
    });

    socket.on('disconnect', async () => {
      const remaining = removeSocket(userIdStr, socket.id);

      if (remaining === 0) {
        try {
          await User.findByIdAndUpdate(userId, {
            isOnline: false,
            lastActive: new Date(),
            socketId: null,
          });
        } catch (e) {
          console.error('Error updating user offline status:', e.message);
        }
        socket.broadcast.emit('user_status_change', { userId, isOnline: false });
      }
    });

    socket.on('error', (error) => {
      console.error(`Socket error for user ${userId}:`, error.message);
    });
  });

  io.on('close', cleanup);

  return {
    cleanup,
    getOnlineUsers: () => new Map([...onlineUsers].map(([k, v]) => [k, new Set(v)])),
  };
};

export default socketHandler;