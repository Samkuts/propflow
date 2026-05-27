import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import v1Router from './api/v1/index';
import { stripeWebhook } from './api/v1/payments/payments.controller';
import { checkrWebhook } from './api/v1/webhooks/checkr.controller';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { startAllJobs } from './jobs';

const app = express();
const PORT = process.env.PORT ?? 4000;

// ── Security & parsing ──────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  })
);
app.use(compression());

// ── Webhooks — MUST be registered before express.json() ─────────────
// Both Stripe and Checkr require the raw request body for signature verification.
app.post(
  '/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  stripeWebhook,
);
app.post(
  '/webhooks/checkr',
  express.raw({ type: 'application/json' }),
  checkrWebhook,
);

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// ── Health check ────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Global API rate limit (generous — auth routes have their own stricter limit)
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,            // 300 req/min per IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { success: false, data: null, error: 'Too many requests, slow down' },
});

// ── API v1 ──────────────────────────────────────────────────────────
app.use('/api/v1', globalLimiter, v1Router);

// ── Error handlers ──────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ── Start ───────────────────────────────────────────────────────────
async function main() {
  try {
    await prisma.$connect();
    logger.info('Connected to database');

    app.listen(PORT, () => {
      logger.info(`API server running on http://localhost:${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV ?? 'development'}`);
    });

    startAllJobs();
  } catch (err) {
    logger.error(`Failed to start server: ${err}`);
    process.exit(1);
  }
}

main();

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
