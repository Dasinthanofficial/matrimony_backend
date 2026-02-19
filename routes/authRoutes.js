// routes/authRoutes.js
import express from 'express';
import multer from 'multer';
import { protect } from '../middleware/authMiddleware.js';

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

// store locally (replace with S3 middleware if you already have)
const upload = multer({ dest: 'uploads/' });

// PUBLIC
router.post(
  '/register',
  upload.fields([
    { name: 'nicFront', maxCount: 1 },
    { name: 'nicBack', maxCount: 1 },
    { name: 'businessReg', maxCount: 1 },
  ]),
  register
);

router.post('/login', login);
router.post('/logout', logout);
router.post('/refresh-token', refreshToken);

router.post('/send-email-otp', sendEmailOtp);
router.get('/verify-email/:token', verifyEmail);

router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);

// PROTECTED
router.get('/me', protect, getMe);
router.post('/change-password', protect, changePassword);
router.delete('/delete-account', protect, deleteAccount);

export default router;