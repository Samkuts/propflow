import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';

import v1Router from './api/v1/index';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';

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
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// ── Health check ────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── API v1 ──────────────────────────────────────────────────────────
app.use('/api/v1', v1Router);

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
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
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
