/**
 * Checkr Webhook Handler
 * ─────────────────────────────────────────────────────────────────────────────
 * Registered at POST /webhooks/checkr (before express.json(), same as Stripe).
 * Verifies HMAC-SHA256 signature, then processes report completion events.
 */

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../../lib/prisma';
import { verifyCheckrSignature } from '../../../lib/checkr';
import { logger } from '../../../lib/logger';

export async function checkrWebhook(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const signature = req.headers['x-checkr-signature'] as string | undefined;
    if (!signature) {
      res.status(400).json({ error: 'Missing X-Checkr-Signature header' });
      return;
    }

    const rawBody = req.body as Buffer;
    if (!verifyCheckrSignature(rawBody, signature)) {
      res.status(401).json({ error: 'Webhook signature verification failed' });
      return;
    }

    // Parse body now that signature is verified
    const event = JSON.parse(rawBody.toString('utf8'));
    const { type, data } = event as { type: string; data?: { object?: Record<string, unknown> } };

    logger.info(`[CheckrWebhook] Received event: ${type}`);

    if (type === 'report.completed' && data?.object) {
      const report = data.object as {
        candidate_id?: string;
        result?: string;
        status?: string;
      };

      if (report.candidate_id) {
        // Find the application whose screeningReportId matches this candidate
        const app = await prisma.rentalApplication.findFirst({
          where: { screeningReportId: report.candidate_id, deletedAt: null },
        });

        if (app) {
          // Store the report result in notes; manager still makes the final approve/deny decision
          const resultNote = `[Background Check] Report completed. Result: ${report.result ?? 'pending'} (Status: ${report.status ?? 'unknown'}).`;
          const existingNotes = app.notes ? `${app.notes}\n\n` : '';

          await prisma.rentalApplication.update({
            where: { id: app.id },
            data: { notes: `${existingNotes}${resultNote}` },
          });

          logger.info(
            `[CheckrWebhook] Updated application ${app.id} with report result: ${report.result}`,
          );
        } else {
          logger.warn(
            `[CheckrWebhook] No application found for candidate_id: ${report.candidate_id}`,
          );
        }
      }
    }

    res.json({ received: true });
  } catch (err) {
    next(err);
  }
}
