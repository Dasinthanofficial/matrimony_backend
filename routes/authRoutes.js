// ===== FILE: ./routes/authRoutes.js =====
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { handleValidation } from '../middleware/validate.js';
import { registerValidator, loginValidator } from '../validators/authValidator.js';
import {
  register,
  login,
  logout,
  getMe,
  refreshToken,
  sendEmailOtp,
  verifyEmail,
  forgotPassword,
  resetPassword,
  changePassword,
  deleteAccount,
} from '../controllers/authController.js';

const router = express.Router();

// ============================================
// PUBLIC ROUTES
// ============================================

// Registration & Login
router.post('/register', registerValidator, handleValidation, register);
router.post('/login', loginValidator, handleValidation, login);
router.post('/logout', logout);

// Token refresh
router.post('/refresh-token', refreshToken);

// Email verification
router.post('/send-email-otp', sendEmailOtp);
router.get('/verify-email/:token', verifyEmail);

// Password reset
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);

// ============================================
// PROTECTED ROUTES
// ============================================

// Get current user
router.get('/me', protect, getMe);

// Change password (must be logged in)
router.post('/change-password', protect, changePassword);

// Delete account (must be logged in)
router.delete('/delete-account', protect, deleteAccount);

export default router;