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

## Sprint 6 orchestration

One Ollama model acts as the orchestrator. It receives tool schemas and decides what to call based on the user query. Express validates and runs the selected tool with the authenticated user ID. The model can use tool results to request further tools. The loop is bounded by `AI_MAX_TOOL_ROUNDS` and `AI_MAX_TOOL_CALLS`.

## Data isolation

All tool queries are scoped to the authenticated `req.user.id`. Tool arguments cannot override user identity. Moodle tokens and OAuth tokens remain encrypted in the backend and are never included in LLM prompts. Document/email text is encrypted in PostgreSQL; embeddings are stored in pgvector for similarity retrieval.
