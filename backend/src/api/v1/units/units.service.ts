import { UnitStatus, Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

export interface CreateUnitInput {
  unitNumber: string;
  beds?: number;
  baths?: number;
  sqft?: number;
  rentAmount: number; // cents
  description?: string;
}

export interface UpdateUnitInput extends Partial<CreateUnitInput> {
  status?: UnitStatus;
}

async function assertPropertyAccess(propertyId: string, managementCompanyId: string) {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, managementCompanyId, deletedAt: null },
  });
  if (!property) throw new Error('PROPERTY_NOT_FOUND');
  return property;
}

export async function listUnits(propertyId: string, managementCompanyId: string) {
  await assertPropertyAccess(propertyId, managementCompanyId);

  return prisma.unit.findMany({
    where: { propertyId, deletedAt: null },
    orderBy: { unitNumber: 'asc' },
    include: {
      leases: {
        where: { status: { in: ['ACTIVE', 'MONTH_TO_MONTH'] }, deletedAt: null },
        include: { tenants: true },
        take: 1,
      },
      workOrders: {
        where: { status: { notIn: ['CLOSED', 'DENIED'] }, deletedAt: null },
        select: { id: true, status: true, priority: true, title: true },
      },
    },
  });
}

export async function getUnit(id: string, propertyId: string, managementCompanyId: string) {
  await assertPropertyAccess(propertyId, managementCompanyId);

  return prisma.unit.findFirst({
    where: { id, propertyId, deletedAt: null },
    include: {
      leases: {
        where: { deletedAt: null },
        orderBy: { startDate: 'desc' },
        include: {
          tenants: true,
          rentCharges: { orderBy: { dueDate: 'desc' }, take: 10 },
          payments: { orderBy: { createdAt: 'desc' }, take: 10 },
        },
      },
      workOrders: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
    },
  });
}

export async function createUnit(
  propertyId: string,
  managementCompanyId: string,
  input: CreateUnitInput
) {
  await assertPropertyAccess(propertyId, managementCompanyId);

  return prisma.unit.create({
    data: {
      ...input,
      propertyId,
      rentAmount: input.rentAmount,
      vacantSince: new Date(),
    },
  });
}

export async function updateUnit(
  id: string,
  propertyId: string,
  managementCompanyId: string,
  input: UpdateUnitInput
) {
  await assertPropertyAccess(propertyId, managementCompanyId);

  const unit = await prisma.unit.findFirst({ where: { id, propertyId, deletedAt: null } });
  if (!unit) throw new Error('NOT_FOUND');

  const data: Prisma.UnitUpdateInput = { ...input };

  // Auto-track vacancy date
  if (input.status === 'VACANT' && unit.status !== 'VACANT') {
    data.vacantSince = new Date();
  } else if (input.status === 'OCCUPIED') {
    data.vacantSince = null;
  }

  return prisma.unit.update({ where: { id }, data });
}

export async function deleteUnit(id: string, propertyId: string, managementCompanyId: string) {
  await assertPropertyAccess(propertyId, managementCompanyId);

  const unit = await prisma.unit.findFirst({ where: { id, propertyId, deletedAt: null } });
  if (!unit) throw new Error('NOT_FOUND');

  const activeLeases = await prisma.lease.count({
    where: { unitId: id, status: { in: ['ACTIVE', 'MONTH_TO_MONTH'] }, deletedAt: null },
  });
  if (activeLeases > 0) throw new Error('HAS_ACTIVE_LEASE');

  await prisma.unit.update({ where: { id }, data: { deletedAt: new Date() } });
}
