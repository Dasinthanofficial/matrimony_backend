import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
} from '../controllers/notificationController.js';

const router = express.Router();

/**
 * Ordering + aliases
 * - Put specific routes before id routes
 * - Support both PUT and PATCH (helps if some clients use PATCH)
 */

// Get unread count
router.get('/unread-count', protect, getUnreadCount);

// Mark all as read
router.put('/read-all', protect, markAllAsRead);
router.patch('/read-all', protect, markAllAsRead);

// Mark single notification as read
router.put('/:id/read', protect, markAsRead);
router.patch('/:id/read', protect, markAsRead);

// Get all notifications
router.get('/', protect, getNotifications);

// Delete all notifications
router.delete('/', protect, deleteAllNotifications);

// Delete single notification
router.delete('/:id', protect, deleteNotification);

export default router;