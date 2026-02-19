import { Router } from 'express';
import { listPublicPlans } from '../controllers/planController.js';

const router = Router();
router.get('/', listPublicPlans);
export default router;