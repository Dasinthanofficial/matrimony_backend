// ===== FILE: ./routes/interestRoutes.js =====
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { handleValidation } from '../middleware/validate.js';
import { interestValidator, userIdParamValidator, mongoIdValidator } from '../validators/commonValidator.js';
import {
  sendInterest,
  acceptInterest,
  declineInterest,
  blockInterest,
  withdrawInterest,
  getInterestsSent,
  getInterestsReceived,
  getAcceptedInterests,
  getDeclinedInterests,
  getMutualInterests,
  getInterestStatus,
  getShortlist,
  addToShortlist,
  removeFromShortlist,
  isShortlisted,
  updateShortlistNote,
} from '../controllers/interestController.js';

const router = express.Router();

// ============================================
// INTEREST ROUTES
// ============================================

// Send new interest
router.post('/', protect, interestValidator, handleValidation, sendInterest);

// Get interests
router.get('/sent', protect, getInterestsSent);
router.get('/received', protect, getInterestsReceived);
router.get('/accepted', protect, getAcceptedInterests);
router.get('/declined', protect, getDeclinedInterests);
router.get('/mutual', protect, getMutualInterests);

// Get interest status with specific user
router.get('/status/:userId', protect, userIdParamValidator, handleValidation, getInterestStatus);

// Interest actions
router.put('/:id/accept', protect, mongoIdValidator, handleValidation, acceptInterest);
router.put('/:id/decline', protect, mongoIdValidator, handleValidation, declineInterest);
router.put('/:id/block', protect, mongoIdValidator, handleValidation, blockInterest);
router.delete('/:id', protect, mongoIdValidator, handleValidation, withdrawInterest);

// ============================================
// SHORTLIST ROUTES
// ============================================

router.get('/shortlist', protect, getShortlist);
router.get('/shortlist/check/:userId', protect, userIdParamValidator, handleValidation, isShortlisted);
router.post('/shortlist/:userId', protect, userIdParamValidator, handleValidation, addToShortlist);
router.put('/shortlist/:userId/note', protect, userIdParamValidator, handleValidation, updateShortlistNote);
router.delete('/shortlist/:userId', protect, userIdParamValidator, handleValidation, removeFromShortlist);

export default router;