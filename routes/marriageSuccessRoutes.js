// ===== FILE: ./routes/marriageSuccessRoutes.js =====
import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import { requireAgency } from '../middleware/requireAgency.js';
import { requireAgencyApproved } from '../middleware/requireAgencyApproved.js';

import {
  getAgencyPayments,
  adminListPayments,
  adminMarkPaid,
} from '../controllers/marriageSuccessController.js';

const router = express.Router();

// Agency routes
router.get(
  '/agency/payments',
  protect,
  requireAgency,
  requireAgencyApproved,
  getAgencyPayments
);

// Admin routes
router.get('/admin/all', protect, admin, adminListPayments);
router.patch('/admin/mark-paid/:id', protect, admin, adminMarkPaid);

export default router;