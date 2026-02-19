import { Router } from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import { adminListAgencyReviews, adminSetReviewStatus } from '../controllers/adminAgencyReviewController.js';

const router = Router();

router.get('/', protect, admin, adminListAgencyReviews);
router.patch('/:id/status', protect, admin, adminSetReviewStatus);

export default router;