-- Sprint 6.2 — allow documents attached to a chat conversation.
-- Migration 006 constrained ai_documents.source_type to ('course', 'email'). Chat attachments
-- were added in 008 with source_type = 'upload', but that check was never extended, so every
-- upload failed at insert time on a freshly migrated database.
-- This migration replaces the old check with one that includes 'upload'. It is safe to re-run.

DO $$
DECLARE
  constraint_name text;
BEGIN
  -- Drop any existing check constraint that mentions source_type, whatever it was named.
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'ai_documents'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%source_type%'
  LOOP
    EXECUTE format('ALTER TABLE ai_documents DROP CONSTRAINT %I', constraint_name);
  END LOOP;

  ALTER TABLE ai_documents
    ADD CONSTRAINT ai_documents_source_type_check
    CHECK (source_type IN ('course', 'email', 'upload'));
END $$;
