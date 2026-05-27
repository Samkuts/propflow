import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './documents.service';
import { ok, created, badRequest, notFound } from '../../../lib/response';

const uploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive().max(20 * 1024 * 1024),
  leaseId: z.string().uuid().optional(),
  workOrderId: z.string().uuid().optional(),
  propertyId: z.string().uuid().optional(),
});

export async function requestUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = uploadSchema.safeParse(req.body);
    if (!parsed.success) { badRequest(res, parsed.error.errors[0].message); return; }

    const result = await svc.requestUpload({
      ...parsed.data,
      managementCompanyId: req.user!.managementCompanyId!,
      uploadedBy: req.user!.sub,
      propertyId: parsed.data.propertyId,
    });
    created(res, result);
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const docs = await svc.listDocuments({
      leaseId: req.query.leaseId as string | undefined,
      workOrderId: req.query.workOrderId as string | undefined,
      propertyId: req.query.propertyId as string | undefined,
      managementCompanyId: req.user!.managementCompanyId!,
    });
    ok(res, docs);
  } catch (err) {
    next(err);
  }
}

export async function getDownloadUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const url = await svc.getDownloadUrl(req.params.id, req.user!.managementCompanyId!);
    ok(res, { url });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'NOT_FOUND') { notFound(res); return; }
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await svc.deleteDocument(req.params.id, req.user!.managementCompanyId!);
    ok(res, { message: 'Document deleted' });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'NOT_FOUND') { notFound(res); return; }
    next(err);
  }
}
