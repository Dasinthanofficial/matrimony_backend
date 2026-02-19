// server/controllers/adminUserController.js
import mongoose from 'mongoose';
import User from '../models/User.js';

// ✅ Adjust these two imports to match your project:
import Profile from '../models/Profile.js'; // normal user profile (usually "Profile")
import AgencyProfile from '../models/AgencyProfile.js'; // agency-created profiles (your project may name it differently)

export const getUserFullDetails = async (req, res) => {
  const { userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ message: 'Invalid userId' });
  }

  const user = await User.findById(userId).select(
    // don’t ever send secrets
    '-password -refreshToken -refreshTokenHash -emailOtp -emailOtpExpires -resetPasswordToken -resetPasswordExpire'
  );

  if (!user) return res.status(404).json({ message: 'User not found' });

  // Full details: user’s own profile (if you store it)
  const profile = await Profile.findOne({ user: user._id }).lean();

  // If agency: include all profiles created by that agency
  let agencyCreatedProfiles = [];
  if (user.role === 'agency') {
    agencyCreatedProfiles = await AgencyProfile.find({
      $or: [{ agency: user._id }, { agencyId: user._id }, { agencyUserId: user._id }],
    })
      .sort({ createdAt: -1 })
      .lean();
  }

  return res.json({
    user,
    profile,
    agencyCreatedProfiles,
  });
};