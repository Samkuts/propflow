import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { requireManager, requireVendor, requireOwner } from '../../../middleware/rbac.middleware';
import * as ctrl from './maintenance.controller';

const router = Router();
router.use(authenticate);

// Static sub-paths must be declared before /:id
router.get('/work-orders/pending-owner-approval', requireOwner, ctrl.pendingOwnerApproval);
router.get('/work-orders', ctrl.list);
router.get('/work-orders/:id', ctrl.get);
router.post('/work-orders', ctrl.create);
router.patch('/work-orders/:id', requireManager, ctrl.update);
router.patch('/work-orders/:id/vendor-action', requireVendor, ctrl.vendorAction);
router.post('/work-orders/:id/owner-approve', requireOwner, ctrl.ownerApprove);
router.post('/work-orders/:id/owner-reject', requireOwner, ctrl.ownerReject);
router.get('/invoices', requireManager, ctrl.listInvoices);
router.post('/invoices', ctrl.submitInvoice);
router.post('/invoices/:id/approve', requireManager, ctrl.approveInvoice);
router.post('/invoices/:id/reject', requireManager, ctrl.rejectInvoice);
router.get('/vendor/:vendorId/work-orders', ctrl.vendorWorkOrders);

export default router;
