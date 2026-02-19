// server/controllers/adminAgencyController.js
import User from '../models/User.js';
import Agency from '../models/Agency.js';
import AdminLog from '../models/AdminLog.js';
import { handleControllerError } from '../utils/errors.js';

const requireAdmin = (req, res) => {
  const role = req.user?.role;
  if (!['admin', 'superadmin'].includes(role)) {
    res.status(403).json({ message: 'Admin access required' });
    return false;
  }
  return true;
};

const log = async (req, action, targetUserId, reason = null, metadata = {}) => {
  try {
    await AdminLog.create({
      adminId: req.user._id,
      action,
      targetUserId,
      reason,
      metadata,
      ipAddress: req?.ip,
      userAgent: req?.get?.('user-agent'),
    });
  } catch (_) {
    // ignore logging failures
  }
};

const mapUserAgencyStatusToAgency = (userStatus) => {
  if (userStatus === 'approved') return 'approved';
  if (userStatus === 'rejected') return 'rejected';
  return 'pending';
};

export const approveAgency = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const agencyUserId = req.params.id;

    const agencyUser = await User.findById(agencyUserId);
    if (!agencyUser) return res.status(404).json({ message: 'Agency not found' });
    if (agencyUser.role !== 'agency') return res.status(400).json({ message: 'User is not an agency' });

    agencyUser.agencyVerification = agencyUser.agencyVerification || {};
    agencyUser.agencyVerification.status = 'approved';
    agencyUser.agencyVerification.reviewedAt = new Date();
    agencyUser.agencyVerification.reviewedBy = req.user._id;
    agencyUser.agencyVerification.rejectionReason = undefined;

    await agencyUser.save();

    // ✅ Sync Agency collection status too
    await Agency.findOneAndUpdate(
      { ownerUserId: agencyUser._id },
      {
        $setOnInsert: { ownerUserId: agencyUser._id, name: agencyUser.fullName || agencyUser.email || 'Agency' },
        $set: { status: mapUserAgencyStatusToAgency('approved') },
      },
      { upsert: true, new: true }
    );

    await log(req, 'agency_approved', agencyUser._id, null, { status: 'approved' });

    res.json({ message: 'Agency approved', agencyId: agencyUserId });
  } catch (e) {
    handleControllerError(res, e, 'Approve agency');
  }
};

export const rejectAgency = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { reason } = req.body;
    const agencyUserId = req.params.id;

    const agencyUser = await User.findById(agencyUserId);
    if (!agencyUser) return res.status(404).json({ message: 'Agency not found' });
    if (agencyUser.role !== 'agency') return res.status(400).json({ message: 'User is not an agency' });

    agencyUser.agencyVerification = agencyUser.agencyVerification || {};
    agencyUser.agencyVerification.status = 'rejected';
    agencyUser.agencyVerification.reviewedAt = new Date();
    agencyUser.agencyVerification.reviewedBy = req.user._id;
    agencyUser.agencyVerification.rejectionReason = reason || 'Rejected';

    await agencyUser.save();

    // ✅ Sync Agency collection status too
    await Agency.findOneAndUpdate(
      { ownerUserId: agencyUser._id },
      {
        $setOnInsert: { ownerUserId: agencyUser._id, name: agencyUser.fullName || agencyUser.email || 'Agency' },
        $set: { status: mapUserAgencyStatusToAgency('rejected') },
      },
      { upsert: true, new: true }
    );

    await log(req, 'agency_rejected', agencyUser._id, reason || 'Rejected', { status: 'rejected' });

    res.json({ message: 'Agency rejected', agencyId: agencyUserId });
  } catch (e) {
    handleControllerError(res, e, 'Reject agency');
  }
};