// ===== FILE: server/middleware/rateLimiter.js =====
import rateLimit from 'express-rate-limit';

// Check if in development mode
const isDev = process.env.NODE_ENV !== 'production';

// General API rate limiter - More lenient
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDev ? 1000 : 100, // 1000 requests in dev, 100 in production
  message: {
    message: 'Too many requests, please try again later',
    retryAfter: 15,
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isDev, // Skip rate limiting entirely in development
});

// Auth rate limiter - For login/register
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDev ? 100 : 10, // 100 attempts in dev, 10 in production
  message: {
    message: 'Too many authentication attempts, please try again later',
    retryAfter: 15,
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isDev,
});

// Strict limiter for sensitive operations
export const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isDev ? 100 : 5,
  message: {
    message: 'Too many attempts, please try again later',
    retryAfter: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isDev,
});

export default {
  apiLimiter,
  authLimiter,
  strictLimiter,
};