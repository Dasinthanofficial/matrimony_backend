// ===== FILE: ./middleware/authMiddleware.js =====
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const getTokenFromRequest = (req) => {
  // 1) Authorization: Bearer <token>
  const auth = req.headers?.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.split(' ')[1];

  // 2) Cookies (requires cookie-parser)
  if (req.cookies?.accessToken) return req.cookies.accessToken;
  if (req.cookies?.token) return req.cookies.token;

  return null;
};

const getUserIdFromDecoded = (decoded) => {
  // Support common JWT payload shapes
  return decoded?.id || decoded?._id || decoded?.userId || decoded?.sub || null;
};

/**
 * Protect routes - require authentication
 */
export const protect = async (req, res, next) => {
  try {
    const token = getTokenFromRequest(req);

    if (!token) {
      return res.status(401).json({
        message: 'Not authorized, no token',
        code: 'NO_TOKEN',
      });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      // eslint-disable-next-line no-console
      console.error('JWT_SECRET not configured');
      return res.status(500).json({
        message: 'Server configuration error',
        code: 'CONFIG_ERROR',
      });
    }

    const decoded = jwt.verify(token, secret);
    const userId = getUserIdFromDecoded(decoded);

    if (!userId) {
      return res.status(401).json({
        message: 'Invalid token payload',
        code: 'INVALID_TOKEN_PAYLOAD',
      });
    }

    const user = await User.findById(userId).select('-password -refreshToken');
    if (!user) {
      return res.status(401).json({
        message: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }

    // Block suspended users
    if (user.isSuspended) {
      return res.status(403).json({
        message: 'Account suspended',
        code: 'ACCOUNT_SUSPENDED',
        reason: user.suspensionReason,
      });
    }

    // Block inactive users (only if explicitly false)
    if (user.isActive === false) {
      return res.status(403).json({
        message: 'Account inactive',
        code: 'ACCOUNT_INACTIVE',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error?.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    if (error?.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token', code: 'INVALID_TOKEN' });
    }

    // eslint-disable-next-line no-console
    console.error('Auth middleware error:', error);
    return res.status(401).json({ message: 'Not authorized', code: 'AUTH_ERROR' });
  }
};

/**
 * Optional auth - attach user if token exists, but don't require it
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return next();

    const secret = process.env.JWT_SECRET;
    if (!secret) return next();

    const decoded = jwt.verify(token, secret);
    const userId = getUserIdFromDecoded(decoded);
    if (!userId) return next();

    const user = await User.findById(userId).select('-password -refreshToken');
    if (user && !user.isSuspended && user.isActive !== false) {
      req.user = user;
    }

    next();
  } catch {
    // Silently continue without user
    next();
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      message: 'Not authorized',
      code: 'NO_AUTH',
    });
  }

  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      message: 'Insufficient permissions',
      code: 'FORBIDDEN',
      required: roles,
    });
  }

  next();
};

/**
 * Admin only routes
 */
export const admin = requireRole('admin', 'superadmin');

/**
 * Superadmin only routes (optional helper)
 */
export const superadmin = requireRole('superadmin');

export default { protect, optionalAuth, admin, superadmin };