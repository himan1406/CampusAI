import { Router } from 'express';
import { z } from 'zod';
import { pool, ensureDevUser } from '../../db/pool.js';
import { requireUser } from '../../middleware/require-user.js';
import { buildSystemPrompt } from '../ai/agent/system-prompt.js';
import { runAgenticChat } from '../ai/agent/orchestrator.js';
import { listSessionAttachments } from './attachments.service.js';

export const router = Router();
router.use(requireUser);

const createSessionSchema = z.object({
  mode: z.enum(['global', 'contextual']).default('global'),
  platform: z.enum(['mycamu', 'outlook', 'gmail', 'lms']).nullable().optional(),
  title: z.string().trim().min(1).max(100).optional()
}).superRefine((value, ctx) => {
  if (value.mode === 'global' && value.platform) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Global sessions cannot specify a platform', path: ['platform'] });
  }
  if (value.mode === 'contextual' && !value.platform) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Contextual sessions require a platform', path: ['platform'] });
  }
});

router.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'degraded', database: 'unavailable' });
  }
});

router.get('/chat/sessions', async (req, res, next) => {
  try {
    await ensureDevUser(req.user.id);
    const result = await pool.query(
      `SELECT id, title, mode, platform, created_at, updated_at
       FROM chat_sessions WHERE user_id = $1 ORDER BY updated_at DESC`,
      [req.user.id]
    );
    res.json({ sessions: result.rows });
  } catch (error) { next(error); }
});

router.post('/chat/sessions', async (req, res, next) => {
  try {
    const parsed = createSessionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    await ensureDevUser(req.user.id);
    const { mode, platform = null, title = 'New conversation' } = parsed.data;
    const result = await pool.query(
      `INSERT INTO chat_sessions (user_id, title, mode, platform)
       VALUES ($1, $2, $3, $4)
       RETURNING id, title, mode, platform, created_at, updated_at`,
      [req.user.id, title, mode, platform]
    );
    res.status(201).json({ session: result.rows[0] });
  } catch (error) { next(error); }
});

router.get('/chat/sessions/:id', async (req, res, next) => {
  try {
    const sessionResult = await pool.query(
      `SELECT id, title, mode, platform, created_at, updated_at
       FROM chat_sessions WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!sessionResult.rowCount) return res.status(404).json({ error: 'Session not found' });
    const messages = await pool.query(
      `SELECT id, role, content, created_at FROM chat_messages
       WHERE session_id = $1 ORDER BY created_at ASC`,
      [req.params.id]
    );
    res.json({ session: sessionResult.rows[0], messages: messages.rows });
  } catch (error) { next(error); }
});

router.delete('/chat/sessions/:id', async (req, res, next) => {
  try {
    // Remove the chat's attached documents (and their chunks) first, whatever the foreign-key cascade rules are.
    await pool.query(
      `DELETE FROM ai_chunks WHERE user_id = $2 AND document_id IN
         (SELECT id FROM ai_documents WHERE user_id = $2 AND session_id = $1)`,
      [req.params.id, req.user.id]
    );
    await pool.query('DELETE FROM ai_documents WHERE user_id = $2 AND session_id = $1', [req.params.id, req.user.id]);
    const result = await pool.query(
      'DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Session not found' });
    res.status(204).end();
  } catch (error) { next(error); }
});

const messageSchema = z.object({
  session_id: z.string().uuid(),
  message: z.string().trim().min(1).max(8000)
});

// Non-streaming chat response for native clients that do not expose a ReadableStream API.
router.post('/chat/answer', async (req, res, next) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { session_id, message } = parsed.data;
  try {
    const sessionResult = await pool.query(
      'SELECT id, mode, platform, title FROM chat_sessions WHERE id = $1 AND user_id = $2',
      [session_id, req.user.id]
    );
    if (!sessionResult.rowCount) return res.status(404).json({ error: 'Session not found' });
    const session = sessionResult.rows[0];
    await pool.query('INSERT INTO chat_messages (session_id, role, content) VALUES ($1, $2, $3)', [session_id, 'user', message]);
    const historyResult = await pool.query(
      'SELECT role, content FROM chat_messages WHERE session_id = $1 ORDER BY created_at DESC LIMIT 20',
      [session_id]
    );
    const attachments = await listSessionAttachments(req.user.id, session_id);
    const result = await runAgenticChat({
      userId: req.user.id,
      sessionId: session_id,
      attachments,
      messages: [{ role: 'system', content: buildSystemPrompt({ ...session, attachments }) }, ...historyResult.rows.reverse()]
    });
    await pool.query('INSERT INTO chat_messages (session_id, role, content) VALUES ($1, $2, $3)', [session_id, 'assistant', result.answer]);
    await pool.query('UPDATE chat_sessions SET updated_at = NOW() WHERE id = $1', [session_id]);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/chat/messages', async (req, res) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { session_id, message } = parsed.data;
  let client;
  try {
    client = await pool.connect();
    const sessionResult = await client.query(
      'SELECT id, mode, platform, title FROM chat_sessions WHERE id = $1 AND user_id = $2',
      [session_id, req.user.id]
    );
    if (!sessionResult.rowCount) {
      client.release();
      return res.status(404).json({ error: 'Session not found' });
    }
    const session = sessionResult.rows[0];

    await client.query(
      'INSERT INTO chat_messages (session_id, role, content) VALUES ($1, $2, $3)',
      [session_id, 'user', message]
    );
    const historyResult = await client.query(
      `SELECT role, content FROM chat_messages
       WHERE session_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [session_id]
    );
    await client.query(
      `UPDATE chat_sessions SET updated_at = NOW(),
       title = CASE WHEN title = 'New conversation' THEN LEFT($2, 55) ELSE title END
       WHERE id = $1`,
      [session_id, message]
    );
    client.release();
    client = null;

    const attachments = await listSessionAttachments(req.user.id, session_id);
    const messages = [
      { role: 'system', content: buildSystemPrompt({ ...session, attachments }) },
      ...historyResult.rows.reverse()
    ];

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    res.write(`event: message.start\ndata: ${JSON.stringify({ session_id })}\n\n`);

    let disconnected = false;
    res.on('close', () => { if (!res.writableEnded) disconnected = true; });
    const result = await runAgenticChat({
      userId: req.user.id,
      sessionId: session_id,
      attachments,
      messages,
      onEvent(event) {
        if (!disconnected) res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      }
    });

    await pool.query(
      'INSERT INTO chat_messages (session_id, role, content) VALUES ($1, $2, $3)',
      [session_id, 'assistant', result.answer]
    );
    await pool.query('UPDATE chat_sessions SET updated_at = NOW() WHERE id = $1', [session_id]);
    if (!disconnected) {
      res.write(`event: message.delta\ndata: ${JSON.stringify({ text: result.answer })}\n\n`);
      res.write(`event: message.done\ndata: ${JSON.stringify({ status: 'completed', tools_used: result.tools_used.length })}\n\n`);
      res.end();
    }
  } catch (error) {
    if (client) client.release();
    if (!res.headersSent) return res.status(502).json({ error: error.message });
    res.write(`event: message.error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});
