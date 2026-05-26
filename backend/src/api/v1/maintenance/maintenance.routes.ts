import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { requireManager, requireVendor } from '../../../middleware/rbac.middleware';
import * as ctrl from './maintenance.controller';

const router = Router();
router.use(authenticate);

router.get('/work-orders', ctrl.list);
router.get('/work-orders/:id', ctrl.get);
router.post('/work-orders', ctrl.create);
router.patch('/work-orders/:id', requireManager, ctrl.update);
router.post('/invoices', ctrl.submitInvoice);
router.post('/invoices/:id/approve', requireManager, ctrl.approveInvoice);
router.get('/vendor/:vendorId/work-orders', ctrl.vendorWorkOrders);

export default router;
