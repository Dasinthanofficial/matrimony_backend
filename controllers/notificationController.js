import mongoose from 'mongoose';
import Notification from '../models/Notification.js';
import { handleControllerError } from '../utils/errors.js';
import { parsePagination, formatPaginationResponse } from '../utils/pagination.js';

function parseReadQuery(read) {
  if (read === undefined) return undefined;
  const v = String(read).toLowerCase().trim();
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return undefined;
}

export const getNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page, limit, skip } = parsePagination(req.query);
    const { type } = req.query;
    const read = parseReadQuery(req.query.read);

    const filter = { userId };
    if (type) filter.type = type;
    if (read !== undefined) filter.read = read;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ userId, read: false }),
    ]);

    res.json({
      notifications,
      unreadCount,
      pagination: formatPaginationResponse(total, page, limit),
    });
  } catch (e) {
    handleControllerError(res, e, 'Get notifications');
  }
};

export const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user._id;
    const count = await Notification.countDocuments({ userId, read: false });
    res.json({ unreadCount: count });
  } catch (e) {
    handleControllerError(res, e, 'Get unread count');
  }
};

export const markAsRead = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid notification ID' });
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: id, userId },
      { read: true, readAt: new Date() },
      { new: true }
    ).lean();

    if (!notification) return res.status(404).json({ message: 'Notification not found' });

    const unreadCount = await Notification.countDocuments({ userId, read: false });

    res.json({ message: 'Notification marked as read', notification, unreadCount });
  } catch (e) {
    handleControllerError(res, e, 'Mark as read');
  }
};

export const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user._id;

    const result = await Notification.updateMany({ userId, read: false }, { read: true, readAt: new Date() });

    const unreadCount = await Notification.countDocuments({ userId, read: false });

    res.json({
      message: 'All notifications marked as read',
      modifiedCount: result.modifiedCount ?? result.nModified ?? 0,
      unreadCount,
    });
  } catch (e) {
    handleControllerError(res, e, 'Mark all as read');
  }
};

export const deleteNotification = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid notification ID' });
    }

    const deleted = await Notification.findOneAndDelete({ _id: id, userId }).lean();
    if (!deleted) return res.status(404).json({ message: 'Notification not found' });

    const unreadCount = await Notification.countDocuments({ userId, read: false });

    res.json({ message: 'Notification deleted', unreadCount });
  } catch (e) {
    handleControllerError(res, e, 'Delete notification');
  }
};

export const deleteAllNotifications = async (req, res) => {
  try {
    const userId = req.user._id;

    const result = await Notification.deleteMany({ userId });

    res.json({
      message: 'All notifications deleted',
      deletedCount: result.deletedCount ?? 0,
      unreadCount: 0,
    });
  } catch (e) {
    handleControllerError(res, e, 'Delete all notifications');
  }
};

export default {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
};