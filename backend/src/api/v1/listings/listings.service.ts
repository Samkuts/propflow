import { prisma } from '../../../lib/prisma';

/** Public: all vacant + listing-enabled units across all companies. */
export async function getPublicListings() {
  return prisma.unit.findMany({
    where: {
      deletedAt: null,
      status: 'VACANT',
      listingEnabled: true,
    },
    include: {
      property: {
        select: {
          id: true,
          name: true,
          address: true,
          city: true,
          state: true,
          zip: true,
          photoUrl: true,
          description: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/** Public: single unit listing detail. */
export async function getPublicListingByUnit(unitId: string) {
  const unit = await prisma.unit.findFirst({
    where: { id: unitId, deletedAt: null, listingEnabled: true, status: 'VACANT' },
    include: {
      property: {
        select: {
          id: true,
          name: true,
          address: true,
          city: true,
          state: true,
          zip: true,
          photoUrl: true,
          description: true,
          managementCompanyId: true,
        },
      },
    },
  });
  if (!unit) return null;
  return unit;
}

/** Manager: toggle listing on/off for a unit. */
export async function updateUnitListing(
  unitId: string,
  propertyId: string,
  managementCompanyId: string,
  data: { listingEnabled?: boolean; listingDescription?: string }
) {
  const unit = await prisma.unit.findFirst({
    where: { id: unitId, propertyId, property: { managementCompanyId }, deletedAt: null },
  });
  if (!unit) throw new Error('NOT_FOUND');

  return prisma.unit.update({
    where: { id: unitId },
    data: {
      ...(data.listingEnabled !== undefined && { listingEnabled: data.listingEnabled }),
      ...(data.listingDescription !== undefined && { listingDescription: data.listingDescription }),
    },
  });
}
