// server/controllers/payhereController.js
import Payment from '../models/Payment.js';
import Subscription from '../models/Subscription.js';
import SubscriptionPlan from '../models/SubscriptionPlan.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { verifyPayHereMd5Sig } from '../utils/payhere.js';

function addInterval(startDate, interval, intervalCount) {
  const s = new Date(startDate);
  const e = new Date(s);

  const intv = String(interval || 'month');
  const n = Math.max(1, Number(intervalCount) || 1);

  if (intv === 'lifetime') return { startDate: s, endDate: null };

  if (intv === 'year') e.setFullYear(e.getFullYear() + n);
  else e.setMonth(e.getMonth() + n); // default month

  return { startDate: s, endDate: e };
}

function featuresArrayToFlags(features = []) {
  const flags = {};
  for (const f of features) flags[String(f)] = true;
  return flags;
}

async function activateSubscriptionForPayment(payment) {
  // Supports:
  // - legacy monthly/yearly payments
  // - new dynamic SubscriptionPlan.code payments (metadata.kind === 'subscription')
  const kind = payment?.metadata?.kind;

  let planDoc = null;

  if (payment?.metadata?.subscriptionPlanId) {
    planDoc = await SubscriptionPlan.findById(payment.metadata.subscriptionPlanId).lean();
  }

  if (!planDoc && payment?.metadata?.planCode) {
    planDoc = await SubscriptionPlan.findOne({ code: payment.metadata.planCode }).lean();
  }

  // Legacy fallback: monthly/yearly
  if (!planDoc && (payment.plan === 'monthly' || payment.plan === 'yearly')) {
    planDoc = {
      code: payment.plan,
      interval: payment.plan === 'yearly' ? 'year' : 'month',
      intervalCount: 1,
      features: [
        'chatAccess',
        'seeWhoLiked',
        'advancedFilters',
        'unlimitedLikes',
        'readReceipts',
        'noAds',
        ...(payment.plan === 'yearly' ? ['prioritySupport', 'profileBoost'] : []),
      ],
    };
  }

  // If it’s not a subscription purchase, do nothing
  if (!planDoc && kind !== 'subscription') return null;
  if (!planDoc) throw new Error('Subscription plan not found for payment');

  const { startDate, endDate } = addInterval(new Date(), planDoc.interval, planDoc.intervalCount);

  const sub = await Subscription.findOneAndUpdate(
    { userId: payment.userId },
    {
      plan: planDoc.code, // ✅ plan stored as code
      status: 'active',
      startDate,
      endDate,
      autoRenew: false,
      currency: payment.currency,
      amount: payment.amount,
      features: featuresArrayToFlags(planDoc.features || []),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await User.findByIdAndUpdate(payment.userId, {
    isPremium: planDoc.code !== 'free',
    premiumExpiry: endDate, // null for lifetime
    subscriptionId: sub._id,
    'subscription.plan': planDoc.code,
    'subscription.startDate': startDate,
    'subscription.endDate': endDate,
    'subscription.isActive': sub.isActive(),
  });

  // best-effort notification
  try {
    await Notification.create({
      userId: payment.userId,
      type: 'subscription',
      title: 'Subscription activated',
      message: `Your ${planDoc.code} subscription is now active.`,
      actionUrl: '/dashboard',
      metadata: { plan: planDoc.code, endDate },
    });
  } catch {
    // ignore
  }

  return sub;
}

// PayHere sends x-www-form-urlencoded
export async function payhereNotify(req, res) {
  try {
    const body = req.body || {};

    const ok = verifyPayHereMd5Sig({
      merchant_id: body.merchant_id,
      order_id: body.order_id,
      payhere_amount: body.payhere_amount,
      payhere_currency: body.payhere_currency,
      status_code: body.status_code,
      md5sig: body.md5sig,
      merchant_secret: process.env.PAYHERE_MERCHANT_SECRET,
    });

    if (!ok) return res.status(400).send('INVALID_SIGNATURE');

    const payment = await Payment.findById(body.order_id);
    if (!payment) return res.status(404).send('PAYMENT_NOT_FOUND');

    // idempotent
    if (['succeeded', 'failed', 'cancelled'].includes(payment.status)) return res.status(200).send('OK');

    payment.gateway = 'payhere';
    payment.currency = String(body.payhere_currency || payment.currency || 'LKR').toUpperCase();
    payment.amount = Number(body.payhere_amount || payment.amount);

    payment.payhere = {
      orderId: String(body.order_id || ''),
      paymentId: String(body.payment_id || ''),
      statusCode: body.status_code != null ? Number(body.status_code) : null,
      method: String(body.method || ''),
      statusMessage: String(body.status_message || ''),
    };

    payment.metadata = { ...(payment.metadata || {}), payhere: body };

    const status = Number(body.status_code);

    if (status === 2) {
      payment.status = 'succeeded';

      // ✅ Activate subscription for subscription purchases
      try {
        await activateSubscriptionForPayment(payment);
      } catch {
        // If activation fails, keep payment succeeded, user can verify/poll later (or admin can inspect)
      }
    } else if (status === -1) {
      payment.status = 'cancelled';
    } else {
      payment.status = 'failed';
    }

    await payment.save();
    return res.status(200).send('OK');
  } catch {
    // PayHere expects 200; don't cause infinite retries
    return res.status(200).send('OK');
  }
}