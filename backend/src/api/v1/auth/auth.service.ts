import crypto from 'crypto';
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
import { sendEmail } from '../../../lib/email';

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

export async function forgotPassword(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  // Silently succeed even if user not found — prevents email enumeration
  if (!user || user.deletedAt) return;

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordResetToken: token, passwordResetExpiresAt: expiresAt },
  });

  const baseUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;

  sendEmail({
    to: email,
    subject: 'Reset your PropFlow password',
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937">
        <div style="background:#4f46e5;border-radius:12px;padding:16px 24px;margin-bottom:24px">
          <span style="color:#fff;font-weight:700;font-size:18px">PropFlow</span>
        </div>
        <h2 style="font-size:20px;font-weight:700;margin-bottom:8px">Reset your password</h2>
        <p style="color:#4b5563;margin-bottom:24px">
          We received a request to reset the password for your account. Click the button below to choose a new password. This link expires in 1 hour.
        </p>
        <p style="margin-bottom:24px">
          <a href="${resetUrl}" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none">
            Reset Password →
          </a>
        </p>
        <p style="color:#6b7280;font-size:13px">
          If you didn't request this, you can safely ignore this email. Your password won't change.
        </p>
      </div>`,
  }).catch(() => {});
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: token,
      passwordResetExpiresAt: { gt: new Date() },
      deletedAt: null,
    },
  });
  if (!user) throw new Error('INVALID_TOKEN');

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, passwordResetToken: null, passwordResetExpiresAt: null },
  });
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) throw new Error('NOT_FOUND');

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new Error('INVALID_CREDENTIALS');

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
}

export async function updateProfile(
  userId: string,
  data: { firstName?: string; lastName?: string; phone?: string }
): Promise<{ id: string; firstName: string; lastName: string; email: string; phone: string | null; role: string }> {
  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true },
  });
  return user;
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
