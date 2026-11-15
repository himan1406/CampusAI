import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function ensureDevUser(userId) {
  await pool.query(
    'INSERT INTO app_users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
    [userId]
  );
}
