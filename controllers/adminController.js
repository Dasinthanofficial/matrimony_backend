import mongoose from 'mongoose';
import User from '../models/User.js';
import Profile from '../models/Profile.js';
import Report from '../models/Report.js';
import AdminLog from '../models/AdminLog.js';
import Interest from '../models/Interest.js';
import Shortlist from '../models/Shortlist.js';
import Notification from '../models/Notification.js';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import Subscription from '../models/Subscription.js';
import Payment from '../models/Payment.js';
import { handleControllerError } from '../utils/errors.js';
import { parsePagination, formatPaginationResponse } from '../utils/pagination.js';

const escapeRegex = (s = '') => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const logAdminAction = async (req, adminId, action, targetUserId, reason, metadata = {}) => {
  try {
    await AdminLog.create({
      adminId,
      actorType: 'admin',
      actorId: adminId,
      actorRole: req?.user?.role || 'admin',
      action,
      targetUserId: targetUserId || null,
      reason: reason || null,
      metadata,
      ipAddress: req?.ip,
      userAgent: req?.get?.('user-agent'),
    });
  } catch (e) {
    console.error('Error logging admin action:', e.message);
  }
};

const cleanupUserData = async (userId, session) => {
  await Profile.deleteOne({ userId }).session(session);
  await Interest.deleteMany({ $or: [{ senderId: userId }, { receiverId: userId }] }).session(session);
  await Shortlist.deleteMany({ $or: [{ userId }, { shortlistedUserId: userId }] }).session(session);
  await Notification.deleteMany({ userId }).session(session);
  await Message.updateMany(
    { $or: [{ senderId: userId }, { receiverId: userId }] },
    { isDeleted: true, deletedAt: new Date() }
  ).session(session);
  await Subscription.deleteOne({ userId }).session(session);
  await Payment.deleteMany({ userId }).session(session);

  const userConversations = await Conversation.find({ participants: userId }).select('_id').session(session);
  for (const conv of userConversations) {
    await Message.updateMany(
      { conversationId: conv._id },
      { isDeleted: true, deletedAt: new Date() }
    ).session(session);
  }
  await Conversation.deleteMany({ participants: userId }).session(session);

  await User.findByIdAndDelete(userId).session(session);
};

// ✅ FIXED: Now returns total + pages for proper frontend pagination
// ✅ FIXED: Attaches subscription info so admin UI can show Premium correctly
export const getAllUsers = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);
    const skip = (page - 1) * limit;

    // Build filter for search query
    const filter = {};
    const search = (req.query.search || '').trim();
    if (search) {
      const escaped = escapeRegex(search);
      filter.$or = [
        { fullName: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
      ];
    }

    const roleFilter = (req.query.role || '').trim();
    if (roleFilter) filter.role = roleFilter;

    const total = await User.countDocuments(filter);
    const pages = Math.max(1, Math.ceil(total / limit));

    // 1) get users for this page (include premium + phone verified fields)
    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select(
        [
          'fullName',
          'email',
          'phone',
          'countryCode',
          'role',
          'isEmailVerified',
          'isPhoneVerified',
          'isPremium',
          'premiumExpiry',
          'subscription', // if you store it embedded, include it too
          'isSuspended',
          'suspensionReason',
          'isActive',
          'createdAt',
          'agencyVerification',
          'managedByAgencyId',
        ].join(' ')
      )
      .lean();

    const userIds = users.map((u) => u._id);

    // 2) attach profile (1:1 by userId)
    const profiles = await Profile.find({ userId: { $in: userIds } })
      .select('userId fullName profileId country city agencyId agencyNameTag createdAt')
      .lean();

    const profileByUserId = new Map(profiles.map((p) => [String(p.userId), p]));

    // 3) attach agency (who manages this user)
    const agencyIds = users
      .map((u) => u.managedByAgencyId)
      .filter(Boolean)
      .map((id) => String(id));

    const agencies = agencyIds.length
      ? await User.find({ _id: { $in: agencyIds } }).select('name fullName email').lean()
      : [];

    const agencyById = new Map(agencies.map((a) => [String(a._id), a]));

    // 4) attach subscription info from Subscription collection (most reliable)
    const subs = userIds.length
      ? await Subscription.find({ userId: { $in: userIds } })
          .select('userId plan endDate isActive')
          .lean()
      : [];

    const subByUserId = new Map(
      subs.map((s) => [
        String(s.userId),
        { plan: s.plan, endDate: s.endDate, isActive: !!s.isActive },
      ])
    );

    // 5) agencyProfilesCount for agencies
    const agencyUserIds = users.filter((u) => u.role === 'agency').map((u) => u._id);

    const countsAgg = agencyUserIds.length
      ? await Profile.aggregate([
          { $match: { agencyId: { $in: agencyUserIds } } },
          { $group: { _id: '$agencyId', count: { $sum: 1 } } },
        ])
      : [];

    const countByAgencyId = new Map(countsAgg.map((x) => [String(x._id), x.count]));

    // 6) shape response
    const shaped = users.map((u) => {
      const profile = profileByUserId.get(String(u._id)) || null;
      const agency = u.managedByAgencyId
        ? agencyById.get(String(u.managedByAgencyId)) || null
        : null;

      // prefer Subscription model result; fallback to embedded u.subscription if you have it
      const subscription = subByUserId.get(String(u._id)) || u.subscription || null;

      return {
        ...u,
        subscription,
        profile,
        agency,
        agencyProfilesCount: u.role === 'agency' ? countByAgencyId.get(String(u._id)) || 0 : 0,
      };
    });

    res.json({
      users: shaped,
      pagination: { page, limit, total, pages },
    });
  } catch (e) {
    console.error('getAllUsers error:', e);
    res.status(500).json({
      message: 'Failed to load users',
      code: 'ADMIN_USERS_LOAD_FAILED',
      error: process.env.NODE_ENV === 'development' ? String(e?.message || e) : undefined,
    });
  }
};

// ✅ FIXED: Also returns pagination
export const getAgencyProfiles = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);
    const skip = (page - 1) * limit;

    const filter = { agencyId: { $exists: true, $ne: null } };

    const total = await Profile.countDocuments(filter);
    const pages = Math.max(1, Math.ceil(total / limit));

    const profiles = await Profile.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select(
        'fullName profileId country city agencyId agencyNameTag successFee successFeeCurrency isActive profileViews createdAt'
      )
      .lean();

    const agencyIds = [...new Set(profiles.map((p) => String(p.agencyId)).filter(Boolean))];

    const agencies = agencyIds.length
      ? await User.find({ _id: { $in: agencyIds } }).select('fullName email name').lean()
      : [];

    const agencyById = new Map(agencies.map((a) => [String(a._id), a]));

    const shaped = profiles.map((p) => ({
      ...p,
      agency: p.agencyId ? agencyById.get(String(p.agencyId)) || null : null,
    }));

    res.json({
      profiles: shaped,
      pagination: { page, limit, total, pages },
    });
  } catch (e) {
    handleControllerError(res, e, 'Get agency profiles');
  }
};

export const getUserDetail = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId))
      return res.status(400).json({ message: 'Invalid userId' });

    const user = await User.findById(userId).select(
      '-password -refreshToken -emailVerificationToken -phoneOTP'
    );
    if (!user) return res.status(404).json({ message: 'User not found' });

    const profile = await Profile.findOne({ userId }).lean();

    let agency = null;
    const agencyId = user.managedByAgencyId || profile?.agencyId;
    if (agencyId) {
      const a = await User.findById(agencyId).select('_id fullName role').lean();
      if (a) agency = { id: a._id, name: a.fullName, role: a.role };
    }

    res.json({ user, profile, agency });
  } catch (e) {
    handleControllerError(res, e, 'Get user detail');
  }
};

export const suspendUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason = '' } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId))
      return res.status(400).json({ message: 'Invalid userId' });
    if (userId === req.user._id.toString())
      return res.status(400).json({ message: 'Cannot suspend yourself' });

    const user = await User.findByIdAndUpdate(
      userId,
      { isSuspended: true, suspensionReason: reason, suspensionDate: new Date() },
      { new: true }
    ).select('-password -refreshToken');

    if (!user) return res.status(404).json({ message: 'User not found' });

    await logAdminAction(req, req.user._id, 'user_suspended', userId, reason);
    res.json({ message: 'User suspended successfully', user });
  } catch (e) {
    handleControllerError(res, e, 'Suspend user');
  }
};

export const unsuspendUser = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId))
      return res.status(400).json({ message: 'Invalid userId' });

    const user = await User.findByIdAndUpdate(
      userId,
      { isSuspended: false, suspensionReason: null, suspensionDate: null },
      { new: true }
    ).select('-password -refreshToken');

    if (!user) return res.status(404).json({ message: 'User not found' });

    await logAdminAction(req, req.user._id, 'user_unsuspended', userId);
    res.json({ message: 'User unsuspended successfully', user });
  } catch (e) {
    handleControllerError(res, e, 'Unsuspend user');
  }
};

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

    await logAdminAction(req, req.user._id, 'user_deleted', userId, reason, {
      targetSnapshot: { email: user.email, fullName: user.fullName, role: user.role },
    });

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
    if (!mongoose.Types.ObjectId.isValid(profileId))
      return res.status(400).json({ message: 'Invalid profileId' });

    const profile = await Profile.findByIdAndUpdate(
      profileId,
      { isApproved: true, approvedAt: new Date(), rejectionReason: null, rejectionDate: null },
      { new: true }
    );

    if (!profile) return res.status(404).json({ message: 'Profile not found' });

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

    if (!mongoose.Types.ObjectId.isValid(profileId))
      return res.status(400).json({ message: 'Invalid profileId' });

    const profile = await Profile.findByIdAndUpdate(
      profileId,
      { isApproved: false, rejectionReason: reason, rejectionDate: new Date() },
      { new: true }
    );

    if (!profile) return res.status(404).json({ message: 'Profile not found' });

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

    res.json({ reports, pagination: formatPaginationResponse(total, page, limit) });
  } catch (e) {
    handleControllerError(res, e, 'Get all reports');
  }
};

export const getReportDetail = async (req, res) => {
  try {
    const { reportId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(reportId))
      return res.status(400).json({ message: 'Invalid reportId' });

    const report = await Report.findById(reportId)
      .populate('reportedUserId', 'email phone')
      .populate('reportedByUserId', 'email')
      .populate('resolvedBy', 'email');

    if (!report) return res.status(404).json({ message: 'Report not found' });
    res.json(report);
  } catch (e) {
    handleControllerError(res, e, 'Get report detail');
  }
};

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
      await logAdminAction(req, req.user._id, 'user_warned', report.reportedUserId, resolutionNote, {
        reportId,
      });
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
      await logAdminAction(
        req,
        req.user._id,
        'user_suspended',
        report.reportedUserId,
        resolutionNote,
        { reportId }
      );
    } else if (action === 'deletion') {
      await cleanupUserData(report.reportedUserId, session);
      await logAdminAction(req, req.user._id, 'user_deleted', report.reportedUserId, resolutionNote, {
        reportId,
      });
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

    if (!mongoose.Types.ObjectId.isValid(reportId))
      return res.status(400).json({ message: 'Invalid reportId' });

    const report = await Report.findByIdAndUpdate(
      reportId,
      { status: 'rejected', resolvedBy: req.user._id, resolvedAt: new Date(), resolutionNote },
      { new: true }
    );

    if (!report) return res.status(404).json({ message: 'Report not found' });

    await logAdminAction(req, req.user._id, 'report_rejected', report.reportedUserId, resolutionNote, {
      reportId,
    });
    res.json({ message: 'Report rejected successfully', report });
  } catch (e) {
    handleControllerError(res, e, 'Reject report');
  }
};

export const getDashboardStats = async (req, res) => {
  try {
    const [
      totalUsers,
      suspendedUsers,
      totalProfiles,
      pendingReports,
      resolvedReports,
      recentUsers,
      reportsByType,
      recentLogs,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isSuspended: true }),
      Profile.countDocuments(),
      Report.countDocuments({ status: 'pending' }),
      Report.countDocuments({ status: 'resolved' }),
      User.find().select('email createdAt').sort({ createdAt: -1 }).limit(5).lean(),
      Report.aggregate([{ $group: { _id: '$reportType', count: { $sum: 1 } } }]),
      AdminLog.find({})
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('actorId', 'email fullName role')
        .populate('adminId', 'email fullName role')
        .populate('targetUserId', 'email fullName role')
        .lean(),
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
      recentLogs,
    });
  } catch (e) {
    handleControllerError(res, e, 'Get dashboard stats');
  }
};

export const updateUserRole = async (req, res) => {
  try {
    if (req.user?.role !== 'superadmin') {
      return res.status(403).json({ message: 'Superadmin access required' });
    }

    const { userId } = req.params;
    const { role } = req.body;

    if (userId === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot change your own role' });
    }

    const target = await User.findById(userId).select('_id role').lean();
    if (!target) return res.status(404).json({ message: 'User not found' });

    if (target.role === role) {
      return res.json({ message: 'Role unchanged', user: target });
    }

    const updated = await User.findByIdAndUpdate(userId, { role }, { new: true }).select(
      '-password -refreshToken'
    );

    await logAdminAction(req, req.user._id, 'user_role_changed', userId, null, {
      from: target.role,
      to: role,
    });

    return res.json({ message: 'User role updated', user: updated });
  } catch (e) {
    handleControllerError(res, e, 'Update user role');
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
        .populate('actorId', 'email fullName role')
        .populate('adminId', 'email fullName role')
        .populate('targetUserId', 'email fullName role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AdminLog.countDocuments(filter),
    ]);

    res.json({ logs, pagination: formatPaginationResponse(total, page, limit) });
  } catch (e) {
    handleControllerError(res, e, 'Get admin logs');
  }
};

export const getUserFullDetails = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid userId' });
    }

    if (req.user?.role !== 'superadmin') {
      return res.status(403).json({ message: 'Superadmin access required' });
    }

    const user = await User.findById(userId).select(
      '-password -refreshToken -refreshTokenHash -emailVerificationToken -phoneOTP -emailOtp -emailOtpExpires -resetPasswordToken -resetPasswordExpire'
    );

    if (!user) return res.status(404).json({ message: 'User not found' });

    const profile = await Profile.findOne({ userId: user._id }).lean();

    let agency = null;
    const agencyId = user.managedByAgencyId || profile?.agencyId;
    if (agencyId && mongoose.Types.ObjectId.isValid(String(agencyId))) {
      const a = await User.findById(agencyId).select('_id fullName email role').lean();
      if (a) agency = a;
    }

    let agencyCreatedProfiles = [];
    if (user.role === 'agency') {
      agencyCreatedProfiles = await Profile.find({ agencyId: user._id })
        .sort({ createdAt: -1 })
        .limit(500)
        .lean();
    }

    return res.json({
      user,
      profile,
      agency,
      agencyCreatedProfiles,
    });
  } catch (e) {
    return handleControllerError(res, e, 'Get user full details');
  }
};