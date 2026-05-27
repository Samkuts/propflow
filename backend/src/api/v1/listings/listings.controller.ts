import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './listings.service';
import { ok, notFound, badRequest } from '../../../lib/response';

export async function getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const listings = await svc.getPublicListings();
    ok(res, listings);
  } catch (err) { next(err); }
}

export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const listing = await svc.getPublicListingByUnit(req.params.unitId);
    if (!listing) { notFound(res); return; }
    ok(res, listing);
  } catch (err) { next(err); }
}

export async function updateListing(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = z.object({
      listingEnabled: z.boolean().optional(),
      listingDescription: z.string().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { badRequest(res, parsed.error.errors[0].message); return; }

    const result = await svc.updateUnitListing(
      req.params.unitId,
      req.params.propertyId,
      req.user!.managementCompanyId!,
      parsed.data
    );
    ok(res, result);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'NOT_FOUND') { notFound(res); return; }
    next(err);
  }
}
