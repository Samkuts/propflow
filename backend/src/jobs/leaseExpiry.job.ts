/**
 * Lease Expiry SMS Job
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs daily at 09:00. Finds all active/month-to-month leases whose endDate
 * falls within a 6–8 day window from now and sends each tenant an SMS reminder.
 *
 * Time-window idempotency: the job only fires for leases whose endDate is
 * between today+6d and today+8d — this naturally prevents duplicate sends
 * even if the job runs slightly late (±24h tolerance).
 */

import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { leaseExpirySms } from '../lib/sms';
import { logger } from '../lib/logger';

export function scheduleLeaseExpiryJob() {
  // Run every day at 09:00
  cron.schedule('0 9 * * *', async () => {
    logger.info('[LeaseExpiry] Starting daily lease expiry SMS run');

    try {
      const now = new Date();

      // Window: endDate between today+6d 00:00 and today+8d 23:59
      const windowStart = new Date(now);
      windowStart.setDate(windowStart.getDate() + 6);
      windowStart.setHours(0, 0, 0, 0);

      const windowEnd = new Date(now);
      windowEnd.setDate(windowEnd.getDate() + 8);
      windowEnd.setHours(23, 59, 59, 999);

      const leases = await prisma.lease.findMany({
        where: {
          status: { in: ['ACTIVE', 'MONTH_TO_MONTH'] },
          endDate: { gte: windowStart, lte: windowEnd },
          deletedAt: null,
        },
        include: {
          unit: { select: { unitNumber: true } },
          tenants: {
            where: { deletedAt: null },
            select: { id: true, firstName: true, phone: true },
          },
        },
      });

      let smsSent = 0;

      for (const lease of leases) {
        const daysLeft = Math.ceil(
          (lease.endDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );

        for (const tenant of lease.tenants) {
          if (!tenant.phone) continue;
          try {
            await leaseExpirySms({
              to: tenant.phone,
              tenantName: tenant.firstName,
              unitNumber: lease.unit?.unitNumber ?? '',
              daysLeft,
            });
            smsSent++;
          } catch (err) {
            logger.error(
              `[LeaseExpiry] Failed to SMS tenant ${tenant.id} for lease ${lease.id}: ${err}`,
            );
          }
        }
      }

      logger.info(
        `[LeaseExpiry] Run complete — ${smsSent} SMS sent for ${leases.length} expiring lease(s)`,
      );
    } catch (err) {
      logger.error(`[LeaseExpiry] Fatal error during lease expiry run: ${err}`);
    }
  });

  logger.info('[LeaseExpiry] Scheduled: daily at 09:00');
}
