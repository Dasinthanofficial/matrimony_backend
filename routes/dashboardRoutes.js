// ===== FILE: ./routes/dashboardRoutes.js =====
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { getDashboardSummary, getRecentVisitors } from '../controllers/dashboardController.js';

const router = express.Router();

router.get('/summary', protect, getDashboardSummary);
router.get('/visitors', protect, getRecentVisitors);

export default router;