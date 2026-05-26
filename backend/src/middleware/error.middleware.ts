import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { logger } from '../lib/logger';
import { serverError, badRequest, conflict, notFound } from '../lib/response';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error({ err, path: req.path, method: req.method });

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        conflict(res, 'A record with that value already exists');
        return;
      case 'P2025':
        notFound(res, 'Record not found');
        return;
      case 'P2003':
        badRequest(res, 'Invalid reference — related record does not exist');
        return;
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    badRequest(res, 'Invalid data provided');
    return;
  }

  serverError(res);
}

export function notFoundHandler(req: Request, res: Response): void {
  notFound(res, `Route ${req.method} ${req.path} not found`);
}
