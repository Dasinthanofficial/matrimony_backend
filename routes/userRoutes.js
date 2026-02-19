import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { updateMyLanguage } from '../controllers/userController.js';

const router = express.Router();

router.patch('/me/language', protect, updateMyLanguage);

export default router;