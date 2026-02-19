import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js'; // <-- keep YOUR real path here
import { requireAgency } from '../middleware/requireAgency.js';

import {
  createAgencyProfile,
  listAgencyProfiles,
  updateAgencyProfile,
  deleteAgencyProfile,
} from '../controllers/agencyProfileController.js';

const router = express.Router();

router.post('/agency/profiles', requireAuth, requireAgency, createAgencyProfile);
router.get('/agency/profiles', requireAuth, requireAgency, listAgencyProfiles);
router.patch('/agency/profiles/:id', requireAuth, requireAgency, updateAgencyProfile);
router.delete('/agency/profiles/:id', requireAuth, requireAgency, deleteAgencyProfile);

export default router;