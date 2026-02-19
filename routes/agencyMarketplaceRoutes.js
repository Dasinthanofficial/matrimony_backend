// ===== FILE: ./routes/agencyMarketplaceRoutes.js =====
import express from 'express';
import { requireAuth, requireRole } from '../middleware/marketplaceAuth.js';
import { requireAgencyApproved } from '../middleware/requireAgencyApproved.js';
import {
  listMyServices,
  createService,
  updateService,
  deleteService,
  createConnectAccount,
  createOnboardingLink,
  getConnectStatus,
  getAgencyServices,
} from '../controllers/agencyMarketplaceController.js';

const router = express.Router();

router.get('/services', requireAuth, requireRole('agency'), listMyServices);

router.post('/services', requireAuth, requireRole('agency'), requireAgencyApproved, createService);
router.patch('/services/:id', requireAuth, requireRole('agency'), requireAgencyApproved, updateService);
router.delete('/services/:id', requireAuth, requireRole('agency'), requireAgencyApproved, deleteService);

router.post('/connect/account', requireAuth, requireRole('agency'), requireAgencyApproved, createConnectAccount);
router.post(
  '/connect/onboarding-link',
  requireAuth,
  requireRole('agency'),
  requireAgencyApproved,
  createOnboardingLink
);
router.get('/connect/status', requireAuth, requireRole('agency'), requireAgencyApproved, getConnectStatus);

// ✅ Keep dynamic routes LAST so they don't accidentally shadow static routes
// user can view agency services (auth required)
router.get('/:agencyId/services', getAgencyServices);

export default router;