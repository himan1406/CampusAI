# Refactor move map

Behaviour-preserving reorganisation into feature-oriented modules. All API paths, SQL,
environment variables, prompt/tool text and runtime behaviour are unchanged.

## Server

| Old path | New path |
| --- | --- |
| `server/src/index.js` | `server/src/server.js` (entry) + `server/src/app.js` (Express app) |
| `server/src/db.js` | `server/src/db/pool.js` |
| `server/src/vault.js` | `server/src/lib/vault.js` |
| `server/src/auth.js` | `server/src/middleware/require-user.js` (CORS/rate-limit/error handlers split into `middleware/`) |
| `server/src/auth-routes.js` | `server/src/modules/auth/auth.routes.js` + `credentials.routes.js` + `auth.service.js` + `auth.schemas.js` |
| `server/src/email-routes.js` | `server/src/modules/email/email.routes.js` + `oauth.js` + `providers/gmail.js` + `providers/outlook.js` + `messages.repository.js` + `sync.js` |
| `server/src/lms-routes.js` | `server/src/modules/lms/lms.routes.js` + `moodle.client.js` + `normalize.js` + `content-sync.js` |
| `server/src/routes.js` | `server/src/modules/chat/chat.routes.js` |
| `server/src/chat-attachments.js` | `server/src/modules/chat/attachments.routes.js` + `attachments.service.js` |
| `server/src/agentic-ai.js` | `server/src/modules/ai/agent/orchestrator.js` + `system-prompt.js` |
| `server/src/ollama.js` | `server/src/modules/ai/agent/ollama.client.js` + `modules/ai/rag/embeddings.js` |
| `server/src/document-indexer.js` | `server/src/modules/ai/rag/extract.js` + `chunk.js` + `indexer.js` + `decrypt.js` |
| `server/sql/001_init.sql` … `008_chat_attachments.sql` | `server/db/migrations/` (contents byte-identical) |

New shared infrastructure: `server/src/config/env.js`, `middleware/cors.js`,
`middleware/rate-limiters.js`, `middleware/error-handler.js`, `modules/ai/tools/{index,definitions,validators,courses,events,emails,documents,helpers}.js`.

`docker-compose.yml` mounts the same container paths (`/docker-entrypoint-initdb.d/00X_*.sql`);
only the host path changed to `./server/db/migrations/`.

## Web

| Old path | New path |
| --- | --- |
| `web/src/LmsPage.jsx` | `web/src/features/lms/LmsPage.jsx` + `CourseList.jsx` + `CalendarView.jsx` + `lms-utils.js` |
| `web/src/styles.css` | `web/src/styles/` (index, tokens, base, buttons, layout, responsive, features/*) |
| `web/src/App.jsx` (monolith) | `web/src/App.jsx` (shell) + `features/*` pages + `components/*` |
| AuthScreen (inside `App.jsx`) | `web/src/features/auth/AuthScreen.jsx` |
| Dashboard JSX (inside `App.jsx`) | `web/src/features/dashboard/DashboardPage.jsx` |
| Inbox JSX (inside `App.jsx`) | `web/src/features/inbox/InboxPage.jsx` |
| Connections JSX (inside `App.jsx`) | `web/src/features/connections/ConnectionsPage.jsx` |
| Assistant JSX (inside `App.jsx`) | `web/src/features/assistant/{AssistantPage,ChatMessages,Composer,AttachmentList,ToolActivity}.jsx` |
| Profile JSX (inside `App.jsx`) | `web/src/features/profile/ProfilePage.jsx` |
| Sidebar/topbar JSX (inside `App.jsx`) | `web/src/components/layout/{Sidebar,Topbar}.jsx` |
| Repeated cards/banners/empty states | `web/src/components/ui/{StatCard,Banner,EmptyState}.jsx` |
| `request()` + API base URL (inside `App.jsx`) | `web/src/api/client.js` |
| `normalizeIndianPhone` (inside `App.jsx`) | `web/src/lib/phone.js` |
| Attachment limits (inside `App.jsx`) | `web/src/lib/attachments.js` |

## Docs

| Old path | New path |
| --- | --- |
| `docs/AGENTIC_RAG.md` | `docs/features/AGENTIC_RAG.md` |
| `docs/CHAT_ATTACHMENTS.md` | `docs/features/CHAT_ATTACHMENTS.md` |
| `docs/ILEARN_API.md` | `docs/integrations/ILEARN_API.md` |
| `docs/lms-probe/` | `docs/integrations/lms-probe/` |
| `docs/SPRINT6_CHANGELOG.md` | `docs/history/SPRINT6_CHANGELOG.md` |
| `START_HERE.txt` | `docs/history/START_HERE.txt` |
