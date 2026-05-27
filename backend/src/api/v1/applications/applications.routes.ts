import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { requireManager } from '../../../middleware/rbac.middleware';
import * as ctrl from './applications.controller';

const router = Router();

// Public — prospective tenants submit without an account
router.post('/', ctrl.submit);
// Public — look up a unit for the application form
router.get('/unit/:unitId', ctrl.getPublicUnit);

// Protected — manager only
router.use(authenticate);
router.use(requireManager);

router.get('/', ctrl.list);
router.get('/:id', ctrl.get);
router.patch('/:id', ctrl.update);
router.post('/:id/submit-for-screening', ctrl.submitScreening);

export default router;
