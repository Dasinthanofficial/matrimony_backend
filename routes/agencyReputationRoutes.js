import { Router } from 'express';
import { getAgencyReputation } from '../controllers/agencyReputationController.js';

const router = Router({ mergeParams: true });
router.get('/', getAgencyReputation);

export default router;