// ===== FILE: server/routes/profileRoutes.js =====
import express from 'express';
import { protect, optionalAuth } from '../middleware/authMiddleware.js';
import {
  getMyProfile,
  createProfile,
  updateProfile,
  deleteProfile,
  getCompletion,
  getProfileById,
  uploadPhotos,
  deletePhoto,
  setProfilePhoto,
  updatePartnerPreferences,
  updatePrivacySettings,
} from '../controllers/profileController.js';
import upload from '../middleware/uploadMiddleware.js';

const router = express.Router();

// Profile CRUD
router.get('/', protect, getMyProfile);
router.post('/', protect, createProfile);
router.put('/', protect, updateProfile);
router.delete('/', protect, deleteProfile);

// Profile completion
router.get('/completion', protect, getCompletion);

// Photos
router.post('/photos', protect, upload.array('photos', 6), uploadPhotos);
router.delete('/photos/:photoId', protect, deletePhoto);
router.put('/photos/:photoId/profile', protect, setProfilePhoto);

// Partner preferences
router.put('/partner-preferences', protect, updatePartnerPreferences);

// Privacy settings
router.put('/privacy-settings', protect, updatePrivacySettings);

// Get profile by ID (public with optional auth)
router.get('/:profileId', optionalAuth, getProfileById);

export default router;