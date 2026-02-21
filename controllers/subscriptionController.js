// server/controllers/subscriptionController.js
import mongoose from 'mongoose';
import crypto from 'crypto';

import Subscription from '../models/Subscription.js';
import SubscriptionPlan from '../models/SubscriptionPlan.js';
import Payment from '../models/Payment.js';
import User from '../models/User.js';

import { handleControllerError, AppError } from '../utils/errors.js';
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

const md5 = (s) => crypto.createHash('md5').update(String(s)).digest('hex');

// PayHere Hash Logic: hash = UPPER(MD5(merchant_id + order_id + amount + currency + UPPER(MD5(merchant_secret))))
function buildPayHereHash({ merchant_id, order_id, amount, currency, merchant_secret }) {
  // 1. Hash the secret first and make it Uppercase
  const hashedSecret = crypto
    .createHash('md5')
    .update(String(merchant_secret))
    .digest('hex')
    .toUpperCase();
  
  // 2. Concatenate fields: MerchantID + OrderID + Amount + Currency + hashedSecret
  const rawString = 
    String(merchant_id) + 
    String(order_id) + 
    String(amount) + 
    String(currency) + 
    hashedSecret;

  // 3. Hash the whole string and return Uppercase
  return crypto.createHash('md5').update(rawString).digest('hex').toUpperCase();
}

const payhereCheckoutUrl = () => {
  if (process.env.PAYHERE_CHECKOUT_URL) return process.env.PAYHERE_CHECKOUT_URL;
  return process.env.PAYHERE_SANDBOX === 'true'
    ? 'https://sandbox.payhere.lk/pay/checkout'
    : 'https://www.payhere.lk/pay/checkout';
};

// Helper to remove accidental quotes from Render env vars
const cleanEnv = (val) => {
  if (!val) return '';
  return String(val).replace(/^['"]|['"]$/g, '').trim();
};

const resolveServerUrl = () => {
  const url = cleanEnv(process.env.SERVER_URL || process.env.API_URL);
  return url ? url.replace(/\/+$/, '') : null;
};

const resolveClientUrl = () => {
  const url = cleanEnv(process.env.CLIENT_URL);
  return url ? url.replace(/\/+$/, '') : null;
};

const ensurePayHereConfigured = () => {
  const merchantId = cleanEnv(process.env.PAYHERE_MERCHANT_ID);
  const merchantSecret = cleanEnv(process.env.PAYHERE_MERCHANT_SECRET);

  if (!merchantId || !merchantSecret) {
    throw new AppError('PayHere config missing', 503, 'PAYHERE_NOT_CONFIGURED');
  }

  const clientUrl = resolveClientUrl();
  if (!clientUrl) {
    throw new AppError('CLIENT_URL not configured', 500, 'CLIENT_URL_MISSING');
  }

  const serverUrl = resolveServerUrl();
  if (!serverUrl) {
    throw new AppError('SERVER_URL (or API_URL) not configured', 500, 'SERVER_URL_MISSING');
  }

  return { merchantId, merchantSecret, clientUrl, serverUrl };
};

const featuresArrayToFlags = (features = []) => {
  const flags = {};
  for (const f of features) flags[String(f)] = true;
  return flags;
};

export const getPlans = async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find({ isActive: true })
      .sort({ sortOrder: 1, price: 1 })
      .lean();

    const payhereConfigured = Boolean(process.env.PAYHERE_MERCHANT_ID && process.env.PAYHERE_MERCHANT_SECRET);

    res.json({ plans, paymentGateway: 'payhere', payhereConfigured });
  } catch (e) {
    handleControllerError(res, e, 'Get plans');
  }
};

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

export const createCheckoutSession = async (req, res) => {
  try {
    const { merchantId, merchantSecret, clientUrl, serverUrl } = ensurePayHereConfigured();

    const { planId } = req.body || {};
    const userId = req.user._id;

    if (!planId) return res.status(400).json({ message: 'planId required' });

    const plan =
      mongoose.Types.ObjectId.isValid(planId)
        ? await SubscriptionPlan.findById(planId).lean()
        : await SubscriptionPlan.findOne({ code: String(planId).trim() }).lean();

    if (!plan || !plan.isActive) return res.status(404).json({ message: 'Plan not found' });

    const currency = String(plan.currency || 'LKR').toUpperCase();
    if (currency !== 'LKR') {
      return res.status(400).json({ message: 'Only LKR plans are supported with PayHere in this setup.' });
    }

    const amountMajor = Number(plan.price);
    if (!Number.isFinite(amountMajor) || amountMajor < 0) {
      return res.status(400).json({ message: 'Invalid plan price' });
    }
    if (amountMajor === 0) {
      return res.status(400).json({
        message: 'This plan is free and does not require payment.',
        code: 'FREE_PLAN_NO_CHECKOUT',
      });
    }

    const user = await User.findById(userId).select('fullName email phone countryCode').lean();

    // Create local payment first (order_id will be this payment._id)
    const payment = await Payment.create({
      userId,
      plan: plan.code,
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
    const amountStr = formatPayHereAmount(amountMajor);

    const payload = {
      merchant_id: merchantId,
      return_url: `${clientUrl}/subscription/success?order_id=${encodeURIComponent(orderId)}`,
      cancel_url: `${clientUrl}/pricing?cancelled=true`,
      notify_url: `${serverUrl}/api/payments/payhere/notify`, // Standardized route

      order_id: orderId,
      items: plan.name,
      currency,
      amount: amountStr,

      first_name: (user?.fullName || 'User').split(' ')[0] || 'User',
      last_name: (user?.fullName || '').split(' ').slice(1).join(' ') || '-',
      email: user?.email || 'no-email@matrimony.local',
      phone: user?.phone ? `${user?.countryCode || '+94'}${user.phone}` : '0771234567',
      address: 'N/A',
      city: 'N/A',
      country: 'Sri Lanka',
    };

    // Add PayHere hash (Correctly calculated)
    payload.hash = buildPayHereHash({
      merchant_id: merchantId,
      order_id: orderId,
      amount: amountStr,
      currency,
      merchant_secret: merchantSecret,
    });

    // Save PayHere specific details
    payment.payhere = payment.payhere || {};
    payment.payhere.orderId = orderId;
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

export const createPaymentIntent = async (_req, res) => {
  return res.status(410).json({ message: 'Stripe removed. Use PayHere checkout.', code: 'STRIPE_REMOVED' });
};

export const verifyPayment = async (req, res) => {
  try {
    const { orderId } = req.body || {};
    if (!orderId) return res.status(400).json({ message: 'orderId required' });

    const payment = await Payment.findById(orderId);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    if (String(payment.userId) !== String(req.user._id)) return res.status(403).json({ message: 'Not authorized' });

    const subscription = await Subscription.findOne({ userId: req.user._id });

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