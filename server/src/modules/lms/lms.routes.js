import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { requireUser } from '../../middleware/require-user.js';
import { encryptSecret, decryptSecret } from '../../lib/vault.js';
import {
  LMS_ORIGIN,
  TOKEN_URL,
  TOKEN_SERVICE,
  postMoodleForm,
  callMoodle,
  friendlyMoodleMessage
} from './moodle.client.js';
import { activeSyncs, runSync } from './content-sync.js';

export const lmsRouter = Router();
lmsRouter.use(requireUser);

const connectSchema = z.object({
  username: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(512)
});

lmsRouter.get('/status', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT a.status, a.auth_method, a.username_hint, a.moodle_site_name,
        a.connected_at, a.last_synced_at,
        (SELECT COUNT(*)::int FROM lms_items i WHERE i.user_id = a.user_id AND i.item_type = 'course') AS course_count,
        (SELECT COUNT(*)::int FROM lms_items i WHERE i.user_id = a.user_id AND i.item_type = 'calendar') AS calendar_count
       FROM lms_accounts a WHERE a.user_id = $1`,
      [req.user.id]
    );
    const account = result.rows[0] || null;
    const connected = Boolean(account && account.status === 'connected' && account.auth_method === 'moodle_token');
    res.json({ connected, account });
  } catch (error) {
    next(error);
  }
});

lmsRouter.post('/connect', async (req, res) => {
  const parsed = connectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter your iLearn username and password.' });

  const username = parsed.data.username;
  let password = parsed.data.password;
  try {
    const tokenForm = new URLSearchParams({
      username,
      password,
      service: TOKEN_SERVICE
    });
    let tokenData;
    try {
      tokenData = await postMoodleForm(TOKEN_URL, tokenForm);
    } finally {
      tokenForm.set('password', '');
      password = '';
      if (req.body) req.body.password = '';
    }

    if (!tokenData?.token) {
      const code = tokenData?.errorcode || tokenData?.error || 'invalidlogin';
      return res.status(401).json({ error: friendlyMoodleMessage(code, tokenData?.error) });
    }

    const siteInfo = await callMoodle(tokenData.token, 'core_webservice_get_site_info');
    if (!siteInfo?.userid) {
      return res.status(502).json({ error: 'iLearn issued a token, but did not return the signed-in student profile.' });
    }

    const encrypted = encryptSecret(tokenData.token);
    const displayName = String(siteInfo.fullname || username).slice(0, 160);
    await pool.query(
      `INSERT INTO lms_accounts
        (user_id, lms_origin, username_hint, session_ciphertext, session_iv, session_tag,
         token_ciphertext, token_iv, token_tag, moodle_user_id, moodle_site_name,
         auth_method, status, connected_at, updated_at)
       VALUES ($1,$2,$3,NULL,NULL,NULL,$4,$5,$6,$7,$8,'moodle_token','connected',NOW(),NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         lms_origin = EXCLUDED.lms_origin,
         username_hint = EXCLUDED.username_hint,
         session_ciphertext = NULL, session_iv = NULL, session_tag = NULL,
         token_ciphertext = EXCLUDED.token_ciphertext,
         token_iv = EXCLUDED.token_iv,
         token_tag = EXCLUDED.token_tag,
         moodle_user_id = EXCLUDED.moodle_user_id,
         moodle_site_name = EXCLUDED.moodle_site_name,
         auth_method = 'moodle_token',
         status = 'connected',
         last_synced_at = NULL,
         connected_at = NOW(),
         updated_at = NOW()`,
      [
        req.user.id, LMS_ORIGIN, displayName,
        encrypted.ciphertext, encrypted.iv, encrypted.tag,
        Number(siteInfo.userid), String(siteInfo.sitename || 'BennettTech iLearn').slice(0, 200)
      ]
    );
    await pool.query('DELETE FROM lms_items WHERE user_id = $1', [req.user.id]);
    await pool.query("DELETE FROM ai_documents WHERE user_id=$1 AND source_type='course'", [req.user.id]);
    res.json({
      connected: true,
      fullname: displayName,
      site_name: String(siteInfo.sitename || 'BennettTech iLearn'),
      message: 'iLearn connected. The password was used only to obtain an encrypted Moodle token.'
    });
  } catch (error) {
    const status = ['invalidlogin', 'invalid_credentials'].includes(String(error.code).toLowerCase()) ? 401
      : ['accessexception', 'servicenotavailable'].includes(String(error.code).toLowerCase()) ? 403
      : 502;
    res.status(status).json({ error: friendlyMoodleMessage(error.code, error.message) });
  } finally {
    password = '';
    if (req.body) req.body.password = '';
  }
});

lmsRouter.post('/sync', async (req, res) => {
  if (activeSyncs.has(req.user.id)) {
    return res.status(409).json({ error: 'An iLearn sync is already running for this account.' });
  }
  activeSyncs.add(req.user.id);
  try {
    const result = await runSync(req.user.id);
    res.json(result);
  } catch (error) {
    const status = error.statusCode || (error.code === 'invalidtoken' ? 401 : 502);
    res.status(status).json({ error: error.statusCode ? error.message : friendlyMoodleMessage(error.code, error.message) });
  } finally {
    activeSyncs.delete(req.user.id);
  }
});

lmsRouter.get('/items', async (req, res, next) => {
  try {
    const type = String(req.query.type || 'all');
    if (!['all', 'course', 'calendar'].includes(type)) {
      return res.status(400).json({ error: 'Only course and calendar items are available in this LMS sprint.' });
    }
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 200));
    const query = String(req.query.q || '').trim().slice(0, 120);
    const result = await pool.query(
      `SELECT id, item_type, payload_ciphertext, payload_iv, payload_tag, last_seen_at, updated_at
       FROM lms_items
       WHERE user_id = $1 AND item_type IN ('course', 'calendar')
         AND ($2 = 'all' OR item_type = $2)
       ORDER BY updated_at DESC LIMIT 500`,
      [req.user.id, type]
    );

    const needle = query.toLowerCase();
    const items = result.rows.map(row => ({
      id: row.id,
      item_type: row.item_type,
      ...JSON.parse(decryptSecret({
        ciphertext: row.payload_ciphertext,
        iv: row.payload_iv,
        tag: row.payload_tag
      })),
      last_seen_at: row.last_seen_at,
      updated_at: row.updated_at
    })).filter(item => !needle || [
      item.title, item.course_name, item.content_text
    ].some(value => String(value || '').toLowerCase().includes(needle)));

    items.sort((a, b) => {
      if (a.item_type === 'calendar' && b.item_type === 'calendar') {
        return Number(a.timestart || 0) - Number(b.timestart || 0);
      }
      if (a.item_type === 'course' && b.item_type === 'course') {
        return String(a.title || '').localeCompare(String(b.title || ''));
      }
      return a.item_type === 'course' ? -1 : 1;
    });
    res.json({ items: items.slice(0, limit) });
  } catch (error) {
    next(error);
  }
});

lmsRouter.delete('/disconnect', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM lms_accounts WHERE user_id = $1', [req.user.id]);
    await pool.query('DELETE FROM lms_items WHERE user_id = $1', [req.user.id]);
    await pool.query("DELETE FROM ai_documents WHERE user_id=$1 AND source_type='course'", [req.user.id]);
    await pool.query('DELETE FROM lms_sync_runs WHERE user_id = $1', [req.user.id]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
