/**
 * Autopay Job
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs daily at 08:00 (after rent posting at 00:05, late fees at 01:00).
 * Finds all tenants with autopay enabled, checks their outstanding balance,
 * and charges their saved Stripe card if they owe money.
 *
 * Each tenant is processed independently — a failure for one tenant does not
 * stop processing for others.
 */

import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { runAutopayForTenant } from '../api/v1/payments/payments.service';
import { stripeConfigured } from '../lib/stripe';
import { logger } from '../lib/logger';

export function scheduleAutopayJob() {
  // Run every day at 08:00
  cron.schedule('0 8 * * *', async () => {
    logger.info('[Autopay] Starting daily autopay run');

    if (!stripeConfigured()) {
      logger.info('[Autopay] Stripe not configured — skipping');
      return;
    }

    try {
      // Find all tenants with autopay enabled who have a Stripe customer
      const tenants = await prisma.tenant.findMany({
        where: {
          autopayEnabled: true,
          stripeCustomerId: { not: null },
          deletedAt: null,
          leaseId: { not: null },
        },
        select: {
          id: true,
          firstName: true,
          leaseId: true,
          managementCompanyId: true,
        },
      });

      // Filter to only active leases (checked in-memory to avoid complex join)
      const activeLeaseIds = new Set(
        (
          await prisma.lease.findMany({
            where: {
              id: { in: tenants.map((t) => t.leaseId!).filter(Boolean) },
              status: { in: ['ACTIVE', 'MONTH_TO_MONTH'] },
              deletedAt: null,
            },
            select: { id: true },
          })
        ).map((l) => l.id),
      );

      const eligibleTenants = tenants.filter(
        (t) => t.leaseId && activeLeaseIds.has(t.leaseId),
      );

      let succeeded = 0;
      let skipped = 0;
      let failed = 0;

      for (const tenant of eligibleTenants) {
        const result = await runAutopayForTenant(
          tenant.id,
          tenant.leaseId!,
          tenant.managementCompanyId,
        );

        if (!result.success) {
          logger.warn(`[Autopay] Tenant ${tenant.id} (${tenant.firstName}): ${result.error}`);
          failed++;
        } else if ((result.amountCents ?? 0) === 0) {
          skipped++; // no balance due
        } else {
          logger.info(
            `[Autopay] Tenant ${tenant.id} (${tenant.firstName}): charged $${((result.amountCents ?? 0) / 100).toFixed(2)}`,
          );
          succeeded++;
        }
      }

      logger.info(
        `[Autopay] Run complete — ${succeeded} charged, ${skipped} skipped (no balance), ${failed} failed out of ${eligibleTenants.length} eligible tenants`,
      );
    } catch (err) {
      logger.error(`[Autopay] Fatal error during autopay run: ${err}`);
    }
  });

  logger.info('[Autopay] Scheduled: daily at 08:00');
}
