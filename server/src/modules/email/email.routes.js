import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { requireUser } from '../../middleware/require-user.js';
import {
  requireRealUser,
  createAuthorizationUrl,
  consumeState,
  exchangeAuthorizationCode,
  getProviderProfile,
  saveAccount,
  frontendRedirect
} from './oauth.js';
import { syncProvider } from './sync.js';
import { listMessages } from './messages.repository.js';

export const emailRouter = Router();
const providers = new Set(['gmail', 'outlook']);
const connectSchema = z.enum(['gmail', 'outlook']);
const syncSchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(25) });

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
    res.json(await syncProvider(req.user.id, provider, parsedBody.data.limit));
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
    res.json({ messages: await listMessages(req.user.id, { provider, limit, search }) });
  } catch (error) { next(error); }
});
