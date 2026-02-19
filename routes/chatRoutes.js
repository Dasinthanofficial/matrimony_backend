// ===== FILE: ./routes/chatRoutes.js =====
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  getConversations,
  getOrCreateConversation,  // ✅ Correct
  getConversation,
  getMessages,
  sendMessage,
  markAsRead,
  deleteMessage,
  deleteConversation,
  getUnreadCount,
  blockUser,
  unblockUser,
  getBlockedUsers,
} from '../controllers/chatController.js';

const router = express.Router();

// Get all conversations
router.get('/', protect, getConversations);

// Get unread count
router.get('/unread-count', protect, getUnreadCount);

// Get blocked users
router.get('/blocked', protect, getBlockedUsers);

// Get or create conversation with a user
router.get('/with/:participantId', protect, getOrCreateConversation);

// Get single conversation
router.get('/:conversationId', protect, getConversation);

// Get messages in a conversation
router.get('/:conversationId/messages', protect, getMessages);

// Send message
router.post('/message', protect, sendMessage);

// Delete message
router.delete('/message/:messageId', protect, deleteMessage);

// Mark conversation as read
router.put('/:conversationId/read', protect, markAsRead);

// Delete conversation
router.delete('/:conversationId', protect, deleteConversation);

// Block/Unblock
router.post('/block/:userId', protect, blockUser);
router.post('/unblock/:userId', protect, unblockUser);

export default router;