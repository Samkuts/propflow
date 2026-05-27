import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { requireTenant } from '../../../middleware/rbac.middleware';
import * as ctrl from './payments.controller';

const router = Router();

// All payment routes require an authenticated tenant
router.use(authenticate, requireTenant);

router.post('/setup-intent', ctrl.setupIntent);
router.get('/payment-method', ctrl.getPaymentMethod);
router.post('/create-intent', ctrl.createPayIntent);
router.post('/confirm', ctrl.confirmPayment);
router.get('/autopay-status', ctrl.getAutopayStatus);
router.patch('/autopay', ctrl.toggleAutopay);

export default router;
