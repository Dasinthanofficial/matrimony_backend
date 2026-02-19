import { Router } from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  upsertAgencyFeedback,
  listAgencyFeedback,
  getMyAgencyFeedback,
} from '../controllers/agencyFeedbackController.js';

const router = Router();

router.get('/agencies/:agencyId/feedback', listAgencyFeedback);
router.post('/agencies/:agencyId/feedback', protect, upsertAgencyFeedback);
router.get('/agencies/:agencyId/feedback/me', protect, getMyAgencyFeedback);

export default router;