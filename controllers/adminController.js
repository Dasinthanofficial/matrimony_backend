// ===== FIXED FILE: ./controllers/adminController.js =====
import mongoose from 'mongoose';
import User from '../models/User.js';
import Profile from '../models/Profile.js';
import Report from '../models/Report.js';
import AdminLog from '../models/AdminLog.js';
import Interest from '../models/Interest.js'; // ✅ FIX: Added for cleanup
import Shortlist from '../models/Shortlist.js'; // ✅ FIX: Added for cleanup
import Notification from '../models/Notification.js'; // ✅ FIX: Added for cleanup
import Message from '../models/Message.js'; // ✅ FIX: Added for cleanup
import Conversation from '../models/Conversation.js'; // ✅ FIX: Added for cleanup
import Subscription from '../models/Subscription.js'; // ✅ FIX: Added for cleanup
import Payment from '../models/Payment.js'; // ✅ FIX: Added for cleanup
import { handleControllerError } from '../utils/errors.js';
import { parsePagination, formatPaginationResponse } from '../utils/pagination.js';

const escapeRegex = (s = '') => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const logAdminAction = async (req, adminId, action, targetUserId, reason, metadata = {}) => {
  try {
    await AdminLog.create({
      adminId,
      action,
      targetUserId,
      reason: reason || null,
      metadata,
      ipAddress: req?.ip,
      userAgent: req?.get?.('user-agent'),
    });
  } catch (e) {
    console.error('Error logging admin action:', e.message);
  }
};

// ✅ FIX: Extracted shared cleanup helper for user deletion
const cleanupUserData = async (userId, session) => {
  await Profile.deleteOne({ userId }).session(session);
  await Interest.deleteMany({
    $or: [{ senderId: userId }, { receiverId: userId }],
  }).session(session);
  await Shortlist.deleteMany({
    $or: [{ userId }, { shortlistedUserId: userId }],
  }).session(session);
  await Notification.deleteMany({ userId }).session(session);
  await Message.updateMany(
    { $or: [{ senderId: userId }, { receiverId: userId }] },
    { isDeleted: true, deletedAt: new Date() }
  ).session(session);
  await Subscription.deleteOne({ userId }).session(session);
  await Payment.deleteMany({ userId }).session(session);

  const userConversations = await Conversation.find({ participants: userId })
    .select('_id')
    .session(session);
  for (const conv of userConversations) {
    await Message.updateMany(
      { conversationId: conv._id },
      { isDeleted: true, deletedAt: new Date() }
    ).session(session);
  }
  await Conversation.deleteMany({ participants: userId }).session(session);

  await User.findByIdAndDelete(userId).session(session);
};

export const getAllUsers = async (req, res) => {
  try {
    const { status = 'all', search = '' } = req.query;
    const { page, limit, skip } = parsePagination(req.query);

    const filter = {};
    if (status === 'active') {
      filter.isActive = true;
      filter.isSuspended = false;
    }
    if (status === 'suspended') {
      filter.isSuspended = true;
    }
    if (search) {
      const q = escapeRegex(String(search).slice(0, 50));
      filter.$or = [{ email: new RegExp(q, 'i') }, { phone: new RegExp(q, 'i') }];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('email phone createdAt isActive isSuspended isEmailVerified isPhoneVerified role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    res.json({
      users,
      pagination: formatPaginationResponse(total, page, limit),
    });
  } catch (e) {
    handleControllerError(res, e, 'Get all users');
  }
};

export const getUserDetail = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid userId' });
    }

    const user = await User.findById(userId).select(
      '-password -refreshToken -emailVerificationToken -phoneOTP'
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const profile = await Profile.findOne({ userId });

    res.json({ user, profile });
  } catch (e) {
    handleControllerError(res, e, 'Get user detail');
  }
};

export const suspendUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason = '' } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid userId' });
    }

    if (userId === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot suspend yourself' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      {
        isSuspended: true,
        suspensionReason: reason,
        suspensionDate: new Date(),
      },
      { new: true }
    ).select('-password -refreshToken');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await logAdminAction(req, req.user._id, 'user_suspended', userId, reason);

    res.json({ message: 'User suspended successfully', user });
  } catch (e) {
    handleControllerError(res, e, 'Suspend user');
  }
};

export const unsuspendUser = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid userId' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      {
        isSuspended: false,
        suspensionReason: null,
        suspensionDate: null,
      },
      { new: true }
    ).select('-password -refreshToken');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await logAdminAction(req, req.user._id, 'user_unsuspended', userId);

    res.json({ message: 'User unsuspended successfully', user });
  } catch (e) {
    handleControllerError(res, e, 'Unsuspend user');
  }
};

// ✅ FIX: Full cleanup on deleteUser
export const deleteUser = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId } = req.params;
    const { reason = '' } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Invalid userId' });
    }

    if (userId === req.user._id.toString()) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Cannot delete yourself' });
    }

    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'User not found' });
    }

    await cleanupUserData(userId, session);

    await session.commitTransaction();

    await logAdminAction(req, req.user._id, 'user_deleted', userId, reason);

    res.json({ message: 'User and all associated data deleted successfully' });
  } catch (e) {
    await session.abortTransaction();
    handleControllerError(res, e, 'Delete user');
  } finally {
    session.endSession();
  }
};

export const approveProfile = async (req, res) => {
  try {
    const { profileId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(profileId)) {
      return res.status(400).json({ message: 'Invalid profileId' });
    }

    const profile = await Profile.findByIdAndUpdate(
      profileId,
      {
        isApproved: true,
        approvedAt: new Date(),
        rejectionReason: null,
        rejectionDate: null,
      },
      { new: true }
    );

    if (!profile) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    await logAdminAction(req, req.user._id, 'profile_approved', profile.userId);

    res.json({ message: 'Profile approved successfully', profile });
  } catch (e) {
    handleControllerError(res, e, 'Approve profile');
  }
};

export const rejectProfile = async (req, res) => {
  try {
    const { profileId } = req.params;
    const { reason = '' } = req.body;

    if (!mongoose.Types.ObjectId.isValid(profileId)) {
      return res.status(400).json({ message: 'Invalid profileId' });
    }

    const profile = await Profile.findByIdAndUpdate(
      profileId,
      {
        isApproved: false,
        rejectionReason: reason,
        rejectionDate: new Date(),
      },
      { new: true }
    );

    if (!profile) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    await logAdminAction(req, req.user._id, 'profile_rejected', profile.userId, reason);

    res.json({ message: 'Profile rejected successfully', profile });
  } catch (e) {
    handleControllerError(res, e, 'Reject profile');
  }
};

export const getAllReports = async (req, res) => {
  try {
    const { status = 'pending', reportType = 'all' } = req.query;
    const { page, limit, skip } = parsePagination(req.query);

    const filter = {};
    if (status !== 'all') filter.status = status;
    if (reportType !== 'all') filter.reportType = reportType;

    const [reports, total] = await Promise.all([
      Report.find(filter)
        .populate('reportedUserId', 'email')
        .populate('reportedByUserId', 'email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Report.countDocuments(filter),
    ]);

    res.json({
      reports,
      pagination: formatPaginationResponse(total, page, limit),
    });
  } catch (e) {
    handleControllerError(res, e, 'Get all reports');
  }
};

export const getReportDetail = async (req, res) => {
  try {
    const { reportId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(reportId)) {
      return res.status(400).json({ message: 'Invalid reportId' });
    }

    const report = await Report.findById(reportId)
      .populate('reportedUserId', 'email phone')
      .populate('reportedByUserId', 'email')
      .populate('resolvedBy', 'email');

    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    res.json(report);
  } catch (e) {
    handleControllerError(res, e, 'Get report detail');
  }
};

// ✅ FIX: Full cleanup on resolveReport deletion action
export const resolveReport = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { reportId } = req.params;
    const { action = 'none', resolutionNote = '' } = req.body;

    if (!mongoose.Types.ObjectId.isValid(reportId)) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Invalid reportId' });
    }

    const report = await Report.findById(reportId).session(session);
    if (!report) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Report not found' });
    }

    report.status = 'resolved';
    report.action = action;
    report.resolvedBy = req.user._id;
    report.resolvedAt = new Date();
    report.resolutionNote = resolutionNote;
    await report.save({ session });

    if (action === 'warning') {
      await logAdminAction(req, req.user._id, 'user_warned', report.reportedUserId, resolutionNote, { reportId });
    } else if (action === 'suspension') {
      await User.findByIdAndUpdate(
        report.reportedUserId,
        {
          isSuspended: true,
          suspensionReason: `Report: ${report.reportType}`,
          suspensionDate: new Date(),
        },
        { session }
      );
      await logAdminAction(req, req.user._id, 'user_suspended', report.reportedUserId, resolutionNote, { reportId });
    } else if (action === 'deletion') {
      // ✅ FIX: Full cleanup instead of just Profile + User
      await cleanupUserData(report.reportedUserId, session);
      await logAdminAction(req, req.user._id, 'user_deleted', report.reportedUserId, resolutionNote, { reportId });
    }

    await session.commitTransaction();

    res.json({ message: 'Report resolved successfully', report });
  } catch (e) {
    await session.abortTransaction();
    handleControllerError(res, e, 'Resolve report');
  } finally {
    session.endSession();
  }
};

export const rejectReport = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { resolutionNote = '' } = req.body;

    if (!mongoose.Types.ObjectId.isValid(reportId)) {
      return res.status(400).json({ message: 'Invalid reportId' });
    }

    const report = await Report.findByIdAndUpdate(
      reportId,
      {
        status: 'rejected',
        resolvedBy: req.user._id,
        resolvedAt: new Date(),
        resolutionNote,
      },
      { new: true }
    );

    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    await logAdminAction(req, req.user._id, 'report_rejected', report.reportedUserId, resolutionNote, { reportId });

    res.json({ message: 'Report rejected successfully', report });
  } catch (e) {
    handleControllerError(res, e, 'Reject report');
  }
};

export const getDashboardStats = async (req, res) => {
  try {
    const [totalUsers, suspendedUsers, totalProfiles, pendingReports, resolvedReports, recentUsers, reportsByType] =
      await Promise.all([
        User.countDocuments(),
        User.countDocuments({ isSuspended: true }),
        Profile.countDocuments(),
        Report.countDocuments({ status: 'pending' }),
        Report.countDocuments({ status: 'resolved' }),
        User.find().select('email createdAt').sort({ createdAt: -1 }).limit(5),
        Report.aggregate([{ $group: { _id: '$reportType', count: { $sum: 1 } } }]),
      ]);

    res.json({
      stats: {
        totalUsers,
        suspendedUsers,
        activeUsers: totalUsers - suspendedUsers,
        totalProfiles,
        pendingReports,
        resolvedReports,
      },
      recentUsers,
      reportsByType,
    });
  } catch (e) {
    handleControllerError(res, e, 'Get dashboard stats');
  }
};

export const getAdminLogs = async (req, res) => {
  try {
    const { action = 'all' } = req.query;
    const { page, limit, skip } = parsePagination(req.query);

    const filter = {};
    if (action !== 'all') filter.action = action;

    const [logs, total] = await Promise.all([
      AdminLog.find(filter)
        .populate('adminId', 'email')
        .populate('targetUserId', 'email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AdminLog.countDocuments(filter),
    ]);

    res.json({
      logs,
      pagination: formatPaginationResponse(total, page, limit),
    });
  } catch (e) {
    handleControllerError(res, e, 'Get admin logs');
  }
};