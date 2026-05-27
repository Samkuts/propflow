import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { requireManagerOrOwner } from '../../../middleware/rbac.middleware';
import { ok } from '../../../lib/response';
import * as svc from './reports.service';

const router = Router();
router.use(authenticate, requireManagerOrOwner);

function parseDateRange(query: Record<string, unknown>) {
  return {
    startDate: query.startDate ? new Date(query.startDate as string) : undefined,
    endDate: query.endDate ? new Date(query.endDate as string) : undefined,
  };
}

router.get('/rent-roll', async (req, res, next) => {
  try { ok(res, await svc.getRentRoll(req.user!.managementCompanyId!, parseDateRange(req.query as Record<string, unknown>))); } catch (e) { next(e); }
});

router.get('/delinquency', async (req, res, next) => {
  try { ok(res, await svc.getDelinquencyReport(req.user!.managementCompanyId!)); } catch (e) { next(e); }
});

router.get('/vacancy', async (req, res, next) => {
  try { ok(res, await svc.getVacancyReport(req.user!.managementCompanyId!, parseDateRange(req.query as Record<string, unknown>))); } catch (e) { next(e); }
});

router.get('/work-orders', async (req, res, next) => {
  try { ok(res, await svc.getWorkOrderSummary(req.user!.managementCompanyId!, parseDateRange(req.query as Record<string, unknown>))); } catch (e) { next(e); }
});

export default router;
