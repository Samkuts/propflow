import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { requireManager, requireManagerOrOwner } from '../../../middleware/rbac.middleware';
import { ok } from '../../../lib/response';
import * as svc from './reports.service';

const router = Router();
router.use(authenticate, requireManagerOrOwner);

router.get('/rent-roll', async (req, res, next) => {
  try { ok(res, await svc.getRentRoll(req.user!.managementCompanyId!)); } catch (e) { next(e); }
});

router.get('/delinquency', async (req, res, next) => {
  try { ok(res, await svc.getDelinquencyReport(req.user!.managementCompanyId!)); } catch (e) { next(e); }
});

router.get('/vacancy', async (req, res, next) => {
  try { ok(res, await svc.getVacancyReport(req.user!.managementCompanyId!)); } catch (e) { next(e); }
});

router.get('/work-orders', async (req, res, next) => {
  try { ok(res, await svc.getWorkOrderSummary(req.user!.managementCompanyId!)); } catch (e) { next(e); }
});

export default router;
