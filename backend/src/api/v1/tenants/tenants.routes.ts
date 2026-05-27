import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { requireManager } from '../../../middleware/rbac.middleware';
import * as ctrl from './tenants.controller';

const router = Router();

router.use(authenticate, requireManager);

router.get('/', ctrl.search);
router.post('/', ctrl.create);
router.get('/:id', ctrl.getOne);

export default router;
