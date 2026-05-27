import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { requireManager, requireManagerOrOwner } from '../../../middleware/rbac.middleware';
import * as ctrl from './leases.controller';

const router = Router();

router.use(authenticate);

router.get('/', requireManager, ctrl.list);
router.get('/expiring', requireManager, ctrl.getExpiring);
router.get('/tenants', requireManager, ctrl.listTenants);
router.get('/my-lease', ctrl.myLease);
router.get('/:id/pdf', ctrl.downloadPdf);
router.get('/:id', ctrl.get);
router.post('/', requireManager, ctrl.create);
router.post('/:id/activate', requireManager, ctrl.activate);
router.post('/:id/terminate', requireManager, ctrl.terminate);
router.post('/:id/renew', requireManager, ctrl.renew);

export default router;
