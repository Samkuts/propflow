import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './inspections.service';
import { ok, created, badRequest, notFound } from '../../../lib/response';

const itemSchema = z.object({
  room: z.string().min(1),
  condition: z.enum(['EXCELLENT', 'GOOD', 'FAIR', 'POOR']),
  notes: z.string().optional(),
});

const createSchema = z.object({
  type: z.enum(['MOVE_IN', 'MOVE_OUT', 'ROUTINE']),
  conductedAt: z.string().min(1),
  overallCondition: z.enum(['EXCELLENT', 'GOOD', 'FAIR', 'POOR']),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1),
});

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listInspections(
      req.params.leaseId,
      req.user!.managementCompanyId!,
      req.user!.sub,
      req.user!.role
    );
    ok(res, result);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'LEASE_NOT_FOUND') { notFound(res); return; }
    next(err);
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.getInspection(
      req.params.id,
      req.params.leaseId,
      req.user!.managementCompanyId!,
      req.user!.sub,
      req.user!.role
    );
    ok(res, result);
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'LEASE_NOT_FOUND' || err.message === 'NOT_FOUND') { notFound(res); return; }
    }
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) { badRequest(res, parsed.error.errors[0].message); return; }

    const result = await svc.createInspection(
      req.params.leaseId,
      req.user!.managementCompanyId!,
      req.user!.sub,
      parsed.data
    );
    created(res, result);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'LEASE_NOT_FOUND') { notFound(res); return; }
    next(err);
  }
}

export async function sign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = z.object({ signature: z.string().min(2) }).safeParse(req.body);
    if (!parsed.success) { badRequest(res, 'Signature is required'); return; }

    const result = await svc.tenantSignInspection(
      req.params.id,
      req.params.leaseId,
      req.user!.managementCompanyId!,
      req.user!.sub,
      parsed.data.signature
    );
    ok(res, result);
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'NOT_FOUND' || err.message === 'LEASE_NOT_FOUND') { notFound(res); return; }
      if (err.message === 'NOT_AUTHORIZED') { res.status(403).json({ success: false, error: 'Forbidden' }); return; }
      if (err.message === 'ALREADY_SIGNED') { badRequest(res, 'Inspection already signed'); return; }
    }
    next(err);
  }
}
