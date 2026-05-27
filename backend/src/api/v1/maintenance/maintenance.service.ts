import { WorkOrderStatus, WorkOrderPriority, Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { workOrderStatusEmail } from '../../../lib/email';
import { workOrderStatusSms } from '../../../lib/sms';

export interface CreateWorkOrderInput {
  propertyId: string;
  unitId?: string;
  title: string;
  description: string;
  priority?: WorkOrderPriority;
  submittedByTenantId?: string;
}

export interface UpdateWorkOrderInput {
  status?: WorkOrderStatus;
  vendorId?: string;
  scheduledDate?: string;
  internalNotes?: string;
  priority?: WorkOrderPriority;
  estimatedCost?: number; // cents
}

export interface SubmitInvoiceInput {
  workOrderId: string;
  amount: number; // cents
  description?: string;
  invoiceDate: string;
  dueDate?: string;
  lineItems?: Array<{ description: string; quantity: number; unitPrice: number }>;
}

export async function listWorkOrders(
  managementCompanyId: string,
  filters: {
    status?: WorkOrderStatus;
    propertyId?: string;
    vendorId?: string;
    priority?: WorkOrderPriority;
    page?: number;
    limit?: number;
  }
) {
  const { page = 1, limit = 20, ...where } = filters;
  const skip = (page - 1) * limit;

  const whereClause: Prisma.WorkOrderWhereInput = {
    managementCompanyId,
    deletedAt: null,
    ...(where.status && { status: where.status }),
    ...(where.propertyId && { propertyId: where.propertyId }),
    ...(where.vendorId && { vendorId: where.vendorId }),
    ...(where.priority && { priority: where.priority }),
  };

  const [workOrders, total] = await Promise.all([
    prisma.workOrder.findMany({
      where: whereClause,
      skip,
      take: limit,
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      include: {
        property: { select: { name: true } },
        unit: { select: { unitNumber: true } },
        vendor: { select: { companyName: true, contactName: true } },
        _count: { select: { invoices: true } },
      },
    }),
    prisma.workOrder.count({ where: whereClause }),
  ]);

  return { workOrders, total };
}

export async function getWorkOrder(id: string, managementCompanyId: string) {
  return prisma.workOrder.findFirst({
    where: { id, managementCompanyId, deletedAt: null },
    include: {
      property: true,
      unit: true,
      vendor: true,
      invoices: { include: { lineItems: true } },
      documents: { where: { deletedAt: null } },
      messages: { orderBy: { createdAt: 'asc' } },
    },
  });
}

export async function createWorkOrder(
  managementCompanyId: string,
  input: CreateWorkOrderInput & { estimatedCost?: number }
) {
  const property = await prisma.property.findFirst({
    where: { id: input.propertyId, managementCompanyId, deletedAt: null },
  });
  if (!property) throw new Error('PROPERTY_NOT_FOUND');

  // Determine if owner approval is needed at creation time
  const threshold = (property as Record<string, unknown>).maintenanceApprovalThreshold as number | null;
  const needsApproval =
    threshold != null &&
    input.estimatedCost != null &&
    input.estimatedCost > threshold;

  return prisma.workOrder.create({
    data: {
      managementCompanyId,
      propertyId: input.propertyId,
      unitId: input.unitId,
      title: input.title,
      description: input.description,
      priority: input.priority ?? 'NORMAL',
      submittedByTenantId: input.submittedByTenantId,
      status: 'SUBMITTED',
      estimatedCost: input.estimatedCost,
      ownerApprovalStatus: needsApproval ? 'PENDING' : 'NOT_REQUIRED',
    },
    include: { property: true, unit: true },
  });
}

export async function updateWorkOrder(
  id: string,
  managementCompanyId: string,
  input: UpdateWorkOrderInput
) {
  const wo = await prisma.workOrder.findFirst({
    where: { id, managementCompanyId, deletedAt: null },
  });
  if (!wo) throw new Error('NOT_FOUND');

  validateStatusTransition(wo.status, input.status);

  // Check if owner approval is required when estimated cost is being set
  let ownerApprovalStatus: 'PENDING' | 'NOT_REQUIRED' | undefined;
  if (input.estimatedCost !== undefined) {
    const property = await prisma.property.findUnique({
      where: { id: wo.propertyId },
      select: { maintenanceApprovalThreshold: true },
    });
    const threshold = property?.maintenanceApprovalThreshold;
    if (threshold != null && input.estimatedCost > threshold) {
      ownerApprovalStatus = 'PENDING';
    } else if (wo.ownerApprovalStatus === 'NOT_REQUIRED') {
      ownerApprovalStatus = 'NOT_REQUIRED';
    }
  }

  const data: Prisma.WorkOrderUpdateInput = {
    ...(input.status && { status: input.status }),
    ...(input.vendorId !== undefined && { vendorId: input.vendorId }),
    ...(input.scheduledDate && { scheduledDate: new Date(input.scheduledDate) }),
    ...(input.internalNotes !== undefined && { internalNotes: input.internalNotes }),
    ...(input.priority && { priority: input.priority }),
    ...(input.estimatedCost !== undefined && { estimatedCost: input.estimatedCost }),
    ...(ownerApprovalStatus && { ownerApprovalStatus }),
  };

  if (input.status === 'COMPLETED') {
    data.completedDate = new Date();
  }

  const updated = await prisma.workOrder.update({
    where: { id },
    data,
    include: {
      vendor: true,
      unit: { select: { unitNumber: true } },
    },
  });

  // Email + SMS the tenant who submitted the work order (if any)
  const SMS_STATUSES: WorkOrderStatus[] = ['APPROVED', 'ASSIGNED', 'COMPLETED'];
  if (input.status && wo.submittedByTenantId) {
    prisma.tenant.findUnique({
      where: { id: wo.submittedByTenantId },
      include: { user: true },
    }).then((tenant) => {
      if (!tenant || !tenant.user) return;
      workOrderStatusEmail({
        to: tenant.user.email,
        name: `${tenant.user.firstName} ${tenant.user.lastName}`,
        title: wo.title,
        status: input.status!,
        unitNumber: updated.unit?.unitNumber ?? '',
      }).catch(() => {});
      // SMS for the most actionable status changes only
      if (SMS_STATUSES.includes(input.status!) && tenant.phone) {
        workOrderStatusSms({
          to: tenant.phone,
          name: tenant.firstName,
          title: wo.title,
          status: input.status!,
        }).catch(() => {});
      }
    }).catch(() => {});
  }

  return updated;
}

export async function submitInvoice(managementCompanyId: string, input: SubmitInvoiceInput) {
  const workOrder = await prisma.workOrder.findFirst({
    where: { id: input.workOrderId, managementCompanyId, deletedAt: null },
    include: { vendor: true },
  });
  if (!workOrder) throw new Error('WORK_ORDER_NOT_FOUND');
  if (!workOrder.vendorId) throw new Error('NO_VENDOR_ASSIGNED');

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.create({
      data: {
        workOrderId: input.workOrderId,
        vendorId: workOrder.vendorId!,
        amount: input.amount,
        description: input.description,
        invoiceDate: new Date(input.invoiceDate),
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        lineItems: input.lineItems
          ? {
              create: input.lineItems.map((li) => ({
                description: li.description,
                quantity: li.quantity,
                unitPrice: li.unitPrice,
                amount: Math.round(li.quantity * li.unitPrice),
              })),
            }
          : undefined,
      },
      include: { lineItems: true },
    });

    // Update WO status to INVOICED
    await tx.workOrder.update({
      where: { id: input.workOrderId },
      data: { status: 'INVOICED' },
    });

    return invoice;
  });
}

export async function listInvoices(
  managementCompanyId: string,
  filters: { workOrderId?: string; status?: string; page?: number; limit?: number }
) {
  const { page = 1, limit = 20, workOrderId, status } = filters;
  const skip = (page - 1) * limit;

  const where: Prisma.InvoiceWhereInput = {
    workOrder: { managementCompanyId, deletedAt: null },
    ...(workOrderId && { workOrderId }),
    ...(status && { status: status as any }),
  };

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        lineItems: true,
        vendor: { select: { companyName: true, contactName: true } },
        workOrder: {
          select: {
            id: true,
            title: true,
            status: true,
            property: { select: { name: true } },
            unit: { select: { unitNumber: true } },
          },
        },
      },
    }),
    prisma.invoice.count({ where }),
  ]);

  return { invoices, total };
}

export async function rejectInvoice(
  invoiceId: string,
  managementCompanyId: string,
  notes?: string
): Promise<object> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, workOrder: { managementCompanyId } },
  });
  if (!invoice) throw new Error('NOT_FOUND');
  if (invoice.status !== 'SUBMITTED') throw new Error('NOT_SUBMITTABLE');

  return prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: 'REJECTED',
      ...(notes && { description: notes }),
    },
  });
}

export async function approveInvoice(
  invoiceId: string,
  managementCompanyId: string
): Promise<object> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, workOrder: { managementCompanyId } },
    include: { workOrder: { include: { property: true } } },
  });
  if (!invoice) throw new Error('NOT_FOUND');
  if (invoice.status !== 'SUBMITTED') throw new Error('NOT_SUBMITTABLE');

  return prisma.$transaction(async (tx) => {
    const approved = await tx.invoice.update({
      where: { id: invoiceId },
      data: { status: 'APPROVED' },
    });

    // Post journal entry: DR Maintenance Expense / CR Accounts Payable
    const accounts = await tx.account.findMany({
      where: { managementCompanyId, code: { in: ['5000', '2000'] } },
    });
    const maintenanceExp = accounts.find((a) => a.code === '5000');
    const ap = accounts.find((a) => a.code === '2000');

    if (maintenanceExp && ap) {
      await tx.journalEntry.create({
        data: {
          managementCompanyId,
          propertyId: invoice.workOrder.propertyId,
          invoiceId: invoice.id,
          type: 'MAINTENANCE_EXPENSE',
          description: `Maintenance expense - WO ${invoice.workOrderId}`,
          entryDate: new Date(),
          lines: {
            create: [
              { accountId: maintenanceExp.id, debit: invoice.amount, credit: 0 },
              { accountId: ap.id, debit: 0, credit: invoice.amount },
            ],
          },
        },
      });
    }

    // Close the work order
    await tx.workOrder.update({
      where: { id: invoice.workOrderId },
      data: { status: 'CLOSED' },
    });

    return approved;
  });
}

export async function getVendorWorkOrders(vendorId: string, managementCompanyId: string) {
  return prisma.workOrder.findMany({
    where: { vendorId, managementCompanyId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    include: {
      property: { select: { name: true, address: true } },
      unit: { select: { unitNumber: true } },
      invoices: { select: { id: true, status: true, amount: true } },
    },
  });
}

// ─── Owner Approval ───────────────────────────────────────────────────────────

export async function listPendingOwnerApprovals(managementCompanyId: string, ownerUserId: string) {
  // Find properties owned by this user
  const owner = await prisma.owner.findFirst({
    where: { userId: ownerUserId, managementCompanyId, deletedAt: null },
    include: { properties: { where: { deletedAt: null }, select: { id: true } } },
  });
  if (!owner) return [];

  const propertyIds = owner.properties.map((p) => p.id);

  return prisma.workOrder.findMany({
    where: {
      managementCompanyId,
      propertyId: { in: propertyIds },
      deletedAt: null,
      ownerApprovalStatus: 'PENDING',
    },
    include: {
      property: { select: { name: true, address: true } },
      unit: { select: { unitNumber: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function ownerApproveWorkOrder(
  id: string,
  managementCompanyId: string,
  ownerUserId: string
) {
  const wo = await prisma.workOrder.findFirst({
    where: { id, managementCompanyId, deletedAt: null, ownerApprovalStatus: 'PENDING' },
    include: { property: { include: { owner: true } } },
  });
  if (!wo) throw new Error('NOT_FOUND');
  if (wo.property.owner?.userId !== ownerUserId) throw new Error('NOT_AUTHORIZED');

  return prisma.workOrder.update({
    where: { id },
    data: {
      ownerApprovalStatus: 'APPROVED',
      ownerApprovedAt: new Date(),
      ownerApprovedBy: ownerUserId,
    },
  });
}

export async function ownerRejectWorkOrder(
  id: string,
  managementCompanyId: string,
  ownerUserId: string,
  reason: string
) {
  const wo = await prisma.workOrder.findFirst({
    where: { id, managementCompanyId, deletedAt: null, ownerApprovalStatus: 'PENDING' },
    include: { property: { include: { owner: true } } },
  });
  if (!wo) throw new Error('NOT_FOUND');
  if (wo.property.owner?.userId !== ownerUserId) throw new Error('NOT_AUTHORIZED');

  return prisma.workOrder.update({
    where: { id },
    data: {
      ownerApprovalStatus: 'REJECTED',
      ownerRejectionReason: reason,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  SUBMITTED: ['APPROVED', 'DENIED'],
  APPROVED: ['ASSIGNED'],
  ASSIGNED: ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: ['INVOICED'],
  INVOICED: ['CLOSED'],
  CLOSED: [],
  DENIED: [],
};

function validateStatusTransition(current: WorkOrderStatus, next?: WorkOrderStatus) {
  if (!next || next === current) return;
  if (!VALID_TRANSITIONS[current].includes(next)) {
    throw new Error(`INVALID_TRANSITION:${current}->${next}`);
  }
}
