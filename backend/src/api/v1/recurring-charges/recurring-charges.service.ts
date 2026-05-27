import { RentChargeType } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

export const ALLOWED_TYPES: RentChargeType[] = ['PET_FEE', 'UTILITY', 'PARKING', 'OTHER'];

export interface CreateRecurringChargeInput {
  type: RentChargeType;
  amount: number; // cents
  description?: string;
  dayOfMonth: number; // 1-28
  startDate: string; // ISO date
  endDate?: string;
}

// Validate lease belongs to company
async function assertLeaseAccess(leaseId: string, managementCompanyId: string) {
  const lease = await prisma.lease.findFirst({
    where: { id: leaseId, deletedAt: null, unit: { property: { managementCompanyId } } },
  });
  if (!lease) throw new Error('LEASE_NOT_FOUND');
  return lease;
}

export async function listRecurringCharges(leaseId: string, managementCompanyId: string) {
  await assertLeaseAccess(leaseId, managementCompanyId);
  return prisma.recurringCharge.findMany({
    where: { leaseId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
}

export async function createRecurringCharge(
  leaseId: string,
  managementCompanyId: string,
  input: CreateRecurringChargeInput
) {
  await assertLeaseAccess(leaseId, managementCompanyId);
  if (!ALLOWED_TYPES.includes(input.type)) throw new Error('INVALID_TYPE');

  return prisma.recurringCharge.create({
    data: {
      leaseId,
      type: input.type,
      amount: input.amount,
      description: input.description,
      dayOfMonth: input.dayOfMonth,
      startDate: new Date(input.startDate),
      endDate: input.endDate ? new Date(input.endDate) : undefined,
      active: true,
    },
  });
}

export async function updateRecurringCharge(
  id: string,
  leaseId: string,
  managementCompanyId: string,
  input: Partial<CreateRecurringChargeInput> & { active?: boolean }
) {
  await assertLeaseAccess(leaseId, managementCompanyId);
  const existing = await prisma.recurringCharge.findFirst({
    where: { id, leaseId, deletedAt: null },
  });
  if (!existing) throw new Error('NOT_FOUND');

  return prisma.recurringCharge.update({
    where: { id },
    data: {
      ...(input.type && { type: input.type }),
      ...(input.amount !== undefined && { amount: input.amount }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.dayOfMonth !== undefined && { dayOfMonth: input.dayOfMonth }),
      ...(input.startDate && { startDate: new Date(input.startDate) }),
      ...(input.endDate !== undefined && { endDate: input.endDate ? new Date(input.endDate) : null }),
      ...(input.active !== undefined && { active: input.active }),
    },
  });
}

export async function deleteRecurringCharge(
  id: string,
  leaseId: string,
  managementCompanyId: string
) {
  await assertLeaseAccess(leaseId, managementCompanyId);
  const existing = await prisma.recurringCharge.findFirst({
    where: { id, leaseId, deletedAt: null },
  });
  if (!existing) throw new Error('NOT_FOUND');

  return prisma.recurringCharge.update({
    where: { id },
    data: { deletedAt: new Date(), active: false },
  });
}

// ─── Called by recurring-charges cron job ────────────────────────────────────

export async function postRecurringCharges(managementCompanyId: string) {
  const today = new Date();
  const dayOfMonth = today.getDate();

  // Find all active recurring charges due today for this company
  const charges = await prisma.recurringCharge.findMany({
    where: {
      deletedAt: null,
      active: true,
      dayOfMonth,
      startDate: { lte: today },
      OR: [{ endDate: null }, { endDate: { gte: today } }],
      lease: {
        deletedAt: null,
        status: { in: ['ACTIVE', 'MONTH_TO_MONTH'] },
        unit: { property: { managementCompanyId } },
      },
    },
    include: {
      lease: { include: { unit: { include: { property: true } } } },
    },
  });

  const results = [];
  for (const rc of charges) {
    // Idempotency: check if a charge of this type already posted this month
    const periodStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const periodEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const existing = await prisma.rentCharge.findFirst({
      where: {
        leaseId: rc.leaseId,
        type: rc.type,
        dueDate: { gte: periodStart, lte: periodEnd },
        // Use explicit null check rather than `?? undefined` — passing undefined
        // to Prisma drops the condition entirely, which would match any description
        // and could cause missed postings when two charges of the same type have
        // different descriptions (e.g. "Parking Spot A" vs "Parking Spot B").
        description: rc.description ?? null,
        deletedAt: null,
      },
    });

    if (!existing) {
      const dueDate = new Date(today.getFullYear(), today.getMonth(), rc.dayOfMonth);
      const charge = await prisma.rentCharge.create({
        data: {
          leaseId: rc.leaseId,
          type: rc.type,
          amount: rc.amount,
          balance: rc.amount,
          dueDate,
          status: 'OUTSTANDING',
          description:
            rc.description ??
            `${rc.type.replace(/_/g, ' ')} – ${today.toLocaleString('default', { month: 'long', year: 'numeric' })}`,
        },
      });
      results.push(charge);
    }
  }

  return results;
}
