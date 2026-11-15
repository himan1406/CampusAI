import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';
import { encryptSecret, decryptSecret } from '../../lib/vault.js';

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly'
];
export const MICROSOFT_SCOPES = ['openid', 'profile', 'email', 'offline_access', 'User.Read', 'Mail.Read'];

export function requireRealUser(req, res, next) {
  if (req.user?.dev) {
    return res.status(403).json({ error: 'Connect email accounts only after signing in with a real CampusOS account. Disable DEV_AUTH_BYPASS and use a student login.' });
  }
  next();
}

export function redirectUri(provider, clientType = 'web') {
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

export function providerConfig(provider, clientType = 'web', explicitRedirectUri = null) {
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
export function frontendRedirect(status, provider, clientType = 'web') {
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

export async function postForm(url, values) {
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

export async function providerGet(url, accessToken, extraHeaders = {}) {
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

export async function createAuthorizationUrl(userId, provider, clientType = 'web') {
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

export async function consumeState(state, provider) {
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

export async function exchangeAuthorizationCode(provider, code, verifier, redirectURI) {
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

export async function getProviderProfile(provider, accessToken) {
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

export async function saveAccount(userId, provider, profile, tokenResponse) {
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

export async function getFreshTokens(userId, provider) {
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
