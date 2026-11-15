import crypto from 'node:crypto';
import { LMS_ORIGIN, stripHtml, safeLmsUrl } from './moodle.client.js';

function hashPayload(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function normalizeCourse(course) {
  const id = Number(course.id);
  const fallbackUrl = `${LMS_ORIGIN}/course/view.php?id=${id}`;
  const summary = stripHtml(course.summary || '');
  const payload = {
    source_url: safeLmsUrl(course.viewurl, fallbackUrl),
    external_id: String(id),
    title: String(course.fullname || course.shortname || `Course ${id}`).slice(0, 500),
    course_name: String(course.fullname || course.shortname || `Course ${id}`),
    content_text: summary,
    startdate: Number(course.startdate || 0),
    enddate: Number(course.enddate || 0),
    metadata: {
      course_id: id,
      shortname: course.shortname || '',
      idnumber: course.idnumber || '',
      category: course.category || null,
      visible: course.visible ?? null,
      progress: course.progress ?? null,
      summary_format: course.summaryformat ?? null
    }
  };
  return {
    item_type: 'course',
    source_key: `course:${id}`,
    payload,
    content_hash: hashPayload(payload)
  };
}

export function normalizeCalendarEvent(event, courseNames) {
  const id = event.id ?? `${event.courseid || 0}:${event.timestart || 0}:${event.name || 'event'}`;
  const start = Number(event.timestart || event.timesort || 0);
  const duration = Math.max(0, Number(event.timeduration || 0));
  const courseId = Number(event.courseid || 0);
  const fallbackUrl = `${LMS_ORIGIN}/calendar/view.php?view=day&time=${start}`;
  const payload = {
    source_url: safeLmsUrl(event.url || event.viewurl, fallbackUrl),
    external_id: String(id),
    title: String(event.name || 'Calendar event').slice(0, 500),
    course_name: courseNames.get(courseId) || event.course?.fullname || null,
    content_text: stripHtml(event.description || ''),
    timestart: start,
    timeduration: duration,
    timeend: start + duration,
    eventtype: event.eventtype || 'event',
    modulename: event.modulename || '',
    courseid: courseId || null,
    metadata: {
      event_id: event.id ?? null,
      eventtype: event.eventtype || null,
      modulename: event.modulename || null,
      instance: event.instance ?? null,
      groupid: event.groupid ?? null,
      userid: event.userid ?? null,
      visible: event.visible ?? null,
      repeatid: event.repeatid ?? null,
      timemodified: event.timemodified ?? null
    }
  };
  return {
    item_type: 'calendar',
    source_key: `calendar:${id}`,
    payload,
    content_hash: hashPayload(payload)
  };
}
