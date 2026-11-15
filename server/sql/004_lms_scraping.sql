-- CampusOS Sprint 4: encrypted iLearn browser sessions and read-only snapshots.
-- No LMS passwords are stored. Browser storage state and extracted page payloads
-- are AES-256-GCM encrypted by the API before they reach PostgreSQL.

CREATE TABLE IF NOT EXISTS lms_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE CASCADE,
  lms_origin TEXT NOT NULL DEFAULT 'https://lms.bennett.edu.in',
  username_hint TEXT,
  session_ciphertext TEXT NOT NULL,
  session_iv TEXT NOT NULL,
  session_tag TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'reauth_required', 'error')),
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lms_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN (
    'course', 'assignment', 'quiz', 'grade', 'attendance',
    'announcement', 'calendar', 'resource', 'activity'
  )),
  source_key TEXT NOT NULL,
  payload_ciphertext TEXT NOT NULL,
  payload_iv TEXT NOT NULL,
  payload_tag TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, source_key)
);

CREATE INDEX IF NOT EXISTS idx_lms_items_user_type
  ON lms_items(user_id, item_type, updated_at DESC);

CREATE TABLE IF NOT EXISTS lms_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  items_found INTEGER NOT NULL DEFAULT 0,
  pages_visited INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_lms_sync_runs_user_started
  ON lms_sync_runs(user_id, started_at DESC);
