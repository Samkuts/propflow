/**
 * Late Fee Job
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs daily at 01:00. For every management company, checks all active leases
 * with outstanding rent charges whose grace period has expired and posts a
 * LateFeecharged + journal entry (DR AR / CR Late Fee Income).
 *
 * The underlying `postLateFees` function in accounting.service.ts is idempotent
 * — it skips charges that already have a late fee in the same billing period.
 */

import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { postLateFees } from '../api/v1/accounting/accounting.service';
import { logger } from '../lib/logger';

export function scheduleLateFeeJob() {
  // Run every day at 01:00
  cron.schedule('0 1 * * *', async () => {
    logger.info('[LateFee] Starting daily late fee posting run');

    try {
      const companies = await prisma.managementCompany.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true },
      });

      let totalPosted = 0;
      for (const company of companies) {
        try {
          const posted = await postLateFees({ managementCompanyId: company.id });
          if (posted.length > 0) {
            logger.info(
              `[LateFee] ${company.name}: posted ${posted.length} late fee(s)`
            );
            totalPosted += posted.length;
          }
        } catch (err) {
          logger.error(
            `[LateFee] Error posting late fees for company ${company.name}: ${err}`
          );
        }
      }

      logger.info(`[LateFee] Run complete — ${totalPosted} late fee(s) posted across ${companies.length} company(s)`);
    } catch (err) {
      logger.error(`[LateFee] Fatal error during late fee run: ${err}`);
    }
  });

  logger.info('[LateFee] Scheduled: daily at 01:00');
}
