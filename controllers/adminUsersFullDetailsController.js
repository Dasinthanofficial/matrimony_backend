// ===== FILE: ./controllers/adminUsersFullDetailsController.js =====
import mongoose from 'mongoose';
import User from '../models/User.js';
import Profile from '../models/Profile.js';

export const getUserFullDetails = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid userId', code: 'INVALID_USER_ID' });
    }

    const user = await User.findById(userId).select('-password -refreshToken').lean();
    if (!user) return res.status(404).json({ message: 'User not found', code: 'USER_NOT_FOUND' });

    // Try common ownership field names for the user's own profile
    const profile = await Profile.findOne({
      $or: [{ userId: user._id }, { user: user._id }, { owner: user._id }, { createdByUserId: user._id }],
    }).lean();

    let agencyCreatedProfiles = [];
    if (user.role === 'agency') {
      agencyCreatedProfiles = await Profile.find({
        $or: [{ agencyId: user._id }, { addedByAgencyId: user._id }, { createdByAgencyId: user._id }],
      })
        .sort({ createdAt: -1 })
        .lean();
    }

    return res.json({ user, profile, agencyCreatedProfiles });
  } catch (e) {
    console.error('getUserFullDetails error:', e);
    return res.status(500).json({
      message: 'Failed to load full user details',
      code: 'ADMIN_USER_FULL_DETAILS_FAILED',
      error: process.env.NODE_ENV === 'development' ? String(e?.message || e) : undefined,
    });
  }
};

export default { getUserFullDetails };