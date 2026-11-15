-- Sprint 3: Gmail and Outlook OAuth connections + encrypted local email cache.
-- Safe to run on a database that already has the original Sprint 3 email tables.

CREATE TABLE IF NOT EXISTS email_oauth_states (
  state_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('gmail', 'outlook')),
  verifier_ciphertext TEXT NOT NULL,
  verifier_iv TEXT NOT NULL,
  verifier_tag TEXT NOT NULL,
  client_type TEXT NOT NULL DEFAULT 'web' CHECK (client_type IN ('web', 'desktop', 'mobile')),
  redirect_uri TEXT NOT NULL DEFAULT '',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE email_oauth_states ADD COLUMN IF NOT EXISTS client_type TEXT NOT NULL DEFAULT 'web';
ALTER TABLE email_oauth_states ADD COLUMN IF NOT EXISTS redirect_uri TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_email_oauth_states_expiry ON email_oauth_states(expires_at);

CREATE TABLE IF NOT EXISTS email_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('gmail', 'outlook')),
  provider_account_id TEXT NOT NULL,
  email_address TEXT NOT NULL,
  display_name TEXT,
  token_ciphertext TEXT NOT NULL,
  token_iv TEXT NOT NULL,
  token_tag TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'reauth_required', 'error')),
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_email_accounts_user ON email_accounts(user_id);

CREATE TABLE IF NOT EXISTS email_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('gmail', 'outlook')),
  provider_message_id TEXT NOT NULL,
  provider_thread_id TEXT,
  received_at TIMESTAMPTZ,
  content_ciphertext TEXT NOT NULL,
  content_iv TEXT NOT NULL,
  content_tag TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  web_url TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, provider, provider_message_id)
);
CREATE INDEX IF NOT EXISTS idx_email_messages_user_date ON email_messages(user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_messages_provider_date ON email_messages(user_id, provider, received_at DESC);
DELETE FROM email_oauth_states WHERE expires_at < NOW();
