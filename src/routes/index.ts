import { Router } from 'express';
import { getHealth } from '../controllers/health.controller';
import { createPaymentController } from '../controllers/payment.controller';
import { getBrowserStatus, restartBrowser } from '../controllers/browser.controller';
import authenticate from '../middleware/authenticate';
import { validatePaymentCreate } from '../middleware/validation';

const router = Router();

// Public health check
router.get('/health', getHealth);

// Secure routes protected by signature authentication and validation layers
router.post('/payments/create', authenticate, validatePaymentCreate, createPaymentController);
router.get('/browser/status', authenticate, getBrowserStatus);
router.post('/browser/restart', authenticate, restartBrowser);

export default router;
