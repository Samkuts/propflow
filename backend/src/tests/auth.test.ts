import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcrypt';

// ── Mock Prisma ───────────────────────────────────────────────────────────────
const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  managementCompany: { create: vi.fn() },
  account: { create: vi.fn(), createMany: vi.fn() },
  refreshToken: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

import { registerManager, login } from '../api/v1/auth/auth.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

const PASSWORD = 'S3cur3P@ssword!';

async function hashedPassword(pw = PASSWORD) {
  return bcrypt.hash(pw, 10); // low rounds for test speed
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('registerManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma)
    );

    mockPrisma.user.findUnique.mockResolvedValue(null); // email not taken
    mockPrisma.managementCompany.create.mockResolvedValue({
      id: 'company-1',
      name: 'Acme Properties',
    });
    mockPrisma.user.create.mockResolvedValue({
      id: 'user-1',
      email: 'manager@acme.com',
      role: 'MANAGER',
      managementCompanyId: 'company-1',
    });
    mockPrisma.account.create.mockResolvedValue({ id: 'acc-1' });
    mockPrisma.account.createMany.mockResolvedValue({ count: 10 });
    mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-1', token: 'tok' });
  });

  it('returns a token pair on success', async () => {
    const tokens = await registerManager({
      email: 'manager@acme.com',
      password: PASSWORD,
      firstName: 'Alice',
      lastName: 'Smith',
      companyName: 'Acme Properties',
      companyEmail: 'info@acme.com',
    });

    expect(tokens).toHaveProperty('accessToken');
    expect(tokens).toHaveProperty('refreshToken');
    expect(typeof tokens.accessToken).toBe('string');
  });

  it('throws EMAIL_TAKEN when email is already registered', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing', email: 'manager@acme.com' });

    await expect(
      registerManager({
        email: 'manager@acme.com',
        password: PASSWORD,
        firstName: 'Alice',
        lastName: 'Smith',
        companyName: 'Acme',
        companyEmail: 'info@acme.com',
      })
    ).rejects.toThrow('EMAIL_TAKEN');
  });

  it('creates a managementCompany and a MANAGER user in the same transaction', async () => {
    await registerManager({
      email: 'manager@acme.com',
      password: PASSWORD,
      firstName: 'Alice',
      lastName: 'Smith',
      companyName: 'Acme',
      companyEmail: 'info@acme.com',
    });

    expect(mockPrisma.managementCompany.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: 'MANAGER', managementCompanyId: 'company-1' }),
      })
    );
  });
});

describe('login', () => {
  let hash: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    hash = await hashedPassword();
    mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-1', token: 'tok' });
  });

  it('returns tokens for valid credentials', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'manager@acme.com',
      passwordHash: hash,
      role: 'MANAGER',
      deletedAt: null,
      managementCompanyId: 'company-1',
      managementCompany: { id: 'company-1' },
    });

    const tokens = await login({ email: 'manager@acme.com', password: PASSWORD });

    expect(tokens).toHaveProperty('accessToken');
    expect(tokens).toHaveProperty('refreshToken');
  });

  it('throws INVALID_CREDENTIALS for wrong password', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'manager@acme.com',
      passwordHash: hash,
      role: 'MANAGER',
      deletedAt: null,
      managementCompanyId: 'company-1',
      managementCompany: { id: 'company-1' },
    });

    await expect(
      login({ email: 'manager@acme.com', password: 'wrongpassword' })
    ).rejects.toThrow('INVALID_CREDENTIALS');
  });

  it('throws INVALID_CREDENTIALS for unknown email', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(
      login({ email: 'nobody@acme.com', password: PASSWORD })
    ).rejects.toThrow('INVALID_CREDENTIALS');
  });

  it('throws INVALID_CREDENTIALS for soft-deleted users', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'manager@acme.com',
      passwordHash: hash,
      role: 'MANAGER',
      deletedAt: new Date(), // soft-deleted
      managementCompanyId: 'company-1',
      managementCompany: { id: 'company-1' },
    });

    await expect(
      login({ email: 'manager@acme.com', password: PASSWORD })
    ).rejects.toThrow('INVALID_CREDENTIALS');
  });
});
