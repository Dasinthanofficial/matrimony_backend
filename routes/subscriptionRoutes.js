import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  getPlans,
  getMySubscription,
  createCheckoutSession,
  createPaymentIntent,
  verifyPayment,
  cancelSubscription,
  getPaymentHistory,
  checkFeatureAccess,
  handleWebhook,
} from '../controllers/subscriptionController.js';

const router = express.Router();

// Stripe webhook (NO auth)
router.post('/webhook', handleWebhook);

// Public
router.get('/plans', getPlans);

// Protected
router.get('/my-subscription', protect, getMySubscription);
router.post('/create-checkout', protect, createCheckoutSession);
router.post('/create-payment-intent', protect, createPaymentIntent);
router.post('/verify', protect, verifyPayment);
router.post('/cancel', protect, cancelSubscription);
router.get('/history', protect, getPaymentHistory);
router.get('/check-feature/:feature', protect, checkFeatureAccess);

export default router;