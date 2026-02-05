// server/controllers/authController.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User.js';
import Profile from '../models/Profile.js';
import { handleControllerError, AppError } from '../utils/errors.js';
import { TOKEN_EXPIRY } from '../utils/constants.js';

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

/**
 * Generate JWT access token with id + role
 */
const generateAccessToken = (user) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');

  return jwt.sign(
    {
      id: user._id,
      role: user.role,
    },
    secret,
    {
      expiresIn: process.env.JWT_EXPIRE || TOKEN_EXPIRY.ACCESS_TOKEN,
    }
  );
};

const generateRefreshToken = () => crypto.randomBytes(40).toString('hex');
const hashToken = (token) => sha256(token);

/**
 * Get user data with profile photo and completion info
 */
const getUserWithPhoto = async (user) => {
  let photoUrl = null;
  let fullName = null;
  let completionPercentage = 0;
  let completionDetails = {};
  let profileId = null;

  try {
    const profile = await Profile.findOne({ userId: user._id }).lean();

    if (profile) {
      completionPercentage = profile.completionPercentage || 0;

      if (profile.completionDetails) {
        if (profile.completionDetails instanceof Map) {
          completionDetails = Object.fromEntries(profile.completionDetails);
        } else {
          completionDetails = profile.completionDetails;
        }
      }

      if (profile.photos?.length > 0) {
        const mainPhoto = profile.photos.find((p) => p.isProfile) || profile.photos[0];
        photoUrl = mainPhoto?.url || null;
      }

      fullName = profile.fullName || null;
      profileId = profile.profileId || profile._id?.toString() || null;
    }
  } catch (err) {
    console.error('Error fetching profile for user:', err.message);
  }

  return {
    id: user._id,
    email: user.email,
    role: user.role,
    subscription: user.subscription,
    profileStatus: user.profileStatus, // if unused, feel free to remove
    profileId,
    phone: user.phone,
    countryCode: user.countryCode,
    isPremium: user.isPremium,
    isEmailVerified: user.isEmailVerified,
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
    const { email, password, phone, countryCode } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const normalizedEmail = email.toLowerCase();
    const existingEmail = await User.findOne({ email: normalizedEmail });
    if (existingEmail) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    if (phone) {
      const existingPhone = await User.findOne({ phone });
      if (existingPhone) {
        return res.status(409).json({ message: 'Phone already registered' });
      }
    }

    const refreshToken = generateRefreshToken();

    const user = await User.create({
      email: normalizedEmail,
      password,
      refreshToken: hashToken(refreshToken),
      phone: phone || undefined,
      countryCode: countryCode || '+91',
      isActive: true,
      isSuspended: false,
    });

    let token;
    try {
      token = generateAccessToken(user);
    } catch (tokenError) {
      await User.findByIdAndDelete(user._id);
      throw new AppError('Server configuration error', 500, 'CONFIG_ERROR');
    }

    const userData = await getUserWithPhoto(user);
    res.status(201).json({ user: userData, token, refreshToken });
  } catch (e) {
    if (e.code === 11000 && e.keyPattern) {
      const field = Object.keys(e.keyPattern)[0];
      return res.status(409).json({
        message: `${field.charAt(0).toUpperCase() + field.slice(1)} already registered`,
      });
    }
    handleControllerError(res, e, 'Register');
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const normalizedEmail = email.toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).select('+password');
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (user.isSuspended) {
      return res.status(403).json({
        message: 'Account suspended',
        code: 'ACCOUNT_SUSPENDED',
        reason: user.suspensionReason,
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = generateAccessToken(user);
    const refreshToken = generateRefreshToken();

    user.refreshToken = hashToken(refreshToken);
    user.lastLogin = new Date();
    user.isOnline = true;
    await user.save();

    const userData = await getUserWithPhoto(user);

    res.json({ user: userData, token, refreshToken });
  } catch (e) {
    handleControllerError(res, e, 'Login');
  }
};

export const sendEmailOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + TOKEN_EXPIRY.EMAIL_VERIFICATION);

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.emailVerificationToken = sha256(token);
    user.emailVerificationExpiry = expiry;
    await user.save();

    const response = { message: 'Verification email sent' };
    if (process.env.NODE_ENV !== 'production') response.token = token;

    res.json(response);
  } catch (e) {
    handleControllerError(res, e, 'Send email OTP');
  }
};

export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) return res.status(400).json({ message: 'Token required' });

    const user = await User.findOne({ emailVerificationToken: sha256(token) });
    if (!user) return res.status(400).json({ message: 'Invalid token' });

    if (user.emailVerificationExpiry < new Date()) {
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

export const refreshToken = async (req, res) => {
  try {
    const { refreshToken: rt } = req.body;
    if (!rt) return res.status(400).json({ message: 'Refresh token required' });

    const user = await User.findOne({ refreshToken: hashToken(rt) });
    if (!user) return res.status(401).json({ message: 'Invalid refresh token' });

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

    if (user.passwordResetExpiry < new Date()) {
      return res.status(400).json({ message: 'Token expired' });
    }

    user.password = password; // pre-save hook handles hashing
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

    user.password = newPassword; // pre-save hook hashes
    await user.save();

    res.json({ message: 'Password changed' });
  } catch (e) {
    handleControllerError(res, e, 'Change password');
  }
};

export const deleteAccount = async (req, res) => {
  try {
    const { password } = req.body;

    const user = await User.findById(req.user._id).select('+password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!password) return res.status(400).json({ message: 'Password confirmation required' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid password' });

    await Profile.findOneAndDelete({ userId: user._id });
    await User.findByIdAndDelete(user._id);

    res.json({ message: 'Account deleted' });
  } catch (e) {
    handleControllerError(res, e, 'Delete account');
  }
};