import { prisma } from '../../../lib/prisma';
import { encryptIfPresent, decryptIfPresent } from '../../../lib/crypto';

// ─── Owner Profile ────────────────────────────────────────────────────────────

export async function getOwnerProfile(userId: string, managementCompanyId: string) {
  const owner = await prisma.owner.findFirst({
    where: { userId, managementCompanyId, deletedAt: null },
    include: { user: { select: { firstName: true, lastName: true, email: true, phone: true } } },
  });
  if (!owner) return null;

  return {
    id: owner.id,
    user: owner.user,
    // Decrypt PII fields for display (masked would be returned but this is the owner's own data)
    taxId: decryptIfPresent(owner.taxId),
    bankAccountNumber: decryptIfPresent(owner.bankAccountNumber),
    bankRoutingNumber: decryptIfPresent(owner.bankRoutingNumber),
  };
}

export async function updateOwnerBankInfo(
  userId: string,
  managementCompanyId: string,
  input: {
    taxId?: string;
    bankAccountNumber?: string;
    bankRoutingNumber?: string;
  }
) {
  const owner = await prisma.owner.findFirst({
    where: { userId, managementCompanyId, deletedAt: null },
  });
  if (!owner) throw new Error('NOT_FOUND');

  return prisma.owner.update({
    where: { id: owner.id },
    data: {
      ...(input.taxId !== undefined && { taxId: encryptIfPresent(input.taxId) }),
      ...(input.bankAccountNumber !== undefined && { bankAccountNumber: encryptIfPresent(input.bankAccountNumber) }),
      ...(input.bankRoutingNumber !== undefined && { bankRoutingNumber: encryptIfPresent(input.bankRoutingNumber) }),
    },
  });
}

// ─── Disbursements ────────────────────────────────────────────────────────────

export async function listDisbursements(
  managementCompanyId: string,
  filters: { ownerId?: string; propertyId?: string; page?: number; limit?: number }
) {
  const { page = 1, limit = 20, ownerId, propertyId } = filters;
  const skip = (page - 1) * limit;

  const where = {
    managementCompanyId,
    ...(ownerId && { ownerId }),
    ...(propertyId && { propertyId }),
  };

  const [disbursements, total] = await Promise.all([
    prisma.disbursement.findMany({
      where,
      skip,
      take: limit,
      orderBy: { disbursementDate: 'desc' },
      include: {
        property: { select: { id: true, name: true } },
      },
    }),
    prisma.disbursement.count({ where }),
  ]);

  return { disbursements, total };
}

export async function requestDisbursement(
  userId: string,
  managementCompanyId: string,
  input: {
    propertyId: string;
    amount: number;
    notes?: string;
  }
) {
  // Find the owner record for this user
  const owner = await prisma.owner.findFirst({
    where: { userId, managementCompanyId, deletedAt: null },
  });
  if (!owner) throw new Error('OWNER_NOT_FOUND');

  // Validate the property belongs to this owner
  const property = await prisma.property.findFirst({
    where: {
      id: input.propertyId,
      managementCompanyId,
      ownerId: owner.id,
      deletedAt: null,
    },
  });
  if (!property) throw new Error('PROPERTY_NOT_FOUND');

  return prisma.disbursement.create({
    data: {
      managementCompanyId,
      ownerId: owner.id,
      propertyId: input.propertyId,
      amount: input.amount,
      disbursementDate: new Date(),
      notes: input.notes,
      status: 'PENDING',
    },
    include: {
      property: { select: { id: true, name: true } },
    },
  });
}

export async function createDisbursement(
  managementCompanyId: string,
  input: {
    ownerId: string;
    propertyId: string;
    amount: number;
    disbursementDate: string;
    notes?: string;
  }
) {
  // Validate property belongs to company and owner
  const property = await prisma.property.findFirst({
    where: {
      id: input.propertyId,
      managementCompanyId,
      ownerId: input.ownerId,
      deletedAt: null,
    },
  });
  if (!property) throw new Error('PROPERTY_NOT_FOUND');

  // Look up accounts for JE: DR Owner Funds Payable / CR Operating Account
  const accounts = await prisma.account.findMany({
    where: { managementCompanyId, code: { in: ['2200', '1000'] } },
  });
  const ownerFundsPayable = accounts.find((a) => a.code === '2200');
  const operatingAccount = accounts.find((a) => a.code === '1000');

  return prisma.$transaction(async (tx) => {
    let journalEntryId: string | null = null;

    if (ownerFundsPayable && operatingAccount) {
      const je = await tx.journalEntry.create({
        data: {
          managementCompanyId,
          propertyId: input.propertyId,
          type: 'OWNER_DISBURSEMENT',
          description: `Owner disbursement - ${property.name}`,
          entryDate: new Date(input.disbursementDate),
          lines: {
            create: [
              { accountId: ownerFundsPayable.id, debit: input.amount, credit: 0 },
              { accountId: operatingAccount.id, debit: 0, credit: input.amount },
            ],
          },
        },
      });
      journalEntryId = je.id;
    }

    const disbursement = await tx.disbursement.create({
      data: {
        managementCompanyId,
        ownerId: input.ownerId,
        propertyId: input.propertyId,
        amount: input.amount,
        disbursementDate: new Date(input.disbursementDate),
        notes: input.notes,
        status: 'PROCESSED',
        journalEntryId,
      },
      include: {
        property: { select: { id: true, name: true } },
      },
    });

    return disbursement;
  });
}
