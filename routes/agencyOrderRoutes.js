// server/routes/agencyOrderRoutes.js
import express from 'express';
import { requireAuth, requireRole } from '../middleware/marketplaceAuth.js';
import { requireAgencyApproved } from '../middleware/requireAgencyApproved.js';
import {
  createAgencyOrderCheckout,
  verifyAgencyOrderPayment,
  payhereNotifyAgencyOrder,
  listMyAgencyOrders,
  listAgencyOrders,
  updateAgencyOrderStatus,
} from '../controllers/agencyOrderController.js';

const router = express.Router();

// buyer
router.post('/checkout', requireAuth, createAgencyOrderCheckout);
router.post('/verify', requireAuth, verifyAgencyOrderPayment);
router.get('/me', requireAuth, listMyAgencyOrders);

// payhere notify (NO auth)
router.post('/payhere/notify', express.urlencoded({ extended: false }), payhereNotifyAgencyOrder);

// agency
router.get('/agency', requireAuth, requireRole('agency'), requireAgencyApproved, listAgencyOrders);
router.patch('/:id/status', requireAuth, requireRole('agency'), requireAgencyApproved, updateAgencyOrderStatus);

export default router;