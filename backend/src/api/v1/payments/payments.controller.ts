import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './payments.service';
import { ok, badRequest, notFound } from '../../../lib/response';
import { getStripe, stripeConfigured } from '../../../lib/stripe';
import { recordPayment } from '../accounting/accounting.service';

// ─── Setup Intent ─────────────────────────────────────────────────────────────

export async function setupIntent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!stripeConfigured()) { badRequest(res, 'Stripe is not configured on this server'); return; }
    const result = await svc.createSetupIntent(req.user!.sub, req.user!.managementCompanyId!);
    ok(res, result);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'TENANT_NOT_FOUND') { notFound(res); return; }
    next(err);
  }
}

// ─── Get Saved Payment Method ─────────────────────────────────────────────────

export async function getPaymentMethod(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!stripeConfigured()) { ok(res, null); return; }
    const pm = await svc.getSavedPaymentMethod(req.user!.sub, req.user!.managementCompanyId!);
    ok(res, pm);
  } catch (err) {
    next(err);
  }
}

// ─── Create Payment Intent ────────────────────────────────────────────────────

const paySchema = z.object({
  leaseId: z.string().uuid(),
  amountCents: z.number().int().positive(),
});

export async function createPayIntent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!stripeConfigured()) { badRequest(res, 'Stripe is not configured on this server'); return; }
    const parsed = paySchema.safeParse(req.body);
    if (!parsed.success) { badRequest(res, parsed.error.errors[0].message); return; }

    const result = await svc.createPayIntent(
      req.user!.sub,
      req.user!.managementCompanyId!,
      parsed.data.amountCents,
      parsed.data.leaseId,
    );
    ok(res, result);
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'NO_PAYMENT_METHOD') { badRequest(res, 'No saved payment method. Please add a card first.'); return; }
      if (err.message === 'INVALID_AMOUNT') { badRequest(res, 'Amount must be greater than zero'); return; }
    }
    next(err);
  }
}

// ─── Confirm & Record ─────────────────────────────────────────────────────────

const confirmSchema = z.object({
  paymentIntentId: z.string().min(1),
  leaseId: z.string().uuid(),
});

export async function confirmPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!stripeConfigured()) { badRequest(res, 'Stripe is not configured'); return; }
    const parsed = confirmSchema.safeParse(req.body);
    if (!parsed.success) { badRequest(res, parsed.error.errors[0].message); return; }

    const result = await svc.confirmAndRecord(
      req.user!.sub,
      req.user!.managementCompanyId!,
      parsed.data.paymentIntentId,
      parsed.data.leaseId,
    );
    ok(res, result);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith('PAYMENT_NOT_SUCCEEDED')) {
      badRequest(res, 'Payment has not succeeded yet. Please complete the payment first.');
      return;
    }
    next(err);
  }
}

// ─── Autopay ─────────────────────────────────────────────────────────────────

const autopaySchema = z.object({ enabled: z.boolean() });

export async function toggleAutopay(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = autopaySchema.safeParse(req.body);
    if (!parsed.success) { badRequest(res, parsed.error.errors[0].message); return; }

    const result = await svc.toggleAutopay(
      req.user!.sub,
      req.user!.managementCompanyId!,
      parsed.data.enabled,
    );
    ok(res, result);
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'TENANT_NOT_FOUND') { notFound(res); return; }
      if (err.message === 'NO_PAYMENT_METHOD') {
        badRequest(res, 'Please save a payment card before enabling autopay.');
        return;
      }
    }
    next(err);
  }
}

export async function getAutopayStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.getAutopayStatus(req.user!.sub, req.user!.managementCompanyId!);
    ok(res, result);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'TENANT_NOT_FOUND') { notFound(res); return; }
    next(err);
  }
}

// ─── Stripe Webhook ───────────────────────────────────────────────────────────

export async function stripeWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) { res.sendStatus(400); return; }

    const sig = req.headers['stripe-signature'] as string;
    let event;
    try {
      event = getStripe().webhooks.constructEvent(req.body as Buffer, sig, secret);
    } catch {
      res.status(400).send('Webhook signature verification failed');
      return;
    }

    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object as { id: string; amount: number; metadata: Record<string, string> };
      const { leaseId, managementCompanyId } = intent.metadata;

      if (leaseId && managementCompanyId) {
        // Idempotency check
        const existing = await (await import('../../../lib/prisma')).prisma.payment.findFirst({
          where: { referenceNumber: intent.id, leaseId },
        });
        if (!existing) {
          await recordPayment(managementCompanyId, {
            leaseId,
            amount: intent.amount,
            method: 'CREDIT_CARD',
            referenceNumber: intent.id,
            memo: 'Online payment via Stripe (webhook)',
          });
        }
      }
    }

    res.json({ received: true });
  } catch (err) {
    next(err);
  }
}
