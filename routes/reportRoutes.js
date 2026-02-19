// ===== FILE: ./routes/reportRoutes.js =====
import { Router } from 'express';
import { protect } from '../middleware/authMiddleware.js';  // ✅ Changed from auth.js
import { handleValidation } from '../middleware/validate.js';
import { reportValidator } from '../validators/commonValidator.js';
import {
  createReport,
  getMyReports,
  getReportStatus,
  getMyReportStats,
} from '../controllers/reportController.js';

const router = Router();

// Create a new report
router.post('/', protect, reportValidator, handleValidation, createReport);

// Get user's submitted reports
router.get('/my-reports', protect, getMyReports);

// Get report statistics
router.get('/my-stats', protect, getMyReportStats);

// Get specific report status
router.get('/:reportId/status', protect, getReportStatus);

export default router;