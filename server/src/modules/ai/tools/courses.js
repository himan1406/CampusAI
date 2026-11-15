import { pool } from '../../../db/pool.js';
import { decryptLms, source } from './helpers.js';

export async function getCourses(userId) {
  const result = await pool.query(
    `SELECT id,payload_ciphertext,payload_iv,payload_tag FROM lms_items
     WHERE user_id=$1 AND item_type='course' ORDER BY updated_at DESC LIMIT 100`, [userId]
  );
  const courses = result.rows.map(row => {
    const payload = decryptLms(row);
    return { id: payload.metadata?.course_id || payload.external_id, title: payload.title, shortname: payload.metadata?.shortname, url: payload.source_url };
  });
  return { data: { count: courses.length, courses }, sources: courses.map(item => source('course', item.title, item.url, item.id)) };
}
