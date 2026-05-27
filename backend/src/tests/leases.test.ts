import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Prisma ───────────────────────────────────────────────────────────────
const mockPrisma = vi.hoisted(() => ({
  lease: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  unit: { findFirst: vi.fn(), update: vi.fn() },
  tenant: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn(), create: vi.fn() },
  account: { findMany: vi.fn() },
  journalEntry: { create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

// Mock email side-effects
vi.mock('../lib/email', () => ({
  leaseActivatedEmail: vi.fn().mockResolvedValue(undefined),
}));

import { createLease, activateLease } from '../api/v1/leases/leases.service';

// ── Shared fixtures ───────────────────────────────────────────────────────────

const COMPANY_ID = 'company-1';
const UNIT_ID = 'unit-1';
const LEASE_ID = 'lease-1';

function makeUnit(status = 'VACANT') {
  return {
    id: UNIT_ID,
    unitNumber: '101',
    status,
    rentAmount: 120000,
    managementCompanyId: COMPANY_ID,
    property: { id: 'prop-1', managementCompanyId: COMPANY_ID, name: 'Sunrise Apts' },
    deletedAt: null,
  };
}

function makeLease(status = 'PENDING') {
  return {
    id: LEASE_ID,
    unitId: UNIT_ID,
    status,
    rentAmount: 120000,
    depositAmount: 120000,
    deletedAt: null,
    unit: {
      unitNumber: '101',
      property: { id: 'prop-1', managementCompanyId: COMPANY_ID, name: 'Sunrise Apts' },
    },
  };
}

// ── createLease ───────────────────────────────────────────────────────────────

describe('createLease', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma)
    );
    mockPrisma.unit.findFirst.mockResolvedValue(makeUnit());
    mockPrisma.lease.create.mockResolvedValue(makeLease());
  });

  it('creates a PENDING lease for a vacant unit', async () => {
    const result = await createLease(COMPANY_ID, {
      unitId: UNIT_ID,
      startDate: '2025-02-01',
      rentAmount: 120000,
      depositAmount: 120000,
    });

    expect(result.status).toBe('PENDING');
    expect(mockPrisma.lease.create).toHaveBeenCalledTimes(1);
  });

  it('throws UNIT_NOT_FOUND when unit does not exist', async () => {
    mockPrisma.unit.findFirst.mockResolvedValue(null);

    await expect(
      createLease(COMPANY_ID, {
        unitId: 'bad-unit',
        startDate: '2025-02-01',
        rentAmount: 120000,
        depositAmount: 120000,
      })
    ).rejects.toThrow('UNIT_NOT_FOUND');
  });
});

// ── activateLease ─────────────────────────────────────────────────────────────

describe('activateLease', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma)
    );
    mockPrisma.lease.findFirst.mockResolvedValue(makeLease('PENDING'));
    mockPrisma.lease.update.mockResolvedValue(makeLease('ACTIVE'));
    mockPrisma.unit.update.mockResolvedValue({ ...makeUnit('OCCUPIED'), vacantSince: null });
    mockPrisma.account.findMany.mockResolvedValue([
      { id: 'acc-trust', code: '1020' },
      { id: 'acc-dep', code: '2100' },
    ]);
    mockPrisma.journalEntry.create.mockResolvedValue({ id: 'je-1' });
    // activateLease calls findUnique for the final return (include startDate for email formatting)
    mockPrisma.lease.findUnique.mockResolvedValue({
      ...makeLease('ACTIVE'),
      startDate: new Date('2025-02-01'),
      rentAmount: 120000,
      tenants: [],
      unit: makeUnit('OCCUPIED'),
    });
  });

  it('marks lease ACTIVE and unit OCCUPIED', async () => {
    await activateLease(LEASE_ID, COMPANY_ID);

    expect(mockPrisma.lease.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ACTIVE' }) })
    );
    expect(mockPrisma.unit.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'OCCUPIED' }) })
    );
  });

  it('posts a security deposit journal entry', async () => {
    await activateLease(LEASE_ID, COMPANY_ID);

    expect(mockPrisma.journalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'SECURITY_DEPOSIT' }),
      })
    );
  });

  it('throws NOT_FOUND when lease does not exist', async () => {
    mockPrisma.lease.findFirst.mockResolvedValue(null);

    await expect(activateLease('bad-id', COMPANY_ID)).rejects.toThrow('NOT_FOUND');
  });

  it('throws NOT_PENDING when lease is already ACTIVE', async () => {
    mockPrisma.lease.findFirst.mockResolvedValue(makeLease('ACTIVE'));

    await expect(activateLease(LEASE_ID, COMPANY_ID)).rejects.toThrow('NOT_PENDING');
  });
});
