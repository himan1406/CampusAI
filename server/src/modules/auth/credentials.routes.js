import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { requireUser } from '../../middleware/require-user.js';
import { encryptSecret } from '../../lib/vault.js';
import { credentialSchema } from './auth.schemas.js';

// MyCamu/LMS credential vault. Passwords are never returned by this API.
export const credentialsRouter = Router();
credentialsRouter.use(requireUser);

credentialsRouter.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, platform, username_hint, status, created_at, updated_at
       FROM connected_credentials WHERE user_id = $1 ORDER BY platform`, [req.user.id]
    );
    res.json({ connections: result.rows });
  } catch (error) { next(error); }
});

credentialsRouter.put('/', async (req, res, next) => {
  const parsed = credentialSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (req.user.dev) return res.status(403).json({ error: 'Credential storage is disabled in development-bypass mode' });
  try {
    const { platform, username, password } = parsed.data;
    const encrypted = encryptSecret(JSON.stringify({ username, password }));
    const hint = username.length > 3 ? `${username.slice(0, 2)}•••${username.slice(-1)}` : '••••';
    const result = await pool.query(
      `INSERT INTO connected_credentials
       (user_id, platform, username_hint, secret_ciphertext, secret_iv, secret_tag, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'stored')
       ON CONFLICT (user_id, platform) DO UPDATE SET
       username_hint = EXCLUDED.username_hint, secret_ciphertext = EXCLUDED.secret_ciphertext,
       secret_iv = EXCLUDED.secret_iv, secret_tag = EXCLUDED.secret_tag,
       status = 'stored', updated_at = NOW()
       RETURNING id, platform, username_hint, status, created_at, updated_at`,
      [req.user.id, platform, hint, encrypted.ciphertext, encrypted.iv, encrypted.tag]
    );
    res.status(200).json({ connection: result.rows[0], message: 'Credentials encrypted and stored. Platform sign-in has not yet been tested.' });
  } catch (error) { next(error); }
});

credentialsRouter.delete('/:platform', async (req, res, next) => {
  if (!['mycamu', 'lms'].includes(req.params.platform)) return res.status(400).json({ error: 'Unsupported platform' });
  try {
    const result = await pool.query(
      'DELETE FROM connected_credentials WHERE user_id = $1 AND platform = $2 RETURNING id',
      [req.user.id, req.params.platform]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Connection not found' });
    res.status(204).end();
  } catch (error) { next(error); }
});
