import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { requireUser } from '../../middleware/require-user.js';
import { signupSchema, loginSchema, refreshSchema } from './auth.schemas.js';
import {
  signAccessToken,
  hashToken,
  refreshCookieOptions,
  publicUser,
  issueWebSession,
  issueMobileSession,
  registerUser,
  authenticateUser,
  rotateRefreshToken,
  sendDuplicateAccount
} from './auth.service.js';

export const authRouter = Router();

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
