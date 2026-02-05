// ===== FILE: ./routes/searchRoutes.js =====
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { handleValidation } from '../middleware/validate.js';
import {
  searchProfilesValidator,
  quickSearchValidator,
  suggestedProfilesValidator,
} from '../validators/searchValidator.js';

import {
  searchProfiles,
  quickSearch,
  getSuggestedProfiles,
  getRecentProfiles,
  searchById,
  getFilterOptions,
} from '../controllers/searchController.js';

const router = express.Router();

// Main search with filters
router.get('/', protect, searchProfilesValidator, handleValidation, searchProfiles);

// Quick search
router.get('/quick', protect, quickSearchValidator, handleValidation, quickSearch);

// Suggested profiles
router.get('/suggested', protect, suggestedProfilesValidator, handleValidation, getSuggestedProfiles);

// Recent profiles
router.get('/recent', protect, getRecentProfiles);

// Filter options
router.get('/filters/options', protect, getFilterOptions);

// Search by profile ID
router.get('/by-id/:profileId', protect, searchById);

export default router;