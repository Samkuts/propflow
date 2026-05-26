import { Router } from 'express';
import authRoutes from './auth/auth.routes';
import propertyRoutes from './properties/properties.routes';
import unitRoutes from './units/units.routes';
import leaseRoutes from './leases/leases.routes';
import accountingRoutes from './accounting/accounting.routes';
import maintenanceRoutes from './maintenance/maintenance.routes';
import reportRoutes from './reports/reports.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/properties', propertyRoutes);
router.use('/properties/:propertyId/units', unitRoutes);
router.use('/leases', leaseRoutes);
router.use('/accounting', accountingRoutes);
router.use('/maintenance', maintenanceRoutes);
router.use('/reports', reportRoutes);

export default router;
