import express from 'express';
import { requireAuth } from '../middleware/marketplaceAuth.js';
import { createAgencyServiceCheckout } from '../controllers/marketplacePaymentsController.js';

const router = express.Router();

router.post('/agency-service/checkout', requireAuth, createAgencyServiceCheckout);



export default router;