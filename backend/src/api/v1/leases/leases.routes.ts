import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { requireManager, requireManagerOrOwner } from '../../../middleware/rbac.middleware';
import * as ctrl from './leases.controller';

const router = Router();

router.use(authenticate);

router.get('/:id', ctrl.get);
router.post('/', requireManager, ctrl.create);
router.post('/:id/activate', requireManager, ctrl.activate);
router.post('/:id/terminate', requireManager, ctrl.terminate);

export default router;
