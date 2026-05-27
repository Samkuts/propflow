import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Prisma before importing the service ──────────────────────────────────
// vi.mock is hoisted, so we must define the mock object via vi.hoisted()
const mockPrisma = vi.hoisted(() => ({
  lease: { findFirst: vi.fn(), findMany: vi.fn() },
  tenant: { findMany: vi.fn() },
  payment: { create: vi.fn() },
  rentCharge: { findMany: vi.fn(), update: vi.fn() },
  paymentApplication: { create: vi.fn() },
  account: { findMany: vi.fn() },
  journalEntry: { create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

// Mock email so it doesn't throw (no SendGrid key in tests)
vi.mock('../lib/email', () => ({
  paymentReceivedEmail: vi.fn().mockResolvedValue(undefined),
}));

import { recordPayment } from '../api/v1/accounting/accounting.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

const COMPANY_ID = 'company-1';
const LEASE_ID = 'lease-1';

function makeCharge(id: string, balance: number, dueDateOffset: number) {
  const d = new Date('2025-01-01');
  d.setMonth(d.getMonth() + dueDateOffset);
  return {
    id,
    balance,
    status: balance > 0 ? 'OUTSTANDING' : 'PAID',
    dueDate: d,
    leaseId: LEASE_ID,
    deletedAt: null,
  };
}

function makeLease() {
  return {
    id: LEASE_ID,
    unit: {
      unitNumber: '101',
      property: { id: 'prop-1', managementCompanyId: COMPANY_ID },
    },
  };
}

function makeAccounts() {
  return [
    { id: 'acc-trust', code: '1010', name: 'Trust - Rent' },
    { id: 'acc-ar', code: '1100', name: 'Accounts Receivable' },
  ];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('recordPayment — FIFO application', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // $transaction runs the callback synchronously with the mock as tx
    mockPrisma.$transaction.mockImplementation((fn: (tx: typeof mockPrisma) => unknown) =>
      fn(mockPrisma)
    );

    mockPrisma.lease.findFirst.mockResolvedValue(makeLease());
    mockPrisma.tenant.findMany.mockResolvedValue([]); // no email side effects
    mockPrisma.account.findMany.mockResolvedValue(makeAccounts());
    mockPrisma.payment.create.mockResolvedValue({
      id: 'pmt-1',
      amount: 120000,
      referenceNumber: null,
    });
    mockPrisma.paymentApplication.create.mockImplementation(
      ({ data }: { data: object }) => Promise.resolve({ id: 'app-new', ...data })
    );
    mockPrisma.rentCharge.update.mockImplementation(
      ({ where, data }: { where: { id: string }; data: object }) =>
        Promise.resolve({ id: where.id, ...data })
    );
    mockPrisma.journalEntry.create.mockResolvedValue({ id: 'je-1' });
  });

  it('fully pays a single outstanding charge', async () => {
    mockPrisma.rentCharge.findMany.mockResolvedValue([makeCharge('c1', 120000, 0)]);

    const result = await recordPayment(COMPANY_ID, {
      leaseId: LEASE_ID,
      amount: 120000,
      method: 'ACH',
    });

    expect(result.appliedTo).toHaveLength(1);
    expect(mockPrisma.rentCharge.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ balance: 0, status: 'PAID' }) })
    );
    expect(mockPrisma.paymentApplication.create).toHaveBeenCalledTimes(1);
  });

  it('applies FIFO across two charges — oldest first', async () => {
    // Charge 1: January (oldest), balance 80000; Charge 2: February, balance 120000
    mockPrisma.rentCharge.findMany.mockResolvedValue([
      makeCharge('c1', 80000, 0),
      makeCharge('c2', 120000, 1),
    ]);

    // Pay $1,200 — enough to fully cover c1 and partially cover c2
    await recordPayment(COMPANY_ID, {
      leaseId: LEASE_ID,
      amount: 120000,
      method: 'CHECK',
    });

    const updateCalls = mockPrisma.rentCharge.update.mock.calls;
    // First update: c1 fully paid
    expect(updateCalls[0][0]).toMatchObject({
      where: { id: 'c1' },
      data: { balance: 0, status: 'PAID' },
    });
    // Second update: c2 partial — remaining 40000 applied
    expect(updateCalls[1][0]).toMatchObject({
      where: { id: 'c2' },
      data: { balance: 80000, status: 'PARTIAL' },
    });
    expect(mockPrisma.paymentApplication.create).toHaveBeenCalledTimes(2);
  });

  it('handles overpayment — stops applying after zero remaining', async () => {
    // Single charge of $500; payment is $1200 (overpayment)
    mockPrisma.rentCharge.findMany.mockResolvedValue([makeCharge('c1', 50000, 0)]);

    await recordPayment(COMPANY_ID, {
      leaseId: LEASE_ID,
      amount: 120000,
      method: 'CREDIT_CARD',
    });

    // Only one charge updated; only $500 applied
    expect(mockPrisma.rentCharge.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.rentCharge.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ balance: 0, status: 'PAID' }) })
    );
  });

  it('posts a balanced journal entry (trust DR, AR CR)', async () => {
    mockPrisma.rentCharge.findMany.mockResolvedValue([makeCharge('c1', 120000, 0)]);

    await recordPayment(COMPANY_ID, {
      leaseId: LEASE_ID,
      amount: 120000,
      method: 'ACH',
    });

    expect(mockPrisma.journalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'PAYMENT_RECEIVED',
          managementCompanyId: COMPANY_ID,
          lines: expect.objectContaining({
            create: expect.arrayContaining([
              expect.objectContaining({ accountId: 'acc-trust', debit: 120000, credit: 0 }),
              expect.objectContaining({ accountId: 'acc-ar', debit: 0, credit: 120000 }),
            ]),
          }),
        }),
      })
    );
  });

  it('throws LEASE_NOT_FOUND when lease does not belong to company', async () => {
    mockPrisma.lease.findFirst.mockResolvedValue(null);

    await expect(
      recordPayment(COMPANY_ID, { leaseId: LEASE_ID, amount: 100, method: 'CASH' })
    ).rejects.toThrow('LEASE_NOT_FOUND');
  });
});
