import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Prisma ───────────────────────────────────────────────────────────────
const mockPrisma = vi.hoisted(() => ({
  user: { findFirst: vi.fn(), create: vi.fn() },
  tenant: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

// Mock email — no credentials in tests
vi.mock('../lib/email', () => ({
  tenantInviteEmail: vi.fn().mockResolvedValue(undefined),
}));

import { createTenant, searchTenants } from '../api/v1/tenants/tenants.service';
import { tenantInviteEmail } from '../lib/email';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const COMPANY_ID = 'company-1';

function makeUser(overrides = {}) {
  return {
    id: 'user-1',
    email: 'jane@example.com',
    role: 'TENANT',
    firstName: 'Jane',
    lastName: 'Doe',
    managementCompanyId: COMPANY_ID,
    ...overrides,
  };
}

function makeTenant(overrides = {}) {
  return {
    id: 'tenant-1',
    managementCompanyId: COMPANY_ID,
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    user: { id: 'user-1', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' },
    ...overrides,
  };
}

// ── createTenant ──────────────────────────────────────────────────────────────

describe('createTenant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma)
    );
    mockPrisma.user.findFirst.mockResolvedValue(null);  // email not taken
    mockPrisma.user.create.mockResolvedValue(makeUser());
    mockPrisma.tenant.create.mockResolvedValue(makeTenant());
  });

  it('creates user and tenant records', async () => {
    const result = await createTenant(COMPANY_ID, {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
    });

    expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: 'TENANT', email: 'jane@example.com' }),
      })
    );
    expect(mockPrisma.tenant.create).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ id: 'tenant-1', email: 'jane@example.com' });
  });

  it('sends an invite email after creation', async () => {
    await createTenant(COMPANY_ID, {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
    });

    // Allow async fire-and-forget
    await new Promise((r) => setTimeout(r, 10));
    expect(tenantInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'jane@example.com', tenantName: 'Jane Doe' })
    );
  });

  it('throws EMAIL_TAKEN when email already exists', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(makeUser());

    await expect(
      createTenant(COMPANY_ID, { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' })
    ).rejects.toThrow('EMAIL_TAKEN');

    expect(mockPrisma.tenant.create).not.toHaveBeenCalled();
  });

  it('does not send email if tenant creation fails', async () => {
    mockPrisma.tenant.create.mockRejectedValue(new Error('DB error'));

    await expect(
      createTenant(COMPANY_ID, { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' })
    ).rejects.toThrow('DB error');

    await new Promise((r) => setTimeout(r, 10));
    expect(tenantInviteEmail).not.toHaveBeenCalled();
  });
});

// ── searchTenants ─────────────────────────────────────────────────────────────

describe('searchTenants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns matching tenants', async () => {
    mockPrisma.tenant.findMany.mockResolvedValue([makeTenant()]);

    const results = await searchTenants(COMPANY_ID, 'jane');

    expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ managementCompanyId: COMPANY_ID }),
      })
    );
    expect(results).toHaveLength(1);
    expect(results[0].user?.email).toBe('jane@example.com');
  });

  it('returns all tenants when search is empty', async () => {
    mockPrisma.tenant.findMany.mockResolvedValue([makeTenant()]);

    await searchTenants(COMPANY_ID, '');

    const callArg = mockPrisma.tenant.findMany.mock.calls[0][0];
    // When search is empty, user filter should be an empty object (no OR clause)
    expect(callArg.where.user).toEqual({});
  });
});
