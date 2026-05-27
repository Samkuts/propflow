import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ApplicationStatus } from '@prisma/client';
import * as svc from './applications.service';
import { ok, created, badRequest, notFound, paginate } from '../../../lib/response';

const submitSchema = z.object({
  unitId: z.string().uuid(),
  managementCompanyId: z.string().uuid(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  employer: z.string().max(200).optional(),
  monthlyIncome: z.number().int().positive().optional(),
  message: z.string().max(2000).optional(),
  ssn: z.string().max(20).optional(),
  dateOfBirth: z.string().optional(),
});

const updateSchema = z.object({
  status: z.enum(['RECEIVED', 'REVIEWING', 'APPROVED', 'DENIED', 'WITHDRAWN']).optional(),
  notes: z.string().max(2000).optional(),
});

/** GET /applications/unit/:unitId — public, returns unit info for the apply form */
export async function getPublicUnit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const unit = await svc.getPublicUnitInfo(req.params.unitId);
    if (!unit) { notFound(res, 'Unit not found or not accepting applications'); return; }
    ok(res, unit);
  } catch (err) { next(err); }
}

/** POST /applications — public, no auth required */
export async function submit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) { badRequest(res, parsed.error.errors[0].message); return; }

    const application = await svc.submitApplication(parsed.data);
    created(res, application);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'UNIT_NOT_FOUND') {
      badRequest(res, 'Unit not found or not accepting applications'); return;
    }
    next(err);
  }
}

/** GET /applications — manager only */
export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const status = req.query.status as svc.SubmitApplicationInput['ssn'] | undefined;
    const unitId = req.query.unitId as string | undefined;

    const result = await svc.listApplications(req.user!.managementCompanyId!, {
      page,
      limit,
      unitId,
      ...(req.query.status && { status: req.query.status as any }),
    });

    paginate(res, result.data, result.total, result.page, result.limit);
  } catch (err) { next(err); }
}

/** GET /applications/:id — manager only */
export async function get(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const app = await svc.getApplication(req.params.id, req.user!.managementCompanyId!);
    if (!app) { notFound(res); return; }
    ok(res, app);
  } catch (err) { next(err); }
}

/** POST /applications/:id/submit-for-screening — manager only */
export async function submitScreening(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.submitForScreening(req.params.id, req.user!.managementCompanyId!);
    ok(res, result);
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'NOT_FOUND') { notFound(res); return; }
      if (err.message === 'CHECKR_NOT_CONFIGURED') {
        badRequest(res, 'Background check service is not configured on this server.'); return;
      }
      if (err.message === 'ALREADY_SCREENED') {
        badRequest(res, 'A background check has already been submitted for this application.'); return;
      }
    }
    next(err);
  }
}

/** PATCH /applications/:id — manager only */
export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) { badRequest(res, parsed.error.errors[0].message); return; }

    const app = await svc.updateApplication(req.params.id, req.user!.managementCompanyId!, {
      status: parsed.data.status as ApplicationStatus | undefined,
      notes: parsed.data.notes,
    });
    ok(res, app);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'NOT_FOUND') { notFound(res); return; }
    next(err);
  }
}
