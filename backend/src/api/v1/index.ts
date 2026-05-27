import { Router } from 'express';
import authRoutes from './auth/auth.routes';
import propertyRoutes from './properties/properties.routes';
import unitRoutes from './units/units.routes';
import leaseRoutes from './leases/leases.routes';
import accountingRoutes from './accounting/accounting.routes';
import maintenanceRoutes from './maintenance/maintenance.routes';
import reportRoutes from './reports/reports.routes';
import documentRoutes from './documents/documents.routes';
import messageRoutes from './messages/messages.routes';
import applicationRoutes from './applications/applications.routes';
import paymentRoutes from './payments/payments.routes';
import tenantRoutes from './tenants/tenants.routes';
import ownerRoutes from './owners/owners.routes';
import recurringChargesRoutes from './recurring-charges/recurring-charges.routes';
import listingsRoutes from './listings/listings.routes';
import inspectionsRoutes from './inspections/inspections.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/properties', propertyRoutes);
router.use('/properties/:propertyId/units', unitRoutes);
router.use('/leases', leaseRoutes);
router.use('/leases/:leaseId/recurring-charges', recurringChargesRoutes);
router.use('/leases/:leaseId/inspections', inspectionsRoutes);
router.use('/listings', listingsRoutes);
router.use('/accounting', accountingRoutes);
router.use('/maintenance', maintenanceRoutes);
router.use('/reports', reportRoutes);
router.use('/documents', documentRoutes);
router.use('/messages', messageRoutes);
router.use('/applications', applicationRoutes);
router.use('/payments', paymentRoutes);
router.use('/tenants', tenantRoutes);
router.use('/owners', ownerRoutes);

export default router;
