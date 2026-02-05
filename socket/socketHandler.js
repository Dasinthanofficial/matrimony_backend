// ===== FILE: ./socket/socketHandler.js =====

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

  // Authentication middleware
  io.use((socket, next) => {
    try {
      const rawToken =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization ||
        socket.handshake.headers?.Authorization;

      const token = rawToken?.startsWith?.('Bearer ') ? rawToken.slice(7) : rawToken;

      if (!token) {
        return next(new Error('Authentication required'));
      }

      // Validate JWT_SECRET
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        console.error('CRITICAL: JWT_SECRET not configured for socket auth');
        return next(new Error('Server configuration error'));
      }

      const decoded = jwt.verify(token, secret);
      socket.userId = decoded.id;
      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return next(new Error('Token expired'));
      }
      if (error.name === 'JsonWebTokenError') {
        return next(new Error('Invalid token'));
      }
      console.error('Socket auth error:', error.message);
      next(new Error('Authentication failed'));
    }
  });

  // Cleanup orphaned users
  const runCleanup = async () => {
    try {
      const disconnectedUsers = [];

      onlineUsers.forEach((socketId, userIdStr) => {
        const socket = io.sockets.sockets.get(socketId);
        if (!socket || !socket.connected) {
          disconnectedUsers.push(userIdStr);
        }
      });

      // Remove from map and update DB in batch
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

  // Start cleanup interval
  cleanupInterval = setInterval(runCleanup, CLEANUP_INTERVAL);

  // Cleanup function for graceful shutdown
  const cleanup = () => {
    console.log('Socket handler cleanup initiated');

    if (cleanupInterval) {
      clearInterval(cleanupInterval);
      cleanupInterval = null;
    }

    // Mark all users as offline
    const offlinePromises = [];
    onlineUsers.forEach((socketId, userIdStr) => {
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

  // Handle process signals
  process.once('SIGTERM', cleanup);
  process.once('SIGINT', cleanup);

  // Connection handler
  io.on('connection', async (socket) => {
    const userId = socket.userId;

    if (!userId) {
      console.error('Socket connection without userId');
      socket.disconnect(true);
      return;
    }

    // Register user
    onlineUsers.set(userId.toString(), socket.id);

    try {
      await User.findByIdAndUpdate(userId, {
        isOnline: true,
        socketId: socket.id,
        lastActive: new Date(),
      });
    } catch (e) {
      console.error('Error updating user online status:', e.message);
    }

    // Broadcast online status
    socket.broadcast.emit('user_status_change', { userId, isOnline: true });

    // Join conversation room
    socket.on('join_conversation', async (conversationId) => {
      try {
        if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
          return socket.emit('error', { message: 'Invalid conversation ID' });
        }

        const conv = await Conversation.findById(conversationId)
          .select('participants')
          .lean();

        if (!conv) {
          return socket.emit('error', { message: 'Conversation not found' });
        }

        const isParticipant = conv.participants.some(
          (p) => p.toString() === userId.toString()
        );

        if (!isParticipant) {
          return socket.emit('error', { message: 'Not authorized to join this conversation' });
        }

        socket.join(conversationId);
        socket.emit('joined_conversation', { conversationId });
      } catch (e) {
        console.error('join_conversation error:', e.message);
        socket.emit('error', { message: 'Failed to join conversation' });
      }
    });

    // Leave conversation room
    socket.on('leave_conversation', (conversationId) => {
      if (conversationId && mongoose.Types.ObjectId.isValid(conversationId)) {
        socket.leave(conversationId);
      }
    });

    // Send message
    socket.on('send_message', async (data) => {
      try {
        const { conversationId, receiverId, content, messageType, clientId } = data || {};

        const fail = (msg) => socket.emit('message_error', { error: msg, clientId });

        if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) return fail('Invalid conversation ID');
        if (!receiverId || !mongoose.Types.ObjectId.isValid(receiverId)) return fail('Invalid receiver ID');
        if (typeof content !== 'string') return fail('Content must be a string');

        const trimmed = content.trim();
        if (!trimmed) return fail('Message cannot be empty');
        if (trimmed.length > LIMITS.MAX_MESSAGE_LENGTH) {
          return fail(`Message too long (max ${LIMITS.MAX_MESSAGE_LENGTH} characters)`);
        }

        const sender = await User.findById(userId)
          .select('isPremium subscription isSuspended isActive')
          .lean();

        if (!sender) return fail('User not found');
        if (sender.isSuspended) return fail('Account suspended');
        if (sender.isActive === false) return fail('Account inactive');
        if (!hasPremiumAccess(sender)) return fail('Premium subscription required');

        const conversation = await Conversation.findById(conversationId).select(
          'participants isBlocked blockedBy'
        );

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

        // ✅ echo clientId back to sender so UI can replace optimistic temp message
        io.to(conversationId).emit('new_message', {
          ...message.toObject(),
          conversationId,
          clientId,
        });

        const receiverSocketId = onlineUsers.get(receiverId.toString());
        if (receiverSocketId) {
          io.to(receiverSocketId).emit('message_notification', {
            conversationId,
            senderId: userId,
            content: trimmed.substring(0, 100),
          });
        }
      } catch (error) {
        console.error('Send message error:', error.message);
        socket.emit('message_error', { error: 'Failed to send message', clientId: data?.clientId });
      }
    });

    // Typing indicator
    socket.on('typing', ({ conversationId } = {}) => {
      try {
        if (conversationId && mongoose.Types.ObjectId.isValid(conversationId)) {
          socket.to(conversationId).emit('user_typing', { userId, conversationId });
        }
      } catch (error) {
        console.error('Typing event error:', error.message);
      }
    });

    // Stop typing indicator
    socket.on('stop_typing', ({ conversationId } = {}) => {
      try {
        if (conversationId && mongoose.Types.ObjectId.isValid(conversationId)) {
          socket.to(conversationId).emit('user_stop_typing', { userId, conversationId });
        }
      } catch (error) {
        console.error('Stop typing event error:', error.message);
      }
    });

    // Mark messages as read
    socket.on('mark_read', async ({ conversationId }) => {
      try {
        if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
          return socket.emit('error', { message: 'Invalid conversation ID' });
        }

        // Verify user is participant
        const conversation = await Conversation.findOne({
          _id: conversationId,
          participants: userId,
        });

        if (!conversation) {
          return socket.emit('error', { message: 'Conversation not found' });
        }

        // Mark messages as read
        await Message.updateMany(
          { conversationId, receiverId: userId, isRead: false },
          { isRead: true, readAt: new Date() }
        );

        // Reset unread count
        await Conversation.findByIdAndUpdate(conversationId, {
          [`unreadCount.${userId.toString()}`]: 0,
        });

        // Notify other participants
        io.to(conversationId).emit('messages_read', { conversationId, userId });
      } catch (error) {
        console.error('Mark read error:', error.message);
        socket.emit('error', { message: 'Failed to mark as read' });
      }
    });

    // Disconnect handler
    socket.on('disconnect', async () => {
      onlineUsers.delete(userId.toString());

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
    });

    // Error handler for socket
    socket.on('error', (error) => {
      console.error(`Socket error for user ${userId}:`, error.message);
    });
  });

  // Handle io server close
  io.on('close', cleanup);

  // Return cleanup function for external use
  return { cleanup, getOnlineUsers: () => new Map(onlineUsers) };
};

export default socketHandler;