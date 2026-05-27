import bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { tenantInviteEmail } from '../../../lib/email';

export interface CreateTenantInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}

/**
 * Search existing tenants for the LeaseCreate tenant-picker.
 * Returns lightweight records suitable for autocomplete.
 */
export async function searchTenants(
  managementCompanyId: string,
  search: string,
  limit = 20
) {
  const filter = search.trim()
    ? {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' as const } },
          { lastName: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const tenants = await prisma.tenant.findMany({
    where: { managementCompanyId, deletedAt: null, user: { ...filter } },
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  return tenants.map((t) => ({
    id: t.id,
    user: t.user,
  }));
}

/**
 * Create a brand-new tenant user under a management company.
 * Generates a random temporary password, creates User + Tenant records,
 * and fires an invite email so the tenant can log in.
 */
export async function createTenant(
  managementCompanyId: string,
  input: CreateTenantInput
) {
  // Prevent duplicate email within the same company
  const existing = await prisma.user.findFirst({
    where: { email: input.email, managementCompanyId },
  });
  if (existing) throw new Error('EMAIL_TAKEN');

  // Generate a temporary password (tenant will be prompted to change on first login in a future feature)
  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        role: UserRole.TENANT,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        managementCompanyId,
      },
    });

    const tenant = await tx.tenant.create({
      data: {
        userId: user.id,
        managementCompanyId,
        // Tenant table also stores denormalized name/email for quick lookups
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    return { user, tenant };
  });

  // Fire-and-forget invite email with temp credentials
  tenantInviteEmail({
    to: input.email,
    tenantName: `${input.firstName} ${input.lastName}`,
    email: input.email,
    tempPassword,
  }).catch(() => {});

  return result.tenant;
}

/**
 * Get a single tenant record (ownership-checked).
 */
export async function getTenant(id: string, managementCompanyId: string) {
  return prisma.tenant.findFirst({
    where: { id, managementCompanyId, deletedAt: null },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      lease: {
        where: { deletedAt: null },
        include: {
          unit: {
            select: {
              unitNumber: true,
              property: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pw = '';
  for (let i = 0; i < 10; i++) {
    pw += chars[Math.floor(Math.random() * chars.length)];
  }
  return pw;
}
