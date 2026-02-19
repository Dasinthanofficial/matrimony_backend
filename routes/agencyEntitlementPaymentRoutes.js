// ===== FILE: ./routes/agencyEntitlementPaymentRoutes.js =====
import express, { Router } from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { requireAgencyApproved } from '../middleware/requireAgencyApproved.js';
import {
  getVerifiedBadgeConfigForAgency,
  getMyVerifiedBadgeStatus,
  createVerifiedBadgeCheckout,
  payhereNotifyVerifiedBadge,
  verifyVerifiedBadgePayment,
} from '../controllers/agencyEntitlementPaymentController.js';

const router = Router();

// Agency can view current config (price/duration)
router.get('/verified-badge/config', protect, requireAgencyApproved, getVerifiedBadgeConfigForAgency);

// ✅ NEW: Agency can view current status (active/expiry)
router.get('/verified-badge/status', protect, requireAgencyApproved, getMyVerifiedBadgeStatus);

// Start PayHere checkout (returns checkoutUrl + payload)
router.post('/verified-badge/checkout', protect, requireAgencyApproved, createVerifiedBadgeCheckout);

// Verify after redirect (polling)
router.post('/verified-badge/verify', protect, requireAgencyApproved, verifyVerifiedBadgePayment);

// PayHere notify (NO auth; uses PayHere md5sig verification)
router.post(
  '/verified-badge/payhere/notify',
  express.urlencoded({ extended: false }),
  payhereNotifyVerifiedBadge
);

export default router;