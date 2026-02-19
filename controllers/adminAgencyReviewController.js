import AgencyReview from '../models/AgencyReview.js';
import { recalcAgencyRating } from '../services/agencyReputationService.js';

export async function adminListAgencyReviews(req, res) {
  const status = req.query.status; // optional
  const q = status ? { status } : {};
  const reviews = await AgencyReview.find(q).sort({ createdAt: -1 }).limit(200);
  res.json({ reviews });
}

export async function adminSetReviewStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body || {};
  if (!['published', 'hidden', 'pending'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  const review = await AgencyReview.findByIdAndUpdate(id, { $set: { status } }, { new: true });
  if (!review) return res.status(404).json({ message: 'Review not found' });

  await recalcAgencyRating(review.agencyId);
  res.json({ review });
}