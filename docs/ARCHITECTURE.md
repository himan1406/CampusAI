# CampusOS Sprint 6 architecture

CampusOS is currently a website-only student workspace.

```text
React + Vite web client
        |
        | CampusOS JWT / HTTP + SSE
        v
Express API
  |-- Authentication + encrypted credential vault
  |-- Gmail / Outlook read-only OAuth + local encrypted inbox cache
  |-- Moodle REST token integration + encrypted courses/calendar
  |-- Campus AI agentic orchestrator
        |-- Ollama chat model (tool selection and response)
        |-- Course tools (courses, course-material RAG)
        |-- Calendar tool
        |-- Email tools (recent, search, thread)
        |-- bounded tool execution loop
  |-- Document ingestion and extraction
        |-- Moodle course pages/resources
        |-- synchronized email bodies
        |-- chunking + Ollama embeddings
        v
PostgreSQL + pgvector
  |-- users / chat sessions / messages
  |-- encrypted OAuth and Moodle credentials
  |-- encrypted email and LMS records
  |-- encrypted AI document titles and chunks
  |-- 768-dimensional vector embeddings
```

## Runtime services

- Web: Vite development server on port 5173.
- API: Express on port 4000.
- PostgreSQL: Docker container on host port 5433.
- Ollama: local service on port 11434.

## Repository layout

```text
CampusOS/
├── docker-compose.yml
├── package.json                      # convenience scripts only (no workspaces)
├── docs/
│   ├── ARCHITECTURE.md
│   ├── REFACTOR_MOVE_MAP.md
│   ├── features/                     # AGENTIC_RAG.md, CHAT_ATTACHMENTS.md
│   ├── integrations/                 # ILEARN_API.md, lms-probe/
│   └── history/                      # SPRINT6_CHANGELOG.md, START_HERE.txt
├── server/
│   ├── db/migrations/                # 001_init.sql ... 008_chat_attachments.sql
│   ├── scripts/
│   │   ├── check-syntax.mjs          # recursive node --check over src/
│   │   ├── contract-snapshot.mjs     # black-box HTTP contract snapshot
│   │   └── smoke-test.mjs            # real-flow test on a throwaway database
│   └── src/
│       ├── server.js                 # entry: env, listen, graceful shutdown
│       ├── app.js                    # Express app: middleware, mounts, health
│       ├── config/env.js             # imports dotenv/config first
│       ├── db/pool.js                # pg Pool + ensureDevUser
│       ├── lib/vault.js              # AES-256-GCM helpers
│       ├── middleware/               # cors, error-handler, rate-limiters, require-user
│       └── modules/
│           ├── auth/                 # auth.routes, credentials.routes, auth.service, auth.schemas
│           ├── email/                # email.routes, oauth, providers/, messages.repository, sync
│           ├── lms/                  # lms.routes, moodle.client, normalize, content-sync
│           ├── chat/                 # chat.routes, attachments.routes, attachments.service
│           └── ai/
│               ├── agent/            # orchestrator, ollama.client, system-prompt
│               ├── tools/            # registry, definitions, validators, courses, events, emails, documents
│               └── rag/              # extract, chunk, embeddings, indexer, decrypt
└── web/
    └── src/
        ├── main.jsx
        ├── App.jsx                   # auth gate + layout shell + page switch
        ├── api/client.js             # request() + token-refresh wrapper
        ├── lib/                      # phone.js, attachments.js
        ├── components/
        │   ├── layout/               # Sidebar, Topbar
        │   └── ui/                   # Banner, EmptyState, StatCard
        ├── features/
        │   ├── auth/                 # AuthScreen
        │   ├── dashboard/            # DashboardPage
        │   ├── inbox/                # InboxPage
        │   ├── connections/          # ConnectionsPage
        │   ├── lms/                  # LmsPage, CourseList, CalendarView, lms-utils
        │   ├── assistant/            # AssistantPage, ChatMessages, Composer, AttachmentList, ToolActivity
        │   └── profile/              # ProfilePage
        └── styles/
            ├── index.css             # imports in the original cascade order
            ├── tokens.css, base.css, buttons.css, layout.css, responsive.css
            └── features/*.css
```

## Server dependency rules

- Layers flow in one direction: `routes → services → db/lib`.
- `modules/ai/tools` may use `db`, `lib` and `modules/ai/rag`.
- Modules never import another module's `*.routes.js`.
- Shared infrastructure lives only in `config/`, `db/`, `lib/` and `middleware/`.
- Singletons (the `pg` Pool, rate limiters, the LMS `activeSyncs` Set) are module-level instances created once.
- `config/env.js` imports `dotenv/config`; every module that reads `process.env` at import time imports it first.
- The server is started from `server/`, so `dotenv` still resolves `server/.env`.
- Middleware and mount order in `app.js` is significant and must not be rearranged:
  helmet → CORS → `express.json` → cookie-parser → auth → credentials → email → lms →
  attachments on `/api/v1/chat/sessions` (own upload limiter) → chat limiter on `/api/v1/chat` →
  main router on `/api/v1` → health → error handler last.

## Web dependency rules

- `App.jsx` owns application state, effects and data fetching; feature pages receive props.
- Feature components may import `api/`, `lib/`, `components/` and their own feature files.
- Presentational components in `components/` do not import features.
- `styles/index.css` imports the split stylesheets in the original order, with the font `@import` first.

## Sprint 6 orchestration

One Ollama model acts as the orchestrator. It receives tool schemas and decides what to call based on the user query. Express validates and runs the selected tool with the authenticated user ID. The model can use tool results to request further tools. The loop is bounded by `AI_MAX_TOOL_ROUNDS` and `AI_MAX_TOOL_CALLS`.

## Data isolation

All tool queries are scoped to the authenticated `req.user.id`. Tool arguments cannot override user identity. Moodle tokens and OAuth tokens remain encrypted in the backend and are never included in LLM prompts. Document/email text is encrypted in PostgreSQL; embeddings are stored in pgvector for similarity retrieval.
