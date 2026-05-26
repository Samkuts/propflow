import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './accounting.service';
import { ok, created, badRequest, notFound, paginate } from '../../../lib/response';

const paymentSchema = z.object({
  leaseId: z.string().uuid(),
  amount: z.number().int().positive(),
  method: z.enum(['ACH', 'CREDIT_CARD', 'CHECK', 'CASH', 'OTHER']),
  referenceNumber: z.string().optional(),
  memo: z.string().optional(),
  paidDate: z.string().optional(),
});

export async function recordPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = paymentSchema.safeParse(req.body);
    if (!parsed.success) { badRequest(res, parsed.error.errors[0].message); return; }

    const result = await svc.recordPayment(req.user!.managementCompanyId!, parsed.data);
    created(res, result);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'LEASE_NOT_FOUND') { notFound(res, 'Lease not found'); return; }
    next(err);
  }
}

export async function postLateFees(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const posted = await svc.postLateFees({ managementCompanyId: req.user!.managementCompanyId! });
    ok(res, { posted: posted.length, items: posted });
  } catch (err) {
    next(err);
  }
}

export async function getLedger(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const result = await svc.getLedger(req.user!.managementCompanyId!, {
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      propertyId: req.query.propertyId as string,
      page,
      limit,
    });
    paginate(res, result.entries, result.total, page, limit);
  } catch (err) {
    next(err);
  }
}

export async function getTenantLedger(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await svc.getTenantLedger(req.params.leaseId, req.user!.managementCompanyId!);
    ok(res, data);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'NOT_FOUND') { notFound(res); return; }
    next(err);
  }
}

export async function ownerStatement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const month = Number(req.query.month) || new Date().getMonth() + 1;
    const { ownerId } = req.params;

    const data = await svc.generateOwnerStatement(req.user!.managementCompanyId!, ownerId, year, month);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}
