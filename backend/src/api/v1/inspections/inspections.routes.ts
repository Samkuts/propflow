import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { requireManager } from '../../../middleware/rbac.middleware';
import * as ctrl from './inspections.controller';

// Mounted at /leases/:leaseId/inspections with mergeParams: true
const router = Router({ mergeParams: true });

router.use(authenticate);

router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', requireManager, ctrl.create);
router.post('/:id/sign', ctrl.sign); // tenant or manager can sign

export default router;
