# CampusOS Sprint 6 — Agentic RAG & Dynamic Tool Orchestration (Web Only)

Sprint 6 builds on the working Sprint 5 website. Campus AI can now choose authenticated backend tools based on the user's question, retrieve relevant iLearn course material and synchronized email content, and use the existing calendar and course records. The project remains website-only: React/Vite + Express + PostgreSQL + local Ollama.

## What's new in Sprint 6

- **Agentic tool-calling loop:** Ollama decides which tools to call, receives their results, and can request additional tools before answering. Execution is bounded by configurable round and call limits.
- **Academic tools:** enrolled courses, iLearn calendar events, and search across indexed course materials.
- **Inbox tools:** recent email retrieval, keyword/semantic hybrid search over synchronized Gmail/Outlook messages, and email-thread retrieval.
- **Course-content ingestion:** attempts Moodle `core_course_get_contents`, reads inline page/module content, and downloads supported same-origin course files.
- **Document extraction:** PDF, DOCX, PPTX, TXT, Markdown, CSV and HTML text extraction.
- **Hybrid RAG:** Ollama embeddings (`nomic-embed-text`) + PostgreSQL/pgvector cosine similarity, with encrypted-text keyword fallback if the embedding model is unavailable.
- **Source references:** the chat displays links to course pages, calendar events and original emails used in the answer.
- **Tool activity:** the chat shows which tools Campus AI is currently using.
- **Follow-up context:** existing chat history is passed into the orchestrator so follow-up questions can refer to previous turns.
- **Privacy:** retrieved text chunks and document titles are encrypted at rest with the existing CampusOS credential-encryption key. Vector embeddings are stored for retrieval and are scoped by authenticated user ID.

## What Sprint 6 does not include

- No separate agent LLMs or multi-agent framework yet. Sprint 6 uses one orchestrator model with specialized tools; this is the foundation for later multi-agent coordination.
- No autonomous study planner or feedback-learning/personalization model yet.
- Email attachments are not downloaded or indexed.
- Course file indexing depends on Bennett's Moodle service exposing `core_course_get_contents` and permitting the student token to download the returned files. If unavailable, course/calendar sync still works and Campus AI reports the limitation.
- Only the first 30 enrolled courses and up to 40 files per sync are processed by default; individual files are limited to 12 MB.
- OCR for scanned/image-only PDFs is not included. Those files may produce little or no extractable text.

## Project structure

```text
CampusOS/
├── docker-compose.yml
├── package.json                  # convenience scripts (npm --prefix)
├── README.md
├── docs/
│   ├── ARCHITECTURE.md           # tree + dependency rules
│   ├── REFACTOR_MOVE_MAP.md      # old path -> new path
│   ├── features/                 # AGENTIC_RAG.md, CHAT_ATTACHMENTS.md
│   ├── integrations/             # ILEARN_API.md, lms-probe/
│   └── history/                  # SPRINT6_CHANGELOG.md, START_HERE.txt
├── server/
│   ├── .env.example
│   ├── package.json
│   ├── db/migrations/001_init.sql ... 008_chat_attachments.sql
│   ├── scripts/                  # check-syntax, contract-snapshot, smoke-test
│   └── src/
│       ├── server.js             # entry: env, listen, graceful shutdown
│       ├── app.js                # Express app: middleware, mounts, health
│       ├── config/ db/ lib/ middleware/
│       └── modules/              # auth, email, lms, chat, ai/{agent,tools,rag}
└── web/
    └── src/
        ├── App.jsx               # auth gate + layout shell + page switch
        ├── api/ lib/ components/ features/ styles/
        └── main.jsx
```

See `docs/ARCHITECTURE.md` for the full tree and the dependency rules between layers.

## Requirements

- Windows 10/11, PowerShell and VS Code.
- Node.js 20.19+ or 22.12+ (Node 24 LTS is recommended).
- npm.
- Docker Desktop with Docker Compose.
- Ollama installed and running locally.
- Existing Sprint 5 `.env` and PostgreSQL volume if upgrading.

Check versions:

```powershell
node -v
npm -v
docker --version
docker compose version
ollama --version
```

## Upgrade from Sprint 5 without losing your data

1. Stop the Sprint 5 backend and frontend terminals with `Ctrl+C`.
2. In the **old Sprint 5 project folder**, run the following to stop/remove its database container while preserving the named volume:

```powershell
docker compose down
```

**Do not add `-v`.** The existing PostgreSQL volume contains your CampusOS accounts, encrypted iLearn token, courses, calendar and email cache.

3. Extract Sprint 6 into a new folder, for example `C:\Users\<you>\CampusOS-Sprint6`.
4. Copy the old `server/.env` into the new Sprint 6 `server` folder. For example, adjust the source path to your actual Sprint 5 folder:

```powershell
Copy-Item "..\CampusOS-Sprint5\server\.env" ".\server\.env"
```

5. Keep these existing values exactly unchanged:
   - `JWT_ACCESS_SECRET`
   - `CREDENTIAL_ENCRYPTION_KEY`
   - `DATABASE_URL`
   - Google OAuth client ID/secret and redirect URI
   - Microsoft OAuth client ID/secret and tenant/redirect URI
   - `LMS_BASE_URL`
   - `LMS_TOKEN_SERVICE`

6. Add or verify these Sprint 6 settings in `server/.env`:

```env
OLLAMA_EMBED_MODEL=nomic-embed-text
AI_MAX_TOOL_ROUNDS=6
AI_MAX_TOOL_CALLS=8
RAG_CHUNK_SIZE=1600
RAG_CHUNK_OVERLAP=250
LMS_CONTENT_SYNC=true
LMS_MAX_COURSES_FOR_CONTENTS=30
LMS_MAX_FILES_PER_SYNC=40
LMS_MAX_FILE_MB=12
```

No new OAuth app, LMS username, LMS password, or API key is required for Sprint 6. The existing encrypted Moodle token is reused.

7. Start Ollama and pull the embedding model once:

```powershell
ollama pull nomic-embed-text
```

Your existing chat model remains controlled by `OLLAMA_MODEL` (default `qwen2.5:3b`). If it is not installed yet:

```powershell
ollama pull qwen2.5:3b
```

8. From the Sprint 6 project root, start PostgreSQL:

```powershell
docker compose up -d db
docker compose ps
```

The Compose file deliberately reuses the existing named volume `campusos_campusos_pgdata`. Check that the `campusos-db` container is healthy before continuing.

9. Apply the new migration **006**. Migrations 001–005 are already applied in an upgraded Sprint 5 database:

```powershell
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U campusos -d campusos -f /docker-entrypoint-initdb.d/006_agentic_rag.sql
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U campusos -d campusos -f /docker-entrypoint-initdb.d/007_phone_number.sql
```

Migration 007 adds the mobile-number field. Existing accounts keep working: on their first successful login after this update, the valid number entered on the login screen is saved to the account. Later logins must use the same number. New accounts must provide a valid email and a 10-digit Indian mobile number (or the same number with the +91 prefix). The number is format-checked but is not SMS/OTP verified.

Verify the new tables:

```powershell
docker compose exec db psql -U campusos -d campusos -c "\\dt ai_*"
```

Expected tables: `ai_documents` and `ai_chunks`.

## Fresh database setup

If this is a genuinely new CampusOS database, copy `server/.env.example` to `server/.env`, generate new random values for `JWT_ACCESS_SECRET` and `CREDENTIAL_ENCRYPTION_KEY`, and start the database. Docker initializes migrations 001–006 on the first creation of an empty volume. Do not use a new encryption key with an existing volume.

## Install and start the backend

```powershell
cd server
npm install
npm run check
npm run dev
```

The backend listens on `http://localhost:4000`.

Health endpoint:

```text
http://localhost:4000/api/v1/health/full
```

The `check` command validates JavaScript syntax, including the new orchestrator and document-indexing modules.

## Install and start the website

Open a second PowerShell terminal from the project root:

```powershell
cd web
npm install
npm run dev
```

Open the Vite URL, normally `http://localhost:5173`.

## First-time Sprint 6 indexing

### iLearn course materials

1. Sign in to CampusOS.
2. Open **iLearn LMS**.
3. Click **Sync iLearn** again. This second sync attempts to retrieve course sections and resources and index their text.
4. Check the sync notification for the number of course documents indexed and any Moodle permission warnings.

The existing courses and calendar are retained. The new sync attempts `core_course_get_contents` for up to 30 enrolled courses. Supported file types are PDF, DOCX, PPTX, TXT, MD, CSV and HTML. A Moodle API permission error means Bennett's student web-service token cannot access that function; CampusOS does not bypass the restriction.

### Gmail and Outlook inboxes

1. Open **Connections**.
2. For each connected provider, click **Sync** again.
3. Sprint 6 indexes the synchronized message body and metadata for AI search. Previously cached messages remain searchable through keyword fallback; re-syncing them builds their embeddings when `nomic-embed-text` is available.

The email sync limit remains 50 messages per request. Attachments are not indexed.

## Try Campus AI

Open **Campus AI** and try:

- `What courses am I enrolled in?`
- `What events do I have in the next two weeks?`
- `Explain the main topics from my Machine Learning course notes.`
- `Find the email where my professor mentioned the project deadline.`
- `Summarize my recent inbox activity.`
- `Compare my upcoming calendar events with the instructions in my professor's emails.`

The **AI activity** section shows which tools the orchestrator selected. **Sources used** displays links to retrieved course pages, events or original mailbox messages.

## How tool selection works

Campus AI uses a bounded Ollama tool-calling loop. The model receives tool schemas, selects tools based on the question, receives backend results, and can call more tools before producing its answer. The backend validates tool names and arguments and supplies the authenticated user ID itself. The model never receives database credentials, Moodle tokens, OAuth tokens or raw account credentials.

Initial tools:

- `get_courses`
- `get_upcoming_events`
- `search_course_materials`
- `search_emails`
- `get_recent_emails`
- `get_email_thread`

Course and email material search uses hybrid semantic + keyword retrieval when embeddings are available. Otherwise it falls back to keyword ranking over encrypted chunks/cache records.

## Chat attachments (Sprint 6.1)

Students can attach PDF, DOCX, PPTX, TXT, MD and CSV files to a Campus AI conversation (paperclip button or drag and drop). Files are scoped to that chat, encrypted, chunked and embedded like course material, and removed when the chat or attachment is deleted. See `docs/features/CHAT_ATTACHMENTS.md`.

To upgrade an existing install:

```powershell
cd server
npm install
cd ..
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U campusos -d campusos -f /docker-entrypoint-initdb.d/008_chat_attachments.sql
```

If the container was created before this release, recreate it (without `-v`) so the new migration file is mounted: `docker compose up -d db`. Then add the new variables from `server/.env.example` (`OLLAMA_NUM_CTX` and the `CHAT_*` limits) to `server/.env` and restart the backend.

## Troubleshooting

**Campus AI answers without searching personal data**
- Confirm Ollama is running and `OLLAMA_MODEL` is installed.
- Check the chat's **AI activity** section. If no tool appears, the model may not have emitted a tool call; retry with a specific question such as “Search my iLearn courses for…” or “Find an email about…”.
- Qwen2.5 supports tool calling in Ollama. Update Ollama if the installed version does not expose tool calls correctly.

**Semantic search is unavailable**
- Run `ollama pull nomic-embed-text`.
- Confirm `OLLAMA_EMBED_MODEL=nomic-embed-text` in `server/.env`.
- Re-sync iLearn and each connected email provider to generate embeddings. Keyword fallback still works without the embedding model.

**No course materials found**
- Re-sync iLearn.
- Check the warning returned by Moodle content sync. Bennett may not expose `core_course_get_contents` to the student token.
- Check that the Moodle course actually contains supported files or readable page content. Scanned PDFs require OCR, which is not included.

**Email search finds nothing**
- Sync the connected Gmail/Outlook provider from Connections.
- The assistant searches the local synchronized cache, not the entire provider mailbox live.

**Migration error**
- Confirm PostgreSQL is running and migrations 001–005 were already applied.
- Run migration 006 with `-v ON_ERROR_STOP=1` and share the full error if it fails.
- Never delete the Docker volume to fix a migration issue.

## Security notes

- Keep `server/.env` private and preserve the original encryption key for existing data.
- Use HTTPS outside localhost.
- Email and LMS tools are read-only in this sprint.
- All database retrieval is filtered by the authenticated CampusOS user ID.
- Tool arguments are validated by the backend; the LLM cannot choose another user's ID.
- Retrieved email/document content is treated as untrusted data and cannot grant permissions or authorize actions.