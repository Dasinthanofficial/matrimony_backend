import express from 'express';
import { requireAuth, requireRole } from '../middleware/marketplaceAuth.js';
import Payment from '../models/Payment.js';

const router = express.Router();

router.get('/payments', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));

  const q = {};
  if (req.query.plan) q.plan = req.query.plan;
  if (!q.plan && req.query.paymentType) q.plan = req.query.paymentType; // backward compat
  if (req.query.status) q.status = req.query.status;

  const [payments, total] = await Promise.all([
    Payment.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Payment.countDocuments(q),
  ]);

  res.json({ payments, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

router.get('/payouts', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));

  const q = { plan: 'agency_service' };
  if (req.query.payoutStatus) q['payout.status'] = req.query.payoutStatus;

  const [payouts, total] = await Promise.all([
    Payment.find(q).sort({ 'payout.releaseAt': 1 }).skip((page - 1) * limit).limit(limit),
    Payment.countDocuments(q),
  ]);

  res.json({ payouts, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

export default router;