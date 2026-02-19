// ===== FILE: ./routes/paymentRoutes.js =====
import { Router } from 'express';
import { protect } from '../middleware/authMiddleware.js';  // ✅ Changed from auth.js
import {
  unlockContact,
  isContactUnlocked,
  getUnlockedContacts,
  getContactDetails,
  getPaymentHistory,
  getPaymentById,
} from '../controllers/paymentController.js';

const router = Router();

// Unlock contact endpoints
router.post('/unlock-contact', protect, unlockContact);
router.post('/unlock-contact/:targetUserId', protect, unlockContact);

// Check if contact is unlocked
router.get('/is-unlocked/:targetUserId', protect, isContactUnlocked);

// Get all unlocked contacts
router.get('/unlocked-contacts', protect, getUnlockedContacts);

// Get contact details (requires unlock or premium)
router.get('/contact/:targetUserId', protect, getContactDetails);

// Payment history
router.get('/history', protect, getPaymentHistory);
router.get('/:paymentId', protect, getPaymentById);

export default router;