import '../../config/env.js';

const LMS_ORIGIN = new URL(process.env.LMS_BASE_URL || 'https://lms.bennett.edu.in').origin;
const TOKEN_URL = `${LMS_ORIGIN}/login/token.php`;
const REST_URL = `${LMS_ORIGIN}/webservice/rest/server.php`;
const TOKEN_SERVICE = process.env.LMS_TOKEN_SERVICE || 'moodle_mobile_app';

export { LMS_ORIGIN, TOKEN_URL, REST_URL, TOKEN_SERVICE };

export class MoodleApiError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MoodleApiError';
    this.code = code || 'moodle_error';
  }
}

export function friendlyMoodleMessage(code, message = '') {
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

export async function postMoodleForm(url, form) {
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

export async function callMoodle(token, functionName, params = {}) {
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

export function stripHtml(value = '') {
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

export function safeLmsUrl(candidate, fallback) {
  try {
    const url = new URL(candidate || fallback, LMS_ORIGIN);
    if (url.origin !== LMS_ORIGIN) return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

export async function downloadMoodleFile(fileUrl, token) {
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
