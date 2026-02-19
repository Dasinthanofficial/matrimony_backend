import mongoose from 'mongoose';
import AgencyFeedback from '../models/AgencyFeedback.js';
import User from '../models/User.js';
import AgencyReputation from '../models/AgencyReputation.js';
import { ensureReputationDoc } from '../services/agencyReputationService.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

async function recalcAgencyRating(agencyId) {
  const aId = new mongoose.Types.ObjectId(String(agencyId));

  const agg = await AgencyFeedback.aggregate([
    { $match: { agencyId: aId, status: 'published' } },
    { $group: { _id: '$agencyId', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);

  const ratingAvg = round2(agg?.[0]?.avg || 0);
  const ratingCount = Number(agg?.[0]?.count || 0);

  await ensureReputationDoc(aId);

  await AgencyReputation.findOneAndUpdate(
    { agencyId: aId },
    { $set: { ratingAvg, ratingCount } },
    { new: true }
  );

  return { ratingAvg, ratingCount };
}

// POST /api/agencies/:agencyId/feedback  (user creates/updates)
export async function upsertAgencyFeedback(req, res) {
  try {
    if (!req.user?._id) return res.status(401).json({ message: 'Unauthorized' });
    if (req.user.role !== 'user') {
      return res.status(403).json({ message: 'Only users can submit feedback' });
    }

    const { agencyId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(agencyId)) {
      return res.status(400).json({ message: 'Invalid agencyId' });
    }
    if (String(req.user._id) === String(agencyId)) {
      return res.status(400).json({ message: 'You cannot rate yourself' });
    }

    const agency = await User.findById(agencyId).select('_id role isActive isSuspended').lean();
    if (!agency || agency.role !== 'agency') return res.status(404).json({ message: 'Agency not found' });
    if (agency.isActive === false || agency.isSuspended === true) {
      return res.status(403).json({ message: 'Agency is not available' });
    }

    const rating = Number(req.body?.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }

    const comment = String(req.body?.comment || '').trim().slice(0, 1000);

    const feedback = await AgencyFeedback.findOneAndUpdate(
      { agencyId, userId: req.user._id },
      { $set: { rating, comment, status: 'published' } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const ratingSummary = await recalcAgencyRating(agencyId);

    return res.json({ feedback, ratingSummary });
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(409).json({ message: 'Feedback already exists. Please refresh and try again.' });
    }
    return res.status(500).json({ message: e?.message || 'Failed to submit feedback' });
  }
}

// GET /api/agencies/:agencyId/feedback  (public list)
export async function listAgencyFeedback(req, res) {
  try {
    const { agencyId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(agencyId)) {
      return res.status(400).json({ message: 'Invalid agencyId' });
    }

    const page = Math.max(1, Number(req.query?.page || 1));
    const limit = Math.min(50, Math.max(1, Number(req.query?.limit || 10)));
    const skip = (page - 1) * limit;

    const [items, total, rep] = await Promise.all([
      AgencyFeedback.find({ agencyId, status: 'published' })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'fullName')
        .lean(),
      AgencyFeedback.countDocuments({ agencyId, status: 'published' }),
      AgencyReputation.findOne({ agencyId }).select('ratingAvg ratingCount').lean(),
    ]);

    return res.json({
      feedback: items,
      ratingSummary: { ratingAvg: rep?.ratingAvg || 0, ratingCount: rep?.ratingCount || 0 },
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Failed to load feedback' });
  }
}

// GET /api/agencies/:agencyId/feedback/me  (logged in user’s own feedback)
export async function getMyAgencyFeedback(req, res) {
  try {
    if (!req.user?._id) return res.status(401).json({ message: 'Unauthorized' });

    const { agencyId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(agencyId)) {
      return res.status(400).json({ message: 'Invalid agencyId' });
    }

    const feedback = await AgencyFeedback.findOne({ agencyId, userId: req.user._id }).lean();
    return res.json({ feedback: feedback || null });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Failed to load feedback' });
  }
}