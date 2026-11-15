# CampusOS Agentic RAG design

## Request lifecycle

1. The authenticated chat route loads the user's last 20 messages and a system policy prompt.
2. Ollama receives the conversation and the registered tool schemas.
3. The model decides whether to answer directly or request one or more tools.
4. Express validates the tool name and Zod arguments, and executes the tool with `req.user.id` supplied by the server.
5. Tool results are returned to Ollama as tool messages. The model may request additional tools.
6. The loop stops after the configured number of rounds/calls, then returns a final answer.
7. The final answer is saved in chat history. The current response also emits tool activity and source references to the web client.

The LLM is never given direct SQL access, account tokens, Moodle credentials or OAuth credentials.

## Tool registry

| Tool | Data source | Retrieval |
|---|---|---|
| `get_courses` | `lms_items` course rows | Decrypt user-scoped records |
| `get_upcoming_events` | `lms_items` calendar rows | Date/course filtering |
| `search_course_materials` | `ai_documents` + `ai_chunks` | pgvector cosine similarity + encrypted chunk keyword ranking |
| `search_emails` | `email_messages` + email `ai_chunks` | pgvector + keyword hybrid ranking |
| `get_recent_emails` | `email_messages` | Latest cached messages |
| `get_email_thread` | `email_messages` | User/provider/thread filter |

## RAG ingestion

### iLearn

- `core_enrol_get_users_courses` and `core_calendar_get_calendar_events` continue to provide courses and events.
- `core_course_get_contents` is attempted for up to `LMS_MAX_COURSES_FOR_CONTENTS` courses.
- Readable module descriptions and inline Moodle page content are extracted.
- Same-origin Moodle file URLs are downloaded server-side with the encrypted token; file count and size limits are applied.
- PDF, DOCX, PPTX, TXT, MD, CSV and HTML are supported. OCR and email attachment extraction are not.
- Text is chunked using `RAG_CHUNK_SIZE` and `RAG_CHUNK_OVERLAP`.

### Email

- Existing Gmail/Outlook sync remains read-only and caches message content encrypted.
- Each successful email sync indexes the message subject, sender, date, snippet and body. It does not index attachments.

### Embeddings and storage

- `OLLAMA_EMBED_MODEL` defaults to `nomic-embed-text` (768 dimensions).
- Embeddings are generated in batches through Ollama `/api/embed`.
- Document titles and chunk text are encrypted using the existing AES-256-GCM vault key.
- Embeddings are stored in pgvector; no raw chunk text is stored in plaintext.
- If embeddings are unavailable, encrypted chunks are still saved and tools fall back to keyword ranking. Re-sync after installing the embedding model to populate missing vectors.

## Security and reliability

- Every tool obtains user identity from the verified CampusOS access token, never from tool arguments.
- All tool queries filter by `user_id`.
- Tool names are allow-listed and arguments are validated with Zod.
- Tool-call rounds and total calls are bounded.
- Retrieved documents and emails are untrusted data; instructions inside them are not executable.
- Tools are read-only. No email send/delete or LMS write operation is exposed.
- Source URLs are surfaced as references, not fetched by the LLM.

## Current limitations

- Tool selection quality depends on the local chat model and its Ollama tool-calling support.
- Moodle may restrict `core_course_get_contents` or pluginfile downloads for student tokens.
- Only synchronized email cache is searchable; provider mailboxes are not queried live at chat time.
- The current search pipeline has keyword fallback; semantic search requires the embedding model.
- Multi-agent coordination, study planning and feedback-based learning are future milestones. Sprint 6 is a single orchestrator with tools, not a multi-agent deployment.
