import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { requireOwner, requireManager } from '../../../middleware/rbac.middleware';
import * as ctrl from './owners.controller';

const router = Router();
router.use(authenticate);

// Owner: manage their own bank info
router.get('/me', requireOwner, ctrl.getMyProfile);
router.patch('/me/bank', requireOwner, ctrl.updateBankInfo);

// Owner: request a disbursement (creates PENDING record for manager to process)
router.post('/me/disbursement-request', requireOwner, ctrl.requestDisbursement);

// Disbursements — owners can list their own; managers can list + create
router.get('/disbursements', ctrl.listDisbursements);
router.post('/disbursements', requireManager, ctrl.createDisbursement);

export default router;
