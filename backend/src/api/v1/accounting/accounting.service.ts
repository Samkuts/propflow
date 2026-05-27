import { PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { paymentReceivedEmail } from '../../../lib/email';

export interface RecordPaymentInput {
  leaseId: string;
  amount: number; // cents
  method: PaymentMethod;
  referenceNumber?: string;
  memo?: string;
  paidDate?: string;
}

export interface PostLateFeesInput {
  managementCompanyId: string;
  asOfDate?: Date;
}

/**
 * Records a payment and applies it to outstanding charges using FIFO.
 * Posts a double-entry journal entry atomically.
 */
export async function recordPayment(
  managementCompanyId: string,
  input: RecordPaymentInput
): Promise<{ payment: object; appliedTo: object[] }> {
  // Verify lease belongs to this company
  const lease = await prisma.lease.findFirst({
    where: { id: input.leaseId, deletedAt: null, unit: { property: { managementCompanyId } } },
    include: { unit: { include: { property: true } } },
  });
  if (!lease) throw new Error('LEASE_NOT_FOUND');

  const result = await prisma.$transaction(async (tx) => {
    // Create the payment record
    const payment = await tx.payment.create({
      data: {
        leaseId: input.leaseId,
        amount: input.amount,
        method: input.method,
        status: PaymentStatus.COMPLETED,
        referenceNumber: input.referenceNumber,
        memo: input.memo,
        paidDate: input.paidDate ? new Date(input.paidDate) : new Date(),
      },
    });

    // FIFO: get all outstanding/partial charges ordered by due date ascending
    const outstandingCharges = await tx.rentCharge.findMany({
      where: {
        leaseId: input.leaseId,
        status: { in: ['OUTSTANDING', 'PARTIAL'] },
        deletedAt: null,
      },
      orderBy: { dueDate: 'asc' },
    });

    // Apply payment to charges in order
    let remaining = input.amount;
    const applications = [];

    for (const charge of outstandingCharges) {
      if (remaining <= 0) break;

      const toApply = Math.min(remaining, charge.balance);
      const newBalance = charge.balance - toApply;
      const newStatus = newBalance === 0 ? 'PAID' : 'PARTIAL';

      await tx.rentCharge.update({
        where: { id: charge.id },
        data: { balance: newBalance, status: newStatus },
      });

      const app = await tx.paymentApplication.create({
        data: { paymentId: payment.id, rentChargeId: charge.id, amount: toApply },
      });
      applications.push(app);
      remaining -= toApply;
    }

    // Post double-entry journal entry
    // DR Trust Account (cash in) / CR Accounts Receivable (reduces AR)
    const accounts = await tx.account.findMany({
      where: { managementCompanyId, code: { in: ['1010', '1100'] } },
    });
    const trustAcc = accounts.find((a) => a.code === '1010');
    const ar = accounts.find((a) => a.code === '1100');

    if (trustAcc && ar) {
      await tx.journalEntry.create({
        data: {
          managementCompanyId,
          propertyId: lease.unit.property.id,
          paymentId: payment.id,
          type: 'PAYMENT_RECEIVED',
          description: `Payment received - ${lease.unit.unitNumber} (${input.method})`,
          entryDate: new Date(input.paidDate ?? new Date()),
          lines: {
            create: [
              { accountId: trustAcc.id, debit: input.amount, credit: 0, description: 'Cash received' },
              { accountId: ar.id, debit: 0, credit: input.amount, description: 'AR reduction' },
            ],
          },
        },
      });
    }

    return { payment, appliedTo: applications };
  });

  // Fire-and-forget payment receipt email to all tenants on the lease
  try {
    const tenants = await prisma.tenant.findMany({
      where: { leaseId: input.leaseId, deletedAt: null },
      include: { user: true },
    });
    const paidDate = new Date(input.paidDate ?? new Date()).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(input.amount / 100);
    for (const tenant of tenants) {
      if (!tenant.user) continue;
      paymentReceivedEmail({
        to: tenant.user.email,
        tenantName: `${tenant.user.firstName} ${tenant.user.lastName}`,
        amount,
        paidDate,
        referenceNumber: input.referenceNumber,
      }).catch(() => {});
    }
  } catch {
    // Non-blocking — email failure must not fail the payment
  }

  return result;
}

/**
 * Posts late fees for all leases past their grace period with outstanding balances.
 */
export async function postLateFees(input: PostLateFeesInput) {
  const asOf = input.asOfDate ?? new Date();

  const leases = await prisma.lease.findMany({
    where: {
      status: { in: ['ACTIVE', 'MONTH_TO_MONTH'] },
      deletedAt: null,
      unit: { property: { managementCompanyId: input.managementCompanyId } },
    },
    include: {
      unit: { include: { property: true } },
      rentCharges: {
        where: {
          type: 'RENT',
          status: { in: ['OUTSTANDING', 'PARTIAL'] },
          deletedAt: null,
        },
      },
    },
  });

  const posted = [];

  for (const lease of leases) {
    for (const charge of lease.rentCharges) {
      const graceCutoff = new Date(charge.dueDate);
      graceCutoff.setDate(graceCutoff.getDate() + lease.gracePeriodDays);

      if (asOf <= graceCutoff) continue; // still within grace period

      // Check if late fee already posted for this charge cycle
      const chargePeriodStart = new Date(charge.dueDate.getFullYear(), charge.dueDate.getMonth(), 1);
      const chargePeriodEnd = new Date(charge.dueDate.getFullYear(), charge.dueDate.getMonth() + 1, 0);

      const existingLateFee = await prisma.rentCharge.findFirst({
        where: {
          leaseId: lease.id,
          type: 'LATE_FEE',
          dueDate: { gte: chargePeriodStart, lte: chargePeriodEnd },
          deletedAt: null,
        },
      });
      if (existingLateFee) continue;

      // Calculate fee amount
      let feeAmount: number;
      if (lease.lateFeeType === 'PERCENT') {
        feeAmount = Math.round((charge.amount * lease.lateFeeAmount) / 10000); // basis points
      } else {
        feeAmount = lease.lateFeeAmount;
      }
      if (feeAmount <= 0) continue;

      const feeCharge = await prisma.$transaction(async (tx) => {
        const rc = await tx.rentCharge.create({
          data: {
            leaseId: lease.id,
            type: 'LATE_FEE',
            amount: feeAmount,
            balance: feeAmount,
            dueDate: graceCutoff,
            description: `Late fee for ${charge.dueDate.toLocaleString('default', { month: 'long', year: 'numeric' })}`,
          },
        });

        // Journal: DR AR / CR Late Fee Income
        const accounts = await tx.account.findMany({
          where: { managementCompanyId: input.managementCompanyId, code: { in: ['1100', '4100'] } },
        });
        const ar = accounts.find((a) => a.code === '1100');
        const lateFeeIncome = accounts.find((a) => a.code === '4100');

        if (ar && lateFeeIncome) {
          await tx.journalEntry.create({
            data: {
              managementCompanyId: input.managementCompanyId,
              propertyId: lease.unit.property.id,
              type: 'LATE_FEE',
              description: `Late fee - ${lease.unit.unitNumber}`,
              entryDate: asOf,
              lines: {
                create: [
                  { accountId: ar.id, debit: feeAmount, credit: 0 },
                  { accountId: lateFeeIncome.id, debit: 0, credit: feeAmount },
                ],
              },
            },
          });
        }
        return rc;
      });
      posted.push(feeCharge);
    }
  }

  return posted;
}

export async function getLedger(
  managementCompanyId: string,
  options: { startDate?: string; endDate?: string; propertyId?: string; page?: number; limit?: number }
) {
  const { startDate, endDate, propertyId, page = 1, limit = 50 } = options;
  const skip = (page - 1) * limit;

  const where: Prisma.JournalEntryWhereInput = {
    managementCompanyId,
    ...(propertyId && { propertyId }),
    ...(startDate || endDate
      ? {
          entryDate: {
            ...(startDate && { gte: new Date(startDate) }),
            ...(endDate && { lte: new Date(endDate) }),
          },
        }
      : {}),
  };

  const [entries, total] = await Promise.all([
    prisma.journalEntry.findMany({
      where,
      skip,
      take: limit,
      orderBy: { entryDate: 'desc' },
      include: {
        lines: { include: { account: { select: { code: true, name: true, type: true } } } },
        property: { select: { name: true } },
      },
    }),
    prisma.journalEntry.count({ where }),
  ]);

  // Verify each entry balances (DR = CR)
  const balanced = entries.every((entry) => {
    const totalDebit = entry.lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = entry.lines.reduce((s, l) => s + l.credit, 0);
    return totalDebit === totalCredit;
  });

  return { entries, total, balanced };
}

export async function getAccountBalance(
  managementCompanyId: string,
  accountCode: string
): Promise<number> {
  const account = await prisma.account.findFirst({
    where: { managementCompanyId, code: accountCode },
    include: { journalLines: true },
  });
  if (!account) throw new Error('ACCOUNT_NOT_FOUND');

  const totalDebit = account.journalLines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = account.journalLines.reduce((s, l) => s + l.credit, 0);

  // Balance calculation depends on account type (normal balance side)
  switch (account.type) {
    case 'ASSET':
    case 'EXPENSE':
      return totalDebit - totalCredit;
    case 'LIABILITY':
    case 'EQUITY':
    case 'INCOME':
      return totalCredit - totalDebit;
  }
}

export async function getChartOfAccounts(managementCompanyId: string) {
  const accounts = await prisma.account.findMany({
    where: { managementCompanyId },
    include: {
      journalLines: {
        select: { debit: true, credit: true },
      },
    },
    orderBy: { code: 'asc' },
  });

  return accounts.map((acc) => {
    const totalDebit = acc.journalLines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = acc.journalLines.reduce((s, l) => s + l.credit, 0);
    let balance: number;
    switch (acc.type) {
      case 'ASSET':
      case 'EXPENSE':
        balance = totalDebit - totalCredit;
        break;
      default: // LIABILITY, EQUITY, INCOME
        balance = totalCredit - totalDebit;
    }
    return {
      id: acc.id,
      code: acc.code,
      name: acc.name,
      type: acc.type,
      balance,
      totalDebit,
      totalCredit,
    };
  });
}

export async function generateOwnerStatement(
  managementCompanyId: string,
  ownerId: string,
  year: number,
  month: number
) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);

  const properties = await prisma.property.findMany({
    where: { managementCompanyId, ownerId, deletedAt: null },
    include: {
      units: {
        where: { deletedAt: null },
        include: {
          leases: {
            where: { deletedAt: null },
            include: {
              rentCharges: { where: { dueDate: { gte: start, lte: end } } },
              payments: { where: { paidDate: { gte: start, lte: end }, status: 'COMPLETED' } },
            },
          },
        },
      },
      journalEntries: {
        where: { entryDate: { gte: start, lte: end } },
        include: { lines: { include: { account: true } } },
      },
    },
  });

  return properties.map((property) => {
    const income = property.journalEntries
      .flatMap((e) => e.lines)
      .filter((l) => l.account.type === 'INCOME')
      .reduce((s, l) => s + l.credit - l.debit, 0);

    const expenses = property.journalEntries
      .flatMap((e) => e.lines)
      .filter((l) => l.account.type === 'EXPENSE')
      .reduce((s, l) => s + l.debit - l.credit, 0);

    const netOwnerAmount = income - expenses;

    return {
      propertyId: property.id,
      propertyName: property.name,
      period: { year, month },
      income,
      expenses,
      netOwnerAmount,
      units: property.units.map((u) => ({
        unitNumber: u.unitNumber,
        status: u.status,
        lease: u.leases[0] ?? null,
      })),
    };
  });
}

export async function getTenantLedger(leaseId: string, managementCompanyId: string) {
  const lease = await prisma.lease.findFirst({
    where: { id: leaseId, deletedAt: null, unit: { property: { managementCompanyId } } },
  });
  if (!lease) throw new Error('NOT_FOUND');

  const [charges, payments] = await Promise.all([
    prisma.rentCharge.findMany({
      where: { leaseId, deletedAt: null },
      orderBy: { dueDate: 'asc' },
      include: { applications: true },
    }),
    prisma.payment.findMany({
      where: { leaseId, status: 'COMPLETED', deletedAt: null },
      orderBy: { paidDate: 'asc' },
      include: { applications: true },
    }),
  ]);

  const totalCharged = charges.reduce((s, c) => s + c.amount, 0);
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const balance = totalCharged - totalPaid;

  return { leaseId, charges, payments, totalCharged, totalPaid, balance };
}
