/**
 * Background Jobs Registry
 * Call `startAllJobs()` once from src/index.ts after the DB connects.
 */

import { scheduleRentPostingJob } from './rentPosting.job';
import { scheduleLateFeeJob } from './lateFee.job';
import { scheduleLeaseExpiryJob } from './leaseExpiry.job';
import { scheduleAutopayJob } from './autopay.job';
import { startRecurringChargesJob } from './recurringCharges.job';
import { logger } from '../lib/logger';

export function startAllJobs() {
  if (process.env.NODE_ENV === 'test') {
    logger.info('[Jobs] Skipping background jobs in test environment');
    return;
  }

  scheduleRentPostingJob();      // 00:05 — post monthly rent charges
  startRecurringChargesJob();    // 00:10 — post recurring non-rent charges
  scheduleLateFeeJob();          // 01:00 — post late fees for overdue charges
  scheduleAutopayJob();          // 08:00 — charge tenants with autopay enabled
  scheduleLeaseExpiryJob();      // 09:00 — SMS tenants whose lease expires in ~7 days

  logger.info('[Jobs] All background jobs scheduled');
}
