import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../../db/pool.js';

const ACCESS_TTL = '15m';
const REFRESH_DAYS = 30;

export function signAccessToken(user) {
  if (!process.env.JWT_ACCESS_SECRET || Buffer.byteLength(process.env.JWT_ACCESS_SECRET) < 32) {
    throw new Error('JWT_ACCESS_SECRET must be configured with at least 32 characters');
  }
  return jwt.sign({ email: user.email }, process.env.JWT_ACCESS_SECRET, {
    subject: String(user.id), expiresIn: ACCESS_TTL, issuer: 'campusos-api', audience: 'campusos-web'
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET, {
    issuer: 'campusos-api', audience: 'campusos-web'
  });
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/v1/auth',
    maxAge: REFRESH_DAYS * 24 * 60 * 60 * 1000
  };
}

export function publicUser(row) {
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

export async function createRefreshToken(userId) {
  const refreshToken = crypto.randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + REFRESH_DAYS * 86400000);
  await pool.query(
    'INSERT INTO auth_refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, hashToken(refreshToken), expiresAt]
  );
  return refreshToken;
}

export async function issueWebSession(user, res) {
  const refreshToken = await createRefreshToken(user.id);
  res.cookie('campusos_refresh', refreshToken, refreshCookieOptions());
  return { access_token: signAccessToken(user), token_type: 'Bearer', expires_in: 900 };
}

export async function issueMobileSession(user) {
  const refreshToken = await createRefreshToken(user.id);
  return {
    access_token: signAccessToken(user),
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_in: 900
  };
}

export async function registerUser(data) {
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

export async function authenticateUser(data) {
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

export async function rotateRefreshToken(refreshToken) {
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

export function sendDuplicateAccount(res) {
  return res.status(409).json({ error: 'An account with this email already exists' });
}
