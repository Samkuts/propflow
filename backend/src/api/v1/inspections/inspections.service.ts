import { InspectionCondition, InspectionType } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

export interface InspectionItem {
  room: string;
  condition: string;
  notes?: string;
}

export interface CreateInspectionInput {
  type: InspectionType;
  conductedAt: string; // ISO datetime
  overallCondition: InspectionCondition;
  notes?: string;
  items: InspectionItem[];
}

async function assertLeaseAccess(
  leaseId: string,
  managementCompanyId: string,
  userId: string,
  role: string
) {
  const lease = await prisma.lease.findFirst({
    where: { id: leaseId, deletedAt: null, unit: { property: { managementCompanyId } } },
  });
  if (!lease) throw new Error('LEASE_NOT_FOUND');

  if (role === 'TENANT') {
    const tenant = await prisma.tenant.findFirst({ where: { userId, leaseId } });
    if (!tenant) throw new Error('LEASE_NOT_FOUND');
  }

  return lease;
}

export async function listInspections(
  leaseId: string,
  managementCompanyId: string,
  userId: string,
  role: string
) {
  await assertLeaseAccess(leaseId, managementCompanyId, userId, role);
  return prisma.inspectionReport.findMany({
    where: { leaseId },
    orderBy: { conductedAt: 'desc' },
  });
}

export async function getInspection(
  id: string,
  leaseId: string,
  managementCompanyId: string,
  userId: string,
  role: string
) {
  await assertLeaseAccess(leaseId, managementCompanyId, userId, role);
  const report = await prisma.inspectionReport.findFirst({ where: { id, leaseId } });
  if (!report) throw new Error('NOT_FOUND');
  return report;
}

export async function createInspection(
  leaseId: string,
  managementCompanyId: string,
  conductedBy: string,
  input: CreateInspectionInput
) {
  const lease = await prisma.lease.findFirst({
    where: { id: leaseId, deletedAt: null, unit: { property: { managementCompanyId } } },
  });
  if (!lease) throw new Error('LEASE_NOT_FOUND');

  return prisma.inspectionReport.create({
    data: {
      leaseId,
      type: input.type,
      conductedAt: new Date(input.conductedAt),
      conductedBy,
      overallCondition: input.overallCondition,
      notes: input.notes,
      items: input.items as object[],
    },
  });
}

export async function tenantSignInspection(
  id: string,
  leaseId: string,
  managementCompanyId: string,
  userId: string,
  tenantSignature: string
) {
  const lease = await prisma.lease.findFirst({
    where: { id: leaseId, deletedAt: null, unit: { property: { managementCompanyId } } },
  });
  if (!lease) throw new Error('LEASE_NOT_FOUND');

  const tenant = await prisma.tenant.findFirst({ where: { userId, leaseId } });
  if (!tenant) throw new Error('NOT_AUTHORIZED');

  const report = await prisma.inspectionReport.findFirst({ where: { id, leaseId } });
  if (!report) throw new Error('NOT_FOUND');
  if (report.signedByTenant) throw new Error('ALREADY_SIGNED');

  return prisma.inspectionReport.update({
    where: { id },
    data: {
      signedByTenant: true,
      signedAt: new Date(),
      tenantSignature,
    },
  });
}
