import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './recurring-charges.service';
import { ok, created, badRequest, notFound } from '../../../lib/response';
import { RentChargeType } from '@prisma/client';

const createSchema = z.object({
  type: z.enum(['PET_FEE', 'UTILITY', 'PARKING', 'OTHER'] as [RentChargeType, ...RentChargeType[]]),
  amount: z.number().int().positive(),
  description: z.string().optional(),
  dayOfMonth: z.number().int().min(1).max(28),
  startDate: z.string().min(1),
  endDate: z.string().optional(),
});

const updateSchema = createSchema.partial().extend({ active: z.boolean().optional() });

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listRecurringCharges(
      req.params.leaseId,
      req.user!.managementCompanyId!
    );
    ok(res, result);
  } catch (err) {
    if (err instanceof Error && err.message === 'LEASE_NOT_FOUND') { notFound(res); return; }
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) { badRequest(res, parsed.error.errors[0].message); return; }

    const result = await svc.createRecurringCharge(
      req.params.leaseId,
      req.user!.managementCompanyId!,
      parsed.data
    );
    created(res, result);
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'LEASE_NOT_FOUND') { notFound(res); return; }
      if (err.message === 'INVALID_TYPE') { badRequest(res, 'Invalid charge type. Use PET_FEE, UTILITY, PARKING, or OTHER'); return; }
    }
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) { badRequest(res, parsed.error.errors[0].message); return; }

    const result = await svc.updateRecurringCharge(
      req.params.id,
      req.params.leaseId,
      req.user!.managementCompanyId!,
      parsed.data
    );
    ok(res, result);
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'NOT_FOUND' || err.message === 'LEASE_NOT_FOUND') { notFound(res); return; }
    }
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await svc.deleteRecurringCharge(
      req.params.id,
      req.params.leaseId,
      req.user!.managementCompanyId!
    );
    ok(res, { deleted: true });
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'NOT_FOUND' || err.message === 'LEASE_NOT_FOUND') { notFound(res); return; }
    }
    next(err);
  }
}
