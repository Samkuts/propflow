import { prisma } from '../../../lib/prisma';

export async function getRentRoll(managementCompanyId: string) {
  const units = await prisma.unit.findMany({
    where: { property: { managementCompanyId }, deletedAt: null },
    orderBy: [{ property: { name: 'asc' } }, { unitNumber: 'asc' }],
    include: {
      property: { select: { id: true, name: true } },
      leases: {
        where: { status: { in: ['ACTIVE', 'MONTH_TO_MONTH'] }, deletedAt: null },
        take: 1,
        include: {
          tenants: { select: { firstName: true, lastName: true, email: true } },
          rentCharges: {
            where: { status: { in: ['OUTSTANDING', 'PARTIAL'] }, deletedAt: null },
          },
        },
      },
    },
  });

  return units.map((unit) => {
    const lease = unit.leases[0] ?? null;
    const balanceDue = lease
      ? lease.rentCharges.reduce((s, c) => s + c.balance, 0)
      : 0;

    return {
      propertyId: unit.property.id,
      propertyName: unit.property.name,
      unitId: unit.id,
      unitNumber: unit.unitNumber,
      status: unit.status,
      rentAmount: unit.rentAmount,
      leaseId: lease?.id ?? null,
      leaseStart: lease?.startDate ?? null,
      leaseEnd: lease?.endDate ?? null,
      tenants: lease?.tenants ?? [],
      balanceDue,
    };
  });
}

export async function getDelinquencyReport(managementCompanyId: string) {
  const leases = await prisma.lease.findMany({
    where: {
      status: { in: ['ACTIVE', 'MONTH_TO_MONTH'] },
      deletedAt: null,
      unit: { property: { managementCompanyId } },
    },
    include: {
      unit: { include: { property: { select: { name: true } } } },
      tenants: { select: { firstName: true, lastName: true, email: true, phone: true } },
      rentCharges: {
        where: { status: { in: ['OUTSTANDING', 'PARTIAL'] }, deletedAt: null },
        orderBy: { dueDate: 'asc' },
      },
    },
  });

  const delinquent = leases
    .filter((l) => l.rentCharges.length > 0)
    .map((l) => {
      const totalBalance = l.rentCharges.reduce((s, c) => s + c.balance, 0);
      const oldestCharge = l.rentCharges[0];
      const daysDelinquent = oldestCharge
        ? Math.floor((Date.now() - oldestCharge.dueDate.getTime()) / 86_400_000)
        : 0;

      return {
        leaseId: l.id,
        propertyName: l.unit.property.name,
        unitNumber: l.unit.unitNumber,
        tenants: l.tenants,
        totalBalance,
        daysDelinquent,
        charges: l.rentCharges,
      };
    });

  return delinquent.sort((a, b) => b.totalBalance - a.totalBalance);
}

export async function getVacancyReport(managementCompanyId: string) {
  const units = await prisma.unit.findMany({
    where: {
      status: 'VACANT',
      property: { managementCompanyId },
      deletedAt: null,
    },
    include: {
      property: { select: { name: true, address: true } },
    },
  });

  const now = Date.now();
  const totalLostRevenue = units.reduce((s, u) => {
    const daysVacant = u.vacantSince
      ? Math.floor((now - u.vacantSince.getTime()) / 86_400_000)
      : 0;
    return s + daysVacant * Math.round(u.rentAmount / 30);
  }, 0);

  return {
    totalVacant: units.length,
    totalLostRevenue,
    units: units.map((u) => ({
      unitId: u.id,
      unitNumber: u.unitNumber,
      propertyName: u.property.name,
      propertyAddress: u.property.address,
      rentAmount: u.rentAmount,
      vacantSince: u.vacantSince,
      daysVacant: u.vacantSince
        ? Math.floor((now - u.vacantSince.getTime()) / 86_400_000)
        : null,
      estimatedLostRevenue: u.vacantSince
        ? Math.floor((now - u.vacantSince.getTime()) / 86_400_000) * Math.round(u.rentAmount / 30)
        : 0,
    })),
  };
}

export async function getWorkOrderSummary(managementCompanyId: string) {
  const [open, completed] = await Promise.all([
    prisma.workOrder.findMany({
      where: {
        managementCompanyId,
        status: { notIn: ['CLOSED', 'DENIED'] },
        deletedAt: null,
      },
      include: {
        property: { select: { name: true } },
        vendor: { select: { companyName: true } },
        invoices: { where: { status: 'APPROVED' }, select: { amount: true } },
      },
    }),
    prisma.workOrder.findMany({
      where: { managementCompanyId, status: 'CLOSED', deletedAt: null },
      select: {
        id: true,
        createdAt: true,
        completedDate: true,
        invoices: { where: { status: 'APPROVED' }, select: { amount: true } },
      },
    }),
  ]);

  const avgCompletionDays =
    completed.length > 0
      ? completed.reduce((s, wo) => {
          if (!wo.completedDate) return s;
          return s + (wo.completedDate.getTime() - wo.createdAt.getTime()) / 86_400_000;
        }, 0) / completed.filter((wo) => wo.completedDate).length
      : 0;

  const totalCost = completed.reduce(
    (s, wo) => s + wo.invoices.reduce((is, inv) => is + inv.amount, 0),
    0
  );

  return {
    openCount: open.length,
    avgCompletionDays: Math.round(avgCompletionDays * 10) / 10,
    totalMaintenanceCost: totalCost,
    openOrders: open,
  };
}
