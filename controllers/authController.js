// controllers/authController.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Profile from '../models/Profile.js';
import Interest from '../models/Interest.js';
import Shortlist from '../models/Shortlist.js';
import Notification from '../models/Notification.js';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import Subscription from '../models/Subscription.js';
import Payment from '../models/Payment.js';
import { handleControllerError, AppError } from '../utils/errors.js';
import { TOKEN_EXPIRY } from '../utils/constants.js';
import AdminLog from '../models/AdminLog.js';

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

const generateAccessToken = (user) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');

  return jwt.sign({ id: user._id, role: user.role }, secret, {
    expiresIn: process.env.JWT_EXPIRE || TOKEN_EXPIRY.ACCESS_TOKEN,
  });
};

const generateRefreshToken = () => crypto.randomBytes(40).toString('hex');
const hashToken = (token) => sha256(token);

const isValidCountryCode = (cc) => typeof cc === 'string' && /^\+\d{1,4}$/.test(cc);

const pickFileUrl = (file) =>
  file?.location || file?.path || (file?.filename ? `/uploads/${file.filename}` : null);

// Language helpers
const ALLOWED_LANGS = new Set(['en', 'si', 'ta']);
const normalizeLang = (lng) => {
  const x = String(lng || '').toLowerCase();
  if (x.startsWith('si')) return 'si';
  if (x.startsWith('ta')) return 'ta';
  if (x.startsWith('en')) return 'en';
  return 'en';
};

const logUserEvent = async (req, action, actorUser, targetUserId, metadata = {}) => {
  try {
    await AdminLog.create({
      adminId: null,
      actorType: 'user',
      actorId: actorUser?._id || null,
      actorRole: actorUser?.role || null,
      action,
      targetUserId: targetUserId || null,
      metadata,
      ipAddress: req?.ip,
      userAgent: req?.get?.('user-agent'),
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Error logging user event:', e.message);
  }
};

const getUserWithPhoto = async (user) => {
  let photoUrl = null;
  let fullName = user.fullName || null;
  let completionPercentage = 0;
  let completionDetails = {};
  let profileId = null;

  try {
    const profile = await Profile.findOne({ userId: user._id }).lean();
    if (profile) {
      completionPercentage = profile.completionPercentage || 0;
      completionDetails =
        profile.completionDetails instanceof Map
          ? Object.fromEntries(profile.completionDetails)
          : profile.completionDetails || {};

      if (profile.photos?.length > 0) {
        const mainPhoto = profile.photos.find((p) => p.isProfile) || profile.photos[0];
        photoUrl = mainPhoto?.url || null;
      }

      fullName = profile.fullName || fullName;
      profileId = profile.profileId || profile._id?.toString() || null;
    }
  } catch {
    // ignore
  }

  return {
    id: user._id,
    email: user.email,
    phone: user.phone,
    countryCode: user.countryCode,

    role: user.role,
    isManagedProfile: user.isManagedProfile,
    managedByAgencyId: user.managedByAgencyId,

    preferredLanguage: user.preferredLanguage || 'en',

    agencyVerification: user.agencyVerification
      ? {
        status: user.agencyVerification.status,
        submittedAt: user.agencyVerification.submittedAt,
        reviewedAt: user.agencyVerification.reviewedAt,
        rejectionReason: user.agencyVerification.rejectionReason,
      }
      : { status: 'none' },

    subscription: user.subscription,
    profileId,

    isPremium: user.isPremium,
    isEmailVerified: user.isEmailVerified,
    isPhoneVerified: user.isPhoneVerified,
    isActive: user.isActive,
    isSuspended: user.isSuspended,
    createdAt: user.createdAt,

    photoUrl,
    fullName,
    completionPercentage,
    completionDetails,
  };
};

export const register = async (req, res) => {
  try {
    const {
      role = 'user',
      fullName,
      email,
      phone,
      countryCode,
      password,
      preferredLanguage,
      dateOfBirth,
      gender,
      currentAddress,
      nicFrontUrl,
      nicBackUrl,
      businessRegCertUrl,
    } = req.body;

    const normalizedRole = String(role || 'user').toLowerCase();
    if (!['user', 'agency'].includes(normalizedRole)) {
      return res.status(400).json({ message: 'Role must be user or agency' });
    }

    const normalizedEmail = email ? String(email).toLowerCase().trim() : null;
    const normalizedPhone = phone ? String(phone).trim() : null;

    if (!normalizedEmail) {
      return res.status(400).json({ message: 'Email is required' });
    }

    if (!password || String(password).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    if (!fullName?.trim()) {
      return res.status(400).json({
        message: normalizedRole === 'agency' ? 'Agency name is required' : 'Full name is required',
      });
    }

    const langNorm = normalizeLang(preferredLanguage);
    const lang = ALLOWED_LANGS.has(langNorm) ? langNorm : 'en';

    const cc = isValidCountryCode(countryCode) ? countryCode : '+94';

    if (normalizedEmail) {
      const existingEmail = await User.findOne({ email: normalizedEmail });
      if (existingEmail) return res.status(409).json({ message: 'Email already registered' });
    }

    if (normalizedPhone) {
      const existingPhone = await User.findOne({ phone: normalizedPhone });
      if (existingPhone) return res.status(409).json({ message: 'Phone already registered' });
    }

    let agencyVerification = undefined;
    if (normalizedRole === 'agency') {
      if (!normalizedPhone) {
        return res.status(400).json({ message: 'Mobile number is required for agency' });
      }
      if (!dateOfBirth) {
        return res.status(400).json({ message: 'Date of birth is required for agency' });
      }
      if (!['male', 'female'].includes(String(gender))) {
        return res.status(400).json({ message: 'Gender is required for agency' });
      }
      if (!currentAddress?.trim()) {
        return res.status(400).json({ message: 'Current address is required for agency' });
      }

      const files = req.files || {};
      const nicFront = pickFileUrl(files.nicFront?.[0]) || nicFrontUrl;
      const nicBack = pickFileUrl(files.nicBack?.[0]) || nicBackUrl;
      const biz = pickFileUrl(files.businessReg?.[0]) || businessRegCertUrl;

      if (!nicFront || !nicBack) return res.status(400).json({ message: 'NIC front and back are required' });
      if (!biz) return res.status(400).json({ message: 'Business registration certificate is required' });

      agencyVerification = {
        status: 'pending',
        submittedAt: new Date(),
        dateOfBirth: new Date(dateOfBirth),
        gender: String(gender),
        currentAddress: String(currentAddress).trim(),
        nicFrontUrl: nicFront,
        nicBackUrl: nicBack,
        businessRegCertUrl: biz,
      };
    }

    const refreshToken = generateRefreshToken();

    const user = await User.create({
      email: normalizedEmail,
      phone: normalizedPhone || undefined,
      countryCode: cc,
      password,
      role: normalizedRole,
      fullName: fullName.trim(),
      preferredLanguage: lang,
      refreshToken: hashToken(refreshToken),
      agencyVerification: agencyVerification || undefined,
      isActive: true,
      isSuspended: false,
    });

    let token;
    try {
      token = generateAccessToken(user);
    } catch {
      await User.findByIdAndDelete(user._id);
      throw new AppError('Server configuration error', 500, 'CONFIG_ERROR');
    }

    const userData = await getUserWithPhoto(user);

    await logUserEvent(req, 'account_created', user, user._id, {
      role: user.role,
      email: user.email,
      phone: user.phone || null,
    });

    res.status(201).json({
      user: userData,
      token,
      refreshToken,
      requiresAdminApproval: normalizedRole === 'agency',
    });
  } catch (e) {
    if (e.code === 11000 && e.keyPattern) {
      const field = Object.keys(e.keyPattern)[0];
      return res.status(409).json({ message: `${field} already registered` });
    }
    handleControllerError(res, e, 'Register');
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!password) return res.status(400).json({ message: 'Password is required' });

    const normalizedEmail = email ? String(email).toLowerCase().trim() : null;
    if (!normalizedEmail) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email: normalizedEmail }).select('+password');
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    if (user.isManagedProfile) {
      return res.status(403).json({ message: 'This account cannot log in', code: 'MANAGED_PROFILE_ACCOUNT' });
    }

    if (user.isSuspended) {
      return res.status(403).json({
        message: 'Account suspended',
        code: 'ACCOUNT_SUSPENDED',
        reason: user.suspensionReason,
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    const token = generateAccessToken(user);
    const refreshToken = generateRefreshToken();

    user.refreshToken = hashToken(refreshToken);
    user.lastLogin = new Date();
    user.isOnline = true;
    await user.save();

    await logUserEvent(req, 'user_login', user, user._id, {
      email: user.email,
    });

    const userData = await getUserWithPhoto(user);
    res.json({ user: userData, token, refreshToken });
  } catch (e) {
    handleControllerError(res, e, 'Login');
  }
};

// ✅ FIX #1: Don't reveal if email exists (prevents user enumeration)
export const sendEmailOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    // ✅ Always return same message regardless of whether user exists
    const genericMessage = 'If that email is registered, a verification link has been sent';

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // ✅ Don't reveal that user doesn't exist
      return res.json({ message: genericMessage });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + TOKEN_EXPIRY.EMAIL_VERIFICATION);

    user.emailVerificationToken = sha256(token);
    user.emailVerificationExpiry = expiry;
    await user.save();

    const response = { message: genericMessage };
    if (process.env.NODE_ENV !== 'production') response.token = token;

    res.json(response);
  } catch (e) {
    handleControllerError(res, e, 'Send email OTP');
  }
};

// ✅ FIX #2: Handle missing expiry safely
export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) return res.status(400).json({ message: 'Token required' });

    const user = await User.findOne({ emailVerificationToken: sha256(token) });
    if (!user) return res.status(400).json({ message: 'Invalid token' });

    // ✅ Handle missing expiry safely
    if (!user.emailVerificationExpiry || user.emailVerificationExpiry < new Date()) {
      return res.status(400).json({ message: 'Token expired' });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpiry = undefined;
    await user.save();

    res.json({ message: 'Email verified' });
  } catch (e) {
    handleControllerError(res, e, 'Verify email');
  }
};

// ✅ FIX #3: Block suspended/inactive users from refreshing tokens
export const refreshToken = async (req, res) => {
  try {
    const { refreshToken: rt } = req.body;
    if (!rt) return res.status(400).json({ message: 'Refresh token required' });

    const user = await User.findOne({ refreshToken: hashToken(rt) });
    if (!user) return res.status(401).json({ message: 'Invalid refresh token' });

    // ✅ Block suspended users
    if (user.isSuspended) {
      return res.status(403).json({
        message: 'Account suspended',
        code: 'ACCOUNT_SUSPENDED',
        reason: user.suspensionReason,
      });
    }

    // ✅ Block inactive users
    if (user.isActive === false) {
      return res.status(403).json({
        message: 'Account is inactive',
        code: 'ACCOUNT_INACTIVE',
      });
    }

    const token = generateAccessToken(user);
    const newRefresh = generateRefreshToken();

    user.refreshToken = hashToken(newRefresh);
    user.lastActive = new Date();
    await user.save();

    res.json({ token, refreshToken: newRefresh });
  } catch (e) {
    handleControllerError(res, e, 'Refresh token');
  }
};

export const logout = async (req, res) => {
  try {
    const { refreshToken: rt } = req.body;

    if (rt) {
      const user = await User.findOne({ refreshToken: hashToken(rt) });
      if (user) {
        user.refreshToken = undefined;
        user.isOnline = false;
        await user.save();

        await logUserEvent(req, 'user_logout', user, user._id, {
          email: user.email,
        });
      }
    }

    res.json({ message: 'Logged out' });
  } catch (e) {
    handleControllerError(res, e, 'Logout');
  }
};

export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const userData = await getUserWithPhoto(user);
    res.json({ user: userData });
  } catch (e) {
    handleControllerError(res, e, 'Get me');
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.json({ message: 'If email exists, reset instructions will be sent' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = sha256(resetToken);
    user.passwordResetExpiry = new Date(Date.now() + TOKEN_EXPIRY.PASSWORD_RESET);
    await user.save();

    const response = { message: 'Reset instructions sent' };
    if (process.env.NODE_ENV !== 'production') response.resetToken = resetToken;

    res.json(response);
  } catch (e) {
    handleControllerError(res, e, 'Forgot password');
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ message: 'Token and password required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const user = await User.findOne({ passwordResetToken: sha256(token) }).select('+password');
    if (!user) return res.status(400).json({ message: 'Invalid token' });

    if (!user.passwordResetExpiry || user.passwordResetExpiry < new Date()) {
      return res.status(400).json({ message: 'Token expired' });
    }

    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpiry = undefined;
    user.refreshToken = undefined;
    await user.save();

    res.json({ message: 'Password reset successful' });
  } catch (e) {
    handleControllerError(res, e, 'Reset password');
  }
};

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Current password incorrect' });

    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password changed' });
  } catch (e) {
    handleControllerError(res, e, 'Change password');
  }
};

export const deleteAccount = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { password } = req.body;
    const userId = req.user._id;

    const user = await User.findById(userId).select('+password').session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'User not found' });
    }
    if (!password) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Password confirmation required' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Invalid password' });
    }

    await logUserEvent(req, 'account_deleted_self', user, user._id, {
      targetSnapshot: { email: user.email, fullName: user.fullName, role: user.role },
    });

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
      await Message.updateMany({ conversationId: conv._id }, { isDeleted: true, deletedAt: new Date() }).session(session);
    }
    await Conversation.deleteMany({ participants: userId }).session(session);

    await User.findByIdAndDelete(userId).session(session);

    await session.commitTransaction();
    res.json({ message: 'Account deleted' });
  } catch (e) {
    await session.abortTransaction();
    handleControllerError(res, e, 'Delete account');
  } finally {
    session.endSession();
  }
};

export default {
  register,
  login,
  sendEmailOtp,
  verifyEmail,
  refreshToken,
  logout,
  getMe,
  forgotPassword,
  resetPassword,
  changePassword,
  deleteAccount,
};