# Sprint 6 changelog

## Added
- Ollama tool-calling orchestrator with a bounded multi-round execution loop.
- Authenticated tools for courses, calendar, course-material search, inbox search, recent emails and email threads.
- Moodle course-content retrieval via `core_course_get_contents` where the Bennett service permits it.
- Same-origin, size-limited Moodle file downloads with redirect-origin validation.
- PDF, DOCX, PPTX, TXT, MD, CSV and HTML extraction.
- Encrypted document chunks and titles, pgvector embeddings, hybrid semantic/keyword retrieval.
- Email body indexing after Gmail/Outlook sync.
- Chat activity events and source links in the website UI.
- Migration `006_agentic_rag.sql`.

## Preserved
- Website-only scope.
- CampusOS authentication and refresh-cookie flow.
- Existing encryption key and encrypted credential storage.
- Gmail/Outlook read-only OAuth integration.
- Bennett Moodle token flow, enrolled courses and calendar sync.
- Existing chat sessions and history.

## Limitations
- One orchestrator model with tools; no separate multi-agent deployment yet.
- Moodle resource retrieval depends on Bennett's Moodle service permissions.
- Email attachments and OCR for scanned PDFs are not included.
- Inbox retrieval operates on the synchronized local cache, not a live provider search.
