import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { pool } from './db/pool.js';
import { requireUser } from './middleware/require-user.js';
import { decryptSecret, encryptSecret } from './lib/vault.js';
import { extractDocumentText, indexTextDocuments } from './document-indexer.js';

export const lmsRouter = Router();
lmsRouter.use(requireUser);

const LMS_ORIGIN = new URL(process.env.LMS_BASE_URL || 'https://lms.bennett.edu.in').origin;
const TOKEN_URL = `${LMS_ORIGIN}/login/token.php`;
const REST_URL = `${LMS_ORIGIN}/webservice/rest/server.php`;
const TOKEN_SERVICE = process.env.LMS_TOKEN_SERVICE || 'moodle_mobile_app';
const activeSyncs = new Set();

class MoodleApiError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MoodleApiError';
    this.code = code || 'moodle_error';
  }
}

function friendlyMoodleMessage(code, message = '') {
  const normalized = String(code || '').toLowerCase();
  if (normalized.includes('invalidlogin') || normalized.includes('invalid login') || normalized.includes('invalid_credentials')) {
    return 'iLearn did not accept that username and password. Check your credentials and try again.';
  }
  if (normalized.includes('invalidtoken')) {
    return 'Your iLearn connection has expired or been revoked. Connect iLearn again.';
  }
  if (normalized.includes('accessexception') || normalized.includes('accessdenied')) {
    return 'iLearn denied this API request. The Moodle service may not expose this read-only function to student accounts.';
  }
  if (normalized.includes('servicenotavailable') || normalized.includes('service')) {
    return 'The Moodle mobile web-service token service is not available for this account.';
  }
  if (normalized.includes('functionnotavailable') || normalized.includes('invalidrecord')) {
    return 'This iLearn API function is not enabled for the current service.';
  }
  if (normalized === 'network_error' || normalized === 'timeout') {
    return 'Could not reach BennettTech iLearn. Check your internet connection and try again.';
  }
  return message ? String(message).slice(0, 240) : 'The iLearn API request failed. Please try again.';
}

async function postMoodleForm(url, form) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      signal: controller.signal
    });
    const raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new MoodleApiError('invalid_response', 'iLearn returned an unexpected response. Confirm that Moodle REST JSON responses are enabled.');
    }
    if (!response.ok || data?.exception || data?.errorcode || data?.error) {
      const code = data?.errorcode || data?.exception || `http_${response.status}`;
      throw new MoodleApiError(code, friendlyMoodleMessage(code, data?.message || data?.error));
    }
    return data;
  } catch (error) {
    if (error instanceof MoodleApiError) throw error;
    if (error?.name === 'AbortError') {
      throw new MoodleApiError('timeout', friendlyMoodleMessage('timeout'));
    }
    throw new MoodleApiError('network_error', friendlyMoodleMessage('network_error'));
  } finally {
    clearTimeout(timer);
  }
}

async function callMoodle(token, functionName, params = {}) {
  const form = new URLSearchParams({
    wstoken: token,
    wsfunction: functionName,
    moodlewsrestformat: 'json'
  });
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) form.set(key, String(value));
  }
  return postMoodleForm(REST_URL, form);
}

function stripHtml(value = '') {
  return String(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
    .slice(0, 12000);
}

function safeLmsUrl(candidate, fallback) {
  try {
    const url = new URL(candidate || fallback, LMS_ORIGIN);
    if (url.origin !== LMS_ORIGIN) return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

function hashPayload(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function normalizeCourse(course) {
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


async function downloadMoodleFile(fileUrl, token) {
  let url = new URL(fileUrl);
  url.searchParams.set('token', token);
  let response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(25000) });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get('location');
    if (!location) throw new Error('Moodle returned a redirect without a location.');
    const redirected = new URL(location, url);
    if (redirected.origin !== LMS_ORIGIN) throw new Error('Moodle attempted to redirect the file download outside the configured LMS origin.');
    redirected.searchParams.set('token', token);
    response = await fetch(redirected, { redirect: 'manual', signal: AbortSignal.timeout(25000) });
  }
  if ([301, 302, 303, 307, 308].includes(response.status)) throw new Error('Moodle returned too many file redirects.');
  return response;
}

async function collectCourseDocuments(token, rawCourses) {
  const documents = [];
  const warnings = [];
  const maxCourses = Math.max(1, Math.min(100, Number(process.env.LMS_MAX_COURSES_FOR_CONTENTS || 30)));
  const maxFiles = Math.max(0, Math.min(200, Number(process.env.LMS_MAX_FILES_PER_SYNC || 40)));
  const maxBytes = Math.max(1, Math.min(50, Number(process.env.LMS_MAX_FILE_MB || 12)) * 1024 * 1024);
  let filesDownloaded = 0;
  let filesAttempted = 0;

  for (const course of rawCourses.slice(0, maxCourses)) {
    const courseId = Number(course.id);
    const courseName = String(course.fullname || course.shortname || `Course ${courseId}`);
    const courseSummary = stripHtml(course.summary || '');
    if (courseSummary.length > 80) {
      documents.push({
        sourceType: 'course', sourceId: `course:${courseId}:summary`,
        title: `${courseName} — Course overview`,
        sourceUrl: safeLmsUrl(course.viewurl, `${LMS_ORIGIN}/course/view.php?id=${courseId}`),
        courseName, text: courseSummary
      });
    }

    let sections;
    try {
      sections = await callMoodle(token, 'core_course_get_contents', { courseid: courseId });
    } catch (error) {
      if (error.code === 'invalidtoken') throw error;
      warnings.push(`${courseName}: course contents are not available through the current Moodle service (${friendlyMoodleMessage(error.code, error.message)})`);
      continue;
    }
    if (!Array.isArray(sections)) continue;

    for (const section of sections) {
      const sectionName = String(section.name || section.sectionname || `Section ${section.section ?? ''}`).trim();
      for (const module of (section.modules || [])) {
        const moduleName = String(module.name || module.modname || 'Course resource').slice(0, 300);
        const moduleUrl = safeLmsUrl(module.url, `${LMS_ORIGIN}/course/view.php?id=${courseId}`);
        const baseTitle = `${courseName} — ${sectionName} — ${moduleName}`.slice(0, 480);
        const inlineParts = [stripHtml(module.description || '')];
        for (const content of (module.contents || [])) {
          if (content.content) inlineParts.push(stripHtml(content.content));
        }
        const inlineText = inlineParts.filter(Boolean).join('\n\n').trim();
        if (inlineText.length > 80) {
          documents.push({
            sourceType: 'course', sourceId: `module:${courseId}:${module.id || module.instance || moduleName}:text`,
            title: baseTitle, sourceUrl: moduleUrl, courseName, text: inlineText
          });
        }

        for (const file of (module.contents || [])) {
          if (filesAttempted >= maxFiles) break;
          if (!file.fileurl || (file.type && file.type !== 'file')) continue;
          const fileUrl = safeLmsUrl(file.fileurl, null);
          if (!fileUrl) continue;
          if (Number(file.filesize || 0) > maxBytes) {
            warnings.push(`${file.filename || 'A course file'} in ${courseName} was skipped because it exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB limit.`);
            continue;
          }
          try {
            filesAttempted += 1;
            const response = await downloadMoodleFile(fileUrl, token);
            if (!response.ok) throw new Error(`Moodle file download returned HTTP ${response.status}`);
            const declaredLength = Number(response.headers.get('content-length') || 0);
            if (declaredLength > maxBytes) throw new Error('File exceeds the configured size limit');
            const buffer = Buffer.from(await response.arrayBuffer());
            if (buffer.length > maxBytes) throw new Error('File exceeds the configured size limit');
            const filename = String(file.filename || file.name || 'resource').slice(0, 240);
            const text = await extractDocumentText(buffer, filename, file.mimetype || response.headers.get('content-type') || '');
            filesDownloaded += 1;
            if (text.length > 80) {
              documents.push({
                sourceType: 'course', sourceId: `file:${courseId}:${file.filepath || ''}:${filename}`,
                title: `${baseTitle} — ${filename}`.slice(0, 500),
                sourceUrl: moduleUrl, courseName, text
              });
            } else {
              warnings.push(`${filename} in ${courseName} was downloaded but contained no extractable text or used an unsupported format.`);
            }
          } catch (error) {
            warnings.push(`${file.filename || 'A course file'} in ${courseName} could not be downloaded or extracted. Check the file type, size limit and Moodle file permissions.`);
          }
        }
      }
      if (filesAttempted >= maxFiles) break;
    }
  }
  if (rawCourses.length > maxCourses) warnings.push(`Course-content sync was limited to the first ${maxCourses} enrolled courses.`);
  if (filesAttempted >= maxFiles && maxFiles > 0) warnings.push(`File download attempt limit reached (${maxFiles} files per sync).`);
  return { documents, warnings, filesDownloaded };
}

function normalizeCalendarEvent(event, courseNames) {
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

async function insertItems(client, userId, items) {
  for (const item of items) {
    const encrypted = encryptSecret(JSON.stringify(item.payload));
    await client.query(
      `INSERT INTO lms_items
        (user_id, item_type, source_key, payload_ciphertext, payload_iv, payload_tag, content_hash, last_seen_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
       ON CONFLICT (user_id, source_key) DO UPDATE SET
         item_type = EXCLUDED.item_type,
         payload_ciphertext = EXCLUDED.payload_ciphertext,
         payload_iv = EXCLUDED.payload_iv,
         payload_tag = EXCLUDED.payload_tag,
         content_hash = EXCLUDED.content_hash,
         last_seen_at = NOW(), updated_at = NOW()`,
      [userId, item.item_type, item.source_key, encrypted.ciphertext, encrypted.iv, encrypted.tag, item.content_hash]
    );
  }
}

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

async function runSync(userId) {
  const accountResult = await pool.query(
    `SELECT token_ciphertext, token_iv, token_tag, moodle_user_id, status, auth_method
     FROM lms_accounts WHERE user_id = $1`,
    [userId]
  );
  if (!accountResult.rowCount || !accountResult.rows[0].token_ciphertext) {
    const error = new Error('Connect your BennettTech iLearn account first.');
    error.statusCode = 404;
    throw error;
  }
  const account = accountResult.rows[0];
  if (account.status !== 'connected' || account.auth_method !== 'moodle_token') {
    const error = new Error('Your iLearn connection needs to be renewed. Connect iLearn again.');
    error.statusCode = 401;
    throw error;
  }

  const token = decryptSecret({
    ciphertext: account.token_ciphertext,
    iv: account.token_iv,
    tag: account.token_tag
  });

  const runResult = await pool.query(
    `INSERT INTO lms_sync_runs (user_id, status) VALUES ($1, 'running') RETURNING id`,
    [userId]
  );
  const runId = runResult.rows[0].id;
  let apiCalls = 0;

  try {
    const siteInfo = await callMoodle(token, 'core_webservice_get_site_info');
    apiCalls += 1;
    if (!siteInfo?.userid || Number(siteInfo.userid) !== Number(account.moodle_user_id)) {
      throw new MoodleApiError('invalidtoken', 'The saved token no longer matches the connected iLearn account.');
    }

    const rawCourses = await callMoodle(token, 'core_enrol_get_users_courses', { userid: siteInfo.userid });
    apiCalls += 1;
    if (!Array.isArray(rawCourses)) {
      throw new MoodleApiError('unexpected_courses_response', 'iLearn did not return the enrolled courses list.');
    }

    const courses = rawCourses
      .filter(course => course && Number.isFinite(Number(course.id)))
      .map(normalizeCourse);
    const courseNames = new Map(
      rawCourses.map(course => [Number(course.id), String(course.fullname || course.shortname || '')])
    );
    const courseIds = rawCourses
      .map(course => Number(course.id))
      .filter(id => Number.isSafeInteger(id) && id > 0)
      .slice(0, 150);

    const now = Math.floor(Date.now() / 1000);
    const calendarParams = {
      'options[userevents]': 1,
      'options[siteevents]': 1,
      'options[timestart]': now - (30 * 24 * 60 * 60),
      'options[timeend]': now + (365 * 24 * 60 * 60),
      'options[ignorehidden]': 1
    };
    courseIds.forEach((id, index) => {
      calendarParams[`events[courseids][${index}]`] = id;
    });

    let calendarItems = [];
    let calendarWarning = null;
    let calendarAvailable = false;
    try {
      const calendarResult = await callMoodle(token, 'core_calendar_get_calendar_events', calendarParams);
      apiCalls += 1;
      if (!Array.isArray(calendarResult?.events)) {
        throw new MoodleApiError('unexpected_calendar_response', 'iLearn did not return calendar events in the expected format.');
      }
      calendarItems = calendarResult.events
        .filter(event => event && Number(event.timestart || 0) > 0)
        .map(event => normalizeCalendarEvent(event, courseNames));
      calendarAvailable = true;
      if (Array.isArray(calendarResult.warnings) && calendarResult.warnings.length) {
        calendarWarning = calendarResult.warnings.map(warning => warning.message).filter(Boolean).join('; ').slice(0, 400) || null;
      }
    } catch (error) {
      if (error.code === 'invalidtoken') throw error;
      calendarWarning = friendlyMoodleMessage(error.code, error.message);
    }

    let courseDocuments = [];
    let contentWarnings = [];
    let filesDownloaded = 0;
    if (process.env.LMS_CONTENT_SYNC !== 'false') {
      const collected = await collectCourseDocuments(token, rawCourses);
      courseDocuments = collected.documents;
      contentWarnings = collected.warnings;
      filesDownloaded = collected.filesDownloaded;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `DELETE FROM lms_items WHERE user_id = $1 AND item_type NOT IN ('course', 'calendar')`,
        [userId]
      );
      await client.query(`DELETE FROM lms_items WHERE user_id = $1 AND item_type = 'course'`, [userId]);
      await insertItems(client, userId, courses);
      if (calendarAvailable) {
        await client.query(`DELETE FROM lms_items WHERE user_id = $1 AND item_type = 'calendar'`, [userId]);
        await insertItems(client, userId, calendarItems);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    let indexing = { documents_indexed: 0, chunks_indexed: 0, skipped: 0, warnings: [] };
    if (courseDocuments.length) {
      try {
        indexing = await indexTextDocuments(userId, courseDocuments);
      } catch (error) {
        contentWarnings.push(`Course files were retrieved but indexing failed: ${String(error.message || error).slice(0, 220)}`);
      }
    }

    await pool.query(
      `UPDATE lms_accounts SET status = 'connected', last_synced_at = NOW(), updated_at = NOW()
       WHERE user_id = $1`,
      [userId]
    );

    const syncedCount = courses.length + (calendarAvailable ? calendarItems.length : 0);
    await pool.query(
      `UPDATE lms_sync_runs SET status = 'completed', items_found = $2, pages_visited = $3, finished_at = NOW()
       WHERE id = $1`,
      [runId, syncedCount, apiCalls]
    );

    return {
      synced: syncedCount,
      courses_synced: courses.length,
      calendar_synced: calendarAvailable ? calendarItems.length : null,
      calendar_available: calendarAvailable,
      api_calls: apiCalls,
      resources_downloaded: filesDownloaded,
      documents_indexed: indexing.documents_indexed,
      chunks_indexed: indexing.chunks_indexed,
      warnings: [calendarWarning, ...contentWarnings, ...(indexing.warnings || [])].filter(Boolean).slice(0, 20)
    };
  } catch (error) {
    if (error.code === 'invalidtoken') {
      await pool.query(
        `UPDATE lms_accounts SET status = 'reauth_required', updated_at = NOW() WHERE user_id = $1`,
        [userId]
      );
    }
    await pool.query(
      `UPDATE lms_sync_runs SET status = 'failed', pages_visited = $2, error_code = $3, finished_at = NOW()
       WHERE id = $1`,
      [runId, apiCalls, String(error.code || 'sync_failed').slice(0, 80)]
    );
    throw error;
  }
}

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
