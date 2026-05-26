import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './maintenance.service';
import { ok, created, badRequest, notFound, paginate } from '../../../lib/response';

const createSchema = z.object({
  propertyId: z.string().uuid(),
  unitId: z.string().uuid().optional(),
  title: z.string().min(1),
  description: z.string().min(1),
  priority: z.enum(['EMERGENCY', 'HIGH', 'NORMAL', 'LOW']).optional(),
});

const updateSchema = z.object({
  status: z.enum(['SUBMITTED', 'APPROVED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'CLOSED', 'DENIED']).optional(),
  vendorId: z.string().uuid().optional().nullable(),
  scheduledDate: z.string().optional(),
  internalNotes: z.string().optional(),
  priority: z.enum(['EMERGENCY', 'HIGH', 'NORMAL', 'LOW']).optional(),
});

const invoiceSchema = z.object({
  workOrderId: z.string().uuid(),
  amount: z.number().int().positive(),
  description: z.string().optional(),
  invoiceDate: z.string(),
  dueDate: z.string().optional(),
  lineItems: z.array(z.object({
    description: z.string(),
    quantity: z.number().positive(),
    unitPrice: z.number().int().positive(),
  })).optional(),
});

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const { workOrders, total } = await svc.listWorkOrders(req.user!.managementCompanyId!, {
      status: req.query.status as any,
      propertyId: req.query.propertyId as string,
      vendorId: req.query.vendorId as string,
      priority: req.query.priority as any,
      page, limit,
    });
    paginate(res, workOrders, total, page, limit);
  } catch (err) { next(err); }
}

export async function get(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const wo = await svc.getWorkOrder(req.params.id, req.user!.managementCompanyId!);
    if (!wo) { notFound(res); return; }
    ok(res, wo);
  } catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) { badRequest(res, parsed.error.errors[0].message); return; }
    const wo = await svc.createWorkOrder(req.user!.managementCompanyId!, parsed.data);
    created(res, wo);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'PROPERTY_NOT_FOUND') { notFound(res, 'Property not found'); return; }
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) { badRequest(res, parsed.error.errors[0].message); return; }
    const wo = await svc.updateWorkOrder(req.params.id, req.user!.managementCompanyId!, parsed.data as any);
    ok(res, wo);
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'NOT_FOUND') { notFound(res); return; }
      if (err.message.startsWith('INVALID_TRANSITION')) { badRequest(res, `Invalid status transition: ${err.message.split(':')[1]}`); return; }
    }
    next(err);
  }
}

export async function submitInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = invoiceSchema.safeParse(req.body);
    if (!parsed.success) { badRequest(res, parsed.error.errors[0].message); return; }
    const invoice = await svc.submitInvoice(req.user!.managementCompanyId!, parsed.data);
    created(res, invoice);
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'WORK_ORDER_NOT_FOUND') { notFound(res, 'Work order not found'); return; }
      if (err.message === 'NO_VENDOR_ASSIGNED') { badRequest(res, 'No vendor assigned to this work order'); return; }
    }
    next(err);
  }
}

export async function approveInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.approveInvoice(req.params.id, req.user!.managementCompanyId!);
    ok(res, result);
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'NOT_FOUND') { notFound(res); return; }
      if (err.message === 'NOT_SUBMITTABLE') { badRequest(res, 'Invoice is not in SUBMITTED status'); return; }
    }
    next(err);
  }
}

export async function vendorWorkOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await svc.getVendorWorkOrders(req.params.vendorId, req.user!.managementCompanyId!);
    ok(res, data);
  } catch (err) { next(err); }
}
