// server/controllers/subscriptionController.js
import mongoose from 'mongoose';
import Subscription from '../models/Subscription.js';
import SubscriptionPlan from '../models/SubscriptionPlan.js';
import Payment from '../models/Payment.js';
import User from '../models/User.js';
import { handleControllerError } from '../utils/errors.js';
import { formatPayHereAmount } from '../utils/payhere.js';

const FREE_FEATURES = {
  unlimitedMessages: false,
  seeWhoLikedYou: false,
  advancedFilters: false,
  prioritySupport: false,
  profileBoost: false,
  unlimitedLikes: false,
  readReceipts: false,
  noAds: false,
};

const payhereCheckoutUrl = () =>
  process.env.PAYHERE_SANDBOX === 'true'
    ? 'https://sandbox.payhere.lk/pay/checkout'
    : 'https://www.payhere.lk/pay/checkout';

const ensurePayHereConfigured = () => {
  if (!process.env.PAYHERE_MERCHANT_ID || !process.env.PAYHERE_MERCHANT_SECRET) {
    const e = new Error('PayHere not configured');
    e.code = 'PAYHERE_NOT_CONFIGURED';
    e.statusCode = 503;
    throw e;
  }
  if (!process.env.CLIENT_URL) {
    const e = new Error('CLIENT_URL not configured');
    e.code = 'CLIENT_URL_MISSING';
    e.statusCode = 500;
    throw e;
  }
  if (!process.env.SERVER_URL) {
    const e = new Error('SERVER_URL not configured');
    e.code = 'SERVER_URL_MISSING';
    e.statusCode = 500;
    throw e;
  }
};

const featuresArrayToFlags = (features = []) => {
  const flags = {};
  for (const f of features) flags[String(f)] = true;
  return flags;
};

// PUBLIC (legacy; your frontend uses GET /api/plans instead)
export const getPlans = async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find({ isActive: true }).sort({ sortOrder: 1, price: 1 }).lean();

    const payhereConfigured = Boolean(process.env.PAYHERE_MERCHANT_ID && process.env.PAYHERE_MERCHANT_SECRET);

    res.json({ plans, paymentGateway: 'payhere', payhereConfigured });
  } catch (e) {
    handleControllerError(res, e, 'Get plans');
  }
};

// PROTECTED
export const getMySubscription = async (req, res) => {
  try {
    const subscription = await Subscription.findOneAndUpdate(
      { userId: req.user._id },
      {
        $setOnInsert: {
          plan: 'free',
          status: 'active',
          features: FREE_FEATURES,
          startDate: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await User.findByIdAndUpdate(req.user._id, {
      subscriptionId: subscription._id,
      'subscription.plan': subscription.plan || 'free',
      'subscription.startDate': subscription.startDate || undefined,
      'subscription.endDate': subscription.endDate ?? null,
      'subscription.isActive': subscription.isActive(),
      premiumExpiry: subscription.endDate ?? null,
      isPremium: subscription.plan !== 'free' && subscription.isActive(),
    });

    res.json({
      subscription: {
        ...subscription.toObject(),
        isActive: subscription.isActive(),
      },
    });
  } catch (e) {
    handleControllerError(res, e, 'Get subscription');
  }
};

// ✅ PayHere checkout creator (dynamic plan support)
// Body: { planId: "<SubscriptionPlan._id>" } OR { planId: "<SubscriptionPlan.code>" }
export const createCheckoutSession = async (req, res) => {
  try {
    ensurePayHereConfigured();

    const { planId } = req.body || {};
    const userId = req.user._id;

    if (!planId) return res.status(400).json({ message: 'planId required' });

    const plan =
      mongoose.Types.ObjectId.isValid(planId)
        ? await SubscriptionPlan.findById(planId).lean()
        : await SubscriptionPlan.findOne({ code: String(planId).trim() }).lean();

    if (!plan || !plan.isActive) return res.status(404).json({ message: 'Plan not found' });

    // If you only want PayHere in LKR, enforce here:
    const currency = String(plan.currency || 'LKR').toUpperCase();
    if (currency !== 'LKR') {
      return res.status(400).json({ message: 'Only LKR plans are supported with PayHere in this setup.' });
    }

    const amountMajor = Number(plan.price);
    if (!Number.isFinite(amountMajor) || amountMajor < 0) return res.status(400).json({ message: 'Invalid plan price' });

    const user = await User.findById(userId).select('fullName email phone countryCode').lean();

    // Create local payment first (order_id will be this payment._id)
    const payment = await Payment.create({
      userId,
      plan: plan.code, // ✅ plan code stored here
      status: 'pending',
      amount: amountMajor,
      currency,
      gateway: 'payhere',
      description: `${plan.name} (PayHere)`,
      metadata: {
        kind: 'subscription',
        subscriptionPlanId: plan._id,
        planCode: plan.code,
        interval: plan.interval,
        intervalCount: plan.intervalCount,
        features: plan.features || [],
        gateway: 'payhere',
      },
    });

    const orderId = String(payment._id);

    const payload = {
      merchant_id: process.env.PAYHERE_MERCHANT_ID,
      return_url: `${process.env.CLIENT_URL}/subscription/success?order_id=${orderId}`,
      cancel_url: `${process.env.CLIENT_URL}/pricing?cancelled=true`,
      notify_url: `${process.env.SERVER_URL}/api/payments/payhere/notify`,

      order_id: orderId,
      items: plan.name,
      currency,
      amount: formatPayHereAmount(amountMajor),

      first_name: (user?.fullName || 'User').split(' ')[0] || 'User',
      last_name: (user?.fullName || '').split(' ').slice(1).join(' ') || '-',
      email: user?.email || 'no-email@matrimony.local',
      phone: user?.phone ? `${user?.countryCode || '+94'}${user.phone}` : '',
      address: 'N/A',
      city: 'N/A',
      country: 'Sri Lanka',
    };

    payment.payhere.orderId = payload.order_id;
    await payment.save();

    return res.json({
      gateway: 'payhere',
      checkoutUrl: payhereCheckoutUrl(),
      payload,
      orderId,
      currency,
      amount: amountMajor,
    });
  } catch (e) {
    handleControllerError(res, e, 'Create PayHere checkout');
  }
};

// Stripe-only endpoint removed (kept to avoid frontend crash if something still calls it)
export const createPaymentIntent = async (_req, res) => {
  return res.status(410).json({ message: 'Stripe removed. Use PayHere checkout.', code: 'STRIPE_REMOVED' });
};

// ✅ Verify payment for success page (polling-friendly)
// Body: { orderId }
export const verifyPayment = async (req, res) => {
  try {
    const { orderId } = req.body || {};
    if (!orderId) return res.status(400).json({ message: 'orderId required' });

    const payment = await Payment.findById(orderId);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    if (String(payment.userId) !== String(req.user._id)) return res.status(403).json({ message: 'Not authorized' });

    const subscription = await Subscription.findOne({ userId: req.user._id });

    // If payment not succeeded and subscription not active yet => frontend should keep polling
    if (payment.status !== 'succeeded' && (!subscription || !subscription.isActive())) {
      return res.status(202).json({ status: payment.status, payment: payment.toObject(), subscription: null });
    }

    return res.json({
      status: payment.status,
      payment: payment.toObject(),
      subscription: subscription ? { ...subscription.toObject(), isActive: subscription.isActive() } : null,
    });
  } catch (e) {
    handleControllerError(res, e, 'Verify PayHere payment');
  }
};

export const cancelSubscription = async (req, res) => {
  try {
    const userId = req.user._id;
    const subscription = await Subscription.findOne({ userId });

    if (!subscription || subscription.plan === 'free') {
      return res.status(400).json({ message: 'No active subscription' });
    }

    // PayHere one-time flow: no gateway cancel; just disable autoRenew
    subscription.status = 'active';
    subscription.cancelledAt = new Date();
    subscription.autoRenew = false;
    await subscription.save();

    await User.findByIdAndUpdate(userId, {
      premiumExpiry: subscription.endDate ?? null,
      'subscription.isActive': subscription.isActive(),
    });

    res.json({
      message: 'Subscription cancelled (no auto-renew). Access continues until end date.',
      subscription,
    });
  } catch (e) {
    handleControllerError(res, e, 'Cancel subscription');
  }
};

export const getPaymentHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const pageNum = Math.max(1, parseInt(req.query.page || '1', 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit || '10', 10)));

    const total = await Payment.countDocuments({ userId, status: 'succeeded' });
    const payments = await Payment.find({ userId, status: 'succeeded' })
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    res.json({
      payments,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (e) {
    handleControllerError(res, e, 'Get payment history');
  }
};

export const checkFeatureAccess = async (req, res) => {
  try {
    const { feature } = req.params;
    const userId = req.user._id;

    const subscription = await Subscription.findOne({ userId });
    if (!subscription) return res.json({ hasAccess: false, plan: 'free' });

    const isActive = subscription.isActive();
    const hasFeature = subscription.features?.[feature] || false;

    res.json({ hasAccess: isActive && hasFeature, plan: subscription.plan, isActive });
  } catch (e) {
    handleControllerError(res, e, 'Check feature access');
  }
};

// Stripe webhook removed
export const handleWebhook = async (_req, res) => {
  return res.status(410).json({ message: 'Stripe webhook removed. Using PayHere notify_url.', code: 'STRIPE_REMOVED' });
};

export default {
  getPlans,
  getMySubscription,
  createCheckoutSession,
  createPaymentIntent,
  verifyPayment,
  cancelSubscription,
  getPaymentHistory,
  checkFeatureAccess,
  handleWebhook,
};