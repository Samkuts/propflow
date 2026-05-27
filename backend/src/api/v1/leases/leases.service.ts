import { LeaseStatus, Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { leaseActivatedEmail } from '../../../lib/email';
import { generateLeasePdf, LeaseData } from '../../../lib/pdf';
import type { Readable } from 'stream';

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

export async function listLeases(
  managementCompanyId: string,
  filters: { status?: string; search?: string; page?: number; limit?: number } = {}
) {
  const { page = 1, limit = 50, status, search } = filters;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {
    deletedAt: null,
    unit: { property: { managementCompanyId } },
    ...(status && { status }),
    ...(search && {
      OR: [
        { unit: { unitNumber: { contains: search, mode: 'insensitive' as const } } },
        { unit: { property: { name: { contains: search, mode: 'insensitive' as const }, managementCompanyId } } },
        { tenants: { some: { user: { firstName: { contains: search, mode: 'insensitive' as const } } } } },
        { tenants: { some: { user: { lastName: { contains: search, mode: 'insensitive' as const } } } } },
        { tenants: { some: { user: { email: { contains: search, mode: 'insensitive' as const } } } } },
      ],
    }),
  };

  const [leases, total] = await Promise.all([
    prisma.lease.findMany({
      where,
      skip,
      take: limit,
      orderBy: { startDate: 'desc' },
      include: {
        unit: {
          select: {
            id: true,
            unitNumber: true,
            property: { select: { id: true, name: true } },
          },
        },
        tenants: {
          select: {
            id: true,
            user: { select: { firstName: true, lastName: true, email: true } },
          },
        },
        rentCharges: {
          where: { status: { in: ['OUTSTANDING', 'PARTIAL'] }, deletedAt: null },
          select: { balance: true },
        },
      },
    }),
    prisma.lease.count({ where }),
  ]);

  return {
    data: leases.map((l) => ({
      ...l,
      balanceDue: l.rentCharges.reduce((s, c) => s + c.balance, 0),
    })),
    total,
    page,
    limit,
  };
}

export async function listTenants(
  managementCompanyId: string,
  filters: { search?: string; page?: number; limit?: number } = {}
) {
  const { page = 1, limit = 50, search } = filters;
  const skip = (page - 1) * limit;

  const searchFilter = search
    ? {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' as const } },
          { lastName: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const [tenants, total] = await Promise.all([
    prisma.tenant.findMany({
      where: {
        deletedAt: null,
        managementCompanyId,
        user: { ...searchFilter },
      },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        lease: {
          where: { deletedAt: null, status: { in: ['ACTIVE', 'MONTH_TO_MONTH', 'PENDING'] } },
          select: {
            id: true,
            status: true,
            rentAmount: true,
            unit: {
              select: {
                unitNumber: true,
                property: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    }),
    prisma.tenant.count({
      where: { deletedAt: null, managementCompanyId, user: { ...searchFilter } },
    }),
  ]);

  return { data: tenants, total, page, limit };
}

// Get the active lease for the currently authenticated tenant user
export async function getMyLease(userId: string, managementCompanyId: string) {
  const tenant = await prisma.tenant.findFirst({
    where: {
      userId,
      managementCompanyId,
      deletedAt: null,
    },
    include: {
      lease: {
        include: {
          unit: {
            include: { property: { select: { id: true, name: true, address: true } } },
          },
          tenants: {
            include: {
              user: { select: { firstName: true, lastName: true, email: true } },
            },
          },
        },
      },
    },
  });

  if (!tenant) return null;
  const lease = (tenant.lease && (tenant.lease as { deletedAt: Date | null }).deletedAt === null)
    ? tenant.lease
    : null;
  return { tenant, lease };
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

  const activated = await prisma.lease.findUnique({
    where: { id },
    include: { tenants: { include: { user: true } }, unit: { include: { property: true } } },
  });

  // Fire-and-forget emails to all tenants on the lease
  if (activated) {
    const startDate = activated.startDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const rentAmount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(activated.rentAmount / 100);
    for (const tenant of activated.tenants) {
      if (!tenant.user) continue;
      leaseActivatedEmail({
        to: tenant.user.email,
        tenantName: `${tenant.user.firstName} ${tenant.user.lastName}`,
        propertyName: activated.unit.property.name,
        unitNumber: activated.unit.unitNumber,
        startDate,
        rentAmount,
      }).catch(() => {}); // non-blocking
    }
  }

  return activated;
}

export async function terminateLease(
  id: string,
  managementCompanyId: string,
  input: { moveOutDate?: string; depositReturnAmount?: number } = {}
) {
  const lease = await prisma.lease.findFirst({
    where: { id, deletedAt: null, unit: { property: { managementCompanyId } } },
    include: { unit: { include: { property: true } } },
  });
  if (!lease) throw new Error('NOT_FOUND');
  if (!['ACTIVE', 'MONTH_TO_MONTH'].includes(lease.status)) throw new Error('CANNOT_TERMINATE');

  const moveOutDate = input.moveOutDate ? new Date(input.moveOutDate) : new Date();
  const depositReturn = input.depositReturnAmount ?? 0;

  await prisma.$transaction(async (tx) => {
    // Terminate lease
    await tx.lease.update({
      where: { id },
      data: {
        status: 'TERMINATED',
        ...(depositReturn > 0 && {
          depositReturned: true,
          depositReturnedDate: moveOutDate,
        }),
      },
    });

    // Set unit vacant
    await tx.unit.update({
      where: { id: lease.unitId },
      data: { status: 'VACANT', vacantSince: moveOutDate },
    });

    // Post deposit return journal entry if applicable
    if (depositReturn > 0) {
      const accounts = await tx.account.findMany({
        where: { managementCompanyId, code: { in: ['1020', '2100'] } },
      });
      const trustAcc = accounts.find((a) => a.code === '1020');
      const depositLiab = accounts.find((a) => a.code === '2100');

      if (trustAcc && depositLiab) {
        await tx.journalEntry.create({
          data: {
            managementCompanyId,
            propertyId: lease.unit.property.id,
            type: 'SECURITY_DEPOSIT_RETURN',
            description: `Security deposit return for unit ${lease.unit.unitNumber}`,
            entryDate: moveOutDate,
            lines: {
              create: [
                { accountId: depositLiab.id, debit: depositReturn, credit: 0, description: 'Release deposit liability' },
                { accountId: trustAcc.id, debit: 0, credit: depositReturn, description: 'Trust account disbursement' },
              ],
            },
          },
        });
      }
    }
  });

  return prisma.lease.findUnique({ where: { id }, include: { unit: true, tenants: true } });
}

export async function renewLease(
  id: string,
  managementCompanyId: string,
  input: { newEndDate: string; newRentAmount?: number }
) {
  const lease = await prisma.lease.findFirst({
    where: { id, deletedAt: null, unit: { property: { managementCompanyId } } },
  });
  if (!lease) throw new Error('NOT_FOUND');
  if (!['ACTIVE', 'MONTH_TO_MONTH'].includes(lease.status)) throw new Error('CANNOT_RENEW');

  const newRent = input.newRentAmount ?? lease.rentAmount;

  const updated = await prisma.lease.update({
    where: { id },
    data: {
      endDate: new Date(input.newEndDate),
      rentAmount: newRent,
      status: 'ACTIVE', // in case it was MONTH_TO_MONTH
    },
    include: { unit: { include: { property: true } }, tenants: true },
  });

  // Update unit's rent amount if it changed
  if (newRent !== lease.rentAmount) {
    await prisma.unit.update({ where: { id: lease.unitId }, data: { rentAmount: newRent } });
  }

  return updated;
}

export async function getExpiringLeases(managementCompanyId: string, days = 30) {
  const now = new Date();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);

  return prisma.lease.findMany({
    where: {
      deletedAt: null,
      status: { in: ['ACTIVE', 'MONTH_TO_MONTH'] },
      endDate: { gte: now, lte: cutoff },
      unit: { property: { managementCompanyId } },
    },
    include: {
      unit: {
        select: {
          id: true,
          unitNumber: true,
          property: { select: { id: true, name: true } },
        },
      },
      tenants: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      },
    },
    orderBy: { endDate: 'asc' },
  });
}

// ─── PDF generation ───────────────────────────────────────────────────────────

export async function getLeasePdfStream(
  leaseId: string,
  managementCompanyId: string,
  userRole: string,
  userId: string
): Promise<{ stream: Readable; filename: string }> {
  const lease = await prisma.lease.findFirst({
    where: { id: leaseId, deletedAt: null },
    include: {
      unit: {
        include: {
          property: {
            include: { managementCompany: true },
          },
        },
      },
      tenants: {
        include: {
          user: { select: { firstName: true, lastName: true, email: true, phone: true } },
        },
      },
    },
  });

  if (!lease) throw new Error('NOT_FOUND');
  if (lease.unit.property.managementCompanyId !== managementCompanyId) throw new Error('NOT_FOUND');

  // Tenants can only download their own lease
  if (userRole === 'TENANT') {
    const t = await prisma.tenant.findFirst({ where: { userId, leaseId } });
    if (!t) throw new Error('NOT_FOUND');
  }

  const company = lease.unit.property.managementCompany;

  const data: LeaseData = {
    companyName: company.name,
    property: {
      name: lease.unit.property.name,
      address: lease.unit.property.address,
    },
    unit: {
      unitNumber: lease.unit.unitNumber,
      bedrooms: (lease.unit as Record<string, unknown>).bedrooms as number | null,
      bathrooms: (lease.unit as Record<string, unknown>).bathrooms as number | null,
    },
    lease: {
      id: lease.id,
      status: lease.status,
      startDate: lease.startDate,
      endDate: lease.endDate ?? null,
      rentAmount: lease.rentAmount,
      depositAmount: lease.depositAmount,
      rentDueDay: lease.rentDueDay,
      gracePeriodDays: lease.gracePeriodDays,
      lateFeeType: lease.lateFeeType,
      lateFeeAmount: lease.lateFeeAmount,
      petsAllowed: lease.petsAllowed,
      petDeposit: lease.petDeposit ?? null,
    },
    tenants: lease.tenants.map((t) => ({
      firstName: t.user?.firstName ?? t.firstName,
      lastName: t.user?.lastName ?? t.lastName,
      email: t.user?.email ?? t.email,
      phone: t.user?.phone ?? t.phone ?? null,
    })),
  };

  const unitSlug = `unit-${lease.unit.unitNumber.replace(/\s+/g, '-')}`;
  const filename = `lease-${unitSlug}-${lease.id.slice(0, 8)}.pdf`;

  return { stream: generateLeasePdf(data), filename };
}

// ─────────────────────────────────────────────────────────────────────────────

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
