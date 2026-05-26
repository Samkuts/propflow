import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './units.service';
import { ok, created, noContent, badRequest, notFound, paginate } from '../../../lib/response';

const createSchema = z.object({
  unitNumber: z.string().min(1),
  beds: z.number().int().min(0).optional(),
  baths: z.number().min(0).optional(),
  sqft: z.number().int().positive().optional(),
  rentAmount: z.number().int().positive(),
  description: z.string().optional(),
});

const updateSchema = createSchema.partial().extend({
  status: z.enum(['OCCUPIED', 'VACANT', 'UNDER_MAINTENANCE', 'NOTICE_GIVEN']).optional(),
});

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const units = await svc.listUnits(req.params.propertyId, req.user!.managementCompanyId!);
    ok(res, units);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'PROPERTY_NOT_FOUND') { notFound(res, 'Property not found'); return; }
    next(err);
  }
}

export async function get(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const unit = await svc.getUnit(req.params.id, req.params.propertyId, req.user!.managementCompanyId!);
    if (!unit) { notFound(res); return; }
    ok(res, unit);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'PROPERTY_NOT_FOUND') { notFound(res, 'Property not found'); return; }
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) { badRequest(res, parsed.error.errors[0].message); return; }

    const unit = await svc.createUnit(req.params.propertyId, req.user!.managementCompanyId!, parsed.data);
    created(res, unit);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'PROPERTY_NOT_FOUND') { notFound(res, 'Property not found'); return; }
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) { badRequest(res, parsed.error.errors[0].message); return; }

    const unit = await svc.updateUnit(req.params.id, req.params.propertyId, req.user!.managementCompanyId!, parsed.data);
    ok(res, unit);
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'NOT_FOUND') { notFound(res); return; }
      if (err.message === 'PROPERTY_NOT_FOUND') { notFound(res, 'Property not found'); return; }
    }
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await svc.deleteUnit(req.params.id, req.params.propertyId, req.user!.managementCompanyId!);
    noContent(res);
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'NOT_FOUND') { notFound(res); return; }
      if (err.message === 'HAS_ACTIVE_LEASE') { badRequest(res, 'Cannot delete a unit with an active lease'); return; }
      if (err.message === 'PROPERTY_NOT_FOUND') { notFound(res, 'Property not found'); return; }
    }
    next(err);
  }
}
