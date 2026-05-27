import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './leases.service';
import { ok, created, badRequest, notFound } from '../../../lib/response';

const createSchema = z.object({
  unitId: z.string().uuid(),
  startDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  endDate: z.string().optional(),
  rentAmount: z.number().int().positive(),
  depositAmount: z.number().int().min(0),
  rentDueDay: z.number().int().min(1).max(28).optional(),
  gracePeriodDays: z.number().int().min(0).max(30).optional(),
  lateFeeType: z.enum(['FLAT', 'PERCENT']).optional(),
  lateFeeAmount: z.number().int().min(0).optional(),
  petsAllowed: z.boolean().optional(),
  petDeposit: z.number().int().min(0).optional(),
  tenantIds: z.array(z.string().uuid()).optional(),
});

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listLeases(req.user!.managementCompanyId!, {
      status: req.query.status as string | undefined,
      search: req.query.search as string | undefined,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 50,
    });
    ok(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getExpiring(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const days = req.query.days ? Number(req.query.days) : 30;
    const result = await svc.getExpiringLeases(req.user!.managementCompanyId!, days);
    ok(res, result);
  } catch (err) {
    next(err);
  }
}

export async function listTenants(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listTenants(req.user!.managementCompanyId!, {
      search: req.query.search as string | undefined,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 50,
    });
    ok(res, result);
  } catch (err) {
    next(err);
  }
}

export async function myLease(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.getMyLease(req.user!.sub, req.user!.managementCompanyId!);
    if (!result) { notFound(res, 'No lease found'); return; }
    ok(res, result);
  } catch (err) {
    next(err);
  }
}

export async function get(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const lease = await svc.getLease(
      req.params.id,
      req.user!.managementCompanyId!,
      req.user!.role,
      req.user!.sub
    );
    if (!lease) { notFound(res); return; }
    ok(res, lease);
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) { badRequest(res, parsed.error.errors[0].message); return; }

    const lease = await svc.createLease(req.user!.managementCompanyId!, parsed.data);
    created(res, lease);
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'UNIT_NOT_FOUND') { notFound(res, 'Unit not found'); return; }
      if (err.message === 'ACTIVE_LEASE_EXISTS') { badRequest(res, 'Unit already has an active or pending lease'); return; }
    }
    next(err);
  }
}

export async function activate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const lease = await svc.activateLease(req.params.id, req.user!.managementCompanyId!);
    ok(res, lease);
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'NOT_FOUND') { notFound(res); return; }
      if (err.message === 'NOT_PENDING') { badRequest(res, 'Lease must be in PENDING status to activate'); return; }
    }
    next(err);
  }
}

export async function terminate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = z.object({
      moveOutDate: z.string().optional(),
      depositReturnAmount: z.number().int().min(0).optional(),
    }).safeParse(req.body);
    if (!parsed.success) { badRequest(res, parsed.error.errors[0].message); return; }

    const result = await svc.terminateLease(req.params.id, req.user!.managementCompanyId!, parsed.data);
    ok(res, result);
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'NOT_FOUND') { notFound(res); return; }
      if (err.message === 'CANNOT_TERMINATE') { badRequest(res, 'Lease must be ACTIVE or MONTH_TO_MONTH to terminate'); return; }
    }
    next(err);
  }
}

export async function downloadPdf(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { stream, filename } = await svc.getLeasePdfStream(
      req.params.id,
      req.user!.managementCompanyId!,
      req.user!.role,
      req.user!.sub
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    stream.pipe(res);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'NOT_FOUND') { notFound(res); return; }
    next(err);
  }
}

export async function renew(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = z.object({
      newEndDate: z.string().min(1),
      newRentAmount: z.number().int().positive().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { badRequest(res, parsed.error.errors[0].message); return; }

    const result = await svc.renewLease(req.params.id, req.user!.managementCompanyId!, parsed.data);
    ok(res, result);
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'NOT_FOUND') { notFound(res); return; }
      if (err.message === 'CANNOT_RENEW') { badRequest(res, 'Lease must be ACTIVE or MONTH_TO_MONTH to renew'); return; }
    }
    next(err);
  }
}
