import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';

export function auditLog(action: string, entityType: string, getEntityId: (req: Request) => string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      await prisma.auditLog.create({
        data: {
          userId: req.user?.sub ?? null,
          managementCompanyId: req.user?.managementCompanyId ?? null,
          action,
          entityType,
          entityId: getEntityId(req),
          after: req.body ?? null,
          ipAddress: req.ip ?? null,
          userAgent: req.headers['user-agent'] ?? null,
        },
      });
    } catch {
      // audit failure must never block the request
    }
    next();
  };
}
