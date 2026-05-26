import { LeaseStatus, Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

export interface CreateLeaseInput {
  unitId: string;
  startDate: string; // ISO date
  endDate?: string;
  rentAmount: number; // cents
  depositAmount: number; // cents
  rentDueDay?: number;
  gracePeriodDays?: number;
  lateFeeType?: 'FLAT' | 'PERCENT';
  lateFeeAmount?: number;
  petsAllowed?: boolean;
  petDeposit?: number;
  tenantIds?: string[]; // link existing tenants
}

export interface AddTenantToLeaseInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  managementCompanyId: string;
}

export async function getLease(
  id: string,
  managementCompanyId: string,
  userRole: string,
  userId: string
) {
  const lease = await prisma.lease.findFirst({
    where: { id, deletedAt: null },
    include: {
      unit: { include: { property: true } },
      tenants: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
      rentCharges: { orderBy: { dueDate: 'desc' } },
      payments: { orderBy: { createdAt: 'desc' } },
      documents: { where: { deletedAt: null } },
    },
  });

  if (!lease) return null;
  if (lease.unit.property.managementCompanyId !== managementCompanyId) return null;

  // Tenants can only see their own lease
  if (userRole === 'TENANT') {
    const tenant = await prisma.tenant.findFirst({
      where: { userId, leaseId: id },
    });
    if (!tenant) return null;
  }

  return lease;
}

export async function listLeasesForUnit(unitId: string, managementCompanyId: string) {
  const unit = await prisma.unit.findFirst({
    where: { id: unitId, property: { managementCompanyId }, deletedAt: null },
  });
  if (!unit) throw new Error('UNIT_NOT_FOUND');

  return prisma.lease.findMany({
    where: { unitId, deletedAt: null },
    orderBy: { startDate: 'desc' },
    include: {
      tenants: true,
      rentCharges: { where: { status: { not: 'PAID' } } },
    },
  });
}

export async function createLease(managementCompanyId: string, input: CreateLeaseInput) {
  // Validate unit belongs to company
  const unit = await prisma.unit.findFirst({
    where: { id: input.unitId, property: { managementCompanyId }, deletedAt: null },
  });
  if (!unit) throw new Error('UNIT_NOT_FOUND');

  // Ensure no active lease already exists
  const activeLease = await prisma.lease.findFirst({
    where: {
      unitId: input.unitId,
      status: { in: ['ACTIVE', 'MONTH_TO_MONTH', 'PENDING'] },
      deletedAt: null,
    },
  });
  if (activeLease) throw new Error('ACTIVE_LEASE_EXISTS');

  const result = await prisma.$transaction(async (tx) => {
    const lease = await tx.lease.create({
      data: {
        unitId: input.unitId,
        startDate: new Date(input.startDate),
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        rentAmount: input.rentAmount,
        depositAmount: input.depositAmount,
        rentDueDay: input.rentDueDay ?? 1,
        gracePeriodDays: input.gracePeriodDays ?? 5,
        lateFeeType: input.lateFeeType ?? 'FLAT',
        lateFeeAmount: input.lateFeeAmount ?? 0,
        petsAllowed: input.petsAllowed ?? false,
        petDeposit: input.petDeposit,
        status: 'PENDING',
        ...(input.tenantIds && {
          tenants: { connect: input.tenantIds.map((id) => ({ id })) },
        }),
      },
      include: { tenants: true, unit: true },
    });

    return lease;
  });

  return result;
}

export async function activateLease(id: string, managementCompanyId: string) {
  const lease = await prisma.lease.findFirst({
    where: { id, deletedAt: null, unit: { property: { managementCompanyId } } },
    include: { unit: { include: { property: true } } },
  });
  if (!lease) throw new Error('NOT_FOUND');
  if (lease.status !== 'PENDING') throw new Error('NOT_PENDING');

  await prisma.$transaction(async (tx) => {
    await tx.lease.update({ where: { id }, data: { status: 'ACTIVE' } });
    await tx.unit.update({ where: { id: lease.unitId }, data: { status: 'OCCUPIED', vacantSince: null } });

    // Post security deposit journal entry
    const company = lease.unit.property;
    const accounts = await tx.account.findMany({
      where: { managementCompanyId, code: { in: ['1020', '2100'] } },
    });
    const trustAcc = accounts.find((a) => a.code === '1020');
    const depositLiab = accounts.find((a) => a.code === '2100');

    if (trustAcc && depositLiab && lease.depositAmount > 0) {
      await tx.journalEntry.create({
        data: {
          managementCompanyId,
          propertyId: lease.unit.property.id,
          type: 'SECURITY_DEPOSIT',
          description: `Security deposit received for unit ${lease.unit.unitNumber}`,
          entryDate: new Date(),
          lines: {
            create: [
              { accountId: trustAcc.id, debit: lease.depositAmount, credit: 0, description: 'Security deposit - trust' },
              { accountId: depositLiab.id, debit: 0, credit: lease.depositAmount, description: 'Security deposit liability' },
            ],
          },
        },
      });
    }
  });

  return prisma.lease.findUnique({ where: { id }, include: { tenants: true, unit: true } });
}

export async function terminateLease(id: string, managementCompanyId: string, reason?: string) {
  const lease = await prisma.lease.findFirst({
    where: { id, deletedAt: null, unit: { property: { managementCompanyId } } },
    include: { unit: true },
  });
  if (!lease) throw new Error('NOT_FOUND');
  if (!['ACTIVE', 'MONTH_TO_MONTH'].includes(lease.status)) throw new Error('CANNOT_TERMINATE');

  await prisma.$transaction(async (tx) => {
    await tx.lease.update({ where: { id }, data: { status: 'TERMINATED' } });
    await tx.unit.update({ where: { id: lease.unitId }, data: { status: 'VACANT', vacantSince: new Date() } });
  });
}

export async function postMonthlyRentCharges(managementCompanyId: string) {
  const today = new Date();
  const dayOfMonth = today.getDate();

  // Find all active leases where today is the rent due day
  const leases = await prisma.lease.findMany({
    where: {
      status: { in: ['ACTIVE', 'MONTH_TO_MONTH'] },
      rentDueDay: dayOfMonth,
      deletedAt: null,
      unit: { property: { managementCompanyId } },
    },
    include: { unit: { include: { property: true } } },
  });

  const results = [];
  for (const lease of leases) {
    // Check if charge already exists for this period
    const chargeStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const chargeEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const existing = await prisma.rentCharge.findFirst({
      where: {
        leaseId: lease.id,
        type: 'RENT',
        dueDate: { gte: chargeStart, lte: chargeEnd },
      },
    });

    if (!existing) {
      const charge = await prisma.$transaction(async (tx) => {
        const rc = await tx.rentCharge.create({
          data: {
            leaseId: lease.id,
            type: 'RENT',
            amount: lease.rentAmount,
            balance: lease.rentAmount,
            dueDate: new Date(today.getFullYear(), today.getMonth(), lease.rentDueDay),
            description: `Rent for ${today.toLocaleString('default', { month: 'long', year: 'numeric' })}`,
          },
        });

        // Post to journal: DR Accounts Receivable / CR Rent Income
        const accounts = await tx.account.findMany({
          where: { managementCompanyId, code: { in: ['1100', '4000'] } },
        });
        const ar = accounts.find((a) => a.code === '1100');
        const income = accounts.find((a) => a.code === '4000');

        if (ar && income) {
          await tx.journalEntry.create({
            data: {
              managementCompanyId,
              propertyId: lease.unit.property.id,
              type: 'RENT_CHARGE',
              description: `Rent charge - ${lease.unit.unitNumber}`,
              entryDate: new Date(),
              lines: {
                create: [
                  { accountId: ar.id, debit: lease.rentAmount, credit: 0 },
                  { accountId: income.id, debit: 0, credit: lease.rentAmount },
                ],
              },
            },
          });
        }
        return rc;
      });
      results.push(charge);
    }
  }
  return results;
}
