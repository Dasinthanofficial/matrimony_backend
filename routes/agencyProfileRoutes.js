// ===== FILE: ./routes/agencyProfileRoutes.js =====
import express from 'express';
import { protect as requireAuth } from '../middleware/authMiddleware.js'; // ✅ FIX: Correct import
import { requireAgency } from '../middleware/requireAgency.js';

import {
  createAgencyProfile,
  listAgencyProfiles,
  updateAgencyProfile,
  deleteAgencyProfile,
} from '../controllers/agencyProfileController.js';

const router = express.Router();

router.post('/profiles', requireAuth, requireAgency, createAgencyProfile);
router.get('/profiles', requireAuth, requireAgency, listAgencyProfiles);
router.patch('/profiles/:id', requireAuth, requireAgency, updateAgencyProfile);
router.delete('/profiles/:id', requireAuth, requireAgency, deleteAgencyProfile);

export default router;