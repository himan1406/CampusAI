# Chat attachments
 
Students can attach documents to a Campus AI conversation and ask questions about them.
 
## Supported files
PDF, DOCX, PPTX, TXT, MD, CSV. Up to 12 MB per file, 3 files per upload, 5 per chat, 50 per user (all configurable in `server/.env`).
Legacy `.doc` / `.ppt` / `.xls`, scanned (image-only) PDFs and password-protected files are rejected with a clear message.
 
## How it works
1. `POST /api/v1/chat/sessions/:id/attachments` (multipart field `files`) checks session ownership, then validates extension, file signature and (for DOCX/PPTX) zip structure and expanded size.
2. Text is extracted in memory with the existing `extractDocumentText()`; nothing is written to disk.
3. `indexTextDocuments()` chunks, encrypts and embeds it as `source_type='upload'` with `session_id` set (migration 008). These rows never appear in course or email search.
4. The system prompt lists the attached file names and the model gets two extra tools, only when the chat has files:
   - `search_attachments(query, limit)` — hybrid semantic + keyword search inside this chat's files.
   - `read_attachment(file_name?, part?)` — reads a file in order, 3 chunks per part, with chunk overlap removed. Used for summaries.
5. Safety net: if the student clearly refers to an attached file but the model answers without calling a tool, the backend discards that answer, runs `read_attachment` (summaries) or `search_attachments` (questions) itself, and asks the model again.
## Endpoints
| Method | Path | Notes |
|---|---|---|
| GET | `/chat/sessions/:id/attachments` | list + limits |
| POST | `/chat/sessions/:id/attachments` | multipart `files`; 201 (some may have failed — see `results`), 422 if every file failed, 413 too large |
| DELETE | `/chat/sessions/:id/attachments/:docId` | removes the file and its chunks |
 
## Configuration (`server/.env`)
`OLLAMA_NUM_CTX` (default 8192), `CHAT_MAX_UPLOAD_MB`, `CHAT_MAX_FILES_PER_SESSION`, `CHAT_MAX_FILES_PER_USER`, `UPLOAD_RATE_LIMIT`.
 
## Known limitations
- No OCR: image-only PDFs and images inside documents produce no text.
- `read_attachment` reads a long document part by part (bounded by `AI_MAX_TOOL_CALLS`), so very long files are summarised from the first parts unless the student asks about later sections.
- Very long files are indexed up to 120 chunks (about the first 190k characters); the student is warned.
- `pdf-parse` 1.1.1 bundles an old pdf.js. If many real-world PDFs fail with "could not be read", switch to a maintained parser.
 