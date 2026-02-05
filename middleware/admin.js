// ===== FILE: ./middleware/admin.js =====
// Backwards-compatible wrapper.
// Source of truth is middleware/authMiddleware.js
import { admin as adminMiddleware } from './authMiddleware.js';

export default adminMiddleware;