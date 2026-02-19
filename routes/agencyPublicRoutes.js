// ===== FILE: ./routes/agencyPublicRoutes.js =====
import express from 'express';
import { getAgencyPublicServices } from '../controllers/agencyPublicController.js';

const router = express.Router();

// Public endpoint
router.get('/agency/:agencyId/services', getAgencyPublicServices);

export default router;