import { PropertyType, Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

export interface CreatePropertyInput {
  name: string;
  type: PropertyType;
  address: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
  description?: string;
  ownerId?: string;
}

export interface UpdatePropertyInput extends Partial<CreatePropertyInput> {}

export interface ListPropertiesQuery {
  page?: number;
  limit?: number;
  search?: string;
  type?: PropertyType;
  ownerId?: string;
}

export async function listProperties(
  managementCompanyId: string,
  query: ListPropertiesQuery
) {
  const { page = 1, limit = 20, search, type, ownerId } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.PropertyWhereInput = {
    managementCompanyId,
    deletedAt: null,
    ...(type && { type }),
    ...(ownerId && { ownerId }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
      ],
    }),
  };

  const [properties, total] = await Promise.all([
    prisma.property.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        owner: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
        _count: { select: { units: { where: { deletedAt: null } } } },
      },
    }),
    prisma.property.count({ where }),
  ]);

  return { properties, total };
}

export async function getProperty(id: string, managementCompanyId: string) {
  return prisma.property.findFirst({
    where: { id, managementCompanyId, deletedAt: null },
    include: {
      owner: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
      units: {
        where: { deletedAt: null },
        orderBy: { unitNumber: 'asc' },
        include: {
          leases: {
            where: { status: { in: ['ACTIVE', 'MONTH_TO_MONTH'] }, deletedAt: null },
            include: { tenants: true },
            take: 1,
          },
        },
      },
    },
  });
}

export async function createProperty(
  managementCompanyId: string,
  input: CreatePropertyInput
) {
  if (input.ownerId) {
    const owner = await prisma.owner.findFirst({
      where: { id: input.ownerId, managementCompanyId, deletedAt: null },
    });
    if (!owner) throw new Error('OWNER_NOT_FOUND');
  }

  return prisma.property.create({
    data: { ...input, managementCompanyId },
    include: { owner: true },
  });
}

export async function updateProperty(
  id: string,
  managementCompanyId: string,
  input: UpdatePropertyInput
) {
  const existing = await prisma.property.findFirst({
    where: { id, managementCompanyId, deletedAt: null },
  });
  if (!existing) throw new Error('NOT_FOUND');

  return prisma.property.update({
    where: { id },
    data: input,
    include: { owner: true },
  });
}

export async function deleteProperty(id: string, managementCompanyId: string) {
  const existing = await prisma.property.findFirst({
    where: { id, managementCompanyId, deletedAt: null },
  });
  if (!existing) throw new Error('NOT_FOUND');

  // Soft delete
  await prisma.property.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function getVacancySummary(managementCompanyId: string) {
  const units = await prisma.unit.findMany({
    where: {
      property: { managementCompanyId, deletedAt: null },
      deletedAt: null,
    },
    select: {
      id: true,
      unitNumber: true,
      status: true,
      rentAmount: true,
      vacantSince: true,
      property: { select: { id: true, name: true } },
    },
  });

  const now = new Date();
  return units
    .filter((u) => u.status === 'VACANT')
    .map((u) => ({
      ...u,
      daysVacant: u.vacantSince
        ? Math.floor((now.getTime() - u.vacantSince.getTime()) / 86_400_000)
        : null,
    }));
}
