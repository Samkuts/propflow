import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { requireManager, requireManagerOrOwner } from '../../../middleware/rbac.middleware';
import * as ctrl from './properties.controller';

const router = Router();

router.use(authenticate);

router.get('/vacancy', requireManagerOrOwner, ctrl.vacancySummary);
router.get('/', requireManagerOrOwner, ctrl.list);
router.get('/:id', requireManagerOrOwner, ctrl.get);
router.post('/', requireManager, ctrl.create);
router.patch('/:id', requireManager, ctrl.update);
router.delete('/:id', requireManager, ctrl.remove);

export default router;
