import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './messages.service';
import { ok, created, badRequest, notFound } from '../../../lib/response';

const sendSchema = z.object({
  recipientId: z.string().uuid(),
  subject: z.string().max(200).optional(),
  body: z.string().min(1).max(4000),
  workOrderId: z.string().uuid().optional(),
});

export async function inbox(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const messages = await svc.getInbox(req.user!.sub, req.user!.managementCompanyId!);
    ok(res, messages);
  } catch (err) { next(err); }
}

export async function sent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const messages = await svc.getSent(req.user!.sub, req.user!.managementCompanyId!);
    ok(res, messages);
  } catch (err) { next(err); }
}

export async function unreadCount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const count = await svc.getUnreadCount(req.user!.sub, req.user!.managementCompanyId!);
    ok(res, { count });
  } catch (err) { next(err); }
}

export async function send(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = sendSchema.safeParse(req.body);
    if (!parsed.success) { badRequest(res, parsed.error.errors[0].message); return; }

    const message = await svc.sendMessage({
      ...parsed.data,
      senderId: req.user!.sub,
      managementCompanyId: req.user!.managementCompanyId!,
    });
    created(res, message);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'RECIPIENT_NOT_FOUND') {
      badRequest(res, 'Recipient not found in this company'); return;
    }
    next(err);
  }
}

export async function markRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const msg = await svc.markRead(req.params.id, req.user!.sub, req.user!.managementCompanyId!);
    ok(res, msg);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'NOT_FOUND') { notFound(res); return; }
    next(err);
  }
}

export async function markAllRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await svc.markAllRead(req.user!.sub, req.user!.managementCompanyId!);
    ok(res, { message: 'All messages marked as read' });
  } catch (err) { next(err); }
}

export async function recipients(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const users = await svc.getRecipients(req.user!.managementCompanyId!, req.user!.sub);
    ok(res, users);
  } catch (err) { next(err); }
}

const broadcastSchema = z.object({
  body: z.string().min(1).max(4000),
  subject: z.string().max(200).optional(),
  propertyId: z.string().uuid().optional(),
});

export async function broadcast(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = broadcastSchema.safeParse(req.body);
    if (!parsed.success) { badRequest(res, parsed.error.errors[0].message); return; }
    const result = await svc.broadcastMessage({
      ...parsed.data,
      senderId: req.user!.sub,
      managementCompanyId: req.user!.managementCompanyId!,
    });
    ok(res, result);
  } catch (err) { next(err); }
}
