// ===== FILE: ./middleware/authMiddleware.js =====
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

/**
 * Protect routes - require authentication
 */
export const protect = async (req, res, next) => {
  try {
    let token;

    // Get token from header or cookies
    if (req.headers.authorization?.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      return res.status(401).json({
        message: 'Not authorized, no token',
        code: 'NO_TOKEN',
      });
    }

    // Verify token
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('JWT_SECRET not configured');
      return res.status(500).json({
        message: 'Server configuration error',
        code: 'CONFIG_ERROR',
      });
    }

    const decoded = jwt.verify(token, secret);

    // Get user from token
    const user = await User.findById(decoded.id).select('-password -refreshToken');

    if (!user) {
      return res.status(401).json({
        message: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }

    // Check if user is suspended
    if (user.isSuspended) {
      return res.status(403).json({
        message: 'Account suspended',
        code: 'ACCOUNT_SUSPENDED',
        reason: user.suspensionReason,
      });
    }

    // Check if user is active
    if (user.isActive === false) {
      return res.status(403).json({
        message: 'Account inactive',
        code: 'ACCOUNT_INACTIVE',
      });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        message: 'Token expired',
        code: 'TOKEN_EXPIRED',
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        message: 'Invalid token',
        code: 'INVALID_TOKEN',
      });
    }

    console.error('Auth middleware error:', error);
    return res.status(401).json({
      message: 'Not authorized',
      code: 'AUTH_ERROR',
    });
  }
};

/**
 * Optional auth - attach user if token exists, but don't require it
 */
export const optionalAuth = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization?.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (token) {
      const secret = process.env.JWT_SECRET;
      if (secret) {
        const decoded = jwt.verify(token, secret);
        const user = await User.findById(decoded.id).select('-password -refreshToken');
        if (user && !user.isSuspended) {
          req.user = user;
        }
      }
    }

    next();
  } catch (error) {
    // Silently continue without user
    next();
  }
};

/**
 * Admin only routes
 */
export const admin = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      message: 'Not authorized',
      code: 'NO_AUTH',
    });
  }

  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
    return res.status(403).json({
      message: 'Admin access required',
      code: 'NOT_ADMIN',
    });
  }

  next();
};

export default { protect, optionalAuth, admin };