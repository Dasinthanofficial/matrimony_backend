// ===== FIXED FILE: server/middleware/rateLimiter.js =====
import rateLimit from 'express-rate-limit';

const isDev = process.env.NODE_ENV !== 'production';

// ✅ FIX: Removed redundant `skip` — apiLimiter is already conditionally mounted in server.js
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    message: 'Too many requests, please try again later',
    retryAfter: 15,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ✅ FIX: Auth limiter still needs skip for dev since it's always mounted
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 100 : 10,
  message: {
    message: 'Too many authentication attempts, please try again later',
    retryAfter: 15,
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev,
});

export const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isDev ? 100 : 5,
  message: {
    message: 'Too many attempts, please try again later',
    retryAfter: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev,
});

export default { apiLimiter, authLimiter, strictLimiter };