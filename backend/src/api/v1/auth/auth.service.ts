import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { UserRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  getRefreshExpiryDate,
} from '../../../lib/jwt';

const BCRYPT_ROUNDS = 12;

export interface RegisterManagerInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  companyName: string;
  companyEmail: string;
  companyPhone?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export async function registerManager(input: RegisterManagerInput): Promise<TokenPair> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new Error('EMAIL_TAKEN');

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const result = await prisma.$transaction(async (tx) => {
    // Create management company
    const company = await tx.managementCompany.create({
      data: {
        name: input.companyName,
        email: input.companyEmail,
        phone: input.companyPhone,
      },
    });

    // Create the manager user
    const user = await tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        role: UserRole.MANAGER,
        firstName: input.firstName,
        lastName: input.lastName,
        managementCompanyId: company.id,
      },
    });

    // Seed the chart of accounts for this company
    await seedChartOfAccounts(tx, company.id);

    return { company, user };
  });

  return issueTokens(result.user.id, result.user.role, result.company.id, result.user.email);
}

export async function login(input: LoginInput): Promise<TokenPair> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: { managementCompany: true },
  });

  if (!user || user.deletedAt) throw new Error('INVALID_CREDENTIALS');

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) throw new Error('INVALID_CREDENTIALS');

  return issueTokens(user.id, user.role, user.managementCompanyId, user.email);
}

export async function refresh(token: string): Promise<TokenPair> {
  let payload: { sub: string; tokenId: string };
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw new Error('INVALID_TOKEN');
  }

  const stored = await prisma.refreshToken.findUnique({ where: { token } });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new Error('INVALID_TOKEN');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.deletedAt) throw new Error('INVALID_TOKEN');

  // Rotate: revoke old, issue new
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

  return issueTokens(user.id, user.role, user.managementCompanyId, user.email);
}

export async function logout(token: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { token },
    data: { revokedAt: new Date() },
  });
}

async function issueTokens(
  userId: string,
  role: UserRole,
  managementCompanyId: string | null,
  email: string
): Promise<TokenPair> {
  const tokenId = uuidv4();

  const accessToken = signAccessToken({ sub: userId, role, managementCompanyId, email });
  const refreshToken = signRefreshToken({ sub: userId, tokenId });

  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId,
      expiresAt: getRefreshExpiryDate(),
    },
  });

  return { accessToken, refreshToken };
}

// Seeds the mandatory chart of accounts for a new management company
async function seedChartOfAccounts(
  tx: Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
  managementCompanyId: string
): Promise<void> {
  const accounts = [
    { code: '1000', name: 'Operating Account', type: 'ASSET' as const, isTrustAccount: false, isSystemAccount: true },
    { code: '1010', name: 'Trust Account - Rent', type: 'ASSET' as const, isTrustAccount: true, isSystemAccount: true },
    { code: '1020', name: 'Trust Account - Security Deposits', type: 'ASSET' as const, isTrustAccount: true, isSystemAccount: true },
    { code: '1100', name: 'Accounts Receivable', type: 'ASSET' as const, isTrustAccount: false, isSystemAccount: true },
    { code: '2000', name: 'Accounts Payable', type: 'LIABILITY' as const, isTrustAccount: false, isSystemAccount: true },
    { code: '2100', name: 'Security Deposit Liability', type: 'LIABILITY' as const, isTrustAccount: false, isSystemAccount: true },
    { code: '2200', name: 'Owner Funds Payable', type: 'LIABILITY' as const, isTrustAccount: false, isSystemAccount: true },
    { code: '3000', name: 'Owner Equity', type: 'EQUITY' as const, isTrustAccount: false, isSystemAccount: true },
    { code: '4000', name: 'Rent Income', type: 'INCOME' as const, isTrustAccount: false, isSystemAccount: true },
    { code: '4100', name: 'Late Fee Income', type: 'INCOME' as const, isTrustAccount: false, isSystemAccount: true },
    { code: '4200', name: 'Pet Fee Income', type: 'INCOME' as const, isTrustAccount: false, isSystemAccount: true },
    { code: '4300', name: 'Other Income', type: 'INCOME' as const, isTrustAccount: false, isSystemAccount: true },
    { code: '5000', name: 'Maintenance Expense', type: 'EXPENSE' as const, isTrustAccount: false, isSystemAccount: true },
    { code: '5100', name: 'Management Fee Expense', type: 'EXPENSE' as const, isTrustAccount: false, isSystemAccount: true },
    { code: '5200', name: 'Utilities Expense', type: 'EXPENSE' as const, isTrustAccount: false, isSystemAccount: true },
    { code: '5300', name: 'Insurance Expense', type: 'EXPENSE' as const, isTrustAccount: false, isSystemAccount: true },
    { code: '5400', name: 'Other Expense', type: 'EXPENSE' as const, isTrustAccount: false, isSystemAccount: true },
  ];

  await tx.account.createMany({
    data: accounts.map((a) => ({ ...a, managementCompanyId })),
    skipDuplicates: true,
  });
}
