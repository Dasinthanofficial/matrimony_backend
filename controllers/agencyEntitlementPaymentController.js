// ===== FILE: ./controllers/agencyEntitlementPaymentController.js =====
import mongoose from 'mongoose';
import crypto from 'crypto';
import AgencyEntitlementPayment from '../models/AgencyEntitlementPayment.js';
import VerifiedBadgeConfig from '../models/VerifiedBadgeConfig.js';
import AgencyReputation from '../models/AgencyReputation.js';
import { ensureReputationDoc, recalcAgencyLevel } from '../services/agencyReputationService.js';
import { formatPayHereAmount, verifyPayHereMd5Sig } from '../utils/payhere.js';

const PAYHERE_CHECKOUT_URL = process.env.PAYHERE_CHECKOUT_URL || 'https://www.payhere.lk/pay/checkout';

const md5 = (s) => crypto.createHash('md5').update(String(s)).digest('hex');

const makePayHereHash = ({ merchant_id, order_id, amount, currency, merchant_secret }) => {
  // PayHere hash:
  // hash = toUpper(md5(merchant_id + order_id + amount + currency + toUpper(md5(merchant_secret))))
  const secretMd5 = md5(merchant_secret).toUpperCase();
  return md5(`${merchant_id}${order_id}${amount}${currency}${secretMd5}`).toUpperCase();
};

const computeExpiresAt = (durationDays, baseDate = new Date()) => {
  const d = Number(durationDays ?? 365);
  if (!Number.isFinite(d) || d <= 0) return null; // lifetime
  return new Date(baseDate.getTime() + d * 24 * 60 * 60 * 1000);
};

const minorToMajor = (amountMinor) => Number(amountMinor || 0) / 100;

export async function getVerifiedBadgeConfigForAgency(req, res) {
  try {
    const cfg = await VerifiedBadgeConfig.findOne().sort({ createdAt: -1 }).lean();
    return res.json({
      config: cfg || { isEnabled: false, currency: 'LKR', priceMinor: 0, durationDays: 365 },
    });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Failed to load config' });
  }
}

// ✅ NEW (recommended): Agency dashboard can query current badge status easily
export async function getMyVerifiedBadgeStatus(req, res) {
  try {
    if (!req.user?._id) return res.status(401).json({ message: 'Unauthorized' });
    if (req.user.role !== 'agency') return res.status(403).json({ message: 'Agency access only' });

    await ensureReputationDoc(req.user._id);

    const rep = await AgencyReputation.findOne({ agencyId: req.user._id }).lean();

    return res.json({
      verifiedBadge: rep?.verifiedBadge || { isActive: false, purchasedAt: null, expiresAt: null },
    });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Failed to load status' });
  }
}

export async function createVerifiedBadgeCheckout(req, res) {
  try {
    if (!req.user?._id) return res.status(401).json({ message: 'Unauthorized' });
    if (req.user.role !== 'agency') return res.status(403).json({ message: 'Agency access only' });
    if (req.user.agencyVerification?.status !== 'approved') {
      return res.status(403).json({ message: 'Agency not approved', code: 'AGENCY_NOT_APPROVED' });
    }

    const cfg = await VerifiedBadgeConfig.findOne().sort({ createdAt: -1 }).lean();
    if (!cfg || !cfg.isEnabled) return res.status(400).json({ message: 'Verified badge is not available' });

    const priceMinor = Number(cfg.priceMinor || 0);
    if (!Number.isFinite(priceMinor) || priceMinor <= 0) {
      return res.status(400).json({ message: 'Verified badge price is not configured' });
    }

    const merchant_id = process.env.PAYHERE_MERCHANT_ID;
    const merchant_secret = process.env.PAYHERE_MERCHANT_SECRET;
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const serverUrl = process.env.SERVER_URL || 'http://localhost:5000';

    if (!merchant_id || !merchant_secret) {
      return res.status(500).json({ message: 'PayHere merchant config missing' });
    }

    const agencyUserId = req.user._id.toString();

    // Create payment record first; use _id as PayHere order_id.
    const payment = await AgencyEntitlementPayment.create({
      kind: 'verified_badge',
      agencyId: agencyUserId,
      userId: agencyUserId,
      currency: String(cfg.currency || 'LKR').toUpperCase(),
      amountMinor: priceMinor,
      provider: 'payhere',
      providerRef: 'pending',
      status: 'pending',
      metadata: { durationDays: cfg.durationDays },
    });

    const order_id = payment._id.toString();
    payment.providerRef = order_id;
    await payment.save();

    const amountMajor = minorToMajor(payment.amountMinor);
    const amountStr = formatPayHereAmount(amountMajor); // must match what you send to PayHere

    const notify_url = `${serverUrl}/api/payments/agency/verified-badge/payhere/notify`;

    // ✅ include orderId in return/cancel so frontend can verify without guessing
    const return_url = `${clientUrl}/agency/verified-badge?orderId=${encodeURIComponent(order_id)}`;
    const cancel_url = `${clientUrl}/agency/verified-badge?cancelled=1&orderId=${encodeURIComponent(order_id)}`;

    const fullName = String(req.user.fullName || 'Agency');
    const [first_name, ...rest] = fullName.split(' ');
    const last_name = rest.join(' ') || 'Agency';

    const payload = {
      merchant_id,
      return_url,
      cancel_url,
      notify_url,

      order_id,
      items: 'Verified Badge',
      currency: payment.currency,
      amount: amountStr,

      first_name: first_name || 'Agency',
      last_name,
      email: req.user.email || 'no-email@example.com',
      phone: req.user.phone || '',
      address: req.user.agencyVerification?.currentAddress || '',
      city: 'Colombo',
      country: 'Sri Lanka',

      custom_1: 'verified_badge',
      custom_2: agencyUserId,
    };

    // ✅ REQUIRED by PayHere
    payload.hash = makePayHereHash({
      merchant_id,
      order_id,
      amount: amountStr,
      currency: payload.currency,
      merchant_secret,
    });

    return res.json({
      checkoutUrl: PAYHERE_CHECKOUT_URL,
      payload,
      orderId: order_id,
    });
  } catch (e) {
    console.error('createVerifiedBadgeCheckout error:', e);
    return res.status(500).json({ message: e?.message || 'Server error' });
  }
}

// PayHere IPN (x-www-form-urlencoded)
// POST /api/payments/agency/verified-badge/payhere/notify
export async function payhereNotifyVerifiedBadge(req, res) {
  try {
    const merchant_secret = process.env.PAYHERE_MERCHANT_SECRET;
    if (!merchant_secret) return res.status(500).send('MISSING_MERCHANT_SECRET');

    const ok = verifyPayHereMd5Sig({ ...req.body, merchant_secret });
    if (!ok) return res.status(400).send('INVALID_SIGNATURE');

    const order_id = String(req.body.order_id || '');
    const status_code = String(req.body.status_code || '');

    if (!mongoose.Types.ObjectId.isValid(order_id)) return res.status(400).send('INVALID_ORDER');

    const payment = await AgencyEntitlementPayment.findById(order_id);
    if (!payment) return res.status(404).send('NOT_FOUND');

    // Optional safety: ensure amount/currency match what we expect
    const payhereCurrency = String(req.body.currency || '').toUpperCase();
    const payhereAmount = Number(req.body.payhere_amount || req.body.amount || 0);
    const expectedAmount = minorToMajor(payment.amountMinor);

    if (payhereCurrency && payhereCurrency !== String(payment.currency).toUpperCase()) {
      payment.status = 'failed';
      payment.processedAt = new Date();
      await payment.save();
      return res.send('OK');
    }
    if (payhereAmount && Math.abs(payhereAmount - expectedAmount) > 0.009) {
      payment.status = 'failed';
      payment.processedAt = new Date();
      await payment.save();
      return res.send('OK');
    }

    // Map PayHere statuses: 2 success, 0 pending, -1 cancelled, -2 failed, -3 chargeback
    if (status_code === '2') payment.status = 'succeeded';
    else if (status_code === '0') payment.status = 'pending';
    else if (status_code === '-1') payment.status = 'cancelled';
    else payment.status = 'failed';

    payment.processedAt = new Date();
    await payment.save();

    if (payment.status === 'succeeded' && payment.kind === 'verified_badge') {
      await ensureReputationDoc(payment.agencyId);

      const rep = await AgencyReputation.findOne({ agencyId: payment.agencyId }).lean();

      const now = new Date();
      const currentExpiry = rep?.verifiedBadge?.expiresAt ? new Date(rep.verifiedBadge.expiresAt) : null;

      // renewal logic:
      // - if lifetime already => keep lifetime
      // - else extend from max(currentExpiry, now)
      let expiresAt = null;
      const durationDays = payment.metadata?.durationDays;

      if (currentExpiry === null && rep?.verifiedBadge?.isActive === true) {
        expiresAt = null; // already lifetime
      } else {
        const base = currentExpiry && currentExpiry > now ? currentExpiry : now;
        expiresAt = computeExpiresAt(durationDays, base);
      }

      await AgencyReputation.findOneAndUpdate(
        { agencyId: payment.agencyId },
        {
          $set: {
            'verifiedBadge.isActive': true,
            'verifiedBadge.purchasedAt': now,
            'verifiedBadge.expiresAt': expiresAt,
            'verifiedBadge.lastPaymentId': payment._id,
          },
        },
        { new: true }
      );

      await recalcAgencyLevel(payment.agencyId);
    }

    return res.send('OK');
  } catch (e) {
    console.error('payhereNotifyVerifiedBadge error:', e);
    return res.status(500).send('ERROR');
  }
}

// POST /api/payments/agency/verified-badge/verify
export async function verifyVerifiedBadgePayment(req, res) {
  try {
    if (!req.user?._id) return res.status(401).json({ message: 'Unauthorized' });

    const { orderId } = req.body || {};
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ message: 'Invalid orderId' });
    }

    const payment = await AgencyEntitlementPayment.findById(orderId).lean();
    if (!payment) return res.status(404).json({ message: 'Payment not found' });

    if (String(payment.agencyId) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const rep = await AgencyReputation.findOne({ agencyId: req.user._id }).lean();

    return res.json({
      status: payment.status,
      payment,
      verifiedBadge: rep?.verifiedBadge || null,
    });
  } catch (e) {
    console.error('verifyVerifiedBadgePayment error:', e);
    return res.status(500).json({ message: e?.message || 'Server error' });
  }
}

export default {
  getVerifiedBadgeConfigForAgency,
  getMyVerifiedBadgeStatus,
  createVerifiedBadgeCheckout,
  payhereNotifyVerifiedBadge,
  verifyVerifiedBadgePayment,
};