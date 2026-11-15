import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';
import { router } from './routes.js';
import { authRouter, credentialsRouter } from './auth-routes.js';
import { emailRouter } from './email-routes.js';
import { lmsRouter } from './lms-routes.js';
import { attachmentsRouter } from './chat-attachments.js';
import { pool } from './db.js';
import { checkOllama } from './ollama.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
const allowedOrigins = new Set([process.env.WEB_ORIGIN || 'http://localhost:5173']);
app.use(cors({
  origin(origin, callback) {
    // Requests without an Origin are permitted for local health checks and server-to-server calls.
    if (!origin || allowedOrigins.has(origin) || (process.env.NODE_ENV === 'development' && origin === 'null')) {
      return callback(null, true);
    }
    return callback(new Error('Origin is not allowed by CampusOS CORS policy'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });
const emailLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 90, standardHeaders: 'draft-7', legacyHeaders: false });
const lmsLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });
const aiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: 'draft-7', legacyHeaders: false });
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.UPLOAD_RATE_LIMIT || 30),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: req => !(req.method === 'POST' && /\/attachments\/?$/.test(req.path))
});
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

app.use((error, _req, res, _next) => {
  console.error('[CampusOS API]', error?.message || 'Unknown error');
  if (error?.message?.includes('CORS policy')) return res.status(403).json({ error: 'Origin is not allowed' });
  res.status(500).json({ error: 'Internal server error' });
});

const port = Number(process.env.PORT || 4000);
const server = app.listen(port, '0.0.0.0', () => console.log(`CampusOS API listening on http://localhost:${port}`));
async function shutdown() {
  server.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);