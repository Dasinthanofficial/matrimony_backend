// ===== FILE: ./middleware/optionalAuth.js =====
// Backwards-compatible wrapper.
// Source of truth is middleware/authMiddleware.js
import { optionalAuth as optionalAuthMiddleware } from './authMiddleware.js';

export default optionalAuthMiddleware;