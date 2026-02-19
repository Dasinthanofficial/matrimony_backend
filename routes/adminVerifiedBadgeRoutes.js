import { Router } from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import {
  getVerifiedBadgeConfig,
  upsertVerifiedBadgeConfig,
  adminGrantVerifiedBadge,
  adminRevokeVerifiedBadge,
} from '../controllers/adminVerifiedBadgeController.js';

const router = Router();

router.get('/', protect, admin, getVerifiedBadgeConfig);
router.put('/', protect, admin, upsertVerifiedBadgeConfig);

router.post('/grant/:agencyId', protect, admin, adminGrantVerifiedBadge);
router.post('/revoke/:agencyId', protect, admin, adminRevokeVerifiedBadge);

export default router;