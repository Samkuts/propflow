import { ApplicationStatus } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { applicationDecisionEmail } from '../../../lib/email';
import { applicationDecisionSms } from '../../../lib/sms';
import { checkrConfigured, createCandidate, createInvitation } from '../../../lib/checkr';

export interface SubmitApplicationInput {
  unitId: string;
  managementCompanyId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  employer?: string;
  monthlyIncome?: number; // cents
  message?: string;
  ssn?: string;       // will be encrypted by caller if needed
  dateOfBirth?: string; // will be encrypted
}

/** Public unit lookup — only returns safe, non-sensitive info */
export async function getPublicUnitInfo(unitId: string) {
  return prisma.unit.findFirst({
    where: { id: unitId, deletedAt: null },
    select: {
      id: true,
      unitNumber: true,
      beds: true,
      baths: true,
      sqft: true,
      rentAmount: true,
      status: true,
      property: {
        select: {
          id: true,
          name: true,
          address: true,
          city: true,
          state: true,
          zip: true,
          managementCompanyId: true,
        },
      },
    },
  });
}

export async function submitApplication(input: SubmitApplicationInput) {
  // Verify unit belongs to company and is visible
  const unit = await prisma.unit.findFirst({
    where: { id: input.unitId, property: { managementCompanyId: input.managementCompanyId }, deletedAt: null },
    include: { property: { select: { name: true } } },
  });
  if (!unit) throw new Error('UNIT_NOT_FOUND');

  return prisma.rentalApplication.create({
    data: {
      managementCompanyId: input.managementCompanyId,
      unitId: input.unitId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      employer: input.employer,
      monthlyIncome: input.monthlyIncome,
      message: input.message,
      status: 'RECEIVED',
    },
  });
}

export async function listApplications(
  managementCompanyId: string,
  filters: { status?: ApplicationStatus; unitId?: string; page?: number; limit?: number } = {}
) {
  const { page = 1, limit = 50, status, unitId } = filters;
  const skip = (page - 1) * limit;

  const where = {
    managementCompanyId,
    deletedAt: null,
    ...(status && { status }),
    ...(unitId && { unitId }),
  };

  const [applications, total] = await Promise.all([
    prisma.rentalApplication.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      // Manual join via unitId below — RentalApplication has no Prisma relation to Unit
    }),
    prisma.rentalApplication.count({ where }),
  ]);

  // Hydrate unit + property names
  const unitIds = [...new Set(applications.map((a) => a.unitId))];
  const units = await prisma.unit.findMany({
    where: { id: { in: unitIds } },
    select: { id: true, unitNumber: true, property: { select: { id: true, name: true } } },
  });
  const unitMap = Object.fromEntries(units.map((u) => [u.id, u]));

  return {
    data: applications.map((a) => ({ ...a, unit: unitMap[a.unitId] ?? null })),
    total,
    page,
    limit,
  };
}

export async function getApplication(id: string, managementCompanyId: string) {
  const app = await prisma.rentalApplication.findFirst({
    where: { id, managementCompanyId, deletedAt: null },
  });
  if (!app) return null;

  const unit = await prisma.unit.findFirst({
    where: { id: app.unitId },
    select: { id: true, unitNumber: true, property: { select: { id: true, name: true } } },
  });

  return { ...app, unit };
}

export async function updateApplication(
  id: string,
  managementCompanyId: string,
  data: { status?: ApplicationStatus; notes?: string }
) {
  const app = await prisma.rentalApplication.findFirst({
    where: { id, managementCompanyId, deletedAt: null },
  });
  if (!app) throw new Error('NOT_FOUND');

  const updated = await prisma.rentalApplication.update({
    where: { id },
    data: {
      ...(data.status && { status: data.status }),
      ...(data.notes !== undefined && { notes: data.notes }),
    },
  });

  // Send decision email for terminal statuses
  if (data.status === 'APPROVED' || data.status === 'DENIED') {
    const unit = await prisma.unit.findFirst({
      where: { id: app.unitId },
      select: { unitNumber: true, property: { select: { name: true } } },
    });
    if (unit) {
      applicationDecisionEmail({
        to: app.email,
        applicantName: `${app.firstName} ${app.lastName}`,
        status: data.status,
        propertyName: unit.property.name,
        unitNumber: unit.unitNumber,
      }).catch(() => {});
      // SMS — use applicant's phone directly (no user lookup needed)
      if (app.phone) {
        applicationDecisionSms({
          to: app.phone,
          applicantName: `${app.firstName} ${app.lastName}`,
          status: data.status,
          unitNumber: unit.unitNumber,
        }).catch(() => {});
      }
    }
  }

  return updated;
}

// ─── Background Check (Checkr) ────────────────────────────────────────────────

/**
 * Submits a rental application for background screening via Checkr.
 * Creates a Candidate + Invitation, stores the candidateId as screeningReportId,
 * and advances the application status to SCREENING.
 * Returns the invitationUrl so the manager can send it to the applicant.
 */
export async function submitForScreening(id: string, managementCompanyId: string) {
  if (!checkrConfigured()) throw new Error('CHECKR_NOT_CONFIGURED');

  const app = await prisma.rentalApplication.findFirst({
    where: { id, managementCompanyId, deletedAt: null },
  });
  if (!app) throw new Error('NOT_FOUND');
  if (app.screeningReportId) throw new Error('ALREADY_SCREENED');

  // Create Checkr candidate
  const candidate = await createCandidate({
    firstName: app.firstName,
    lastName: app.lastName,
    email: app.email,
    phone: app.phone,
  });

  // Send invitation for the candidate to complete their screening
  const invitation = await createInvitation({ candidateId: candidate.id });

  // Save candidate ID + advance status
  await prisma.rentalApplication.update({
    where: { id },
    data: {
      screeningReportId: candidate.id,
      status: 'SCREENING' as ApplicationStatus,
    },
  });

  return { invitationUrl: invitation.invitation_url, candidateId: candidate.id };
}
