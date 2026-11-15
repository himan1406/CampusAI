import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFile, readFile } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverDir = join(__dirname, '..');
const PORT = 4099;
const BASE_URL = `http://localhost:${PORT}`;

// Determine entry file (src/server.js if exists, otherwise src/index.js)
let entryFile = 'src/index.js';
try {
  await readFile(join(serverDir, 'src', 'server.js'));
  entryFile = 'src/server.js';
} catch {}

const endpoints = [
  // Root & Health
  { method: 'GET', path: '/' },
  { method: 'GET', path: '/api/v1/health/full' },
  { method: 'GET', path: '/api/v1/health' },

  // Auth
  { method: 'POST', path: '/api/v1/auth/signup' },
  { method: 'POST', path: '/api/v1/auth/login' },
  { method: 'POST', path: '/api/v1/auth/refresh' },
  { method: 'POST', path: '/api/v1/auth/logout' },
  { method: 'POST', path: '/api/v1/auth/mobile/signup' },
  { method: 'POST', path: '/api/v1/auth/mobile/login' },
  { method: 'POST', path: '/api/v1/auth/mobile/refresh' },
  { method: 'POST', path: '/api/v1/auth/mobile/logout' },
  { method: 'GET', path: '/api/v1/auth/me' },

  // Credentials
  { method: 'GET', path: '/api/v1/connections/credentials' },
  { method: 'PUT', path: '/api/v1/connections/credentials' },
  { method: 'DELETE', path: '/api/v1/connections/credentials/mycamu' },
  { method: 'DELETE', path: '/api/v1/connections/credentials/invalid' },

  // Email
  { method: 'GET', path: '/api/v1/email/connect/gmail' },
  { method: 'GET', path: '/api/v1/email/connect/outlook' },
  { method: 'GET', path: '/api/v1/email/connect/invalid' },
  { method: 'GET', path: '/api/v1/email/oauth/gmail/callback' },
  { method: 'GET', path: '/api/v1/email/oauth/outlook/callback' },
  { method: 'GET', path: '/api/v1/email/accounts' },
  { method: 'DELETE', path: '/api/v1/email/accounts/gmail' },
  { method: 'DELETE', path: '/api/v1/email/accounts/invalid' },
  { method: 'POST', path: '/api/v1/email/sync/gmail' },
  { method: 'POST', path: '/api/v1/email/sync/invalid' },
  { method: 'GET', path: '/api/v1/email/messages' },

  // LMS
  { method: 'GET', path: '/api/v1/lms/status' },
  { method: 'POST', path: '/api/v1/lms/connect' },
  { method: 'POST', path: '/api/v1/lms/sync' },
  { method: 'GET', path: '/api/v1/lms/items' },
  { method: 'DELETE', path: '/api/v1/lms/disconnect' },

  // Chat & Sessions
  { method: 'GET', path: '/api/v1/chat/sessions' },
  { method: 'POST', path: '/api/v1/chat/sessions' },
  { method: 'GET', path: '/api/v1/chat/sessions/00000000-0000-0000-0000-000000000000' },
  { method: 'DELETE', path: '/api/v1/chat/sessions/00000000-0000-0000-0000-000000000000' },
  { method: 'POST', path: '/api/v1/chat/answer' },
  { method: 'POST', path: '/api/v1/chat/messages' },

  // Attachments
  { method: 'GET', path: '/api/v1/chat/sessions/00000000-0000-0000-0000-000000000000/attachments' },
  { method: 'POST', path: '/api/v1/chat/sessions/00000000-0000-0000-0000-000000000000/attachments' },
  { method: 'DELETE', path: '/api/v1/chat/sessions/00000000-0000-0000-0000-000000000000/attachments/doc-1' },

  // Unknown route (404)
  { method: 'GET', path: '/api/v1/unknown-endpoint' }
];

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`${BASE_URL}/`);
      if (res.ok) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`Server did not start on port ${PORT} within 10 seconds.`);
}

console.log(`Starting server on port ${PORT} (${entryFile})...`);
const child = spawn(process.execPath, [entryFile], {
  cwd: serverDir,
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'inherit'
});

try {
  await waitForServer();
  console.log('Server is ready. Recording contract snapshot...');

  const results = {
    endpoints: {},
    cors: {},
    rateLimitHeaders: {}
  };

  for (const ep of endpoints) {
    const key = `${ep.method} ${ep.path}`;
    try {
      const options = {
        method: ep.method,
        headers: ep.method === 'POST' || ep.method === 'PUT' ? { 'Content-Type': 'application/json' } : {}
      };
      if (ep.method === 'POST' || ep.method === 'PUT') {
        options.body = '{}';
      }
      const res = await fetch(`${BASE_URL}${ep.path}`, options);
      const contentType = res.headers.get('content-type') || null;
      const hasRateLimit = Boolean(res.headers.get('ratelimit-limit') || res.headers.get('x-ratelimit-limit'));

      results.endpoints[key] = {
        status: res.status,
        contentType: contentType ? contentType.split(';')[0].trim() : null,
        hasRateLimit
      };
    } catch (err) {
      results.endpoints[key] = { error: err.message };
    }
  }

  // CORS checks
  // 1. Allowed origin preflight
  const preflightAllowed = await fetch(`${BASE_URL}/api/v1/auth/signup`, {
    method: 'OPTIONS',
    headers: {
      'Origin': 'http://localhost:5173',
      'Access-Control-Request-Method': 'POST'
    }
  });
  results.cors['preflight_allowed'] = {
    status: preflightAllowed.status,
    allowOrigin: preflightAllowed.headers.get('access-control-allow-origin'),
    allowCredentials: preflightAllowed.headers.get('access-control-allow-credentials'),
    allowMethods: preflightAllowed.headers.get('access-control-allow-methods')
  };

  // 2. Disallowed origin preflight
  const preflightDisallowed = await fetch(`${BASE_URL}/api/v1/auth/signup`, {
    method: 'OPTIONS',
    headers: {
      'Origin': 'http://disallowed-origin.example.com',
      'Access-Control-Request-Method': 'POST'
    }
  });
  results.cors['preflight_disallowed'] = {
    status: preflightDisallowed.status,
    allowOrigin: preflightDisallowed.headers.get('access-control-allow-origin')
  };

  // 3. Simple GET with allowed origin
  const getOriginAllowed = await fetch(`${BASE_URL}/`, {
    headers: { 'Origin': 'http://localhost:5173' }
  });
  results.cors['get_allowed_origin'] = {
    status: getOriginAllowed.status,
    allowOrigin: getOriginAllowed.headers.get('access-control-allow-origin')
  };

  // 4. Simple GET with disallowed origin
  const getOriginDisallowed = await fetch(`${BASE_URL}/`, {
    headers: { 'Origin': 'http://disallowed-origin.example.com' }
  });
  results.cors['get_disallowed_origin'] = {
    status: getOriginDisallowed.status,
    allowOrigin: getOriginDisallowed.headers.get('access-control-allow-origin')
  };

  // Save to file or compare
  const isBaseline = process.argv.includes('--baseline');
  const targetFile = isBaseline
    ? join(__dirname, 'contract-before.json')
    : join(__dirname, 'contract-after.json');

  await writeFile(targetFile, JSON.stringify(results, null, 2), 'utf8');
  console.log(`Saved contract snapshot to ${targetFile}`);

  if (!isBaseline) {
    const beforeRaw = await readFile(join(__dirname, 'contract-before.json'), 'utf8');
    const before = JSON.parse(beforeRaw);
    const diffs = [];
    for (const [k, v] of Object.entries(results.endpoints)) {
      const b = before.endpoints[k];
      if (!b) diffs.push(`New endpoint: ${k}`);
      else if (b.status !== v.status || b.contentType !== v.contentType) {
        diffs.push(`Mismatch on ${k}: before=${JSON.stringify(b)}, after=${JSON.stringify(v)}`);
      }
    }
    for (const [k, v] of Object.entries(results.cors)) {
      const b = before.cors[k];
      if (JSON.stringify(b) !== JSON.stringify(v)) {
        diffs.push(`CORS mismatch on ${k}: before=${JSON.stringify(b)}, after=${JSON.stringify(v)}`);
      }
    }
    if (diffs.length > 0) {
      console.error('❌ Contract diffs detected:');
      diffs.forEach(d => console.error('  - ' + d));
      process.exitCode = 1;
    } else {
      console.log('✓ Contract snapshot is 100% IDENTICAL before and after!');
    }
  }
} finally {
  child.kill();
}
