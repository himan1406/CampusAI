-- CampusOS Sprint 2: account authentication, refresh sessions and encrypted credentials.
-- Existing Sprint 1 chat tables are preserved.

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS student_id TEXT,
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS academic_year SMALLINT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_email_unique
  ON app_users (LOWER(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user
  ON auth_refresh_tokens(user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS connected_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('mycamu', 'lms')),
  username_hint TEXT NOT NULL,
  secret_ciphertext TEXT NOT NULL,
  secret_iv TEXT NOT NULL,
  secret_tag TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'stored' CHECK (status IN ('stored', 'verified', 'error', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, platform)
);
CREATE INDEX IF NOT EXISTS idx_connected_credentials_user
  ON connected_credentials(user_id);

-- Never persist a raw password or an un-hashed refresh token.
