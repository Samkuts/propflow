import { Request, Response, NextFunction } from 'express';
import { forbidden } from '../lib/response';

/**
 * Ensures that every request from a MANAGER/OWNER/VENDOR is scoped to their
 * management company. Attaches managementCompanyId to req for downstream use.
 */
export function requireCompanyScope(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.managementCompanyId) {
    forbidden(res, 'No company scope found on token');
    return;
  }
  next();
}

/**
 * For list queries: injects the scoped WHERE clause so controllers never
 * forget to filter by company.
 */
export function injectCompanyFilter(req: Request, _res: Response, next: NextFunction): void {
  (req as Request & { companyId: string }).companyId = req.user?.managementCompanyId ?? '';
  next();
}
