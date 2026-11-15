import './config/env.js';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { corsMiddleware } from './middleware/cors.js';
import { authLimiter, emailLimiter, lmsLimiter, aiLimiter, uploadLimiter } from './middleware/rate-limiters.js';
import { errorHandler } from './middleware/error-handler.js';
import { router } from './routes.js';
import { authRouter, credentialsRouter } from './auth-routes.js';
import { emailRouter } from './email-routes.js';
import { lmsRouter } from './lms-routes.js';
import { attachmentsRouter } from './chat-attachments.js';
import { pool } from './db/pool.js';
import { checkOllama } from './ollama.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(corsMiddleware);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.use('/api/v1/auth', authLimiter, authRouter);
app.use('/api/v1/connections/credentials', credentialsRouter);
app.use('/api/v1/email', emailLimiter, emailRouter);
app.use('/api/v1/lms', lmsLimiter, lmsRouter);
// Attachments get their own limiter (uploads only) so listing/removing files does not use up the chat budget.
app.use('/api/v1/chat/sessions', uploadLimiter, attachmentsRouter);
app.use('/api/v1/chat', aiLimiter);
app.use('/api/v1', router);

app.get('/', (_req, res) => res.json({ name: 'CampusOS API', version: '0.6.0', health: '/api/v1/health/full' }));
app.get('/api/v1/health/full', async (_req, res) => {
  let database = false;
  try { await pool.query('SELECT 1'); database = true; } catch {}
  const ollama = await checkOllama();
  res.status(database ? 200 : 503).json({
    status: database ? 'ok' : 'degraded',
    database: database ? 'connected' : 'unavailable',
    ollama: ollama ? 'connected' : 'unavailable',
    model: process.env.OLLAMA_MODEL || 'qwen2.5:3b'
  });
});

app.use(errorHandler);

const port = Number(process.env.PORT || 4000);
const server = app.listen(port, '0.0.0.0', () => console.log(`CampusOS API listening on http://localhost:${port}`));
async function shutdown() {
  server.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);