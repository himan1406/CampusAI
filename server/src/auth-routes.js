import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from './db.js';
import { signAccessToken, requireUser } from './auth.js';
import { encryptSecret } from './vault.js';

export const authRouter = Router();
const credentialsRouter = Router();
const REFRESH_DAYS = 30;
const emailSchema = z.string().trim().email({ message: 'Enter a valid email address' }).max(254).transform(v => v.toLowerCase());
function normalizeIndianPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const localNumber = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(localNumber) ? `+91${localNumber}` : '';
}
const phoneSchema = z.string().trim().transform(normalizeIndianPhone).refine(
  value => Boolean(value),
  { message: 'Enter a valid 10-digit Indian mobile number (6–9 first digit)' }
);
const signupSchema = z.object({
  full_name: z.string().trim().min(2).max(100),
  email: emailSchema,
  phone_number: phoneSchema,
  password: z.string().min(12).max(128),
  student_id: z.string().trim().max(60).optional().nullable(),
  department: z.string().trim().max(100).optional().nullable(),
  academic_year: z.number().int().min(1).max(8).optional().nullable()
});
const loginSchema = z.object({ email: emailSchema, phone_number: phoneSchema, password: z.string().min(1).max(128) });
const refreshSchema = z.object({ refresh_token: z.string().min(20).max(200) });

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/v1/auth',
    maxAge: REFRESH_DAYS * 24 * 60 * 60 * 1000
  };
}
function publicUser(row) {
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    phone_number: row.phone_number,
    student_id: row.student_id,
    department: row.department,
    academic_year: row.academic_year,
    created_at: row.created_at
  };
}
async function createRefreshToken(userId) {
  const refreshToken = crypto.randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + REFRESH_DAYS * 86400000);
  await pool.query(
    'INSERT INTO auth_refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, hashToken(refreshToken), expiresAt]
  );
  return refreshToken;
}
async function issueWebSession(user, res) {
  const refreshToken = await createRefreshToken(user.id);
  res.cookie('campusos_refresh', refreshToken, refreshCookieOptions());
  return { access_token: signAccessToken(user), token_type: 'Bearer', expires_in: 900 };
}
async function issueMobileSession(user) {
  const refreshToken = await createRefreshToken(user.id);
  return {
    access_token: signAccessToken(user),
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_in: 900
  };
}
async function registerUser(data) {
  const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN?.toLowerCase();
  if (allowedDomain && data.email.split('@')[1] !== allowedDomain) {
    const error = new Error(`Use your college email address ending in @${allowedDomain}`);
    error.statusCode = 403;
    throw error;
  }
  const passwordHash = await bcrypt.hash(data.password, 12);
  const result = await pool.query(
    `INSERT INTO app_users (id, full_name, email, phone_number, password_hash, student_id, department, academic_year)
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7)
     RETURNING id, full_name, email, phone_number, student_id, department, academic_year, created_at`,
    [data.full_name, data.email, data.phone_number, passwordHash, data.student_id || null, data.department || null, data.academic_year || null]
  );
  return result.rows[0];
}
async function authenticateUser(data) {
  const result = await pool.query(
    `SELECT id, full_name, email, phone_number, password_hash, student_id, department, academic_year, created_at
     FROM app_users WHERE LOWER(email) = $1 AND is_active = TRUE`, [data.email]
  );
  const user = result.rows[0];
  const valid = user?.password_hash ? await bcrypt.compare(data.password, user.password_hash) : false;
  if (!valid) {
    const error = new Error('Invalid email, mobile number or password');
    error.statusCode = 401;
    throw error;
  }

  // Existing CampusOS accounts predate phone-number collection. On their first
  // successful login, save the supplied valid number; future logins must match it.
  if (user.phone_number && user.phone_number !== data.phone_number) {
    const error = new Error('Invalid email, mobile number or password');
    error.statusCode = 401;
    throw error;
  }
  if (!user.phone_number) {
    const saved = await pool.query(
      'UPDATE app_users SET phone_number = $1 WHERE id = $2 AND phone_number IS NULL RETURNING phone_number',
      [data.phone_number, user.id]
    );
    if (saved.rowCount) {
      user.phone_number = saved.rows[0].phone_number;
    } else {
      const latest = await pool.query('SELECT phone_number FROM app_users WHERE id = $1', [user.id]);
      if (latest.rows[0]?.phone_number !== data.phone_number) {
        const error = new Error('Invalid email, mobile number or password');
        error.statusCode = 401;
        throw error;
      }
      user.phone_number = latest.rows[0].phone_number;
    }
  }
  return user;
}
async function rotateRefreshToken(refreshToken) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT r.id AS token_id, r.user_id, u.full_name, u.email, u.phone_number, u.student_id,
              u.department, u.academic_year, u.created_at, u.is_active
       FROM auth_refresh_tokens r JOIN app_users u ON u.id = r.user_id
       WHERE r.token_hash = $1 AND r.revoked_at IS NULL AND r.expires_at > NOW()
       FOR UPDATE OF r`, [hashToken(refreshToken)]
    );
    if (!found.rowCount || !found.rows[0].is_active) {
      await client.query('ROLLBACK');
      return null;
    }
    const row = found.rows[0];
    await client.query('UPDATE auth_refresh_tokens SET revoked_at = NOW() WHERE id = $1', [row.token_id]);
    const nextToken = crypto.randomBytes(48).toString('base64url');
    await client.query(
      "INSERT INTO auth_refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')",
      [row.user_id, hashToken(nextToken)]
    );
    await client.query('COMMIT');
    return { user: row, refresh_token: nextToken };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
function sendDuplicateAccount(res) {
  return res.status(409).json({ error: 'An account with this email already exists' });
}

// Browser/web authentication: refresh token is held in an HTTP-only cookie.
authRouter.post('/signup', async (req, res, next) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const user = await registerUser(parsed.data);
    const tokens = await issueWebSession(user, res);
    res.status(201).json({ user: publicUser(user), ...tokens });
  } catch (error) {
    if (error.code === '23505') return sendDuplicateAccount(res);
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    next(error);
  }
});

authRouter.post('/login', async (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const user = await authenticateUser(parsed.data);
    const tokens = await issueWebSession(user, res);
    res.json({ user: publicUser(user), ...tokens });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    next(error);
  }
});

authRouter.post('/refresh', async (req, res, next) => {
  const token = req.cookies?.campusos_refresh;
  if (!token) return res.status(401).json({ error: 'Refresh session missing' });
  try {
    const rotated = await rotateRefreshToken(token);
    if (!rotated) {
      res.clearCookie('campusos_refresh', { ...refreshCookieOptions(), maxAge: undefined });
      return res.status(401).json({ error: 'Refresh session expired or invalid' });
    }
    res.cookie('campusos_refresh', rotated.refresh_token, refreshCookieOptions());
    res.json({ access_token: signAccessToken(rotated.user), token_type: 'Bearer', expires_in: 900 });
  } catch (error) { next(error); }
});

authRouter.post('/logout', async (req, res, next) => {
  try {
    const token = req.cookies?.campusos_refresh;
    if (token) await pool.query('UPDATE auth_refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1', [hashToken(token)]);
    res.clearCookie('campusos_refresh', { ...refreshCookieOptions(), maxAge: undefined });
    res.status(204).end();
  } catch (error) { next(error); }
});

// Native/desktop token transport: refresh tokens are returned once and stored in OS secure storage.
authRouter.post('/mobile/signup', async (req, res, next) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const user = await registerUser(parsed.data);
    const tokens = await issueMobileSession(user);
    res.status(201).json({ user: publicUser(user), ...tokens });
  } catch (error) {
    if (error.code === '23505') return sendDuplicateAccount(res);
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    next(error);
  }
});

authRouter.post('/mobile/login', async (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const user = await authenticateUser(parsed.data);
    const tokens = await issueMobileSession(user);
    res.json({ user: publicUser(user), ...tokens });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    next(error);
  }
});

authRouter.post('/mobile/refresh', async (req, res, next) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) return res.status(401).json({ error: 'Refresh session missing or invalid' });
  try {
    const rotated = await rotateRefreshToken(parsed.data.refresh_token);
    if (!rotated) return res.status(401).json({ error: 'Refresh session expired or invalid' });
    res.json({
      access_token: signAccessToken(rotated.user),
      refresh_token: rotated.refresh_token,
      token_type: 'Bearer',
      expires_in: 900
    });
  } catch (error) { next(error); }
});

authRouter.post('/mobile/logout', async (req, res, next) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (parsed.success) {
    try {
      await pool.query('UPDATE auth_refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1', [hashToken(parsed.data.refresh_token)]);
    } catch (error) { return next(error); }
  }
  res.status(204).end();
});

authRouter.get('/me', requireUser, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, email, phone_number, student_id, department, academic_year, created_at
       FROM app_users WHERE id = $1`, [req.user.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'User not found' });
    res.json({ user: publicUser(result.rows[0]) });
  } catch (error) { next(error); }
});

// MyCamu/LMS credential vault. Passwords are never returned by this API.
credentialsRouter.use(requireUser);
const credentialSchema = z.object({
  platform: z.enum(['mycamu', 'lms']),
  username: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(512)
});
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

export { credentialsRouter };
