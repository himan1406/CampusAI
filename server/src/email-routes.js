import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { pool } from './db/pool.js';
import { requireUser } from './middleware/require-user.js';
import { encryptSecret, decryptSecret } from './lib/vault.js';
import { indexTextDocuments } from './modules/ai/rag/indexer.js';

export const emailRouter = Router();
const providers = new Set(['gmail', 'outlook']);
const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly'
];
const MICROSOFT_SCOPES = ['openid', 'profile', 'email', 'offline_access', 'User.Read', 'Mail.Read'];
const connectSchema = z.enum(['gmail', 'outlook']);
const syncSchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(25) });

function requireRealUser(req, res, next) {
  if (req.user?.dev) {
    return res.status(403).json({ error: 'Connect email accounts only after signing in with a real CampusOS account. Disable DEV_AUTH_BYPASS and use a student login.' });
  }
  next();
}

function redirectUri(provider, clientType = 'web') {
  const mobileConfigured = provider === 'gmail'
    ? process.env.GOOGLE_REDIRECT_URI_MOBILE
    : process.env.MICROSOFT_REDIRECT_URI_MOBILE;
  const configured = clientType === 'mobile' && mobileConfigured
    ? mobileConfigured
    : provider === 'gmail' ? process.env.GOOGLE_REDIRECT_URI : process.env.MICROSOFT_REDIRECT_URI;
  if (configured) return configured;
  const port = Number(process.env.PORT || 4000);
  return `http://localhost:${port}/api/v1/email/oauth/${provider}/callback`;
}

function providerConfig(provider, clientType = 'web', explicitRedirectUri = null) {
  if (provider === 'gmail') {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      throw new Error('Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in server/.env.');
    }
    return {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: explicitRedirectUri || redirectUri(provider, clientType)
    };
  }
  if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
    throw new Error('Microsoft OAuth is not configured. Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET in server/.env.');
  }
  const tenant = process.env.MICROSOFT_TENANT_ID || 'common';
  if (!/^[a-zA-Z0-9.-]+$/.test(tenant)) throw new Error('MICROSOFT_TENANT_ID contains invalid characters.');
  return {
    clientId: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    redirectUri: explicitRedirectUri || redirectUri(provider, clientType),
    tenant
  };
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}
function sha256(value) {
  return crypto.createHash('sha256').update(value).digest();
}
function hashState(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function frontendRedirect(status, provider, clientType = 'web') {
  if (clientType === 'mobile' || clientType === 'desktop') {
    const target = new URL('campusos://email-connected');
    target.searchParams.set('status', status);
    if (provider) target.searchParams.set('provider', provider);
    return target.toString();
  }
  const target = new URL(process.env.WEB_ORIGIN || 'http://localhost:5173');
  target.pathname = '/';
  target.searchParams.set('email_connection', status);
  if (provider) target.searchParams.set('provider', provider);
  return target.toString();
}

async function postForm(url, values) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== '') body.set(key, String(value));
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`OAuth provider returned HTTP ${response.status}`);
    error.providerStatus = response.status;
    error.providerStage = 'oauth_token';
    throw error;
  }
  return payload;
}

async function providerGet(url, accessToken, extraHeaders = {}) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, ...extraHeaders }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`Email provider returned HTTP ${response.status}`);
    error.providerStatus = response.status;
    error.providerStage = 'api';
    throw error;
  }
  return payload;
}

async function createAuthorizationUrl(userId, provider, clientType = 'web') {
  const config = providerConfig(provider, clientType);
  const state = crypto.randomBytes(32).toString('base64url');
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = base64url(sha256(verifier));
  const encryptedVerifier = encryptSecret(verifier);
  await pool.query('DELETE FROM email_oauth_states WHERE expires_at < NOW()');
  await pool.query(
    `INSERT INTO email_oauth_states
      (state_hash, user_id, provider, verifier_ciphertext, verifier_iv, verifier_tag, client_type, redirect_uri, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() + INTERVAL '10 minutes')`,
    [hashState(state), userId, provider, encryptedVerifier.ciphertext, encryptedVerifier.iv, encryptedVerifier.tag, clientType, config.redirectUri]
  );

  let authorizationUrl;
  if (provider === 'gmail') {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', config.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', GOOGLE_SCOPES.join(' '));
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    authorizationUrl = url.toString();
  } else {
    const url = new URL(`https://login.microsoftonline.com/${config.tenant}/oauth2/v2.0/authorize`);
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', config.redirectUri);
    url.searchParams.set('response_mode', 'query');
    url.searchParams.set('scope', MICROSOFT_SCOPES.join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    authorizationUrl = url.toString();
  }
  return authorizationUrl;
}

async function consumeState(state, provider) {
  const result = await pool.query(
    `DELETE FROM email_oauth_states
     WHERE state_hash = $1 AND provider = $2 AND expires_at > NOW()
     RETURNING user_id, verifier_ciphertext, verifier_iv, verifier_tag, client_type, redirect_uri`,
    [hashState(state), provider]
  );
  if (!result.rowCount) return null;
  const row = result.rows[0];
  return {
    userId: row.user_id,
    verifier: decryptSecret({ ciphertext: row.verifier_ciphertext, iv: row.verifier_iv, tag: row.verifier_tag }),
    clientType: row.client_type,
    redirectUri: row.redirect_uri
  };
}

async function exchangeAuthorizationCode(provider, code, verifier, redirectURI) {
  const config = providerConfig(provider, 'web', redirectURI);
  if (provider === 'gmail') {
    return postForm('https://oauth2.googleapis.com/token', {
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier
    });
  }
  return postForm(`https://login.microsoftonline.com/${config.tenant}/oauth2/v2.0/token`, {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
    code_verifier: verifier,
    scope: MICROSOFT_SCOPES.join(' ')
  });
}

async function getProviderProfile(provider, accessToken) {
  if (provider === 'gmail') {
    const profile = await providerGet('https://gmail.googleapis.com/gmail/v1/users/me/profile', accessToken);
    if (!profile.emailAddress) throw new Error('Google did not return a Gmail address.');
    return { id: profile.emailAddress.toLowerCase(), email: profile.emailAddress, name: null };
  }
  const profile = await providerGet(
    'https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName',
    accessToken
  );
  const email = profile.mail || profile.userPrincipalName;
  if (!profile.id || !email) throw new Error('Microsoft did not return a mailbox identity.');
  return { id: profile.id, email, name: profile.displayName || null };
}

async function saveAccount(userId, provider, profile, tokenResponse) {
  const existing = await pool.query(
    'SELECT token_ciphertext, token_iv, token_tag FROM email_accounts WHERE user_id = $1 AND provider = $2',
    [userId, provider]
  );
  let previousRefreshToken = null;
  if (existing.rowCount) {
    const previous = JSON.parse(decryptSecret({ ciphertext: existing.rows[0].token_ciphertext, iv: existing.rows[0].token_iv, tag: existing.rows[0].token_tag }));
    previousRefreshToken = previous.refresh_token || null;
  }
  const tokens = {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token || previousRefreshToken,
    token_type: tokenResponse.token_type || 'Bearer'
  };
  if (!tokens.refresh_token) {
    throw new Error('Provider did not issue a refresh token. Disconnect the app in provider settings and reconnect, then try again.');
  }
  const encrypted = encryptSecret(JSON.stringify(tokens));
  const expiresAt = new Date(Date.now() + Math.max(60, Number(tokenResponse.expires_in || 3600)) * 1000);
  const scopes = String(tokenResponse.scope || (provider === 'gmail' ? GOOGLE_SCOPES.join(' ') : MICROSOFT_SCOPES.join(' '))).split(' ');
  await pool.query(
    `INSERT INTO email_accounts
      (user_id, provider, provider_account_id, email_address, display_name,
       token_ciphertext, token_iv, token_tag, scopes, expires_at, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'connected')
     ON CONFLICT (user_id, provider) DO UPDATE SET
       provider_account_id = EXCLUDED.provider_account_id,
       email_address = EXCLUDED.email_address,
       display_name = EXCLUDED.display_name,
       token_ciphertext = EXCLUDED.token_ciphertext,
       token_iv = EXCLUDED.token_iv,
       token_tag = EXCLUDED.token_tag,
       scopes = EXCLUDED.scopes,
       expires_at = EXCLUDED.expires_at,
       status = 'connected', updated_at = NOW()`,
    [userId, provider, profile.id, profile.email, profile.name, encrypted.ciphertext, encrypted.iv, encrypted.tag, scopes, expiresAt]
  );
}

async function getFreshTokens(userId, provider) {
  const result = await pool.query(
    `SELECT token_ciphertext, token_iv, token_tag, expires_at, status
     FROM email_accounts WHERE user_id = $1 AND provider = $2`,
    [userId, provider]
  );
  if (!result.rowCount) {
    const error = new Error(`${provider} is not connected.`);
    error.statusCode = 404;
    throw error;
  }
  const row = result.rows[0];
  if (row.status !== 'connected') {
    const error = new Error(`${provider} needs to be reconnected.`);
    error.statusCode = 409;
    throw error;
  }
  const tokens = JSON.parse(decryptSecret({ ciphertext: row.token_ciphertext, iv: row.token_iv, tag: row.token_tag }));
  if (row.expires_at && new Date(row.expires_at).getTime() > Date.now() + 120000) return tokens;
  if (!tokens.refresh_token) {
    await pool.query("UPDATE email_accounts SET status = 'reauth_required', updated_at = NOW() WHERE user_id = $1 AND provider = $2", [userId, provider]);
    const error = new Error(`${provider} authorization expired. Reconnect this account.`);
    error.statusCode = 401;
    throw error;
  }

  const config = providerConfig(provider);
  let refreshed;
  if (provider === 'gmail') {
    refreshed = await postForm('https://oauth2.googleapis.com/token', {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token'
    });
  } else {
    refreshed = await postForm(`https://login.microsoftonline.com/${config.tenant}/oauth2/v2.0/token`, {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token',
      scope: MICROSOFT_SCOPES.join(' ')
    });
  }
  const nextTokens = {
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token || tokens.refresh_token,
    token_type: refreshed.token_type || tokens.token_type || 'Bearer'
  };
  const encrypted = encryptSecret(JSON.stringify(nextTokens));
  const expiresAt = new Date(Date.now() + Math.max(60, Number(refreshed.expires_in || 3600)) * 1000);
  await pool.query(
    `UPDATE email_accounts SET token_ciphertext=$3, token_iv=$4, token_tag=$5,
       expires_at=$6, status='connected', updated_at=NOW()
     WHERE user_id=$1 AND provider=$2`,
    [userId, provider, encrypted.ciphertext, encrypted.iv, encrypted.tag, expiresAt]
  );
  return nextTokens;
}

function headerValue(headers, name) {
  return headers?.find(h => String(h.name).toLowerCase() === name.toLowerCase())?.value || '';
}
function decodeBase64Url(value) {
  if (!value) return '';
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}
function stripHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
}
function collectGmailBody(part, output) {
  if (!part) return;
  if (part.mimeType === 'text/plain' && part.body?.data) output.plain.push(decodeBase64Url(part.body.data));
  if (part.mimeType === 'text/html' && part.body?.data) output.html.push(decodeBase64Url(part.body.data));
  for (const child of part.parts || []) collectGmailBody(child, output);
}
function parseFrom(value) {
  const match = String(value || '').match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1].replace(/^"|"$/g, ''), email: match[2] };
  return { name: '', email: String(value || '').trim() };
}

async function fetchGmailMessages(accessToken, limit) {
  const list = await providerGet(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${limit}&q=${encodeURIComponent('in:inbox')}`,
    accessToken
  );
  const ids = list.messages || [];
  const messages = [];
  for (let i = 0; i < ids.length; i += 5) {
    const batch = ids.slice(i, i + 5);
    const rows = await Promise.all(batch.map(async item => {
      const message = await providerGet(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=full`,
        accessToken
      );
      const headers = message.payload?.headers || [];
      const from = parseFrom(headerValue(headers, 'From'));
      const bodyParts = { plain: [], html: [] };
      collectGmailBody(message.payload, bodyParts);
      const body = bodyParts.plain.join('\n') || stripHtml(bodyParts.html.join('\n')) || message.snippet || '';
      const threadId = message.threadId || item.threadId || null;
      return {
        provider_message_id: message.id,
        provider_thread_id: threadId,
        subject: headerValue(headers, 'Subject') || '(no subject)',
        from_name: from.name || null,
        from_email: from.email || null,
        received_at: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : null,
        snippet: message.snippet || '',
        body_text: body.slice(0, 100000),
        is_read: !(message.labelIds || []).includes('UNREAD'),
        web_url: threadId ? `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(threadId)}` : null
      };
    }));
    messages.push(...rows);
  }
  return messages;
}

async function fetchOutlookMessages(accessToken, limit) {
  const select = 'id,conversationId,subject,from,receivedDateTime,bodyPreview,body,isRead,webLink';
  const url = new URL('https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages');
  url.searchParams.set('$top', String(limit));
  url.searchParams.set('$select', select);
  url.searchParams.set('$orderby', 'receivedDateTime desc');
  const payload = await providerGet(url.toString(), accessToken, {
    Prefer: 'outlook.body-content-type="text", IdType="ImmutableId"'
  });
  return (payload.value || []).map(message => ({
    provider_message_id: message.id,
    provider_thread_id: message.conversationId || null,
    subject: message.subject || '(no subject)',
    from_name: message.from?.emailAddress?.name || null,
    from_email: message.from?.emailAddress?.address || null,
    received_at: message.receivedDateTime || null,
    snippet: message.bodyPreview || '',
    body_text: String(message.body?.content || message.bodyPreview || '').slice(0, 100000),
    is_read: Boolean(message.isRead),
    web_url: message.webLink || null
  }));
}

async function upsertMessages(userId, provider, messages) {
  let count = 0;
  for (const message of messages) {
    // Encrypt all human-readable message content, not just the body.
    const encryptedContent = encryptSecret(JSON.stringify({
      subject: message.subject || '(no subject)',
      from_name: message.from_name || null,
      from_email: message.from_email || null,
      snippet: message.snippet || '',
      body_text: message.body_text || ''
    }));
    await pool.query(
      `INSERT INTO email_messages
        (user_id, provider, provider_message_id, provider_thread_id, received_at,
         content_ciphertext, content_iv, content_tag, is_read, web_url, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
       ON CONFLICT (user_id, provider, provider_message_id) DO UPDATE SET
         provider_thread_id=EXCLUDED.provider_thread_id, received_at=EXCLUDED.received_at,
         content_ciphertext=EXCLUDED.content_ciphertext, content_iv=EXCLUDED.content_iv,
         content_tag=EXCLUDED.content_tag, is_read=EXCLUDED.is_read,
         web_url=EXCLUDED.web_url, synced_at=NOW(), updated_at=NOW()`,
      [userId, provider, message.provider_message_id, message.provider_thread_id,
        message.received_at, encryptedContent.ciphertext, encryptedContent.iv,
        encryptedContent.tag, message.is_read, message.web_url]
    );
    count += 1;
  }
  await pool.query(
    'UPDATE email_accounts SET last_sync_at=NOW(), updated_at=NOW() WHERE user_id=$1 AND provider=$2',
    [userId, provider]
  );
  let indexing = { documents_indexed: 0, chunks_indexed: 0, warnings: [] };
  try {
    indexing = await indexTextDocuments(userId, messages.map(message => ({
      sourceType: 'email',
      sourceId: `email:${provider}:${message.provider_message_id}`,
      title: `${message.subject || '(no subject)'} — ${message.from_name || message.from_email || provider}`,
      sourceUrl: message.web_url || null,
      text: `Subject: ${message.subject || ''}\nFrom: ${message.from_name || ''} <${message.from_email || ''}>\nDate: ${message.received_at || ''}\n\n${message.snippet || ''}\n\n${String(message.body_text || '').slice(0, 18000)}`
    })));
  } catch (error) {
    indexing.warnings = [`Email sync succeeded, but AI indexing failed: ${String(error.message || error).slice(0, 200)}`];
  }
  return { count, indexing };
}

// Start OAuth. The caller must be a real, authenticated CampusOS student.
emailRouter.get('/connect/:provider', requireUser, requireRealUser, async (req, res, next) => {
  const parsed = connectSchema.safeParse(req.params.provider);
  if (!parsed.success) return res.status(400).json({ error: 'Provider must be gmail or outlook.' });
  try {
    const clientType = z.enum(['web', 'desktop', 'mobile']).safeParse(req.query.client || 'web');
    if (!clientType.success) return res.status(400).json({ error: 'client must be web, desktop or mobile' });
    const authorization_url = await createAuthorizationUrl(req.user.id, parsed.data, clientType.data);
    res.json({ provider: parsed.data, client: clientType.data, authorization_url });
  } catch (error) { next(error); }
});

// OAuth callbacks are public routes; a short-lived, one-use state value binds them to the student.
for (const provider of providers) {
  emailRouter.get(`/oauth/${provider}/callback`, async (req, res) => {
    let callbackClient = 'web';
    try {
      const { code, state, error } = req.query;
      if (typeof state !== 'string') return res.redirect(frontendRedirect('failed', provider));
      const oauthState = await consumeState(state, provider);
      if (!oauthState) return res.redirect(frontendRedirect('state_expired', provider));
      callbackClient = oauthState.clientType;
      if (error || typeof code !== 'string') return res.redirect(frontendRedirect('denied', provider, callbackClient));
      const tokenResponse = await exchangeAuthorizationCode(provider, code, oauthState.verifier, oauthState.redirectUri);
      const profile = await getProviderProfile(provider, tokenResponse.access_token);
      await saveAccount(oauthState.userId, provider, profile, tokenResponse);
      return res.redirect(frontendRedirect('connected', provider, callbackClient));
    } catch (callbackError) {
      console.error(`[CampusOS ${provider} OAuth]`, callbackError?.message || 'Callback failed');
      return res.redirect(frontendRedirect('failed', provider, callbackClient));
    }
  });
}

emailRouter.get('/accounts', requireUser, requireRealUser, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT provider, email_address, display_name, scopes, status, last_sync_at, created_at, updated_at
       FROM email_accounts WHERE user_id=$1 ORDER BY provider`, [req.user.id]
    );
    res.json({ accounts: result.rows });
  } catch (error) { next(error); }
});

emailRouter.delete('/accounts/:provider', requireUser, requireRealUser, async (req, res, next) => {
  const parsed = connectSchema.safeParse(req.params.provider);
  if (!parsed.success) return res.status(400).json({ error: 'Provider must be gmail or outlook.' });
  try {
    const result = await pool.query(
      'DELETE FROM email_accounts WHERE user_id=$1 AND provider=$2 RETURNING id',
      [req.user.id, parsed.data]
    );
    await pool.query('DELETE FROM email_messages WHERE user_id=$1 AND provider=$2', [req.user.id, parsed.data]);
    await pool.query("DELETE FROM ai_documents WHERE user_id=$1 AND source_type='email' AND source_id LIKE $2", [req.user.id, `email:${parsed.data}:%`]);
    if (!result.rowCount) return res.status(404).json({ error: 'Email account is not connected.' });
    res.status(204).end();
  } catch (error) { next(error); }
});

emailRouter.post('/sync/:provider', requireUser, requireRealUser, async (req, res, next) => {
  const parsedProvider = connectSchema.safeParse(req.params.provider);
  const parsedBody = syncSchema.safeParse(req.body || {});
  if (!parsedProvider.success) return res.status(400).json({ error: 'Provider must be gmail or outlook.' });
  if (!parsedBody.success) return res.status(400).json({ error: parsedBody.error.flatten() });
  const provider = parsedProvider.data;
  try {
    const tokens = await getFreshTokens(req.user.id, provider);
    const messages = provider === 'gmail'
      ? await fetchGmailMessages(tokens.access_token, parsedBody.data.limit)
      : await fetchOutlookMessages(tokens.access_token, parsedBody.data.limit);
    const sync = await upsertMessages(req.user.id, provider, messages);
    res.json({
      provider, synced: sync.count,
      indexed_documents: sync.indexing.documents_indexed || 0,
      indexed_chunks: sync.indexing.chunks_indexed || 0,
      warnings: sync.indexing.warnings || [],
      message: `Synced ${sync.count} messages and indexed ${sync.indexing.documents_indexed || 0} for Campus AI.`
    });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    if ((error.providerStage === 'oauth_token' && [400, 401].includes(error.providerStatus)) ||
        (error.providerStage === 'api' && [401, 403].includes(error.providerStatus))) {
      await pool.query("UPDATE email_accounts SET status='reauth_required', updated_at=NOW() WHERE user_id=$1 AND provider=$2", [req.user.id, provider]).catch(() => {});
      return res.status(409).json({ error: 'The provider rejected this connection. Reconnect the account and check that the required permissions were granted.' });
    }
    next(error);
  }
});

emailRouter.get('/messages', requireUser, requireRealUser, async (req, res, next) => {
  const provider = req.query.provider;
  if (provider !== undefined && !providers.has(provider)) return res.status(400).json({ error: 'Provider must be gmail or outlook.' });
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit || '50', 10) || 50));
  const search = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 200).toLowerCase() : '';
  try {
    const values = [req.user.id];
    let where = 'user_id=$1';
    if (provider) { values.push(provider); where += ` AND provider=$${values.length}`; }
    // Search is applied after decryption so message content never needs plaintext DB indexes.
    const candidateLimit = search ? Math.min(500, limit * 10) : limit;
    values.push(candidateLimit);
    const result = await pool.query(
      `SELECT id, provider, provider_message_id, provider_thread_id, received_at,
        content_ciphertext, content_iv, content_tag, is_read, web_url, synced_at
       FROM email_messages WHERE ${where}
       ORDER BY received_at DESC NULLS LAST LIMIT $${values.length}`,
      values
    );
    let messages = result.rows.map(row => {
      const { content_ciphertext, content_iv, content_tag, ...metadata } = row;
      const content = JSON.parse(decryptSecret({ ciphertext: content_ciphertext, iv: content_iv, tag: content_tag }));
      return { ...metadata, ...content };
    });
    if (search) {
      messages = messages.filter(message =>
        [message.subject, message.from_name, message.from_email, message.snippet, message.body_text]
          .some(value => String(value || '').toLowerCase().includes(search))
      );
    }
    res.json({ messages: messages.slice(0, limit) });
  } catch (error) { next(error); }
});
