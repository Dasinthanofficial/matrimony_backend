// ===== FILE: ./controllers/adminVerifiedBadgeController.js =====
import mongoose from 'mongoose';
import VerifiedBadgeConfig from '../models/VerifiedBadgeConfig.js';
import AgencyReputation from '../models/AgencyReputation.js';
import { ensureReputationDoc, recalcAgencyLevel } from '../services/agencyReputationService.js';

const computeExpiresAt = (durationDays) => {
  const d = Number(durationDays ?? 365);
  if (!Number.isFinite(d) || d <= 0) return null; // lifetime
  return new Date(Date.now() + d * 24 * 60 * 60 * 1000);
};

export async function getVerifiedBadgeConfig(req, res) {
  const cfg = await VerifiedBadgeConfig.findOne().sort({ createdAt: -1 }).lean();
  return res.json({
    config: cfg || { isEnabled: false, currency: 'LKR', priceMinor: 0, durationDays: 365 },
  });
}

export async function upsertVerifiedBadgeConfig(req, res) {
  const b = req.body || {};

  const isEnabled = b.isEnabled === true;

  const currency = String(b.currency || 'LKR').toUpperCase();

  // accept either priceMinor or priceMajor
  let priceMinor = b.priceMinor;
  if (priceMinor == null && b.priceMajor != null) {
    const major = Number(b.priceMajor);
    priceMinor = Math.round(major * 100);
  }
  priceMinor = Number(priceMinor);

  if (!Number.isFinite(priceMinor) || priceMinor < 0) {
    return res.status(400).json({ message: 'priceMinor (or priceMajor) must be a valid number >= 0' });
  }

  let durationDays = b.durationDays;
  durationDays = durationDays == null ? 365 : Number(durationDays);
  if (!Number.isFinite(durationDays) || durationDays < 0) {
    return res.status(400).json({ message: 'durationDays must be >= 0' });
  }

  const cfg = await VerifiedBadgeConfig.findOneAndUpdate(
    {},
    { $set: { isEnabled, currency, priceMinor, durationDays } },
    { upsert: true, new: true }
  );

  return res.json({ success: true, config: cfg });
}

export async function adminGrantVerifiedBadge(req, res) {
  const { agencyId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(agencyId)) {
    return res.status(400).json({ message: 'Invalid agencyId' });
  }

  const cfg = await VerifiedBadgeConfig.findOne().sort({ createdAt: -1 }).lean();
  const expiresAt = computeExpiresAt(cfg?.durationDays);

  await ensureReputationDoc(agencyId);

  const rep = await AgencyReputation.findOneAndUpdate(
    { agencyId },
    {
      $set: {
        'verifiedBadge.isActive': true,
        'verifiedBadge.purchasedAt': new Date(),
        'verifiedBadge.expiresAt': expiresAt,
        'verifiedBadge.lastPaymentId': null,
      },
    },
    { new: true }
  );

  await recalcAgencyLevel(agencyId);

  return res.json({ success: true, verifiedBadge: rep.verifiedBadge });
}

export async function adminRevokeVerifiedBadge(req, res) {
  const { agencyId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(agencyId)) {
    return res.status(400).json({ message: 'Invalid agencyId' });
  }

  await ensureReputationDoc(agencyId);

  const rep = await AgencyReputation.findOneAndUpdate(
    { agencyId },
    {
      $set: {
        'verifiedBadge.isActive': false,
        'verifiedBadge.expiresAt': new Date(),
      },
    },
    { new: true }
  );

  await recalcAgencyLevel(agencyId);

  return res.json({ success: true, verifiedBadge: rep.verifiedBadge });
}

export default {
  getVerifiedBadgeConfig,
  upsertVerifiedBadgeConfig,
  adminGrantVerifiedBadge,
  adminRevokeVerifiedBadge,
};