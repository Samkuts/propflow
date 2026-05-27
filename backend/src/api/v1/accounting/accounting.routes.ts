import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { requireManager, requireManagerOrOwner } from '../../../middleware/rbac.middleware';
import * as ctrl from './accounting.controller';

const router = Router();

router.use(authenticate);

router.post('/payments', requireManager, ctrl.recordPayment);
router.post('/late-fees/post', requireManager, ctrl.postLateFees);
router.post('/rent-charges/post', requireManager, ctrl.postRentCharges);
router.get('/accounts', requireManager, ctrl.getChartOfAccounts);
router.get('/ledger', requireManager, ctrl.getLedger);
router.get('/ledger/:leaseId/tenant', ctrl.getTenantLedger);
router.get('/owner-statement/:ownerId', requireManagerOrOwner, ctrl.ownerStatement);

export default router;
