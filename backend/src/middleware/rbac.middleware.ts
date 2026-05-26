import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { forbidden } from '../lib/response';

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      forbidden(res, 'Not authenticated');
      return;
    }
    if (!roles.includes(req.user.role)) {
      forbidden(res, 'Insufficient permissions');
      return;
    }
    next();
  };
}

export const requireManager = requireRole(UserRole.MANAGER);
export const requireOwner   = requireRole(UserRole.OWNER);
export const requireTenant  = requireRole(UserRole.TENANT);
export const requireVendor  = requireRole(UserRole.VENDOR);
export const requireManagerOrOwner = requireRole(UserRole.MANAGER, UserRole.OWNER);
