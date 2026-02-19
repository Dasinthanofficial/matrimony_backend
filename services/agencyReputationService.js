import mongoose from 'mongoose';
import AgencyReview from '../models/AgencyReview.js';
import AgencyReputation from '../models/AgencyReputation.js';
import AgencyLevelRule from '../models/AgencyLevelRule.js';

export async function ensureReputationDoc(agencyId) {
  return AgencyReputation.findOneAndUpdate(
    { agencyId },
    { $setOnInsert: { agencyId } },
    { new: true, upsert: true }
  );
}

export async function recalcAgencyRating(agencyId) {
  const [row] = await AgencyReview.aggregate([
    { $match: { agencyId: new mongoose.Types.ObjectId(agencyId), status: 'published' } },
    { $group: { _id: '$agencyId', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);

  const ratingAvg = row?.avg ? Math.round(row.avg * 10) / 10 : 0;
  const ratingCount = row?.count || 0;

  await ensureReputationDoc(agencyId);
  return AgencyReputation.findOneAndUpdate(
    { agencyId },
    { $set: { ratingAvg, ratingCount } },
    { new: true }
  );
}

export async function recalcAgencyLevel(agencyId) {
  const rep = await ensureReputationDoc(agencyId);
  const rules = await AgencyLevelRule.find({ isActive: true }).sort({ level: 1 });

  let newLevel = 1;
  for (const r of rules) {
    const ok =
      rep.stats.postMarriagePaymentsCount >= r.minPostMarriagePaymentsCount &&
      rep.stats.postMarriageRevenueMinor >= r.minPostMarriageRevenueMinor &&
      rep.ratingAvg >= r.minAvgRating &&
      rep.ratingCount >= r.minRatingCount;
    if (ok) newLevel = r.level;
  }

  if (newLevel !== rep.agencyLevel) {
    rep.agencyLevel = newLevel;
    await rep.save();
  }
  return rep;
}

export function isBadgeActiveNow(rep) {
  if (!rep?.verifiedBadge?.isActive) return false;
  const exp = rep.verifiedBadge.expiresAt;
  return !exp || new Date(exp).getTime() > Date.now();
}