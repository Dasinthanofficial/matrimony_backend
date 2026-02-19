import mongoose from 'mongoose';
import AgencyReview from '../models/AgencyReview.js';
import { recalcAgencyRating } from '../services/agencyReputationService.js';

export async function listAgencyReviews(req, res) {
  try {
    const { agencyId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(agencyId)) return res.status(400).json({ message: 'Invalid agencyId' });

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      AgencyReview.find({ agencyId, status: 'published' })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-__v'),
      AgencyReview.countDocuments({ agencyId, status: 'published' }),
    ]);

    res.json({ page, limit, total, reviews: items });
  } catch {
    res.status(500).json({ message: 'Failed to load reviews' });
  }
}

// one review per user per agency (upsert)
export async function upsertMyAgencyReview(req, res) {
  try {
    const { agencyId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(agencyId)) return res.status(400).json({ message: 'Invalid agencyId' });

    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const rating = Number(req.body?.rating);
    const title = req.body?.title ?? '';
    const comment = req.body?.comment ?? '';

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be 1..5' });
    }

    const review = await AgencyReview.findOneAndUpdate(
      { agencyId, userId },
      {
        $set: {
          rating,
          title: String(title).trim(),
          comment: String(comment).trim(),
          status: 'published', // change to 'pending' if you want moderation
        },
      },
      { new: true, upsert: true }
    );

    await recalcAgencyRating(agencyId);
    res.json({ review });
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ message: 'You already reviewed this agency' });
    res.status(500).json({ message: 'Failed to save review' });
  }
}

export async function deleteMyAgencyReview(req, res) {
  try {
    const { agencyId } = req.params;
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    await AgencyReview.deleteOne({ agencyId, userId });
    await recalcAgencyRating(agencyId);

    res.json({ success: true });
  } catch {
    res.status(500).json({ message: 'Failed to delete review' });
  }
}