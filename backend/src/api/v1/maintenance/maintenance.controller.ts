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
  estimatedCost: z.number().int().positive().optional(),
});

const updateSchema = z.object({
  status: z.enum(['SUBMITTED', 'APPROVED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'CLOSED', 'DENIED']).optional(),
  vendorId: z.string().uuid().optional().nullable(),
  scheduledDate: z.string().optional(),
  internalNotes: z.string().optional(),
  priority: z.enum(['EMERGENCY', 'HIGH', 'NORMAL', 'LOW']).optional(),
  estimatedCost: z.number().int().positive().optional(),
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

export async function vendorAction(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status } = req.body;
    const allowed = ['IN_PROGRESS', 'COMPLETED'];
    if (!status || !allowed.includes(status)) {
      badRequest(res, 'Vendors may only set status to IN_PROGRESS or COMPLETED'); return;
    }
    // Verify this work order is assigned to this vendor
    const wo = await svc.getWorkOrder(req.params.id, req.user!.managementCompanyId!);
    if (!wo) { notFound(res); return; }
    const updated = await svc.updateWorkOrder(req.params.id, req.user!.managementCompanyId!, { status });
    ok(res, updated);
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'NOT_FOUND') { notFound(res); return; }
      if (err.message.startsWith('INVALID_TRANSITION')) { badRequest(res, `Invalid status transition`); return; }
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

export async function listInvoices(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const { invoices, total } = await svc.listInvoices(req.user!.managementCompanyId!, {
      workOrderId: req.query.workOrderId as string,
      status: req.query.status as string,
      page, limit,
    });
    paginate(res, invoices, total, page, limit);
  } catch (err) { next(err); }
}

export async function rejectInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.rejectInvoice(req.params.id, req.user!.managementCompanyId!, req.body.notes);
    ok(res, result);
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'NOT_FOUND') { notFound(res); return; }
      if (err.message === 'NOT_SUBMITTABLE') { badRequest(res, 'Invoice is not in SUBMITTED status'); return; }
    }
    next(err);
  }
}

// ─── Owner Approval ───────────────────────────────────────────────────────────

export async function pendingOwnerApproval(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listPendingOwnerApprovals(req.user!.managementCompanyId!, req.user!.sub);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function ownerApprove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.ownerApproveWorkOrder(
      req.params.id,
      req.user!.managementCompanyId!,
      req.user!.sub
    );
    ok(res, result);
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'NOT_FOUND') { notFound(res); return; }
      if (err.message === 'NOT_AUTHORIZED') { res.status(403).json({ success: false, error: 'This work order is not on your property' }); return; }
    }
    next(err);
  }
}

export async function ownerReject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = z.object({ reason: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) { badRequest(res, 'Rejection reason is required'); return; }

    const result = await svc.ownerRejectWorkOrder(
      req.params.id,
      req.user!.managementCompanyId!,
      req.user!.sub,
      parsed.data.reason
    );
    ok(res, result);
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'NOT_FOUND') { notFound(res); return; }
      if (err.message === 'NOT_AUTHORIZED') { res.status(403).json({ success: false, error: 'This work order is not on your property' }); return; }
    }
    next(err);
  }
}
