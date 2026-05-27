import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { requireManager } from '../../../middleware/rbac.middleware';
import * as ctrl from './recurring-charges.controller';

// Mounted at /leases/:leaseId/recurring-charges with mergeParams: true
const router = Router({ mergeParams: true });

router.use(authenticate, requireManager);

router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.patch('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

export default router;
