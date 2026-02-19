import { Router } from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { listAgencyReviews, upsertMyAgencyReview, deleteMyAgencyReview } from '../controllers/agencyReviewController.js';

const router = Router({ mergeParams: true });

router.get('/', listAgencyReviews);
router.post('/', protect, upsertMyAgencyReview);
router.delete('/mine', protect, deleteMyAgencyReview);

export default router;