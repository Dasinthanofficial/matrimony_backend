import { Router } from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import {
  listAgencyLevelRules,
  createAgencyLevelRule,
  updateAgencyLevelRule,
  deleteAgencyLevelRule,
} from '../controllers/adminAgencyLevelController.js';

const router = Router();

router.get('/', protect, admin, listAgencyLevelRules);
router.post('/', protect, admin, createAgencyLevelRule);
router.put('/:id', protect, admin, updateAgencyLevelRule);
router.delete('/:id', protect, admin, deleteAgencyLevelRule);

export default router;