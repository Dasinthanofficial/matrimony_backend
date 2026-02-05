// ===== FILE: ./routes/notificationRoutes.js =====
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

// Get all notifications
router.get('/', protect, getNotifications);

// Get unread count
router.get('/unread-count', protect, getUnreadCount);

// Mark single notification as read
router.put('/:id/read', protect, markAsRead);

// Mark all as read
router.put('/read-all', protect, markAllAsRead);

// Delete single notification
router.delete('/:id', protect, deleteNotification);

// Delete all notifications
router.delete('/', protect, deleteAllNotifications);

export default router;