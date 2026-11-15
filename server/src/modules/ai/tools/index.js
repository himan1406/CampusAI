import { validators } from './validators.js';
import { getCourses } from './courses.js';
import { getUpcomingEvents } from './events.js';
import { searchCourseMaterials, searchAttachments, readAttachment } from './documents.js';
import { searchEmails, getRecentEmails, getEmailThread } from './emails.js';

export async function executeTool(userId, name, rawArgs, ctx = {}) {
  const validator = validators[name];
  if (!validator) throw new Error('Tool is not available.');
  const parsed = validator.safeParse(rawArgs && typeof rawArgs === 'object' ? rawArgs : {});
  if (!parsed.success) return { error: 'The tool arguments were invalid. Please try a narrower request.', sources: [] };
  switch (name) {
    case 'get_courses': return getCourses(userId);
    case 'get_upcoming_events': return getUpcomingEvents(userId, parsed.data);
    case 'search_course_materials': return searchCourseMaterials(userId, parsed.data);
    case 'search_emails': return searchEmails(userId, parsed.data);
    case 'get_recent_emails': return getRecentEmails(userId, parsed.data);
    case 'get_email_thread': return getEmailThread(userId, parsed.data);
    case 'search_attachments': return searchAttachments(userId, parsed.data, ctx);
    case 'read_attachment': return readAttachment(userId, parsed.data, ctx);
    default: throw new Error('Tool is not available.');
  }
}
