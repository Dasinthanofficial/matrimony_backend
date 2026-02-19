// server/routes/adminPlanRoutes.js
import { Router } from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';

import {
  listPlans,
  createPlan,
  updatePlan,
  togglePlan,
  deletePlan,
  reorderPlans,
} from '../controllers/adminPlanController.js';

const router = Router();

router.get('/', protect, admin, listPlans);
router.post('/', protect, admin, createPlan);
router.put('/reorder', protect, admin, reorderPlans);
router.put('/:planId', protect, admin, updatePlan);
router.patch('/:planId/toggle', protect, admin, togglePlan);
router.delete('/:planId', protect, admin, deletePlan);

export default router;