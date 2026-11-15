-- CampusOS Sprint 6: encrypted RAG document chunks and optional pgvector embeddings.
CREATE TABLE IF NOT EXISTS ai_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('course', 'email')),
  source_id TEXT NOT NULL,
  title_ciphertext TEXT NOT NULL,
  title_iv TEXT NOT NULL,
  title_tag TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, source_type, source_id)
);

CREATE TABLE IF NOT EXISTS ai_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES ai_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content_ciphertext TEXT NOT NULL,
  content_iv TEXT NOT NULL,
  content_tag TEXT NOT NULL,
  embedding VECTOR(768),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_ai_documents_user_source
  ON ai_documents(user_id, source_type, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_chunks_user_document
  ON ai_chunks(user_id, document_id);
CREATE INDEX IF NOT EXISTS idx_ai_chunks_embedding
  ON ai_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
