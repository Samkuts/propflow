import { WorkOrderStatus, WorkOrderPriority, Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

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
  input: CreateWorkOrderInput
) {
  const property = await prisma.property.findFirst({
    where: { id: input.propertyId, managementCompanyId, deletedAt: null },
  });
  if (!property) throw new Error('PROPERTY_NOT_FOUND');

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

  const data: Prisma.WorkOrderUpdateInput = {
    ...(input.status && { status: input.status }),
    ...(input.vendorId !== undefined && { vendorId: input.vendorId }),
    ...(input.scheduledDate && { scheduledDate: new Date(input.scheduledDate) }),
    ...(input.internalNotes !== undefined && { internalNotes: input.internalNotes }),
    ...(input.priority && { priority: input.priority }),
  };

  if (input.status === 'COMPLETED') {
    data.completedDate = new Date();
  }

  return prisma.workOrder.update({ where: { id }, data, include: { vendor: true } });
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
