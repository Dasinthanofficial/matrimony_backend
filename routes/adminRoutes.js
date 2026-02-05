// ===== FILE: ./routes/adminRoutes.js =====
import { Router } from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';  // ✅ Changed from auth.js
import { handleValidation } from '../middleware/validate.js';
import {
  suspendUserValidator,
  resolveReportValidator,
  paginationValidator,
} from '../validators/adminValidator.js';
import {
  getAllUsers,
  getUserDetail,
  suspendUser,
  unsuspendUser,
  deleteUser,
  approveProfile,
  rejectProfile,
  getAllReports,
  getReportDetail,
  resolveReport,
  rejectReport,
  getDashboardStats,
  getAdminLogs,
} from '../controllers/adminController.js';

import {
  listPlans,
  createPlan,
  updatePlan,
  togglePlan,
  deletePlan,
  reorderPlans,
} from '../controllers/adminPlanController.js';

const router = Router();

// ============================================
// USER MANAGEMENT
// ============================================

router.get('/users', protect, admin, paginationValidator, handleValidation, getAllUsers);
router.get('/users/:userId', protect, admin, getUserDetail);
router.put('/users/:userId/suspend', protect, admin, suspendUserValidator, handleValidation, suspendUser);
router.put('/users/:userId/unsuspend', protect, admin, unsuspendUser);
router.delete('/users/:userId', protect, admin, deleteUser);

// ============================================
// PROFILE MANAGEMENT
// ============================================

router.put('/profiles/:profileId/approve', protect, admin, approveProfile);
router.put('/profiles/:profileId/reject', protect, admin, rejectProfile);

// ============================================
// REPORT MANAGEMENT
// ============================================

router.get('/reports', protect, admin, paginationValidator, handleValidation, getAllReports);
router.get('/reports/:reportId', protect, admin, getReportDetail);
router.put('/reports/:reportId/resolve', protect, admin, resolveReportValidator, handleValidation, resolveReport);
router.put('/reports/:reportId/reject', protect, admin, rejectReport);

// ============================================
// DASHBOARD & LOGS
// ============================================

router.get('/dashboard/stats', protect, admin, getDashboardStats);
router.get('/logs', protect, admin, paginationValidator, handleValidation, getAdminLogs);

// ============================================
// PLANS MANAGEMENT
// ============================================

router.get('/plans', protect, admin, listPlans);
router.post('/plans', protect, admin, createPlan);
router.put('/plans/reorder', protect, admin, reorderPlans);
router.put('/plans/:planId', protect, admin, updatePlan);
router.patch('/plans/:planId/toggle', protect, admin, togglePlan);
router.delete('/plans/:planId', protect, admin, deletePlan);

export default router;