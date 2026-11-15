-- Sprint 6.1: store normalized Indian mobile numbers for CampusOS accounts.
-- Existing accounts are populated on their first successful login after this migration.
ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS phone_number TEXT;
