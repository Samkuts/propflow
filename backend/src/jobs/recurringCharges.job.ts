import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { postRecurringCharges } from '../api/v1/recurring-charges/recurring-charges.service';
import { logger } from '../lib/logger';

/**
 * Posts recurring non-rent charges (parking, pet fees, utilities, etc.)
 * Runs at 00:10 daily — after rent posting (00:05) but before late fees (01:00).
 */
export function startRecurringChargesJob() {
  cron.schedule('10 0 * * *', async () => {
    logger.info('[RecurringCharges] Starting recurring charge posting run');
    try {
      const companies = await prisma.managementCompany.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true },
      });

      let totalPosted = 0;
      for (const company of companies) {
        try {
          const posted = await postRecurringCharges(company.id);
          totalPosted += posted.length;
          if (posted.length > 0) {
            logger.info(
              `[RecurringCharges] ${company.name}: posted ${posted.length} charge(s)`
            );
          }
        } catch (err) {
          logger.error(
            `[RecurringCharges] Error posting for company ${company.name}: ${err}`
          );
        }
      }
      logger.info(`[RecurringCharges] Run complete — ${totalPosted} charge(s) posted across ${companies.length} company(s)`);
    } catch (err) {
      logger.error(`[RecurringCharges] Fatal error during recurring charge run: ${err}`);
    }
  });

  logger.info('[RecurringCharges] Scheduled: daily at 00:10');
}
