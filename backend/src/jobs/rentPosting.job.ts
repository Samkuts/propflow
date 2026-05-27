/**
 * Rent Posting Job
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs daily at midnight. For each active lease whose `rentDueDay` matches
 * today's day-of-month, posts a RentCharge and the corresponding journal entry
 * (DR Accounts Receivable / CR Rent Income).
 *
 * The underlying `postMonthlyRentCharges` function in leases.service.ts is
 * idempotent — it skips leases that already have a charge for the current month.
 */

import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { postMonthlyRentCharges } from '../api/v1/leases/leases.service';
import { logger } from '../lib/logger';

export function scheduleRentPostingJob() {
  // Run every day at 00:05 (5 minutes past midnight, avoids exactly-midnight contention)
  cron.schedule('5 0 * * *', async () => {
    logger.info('[RentPosting] Starting daily rent charge posting run');

    try {
      // Fetch all management companies that have active leases
      const companies = await prisma.managementCompany.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true },
      });

      let totalPosted = 0;
      for (const company of companies) {
        try {
          const posted = await postMonthlyRentCharges(company.id);
          if (posted.length > 0) {
            logger.info(
              `[RentPosting] ${company.name}: posted ${posted.length} rent charge(s)`
            );
            totalPosted += posted.length;
          }
        } catch (err) {
          logger.error(
            `[RentPosting] Error posting for company ${company.name}: ${err}`
          );
        }
      }

      logger.info(`[RentPosting] Run complete — ${totalPosted} charge(s) posted across ${companies.length} company(s)`);
    } catch (err) {
      logger.error(`[RentPosting] Fatal error during rent posting run: ${err}`);
    }
  });

  logger.info('[RentPosting] Scheduled: daily at 00:05');
}
