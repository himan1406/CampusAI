-- Sprint 6.1 — documents attached to a chat conversation.
-- Uploaded files reuse ai_documents / ai_chunks (encrypted text + pgvector embeddings).
-- They are tagged source_type = 'upload' and scoped to one chat via session_id, so they
-- never appear in course-material or email search and are removed with the chat.

DO $$
DECLARE
  session_id_type text;
BEGIN
  -- Match the exact type of chat_sessions.id so the foreign key always lines up.
  SELECT format_type(a.atttypid, a.atttypmod) INTO session_id_type
  FROM pg_attribute a
  WHERE a.attrelid = 'chat_sessions'::regclass AND a.attname = 'id' AND NOT a.attisdropped;

  IF session_id_type IS NULL THEN
    RAISE EXCEPTION 'chat_sessions.id was not found; apply migrations 001-007 first';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_documents' AND column_name = 'session_id'
  ) THEN
    EXECUTE format(
      'ALTER TABLE ai_documents ADD COLUMN session_id %s REFERENCES chat_sessions(id) ON DELETE CASCADE',
      session_id_type
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ai_documents_session_idx
  ON ai_documents (user_id, session_id)
  WHERE session_id IS NOT NULL;