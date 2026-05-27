import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { requireManager } from '../../../middleware/rbac.middleware';
import * as ctrl from './listings.controller';

const router = Router();

// Public routes — no auth required
router.get('/', ctrl.getAll);
router.get('/unit/:unitId', ctrl.getOne);

// Manager: update listing status for a unit
// PATCH /listings/properties/:propertyId/units/:unitId
router.patch(
  '/properties/:propertyId/units/:unitId',
  authenticate,
  requireManager,
  ctrl.updateListing
);

export default router;
