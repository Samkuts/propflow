import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { requireManager, requireManagerOrOwner } from '../../../middleware/rbac.middleware';
import * as ctrl from './units.controller';

// Mounted at /api/v1/properties/:propertyId/units
const router = Router({ mergeParams: true });

router.use(authenticate);

router.get('/', requireManagerOrOwner, ctrl.list);
router.get('/:id', requireManagerOrOwner, ctrl.get);
router.post('/', requireManager, ctrl.create);
router.patch('/:id', requireManager, ctrl.update);
router.delete('/:id', requireManager, ctrl.remove);

export default router;
