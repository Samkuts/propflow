import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as authController from './auth.controller';
import { authenticate } from '../../../middleware/auth.middleware';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, data: null, error: 'Too many requests, please try again later' },
});

const router = Router();

router.post('/register/manager', authLimiter, authController.registerManager);
router.post('/login', authLimiter, authController.login);
router.post('/refresh', authLimiter, authController.refreshToken);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);

export default router;
