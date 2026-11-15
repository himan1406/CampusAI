// Real-flow smoke test for the CampusOS API.
// Runs the server against a THROWAWAY database and exercises DB-backed flows end to end.
// Usage: SMOKE_DATABASE_URL=postgres://... node scripts/smoke-test.mjs
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { accessSync, constants } from 'node:fs';

const serverDir = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.SMOKE_PORT || 4098);
const BASE = `http://localhost:${PORT}`;
const DB_URL = process.env.SMOKE_DATABASE_URL;
const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';

let entry = process.env.SMOKE_ENTRY || 'src/server.js';
if (!process.env.SMOKE_ENTRY) {
  try { accessSync(join(serverDir, 'src', 'server.js'), constants.R_OK); } catch { entry = 'src/index.js'; }
}

if (!DB_URL) {
  console.error('SMOKE_DATABASE_URL is required (point it at a throwaway database, never the real one).');
  process.exit(1);
}

const lines = [];
let pass = 0, fail = 0, skip = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; lines.push(`  PASS  ${name}`); }
  else { fail++; lines.push(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); }
};
const note = (name) => { skip++; lines.push(`  SKIP  ${name}`); };

const child = spawn(process.execPath, [entry], {
  cwd: serverDir,
  env: { ...process.env, DATABASE_URL: DB_URL, PORT: String(PORT), NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'pipe']
});
let serverLog = '';
child.stdout.on('data', d => { serverLog += d; });
child.stderr.on('data', d => { serverLog += d; });
const stop = () => { try { child.kill(); } catch {} };
process.on('exit', stop);

async function waitReady() {
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(BASE + '/'); if (r.status === 200) return true; } catch {}
    if (child.exitCode !== null) return false;
    await sleep(500);
  }
  return false;
}

async function ollamaModels() {
  try {
    const r = await fetch(OLLAMA + '/api/tags');
    const body = await r.json();
    const names = new Set();
    for (const m of body.models || []) { names.add(m.name); names.add(String(m.name).split(':')[0]); }
    return names;
  } catch { return new Set(); }
}

const unique = Date.now().toString(36);
const email = `smoke_${unique}@example.com`;
const phone = '9876543210';
const password = 'SmokeTestPass123!';

async function main() {
  if (!(await waitReady())) {
    lines.push('  FAIL  server did not become ready');
    fail++;
    return;
  }

  // 1. Root + routing quirk
  const root = await fetch(BASE + '/');
  const rootBody = await root.json().catch(() => ({}));
  check('GET / returns 200 CampusOS API', root.status === 200 && rootBody.name === 'CampusOS API', `status=${root.status}`);

  const health = await fetch(BASE + '/api/v1/health');
  check('GET /api/v1/health returns 401 (router shadowing preserved)', health.status === 401, `status=${health.status}`);

  // 2. Signup
  const signup = await fetch(BASE + '/api/v1/auth/signup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ full_name: 'Smoke Test', email, phone_number: phone, password })
  });
  const signupBody = await signup.json().catch(() => ({}));
  if (signup.status === 403) {
    lines.push(`  ABORT signup blocked by ALLOWED_EMAIL_DOMAIN: ${signupBody.error}`);
    fail++;
    return;
  }
  check('POST /auth/signup returns 201', signup.status === 201, `status=${signup.status} ${JSON.stringify(signupBody).slice(0, 160)}`);
  const setCookie = signup.headers.get('set-cookie') || '';
  check('signup sets campusos_refresh cookie (path=/api/v1/auth)', /campusos_refresh=/.test(setCookie) && /Path=\/api\/v1\/auth/i.test(setCookie), setCookie.slice(0, 120));
  const refreshCookie = (setCookie.match(/campusos_refresh=[^;]+/) || [''])[0];
  const accessToken = signupBody.access_token;
  check('signup returns access_token + user', Boolean(accessToken) && Boolean(signupBody.user?.id), JSON.stringify(signupBody).slice(0, 160));

  // 3. Login
  const login = await fetch(BASE + '/api/v1/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, phone_number: phone, password })
  });
  const loginBody = await login.json().catch(() => ({}));
  check('POST /auth/login returns 200 with access_token', login.status === 200 && Boolean(loginBody.access_token), `status=${login.status}`);

  // 4. Authenticated /me
  const me = await fetch(BASE + '/api/v1/auth/me', { headers: { Authorization: `Bearer ${accessToken}` } });
  const meBody = await me.json().catch(() => ({}));
  check('GET /auth/me returns the signed-up user', me.status === 200 && meBody.user?.email === email, `status=${me.status} email=${meBody.user?.email}`);

  // 5. Chat session lifecycle (DB-backed)
  const created = await fetch(BASE + '/api/v1/chat/sessions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ mode: 'global' })
  });
  const createdBody = await created.json().catch(() => ({}));
  check('POST /chat/sessions returns 201', created.status === 201 && Boolean(createdBody.session?.id), `status=${created.status}`);
  const sessionId = createdBody.session?.id;

  const list = await fetch(BASE + '/api/v1/chat/sessions', { headers: { Authorization: `Bearer ${accessToken}` } });
  const listBody = await list.json().catch(() => ({}));
  check('GET /chat/sessions lists the new session', list.status === 200 && (listBody.sessions || []).some(s => s.id === sessionId), `status=${list.status}`);

  const detail = await fetch(`${BASE}/api/v1/chat/sessions/${sessionId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const detailBody = await detail.json().catch(() => ({}));
  check('GET /chat/sessions/:id returns session + messages[]', detail.status === 200 && detailBody.session?.id === sessionId && Array.isArray(detailBody.messages), `status=${detail.status}`);

  const atts = await fetch(`${BASE}/api/v1/chat/sessions/${sessionId}/attachments`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const attsBody = await atts.json().catch(() => ({}));
  check('GET /chat/sessions/:id/attachments returns [] + limits', atts.status === 200 && Array.isArray(attsBody.attachments) && Boolean(attsBody.limits), `status=${atts.status}`);

  // 6. Attachment upload (needs the embedding model)
  const models = await ollamaModels();
  if (models.has('nomic-embed-text')) {
    const fd = new FormData();
    const text = 'CampusOS smoke test document. '.repeat(20);
    fd.append('files', new Blob([text], { type: 'text/plain' }), 'smoke.txt');
    const up = await fetch(`${BASE}/api/v1/chat/sessions/${sessionId}/attachments`, {
      method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: fd
    });
    const upBody = await up.json().catch(() => ({}));
    check('POST attachment indexes a txt file (201)', up.status === 201 && (upBody.results || []).some(r => r.ok), `status=${up.status} ${JSON.stringify(upBody).slice(0, 160)}`);
    const del = await fetch(`${BASE}/api/v1/chat/sessions/${sessionId}/attachments/${(upBody.results || [])[0]?.id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` }
    });
    check('DELETE attachment returns 204', del.status === 204, `status=${del.status}`);
  } else {
    note('attachment upload (nomic-embed-text not pulled in Ollama)');
  }

  // 7. Refresh + logout (cookie flow)
  const refresh = await fetch(BASE + '/api/v1/auth/refresh', { method: 'POST', headers: { Cookie: refreshCookie } });
  const refreshBody = await refresh.json().catch(() => ({}));
  check('POST /auth/refresh rotates cookie -> 200 access_token', refresh.status === 200 && Boolean(refreshBody.access_token), `status=${refresh.status}`);

  const logout = await fetch(BASE + '/api/v1/auth/logout', { method: 'POST', headers: { Cookie: refreshCookie } });
  check('POST /auth/logout returns 204', logout.status === 204, `status=${logout.status}`);

  // 8. Streaming chat (needs the chat model) - SSE event names must be unchanged
  if (models.has(process.env.OLLAMA_MODEL || 'qwen2.5:3b')) {
    const res = await fetch(BASE + '/api/v1/chat/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ session_id: sessionId, message: 'Reply with the single word: ok' })
    });
    const text = await res.text();
    check('POST /chat/messages streams message.start/delta/done',
      res.status === 200 && text.includes('event: message.start') && text.includes('event: message.done'),
      `status=${res.status} len=${text.length}`);
  } else {
    note(`streaming chat (${process.env.OLLAMA_MODEL || 'qwen2.5:3b'} not pulled in Ollama)`);
  }

  // 9. Session delete (DB-backed cleanup)
  const delSession = await fetch(`${BASE}/api/v1/chat/sessions/${sessionId}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` }
  });
  check('DELETE /chat/sessions/:id returns 204', delSession.status === 204, `status=${delSession.status}`);
}

main()
  .catch(error => { lines.push(`  FAIL  uncaught: ${error?.stack || error}`); fail++; })
  .finally(() => {
    stop();
    console.log('\n=== CampusOS smoke test ===');
    console.log(lines.join('\n'));
    console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
    if (fail && serverLog) console.log('\n--- server log (tail) ---\n' + serverLog.split('\n').slice(-25).join('\n'));
    process.exit(fail ? 1 : 0);
  });
