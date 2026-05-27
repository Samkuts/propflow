import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './properties.service';
import { ok, created, noContent, badRequest, notFound, paginate } from '../../../lib/response';

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['RESIDENTIAL', 'COMMERCIAL', 'HOA']),
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  zip: z.string().min(1),
  country: z.string().optional(),
  description: z.string().optional(),
  ownerId: z.string().uuid().optional(),
});

const updateSchema = createSchema.partial();

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const companyId = req.user!.managementCompanyId!;
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const search = req.query.search as string | undefined;
    const type = req.query.type as svc.ListPropertiesQuery['type'];
    const ownerId = req.query.ownerId as string | undefined;

    const { properties, total } = await svc.listProperties(companyId, {
      page, limit, search, type, ownerId,
    });
    paginate(res, properties, total, page, limit);
  } catch (err) {
    next(err);
  }
}

export async function get(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const property = await svc.getProperty(req.params.id, req.user!.managementCompanyId!);
    if (!property) { notFound(res); return; }
    ok(res, property);
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) { badRequest(res, parsed.error.errors[0].message); return; }

    const property = await svc.createProperty(req.user!.managementCompanyId!, parsed.data);
    created(res, property);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'OWNER_NOT_FOUND') {
      notFound(res, 'Owner not found in this company');
      return;
    }
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) { badRequest(res, parsed.error.errors[0].message); return; }

    const property = await svc.updateProperty(req.params.id, req.user!.managementCompanyId!, parsed.data);
    ok(res, property);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'NOT_FOUND') { notFound(res); return; }
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await svc.deleteProperty(req.params.id, req.user!.managementCompanyId!);
    noContent(res);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'NOT_FOUND') { notFound(res); return; }
    next(err);
  }
}

export async function vacancySummary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await svc.getVacancySummary(req.user!.managementCompanyId!);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}

export async function setApprovalThreshold(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = z.object({
      maintenanceApprovalThreshold: z.number().int().positive().nullable(),
    }).safeParse(req.body);
    if (!parsed.success) { badRequest(res, parsed.error.errors[0].message); return; }

    const property = await svc.updateProperty(
      req.params.id,
      req.user!.managementCompanyId!,
      { maintenanceApprovalThreshold: parsed.data.maintenanceApprovalThreshold } as Parameters<typeof svc.updateProperty>[2]
    );
    ok(res, property);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'NOT_FOUND') { notFound(res); return; }
    next(err);
  }
}
