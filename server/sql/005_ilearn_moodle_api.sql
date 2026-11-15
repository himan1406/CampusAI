-- CampusOS Sprint 5: switch iLearn from browser snapshots to Moodle REST tokens.
-- Existing browser-session columns are retained as nullable for safe upgrades.

ALTER TABLE lms_accounts
  ALTER COLUMN session_ciphertext DROP NOT NULL,
  ALTER COLUMN session_iv DROP NOT NULL,
  ALTER COLUMN session_tag DROP NOT NULL;

ALTER TABLE lms_accounts
  ADD COLUMN IF NOT EXISTS token_ciphertext TEXT,
  ADD COLUMN IF NOT EXISTS token_iv TEXT,
  ADD COLUMN IF NOT EXISTS token_tag TEXT,
  ADD COLUMN IF NOT EXISTS moodle_user_id BIGINT,
  ADD COLUMN IF NOT EXISTS moodle_site_name TEXT,
  ADD COLUMN IF NOT EXISTS auth_method TEXT NOT NULL DEFAULT 'moodle_token';

-- Existing Sprint 4 browser sessions are not Moodle API tokens.
UPDATE lms_accounts
SET auth_method = 'browser'
WHERE token_ciphertext IS NULL;
