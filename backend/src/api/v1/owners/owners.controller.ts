import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './owners.service';
import { ok, created, badRequest, notFound, paginate } from '../../../lib/response';

export async function getMyProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profile = await svc.getOwnerProfile(req.user!.sub, req.user!.managementCompanyId!);
    if (!profile) { notFound(res, 'Owner profile not found'); return; }
    ok(res, profile);
  } catch (err) { next(err); }
}

export async function updateBankInfo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = z.object({
      taxId: z.string().optional(),
      bankAccountNumber: z.string().optional(),
      bankRoutingNumber: z.string().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { badRequest(res, parsed.error.errors[0].message); return; }

    await svc.updateOwnerBankInfo(req.user!.sub, req.user!.managementCompanyId!, parsed.data);
    ok(res, { message: 'Bank information updated' });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'NOT_FOUND') { notFound(res); return; }
    next(err);
  }
}

export async function listDisbursements(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const { disbursements, total } = await svc.listDisbursements(req.user!.managementCompanyId!, {
      ownerId: req.query.ownerId as string,
      propertyId: req.query.propertyId as string,
      page,
      limit,
    });
    paginate(res, disbursements, total, page, limit);
  } catch (err) { next(err); }
}

export async function requestDisbursement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = z.object({
      propertyId: z.string().uuid(),
      amount: z.number().int().positive(),
      notes: z.string().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { badRequest(res, parsed.error.errors[0].message); return; }

    const disbursement = await svc.requestDisbursement(
      req.user!.sub,
      req.user!.managementCompanyId!,
      parsed.data
    );
    created(res, disbursement);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'OWNER_NOT_FOUND') { notFound(res, 'Owner profile not found'); return; }
    if (err instanceof Error && err.message === 'PROPERTY_NOT_FOUND') {
      notFound(res, 'Property not found or does not belong to you');
      return;
    }
    next(err);
  }
}

export async function createDisbursement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = z.object({
      ownerId: z.string().uuid(),
      propertyId: z.string().uuid(),
      amount: z.number().int().positive(),
      disbursementDate: z.string().min(1),
      notes: z.string().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { badRequest(res, parsed.error.errors[0].message); return; }

    const disbursement = await svc.createDisbursement(req.user!.managementCompanyId!, parsed.data);
    created(res, disbursement);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'PROPERTY_NOT_FOUND') {
      notFound(res, 'Property not found or does not belong to this owner');
      return;
    }
    next(err);
  }
}
