import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './tenants.service';
import { ok, created, badRequest, notFound } from '../../../lib/response';

const createSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
});

/**
 * GET /api/v1/tenants?search=...
 * Lightweight search for the LeaseCreate tenant-picker autocomplete.
 */
export async function search(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = (req.query.search as string) ?? '';
    const results = await svc.searchTenants(req.user!.managementCompanyId!, q);
    ok(res, results);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/tenants
 * Create a new tenant user, send invite email.
 */
export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) { badRequest(res, parsed.error.errors[0].message); return; }

    const tenant = await svc.createTenant(req.user!.managementCompanyId!, parsed.data);
    created(res, tenant);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'EMAIL_TAKEN') {
      badRequest(res, 'A user with this email already exists in your company');
      return;
    }
    next(err);
  }
}

/**
 * GET /api/v1/tenants/:id
 */
export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenant = await svc.getTenant(req.params.id, req.user!.managementCompanyId!);
    if (!tenant) { notFound(res, 'Tenant not found'); return; }
    ok(res, tenant);
  } catch (err) {
    next(err);
  }
}
