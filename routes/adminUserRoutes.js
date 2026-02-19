// server/routes/adminUserRoutes.js
import { Router } from 'express';
import { protect, admin, superadmin } from '../middleware/authMiddleware.js';
import { getUsers, updateUserRole, getUserFullDetails } from '../controllers/adminUserController.js';

const router = Router();

// existing
router.get('/', protect, admin, getUsers);
router.patch('/:userId/role', protect, admin, updateUserRole);

// ✅ NEW (superadmin only)
router.get('/:userId/full', protect, superadmin, getUserFullDetails);

export default router;