import { Response } from 'express';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string | null;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export function ok<T>(res: Response, data: T, meta?: ApiResponse['meta'], status = 200): Response {
  return res.status(status).json({ success: true, data, error: null, meta });
}

export function created<T>(res: Response, data: T): Response {
  return res.status(201).json({ success: true, data, error: null });
}

export function noContent(res: Response): Response {
  return res.status(204).send();
}

export function badRequest(res: Response, error: string): Response {
  return res.status(400).json({ success: false, data: null, error });
}

export function unauthorized(res: Response, error = 'Unauthorized'): Response {
  return res.status(401).json({ success: false, data: null, error });
}

export function forbidden(res: Response, error = 'Forbidden'): Response {
  return res.status(403).json({ success: false, data: null, error });
}

export function notFound(res: Response, error = 'Not found'): Response {
  return res.status(404).json({ success: false, data: null, error });
}

export function conflict(res: Response, error: string): Response {
  return res.status(409).json({ success: false, data: null, error });
}

export function serverError(res: Response, error = 'Internal server error'): Response {
  return res.status(500).json({ success: false, data: null, error });
}

export function paginate<T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  limit: number
): Response {
  return ok(res, data, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
}
