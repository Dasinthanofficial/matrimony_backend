import mongoose from 'mongoose';
import AgencyReputation from '../models/AgencyReputation.js';
import { ensureReputationDoc, isBadgeActiveNow } from '../services/agencyReputationService.js';

export async function getAgencyReputation(req, res) {
  try {
    const { agencyId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(agencyId)) return res.status(400).json({ message: 'Invalid agencyId' });

    const rep = await ensureReputationDoc(agencyId);
    res.json({
      agencyId,
      ratingAvg: rep.ratingAvg,
      ratingCount: rep.ratingCount,
      agencyLevel: rep.agencyLevel,
      stats: rep.stats,
      verifiedBadge: {
        isActive: isBadgeActiveNow(rep),
        purchasedAt: rep.verifiedBadge?.purchasedAt || null,
        expiresAt: rep.verifiedBadge?.expiresAt || null,
      },
    });
  } catch {
    res.status(500).json({ message: 'Failed to load agency reputation' });
  }
}