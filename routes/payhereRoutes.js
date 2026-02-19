import express from 'express';
import { payhereNotify } from '../controllers/payhereController.js';

const router = express.Router();

// PayHere IPN uses x-www-form-urlencoded
router.post('/notify', express.urlencoded({ extended: true }), payhereNotify);

export default router;