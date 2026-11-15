import { pool } from '../../db/pool.js';
import { encryptSecret, decryptSecret } from '../../lib/vault.js';
import { extractDocumentText } from '../ai/rag/extract.js';
import { indexTextDocuments } from '../ai/rag/indexer.js';
import {
  LMS_ORIGIN,
  MoodleApiError,
  friendlyMoodleMessage,
  callMoodle,
  downloadMoodleFile,
  stripHtml,
  safeLmsUrl
} from './moodle.client.js';
import { normalizeCourse, normalizeCalendarEvent } from './normalize.js';

export const activeSyncs = new Set();

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

export async function runSync(userId) {
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
