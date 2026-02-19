 import express from 'express';
 import { protect } from '../middleware/authMiddleware.js';
 import { requireAgency } from '../middleware/requireAgency.js';
 import { requireAgencyApproved } from '../middleware/requireAgencyApproved.js';

 import {
   getMyAgencyProfiles,
   createAgencyProfile,
   updateAgencyProfile,
   deleteAgencyProfile,
 } from '../controllers/agencyProfileController.js';

import { getAgencyOverview } from '../controllers/agencyDashboardController.js';

 const router = express.Router();

 // Always require login + agency role for anything under /api/agency/*
 router.use(protect, requireAgency);

 // ✅ Let agency see dashboard data even if not approved
 router.get('/profiles', getMyAgencyProfiles);

// ✅ Agency dashboard overview (requires approval per your spec)
router.get('/overview', requireAgencyApproved, getAgencyOverview);

 // ✅ Only approved agencies can create/update/delete
 router.post('/profiles', requireAgencyApproved, createAgencyProfile);
 router.patch('/profiles/:id', requireAgencyApproved, updateAgencyProfile);
 router.put('/profiles/:id', requireAgencyApproved, updateAgencyProfile);
 router.delete('/profiles/:id', requireAgencyApproved, deleteAgencyProfile);

 export default router;