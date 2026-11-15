import '../../../config/env.js';
import { pool } from '../../../db/pool.js';
import { decryptLms, source } from './helpers.js';

const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';

function validDateKey(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : value;
}

function localDateKey(value) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}

export async function getUpcomingEvents(userId, args) {
  const now = new Date();
  const startKey = validDateKey(args.start_date) || localDateKey(now);
  const endKey = validDateKey(args.end_date) || localDateKey(new Date(now.getTime() + 30 * 86400000));
  const start = new Date(`${startKey}T00:00:00.000Z`);
  const end = new Date(`${endKey}T00:00:00.000Z`);
  if (end < start || end - start > 366 * 86400000) return { error: 'Choose a valid date range of no more than one year.', data: null, sources: [] };
  const result = await pool.query(
    `SELECT id,payload_ciphertext,payload_iv,payload_tag FROM lms_items
     WHERE user_id=$1 AND item_type='calendar' ORDER BY updated_at DESC LIMIT 500`, [userId]
  );
  const courseFilter = String(args.course_name || '').toLowerCase();
  const events = result.rows.map(row => ({ id: row.id, ...decryptLms(row) }))
    .filter(event => {
      const eventDate = new Date(Number(event.timestart || 0) * 1000);
      const eventKey = localDateKey(eventDate);
      return eventKey >= startKey && eventKey <= endKey && (!courseFilter || String(event.course_name || '').toLowerCase().includes(courseFilter));
    })
    .sort((a, b) => Number(a.timestart) - Number(b.timestart))
    .slice(0, Math.max(1, Math.min(20, Number(args.limit) || 15)))
    .map(event => ({
      id: event.id, title: event.title, course_name: event.course_name,
      start: new Intl.DateTimeFormat('en-IN', { timeZone: APP_TIMEZONE, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(Number(event.timestart) * 1000)),
      end: new Intl.DateTimeFormat('en-IN', { timeZone: APP_TIMEZONE, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(Number(event.timeend || event.timestart) * 1000)),
      timezone: APP_TIMEZONE, description: String(event.content_text || '').slice(0, 400), type: event.eventtype, url: event.source_url
    }));
  return { data: { count: events.length, events }, sources: events.map(event => source('calendar', `${event.title}${event.course_name ? ` · ${event.course_name}` : ''}`, event.url, event.id)) };
}
