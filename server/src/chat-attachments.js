import { Router } from 'express';
import crypto from 'node:crypto';
import multer from 'multer';
import JSZip from 'jszip';
import { pool } from './db/pool.js';
import { requireUser } from './middleware/require-user.js';
import { extractDocumentText } from './modules/ai/rag/extract.js';
import { chunkText } from './modules/ai/rag/chunk.js';
import { indexTextDocuments } from './modules/ai/rag/indexer.js';
import { decryptDocumentTitle } from './modules/ai/rag/decrypt.js';

// Documents attached to a single chat conversation.
// Files are never written to disk: the text is extracted in memory, encrypted, chunked and
// embedded through the existing indexer, tagged source_type='upload' and scoped to the session.

export const attachmentsRouter = Router();

const clampNumber = (value, fallback, min, max) => Math.max(min, Math.min(max, Number(value) || fallback));
const MAX_UPLOAD_MB = clampNumber(process.env.CHAT_MAX_UPLOAD_MB, 12, 1, 25);
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 3;
const MAX_FILES_PER_SESSION = clampNumber(process.env.CHAT_MAX_FILES_PER_SESSION, 5, 1, 20);
const MAX_FILES_PER_USER = clampNumber(process.env.CHAT_MAX_FILES_PER_USER, 50, 1, 500);
const MAX_TEXT_CHARS = 180000;
const EXTRACT_TIMEOUT_MS = 60000;
const MAX_ZIP_ENTRIES = 3000;
const MAX_UNCOMPRESSED_BYTES = 250 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'pptx', 'txt', 'md', 'csv'];

class UploadError extends Error {}

function safeFileName(original) {
  let name = String(original || '')
    .normalize('NFC')
    .replace(/[\\/]+/g, '_')
    .replace(/[\u0000-\u001f\u007f<>"`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (name.length > 120) {
    const dot = name.lastIndexOf('.');
    const ext = dot > 0 && name.length - dot <= 9 ? name.slice(dot) : '';
    name = name.slice(0, 120 - ext.length) + ext;
  }
  return name || 'document';
}

function extensionOf(name) {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(name);
  return match ? match[1].toLowerCase() : '';
}

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new UploadError(message)), ms); })
  ]).finally(() => clearTimeout(timer));
}

function matchesSignature(ext, buffer) {
  if (ext === 'pdf') return buffer.subarray(0, 1024).toString('latin1').includes('%PDF-');
  if (ext === 'docx' || ext === 'pptx') return buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  return !buffer.subarray(0, 4096).includes(0); // plain text must not contain NUL bytes
}

// DOCX/PPTX are zip archives. Check them before extraction so a zip bomb or a renamed file
// is rejected cheaply. JSZip keeps entries compressed until they are read.
async function inspectOfficeZip(buffer, requiredEntry) {
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new UploadError('This file is damaged or is not a valid Office document.');
  }
  const entries = Object.values(zip.files);
  if (entries.length > MAX_ZIP_ENTRIES) throw new UploadError('This document contains too many internal parts.');
  // _data.uncompressedSize is an internal JSZip field; the guard is skipped if it ever disappears.
  const total = entries.reduce((sum, entry) => sum + Number(entry._data?.uncompressedSize || 0), 0);
  if (total > MAX_UNCOMPRESSED_BYTES) throw new UploadError('This document expands to an unsafe size.');
  if (!zip.files[requiredEntry]) throw new UploadError('The file extension does not match the file contents.');
}

async function processFile(userId, sessionId, file) {
  const name = safeFileName(file.originalname);
  const ext = extensionOf(name);
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    if (ext === 'doc' || ext === 'ppt') {
      throw new UploadError(`Legacy .${ext} files are not supported. Save the file as .${ext}x and attach it again.`);
    }
    throw new UploadError(`.${ext || 'unknown'} files are not supported. Attach PDF, DOCX, PPTX, TXT, MD or CSV files.`);
  }
  if (!file.buffer?.length) throw new UploadError('This file is empty.');
  if (!matchesSignature(ext, file.buffer)) throw new UploadError('The file extension does not match the file contents.');
  if (ext === 'docx') await inspectOfficeZip(file.buffer, 'word/document.xml');
  if (ext === 'pptx') await inspectOfficeZip(file.buffer, 'ppt/presentation.xml');

  let text;
  try {
    // The MIME type is deliberately not passed: the browser-supplied value is untrusted.
    text = await withTimeout(extractDocumentText(file.buffer, name, ''), EXTRACT_TIMEOUT_MS, 'Reading this file took too long.');
  } catch (error) {
    if (error instanceof UploadError) throw error;
    throw new UploadError('This file could not be read. It may be damaged or password-protected.');
  }
  text = String(text || '').slice(0, MAX_TEXT_CHARS);
  if (text.replace(/\s+/g, ' ').trim().length < 40) {
    throw new UploadError('No readable text was found in this file. Scanned or image-only PDFs need OCR, which is not available yet.');
  }

  const truncated = chunkText(text).length >= 120;
  const fingerprint = crypto.createHash('sha256').update(file.buffer).digest('hex').slice(0, 24);
  const sourceId = `upload:${sessionId}:${fingerprint}`;
  const summary = await indexTextDocuments(userId, [{
    sourceType: 'upload', sourceId, title: name, sourceUrl: null, courseName: null, text, sessionId
  }]);

  const stored = await pool.query(
    `SELECT d.id, (SELECT COUNT(*)::int FROM ai_chunks c WHERE c.document_id = d.id AND c.user_id = d.user_id) AS chunk_count
     FROM ai_documents d WHERE d.user_id = $1 AND d.source_type = 'upload' AND d.source_id = $2`,
    [userId, sourceId]
  );
  if (!stored.rowCount) throw new UploadError('No searchable text could be created from this file.');

  const warnings = [...(summary.warnings || [])];
  if (truncated) warnings.push(`${name} is very long, so only the first part was indexed.`);
  return {
    id: stored.rows[0].id,
    name,
    chunks: stored.rows[0].chunk_count,
    duplicate: summary.documents_indexed === 0,
    warnings
  };
}

export async function listSessionAttachments(userId, sessionId) {
  if (!sessionId) return [];
  const result = await pool.query(
    `SELECT d.id, d.title_ciphertext, d.title_iv, d.title_tag,
            (SELECT COUNT(*)::int FROM ai_chunks c WHERE c.document_id = d.id AND c.user_id = d.user_id) AS chunk_count
     FROM ai_documents d
     WHERE d.user_id = $1 AND d.session_id = $2 AND d.source_type = 'upload'
     ORDER BY d.indexed_at ASC, d.id ASC`,
    [userId, sessionId]
  );
  return result.rows.flatMap(row => {
    try {
      return [{ id: row.id, name: decryptDocumentTitle(row).title || 'document', chunks: row.chunk_count }];
    } catch {
      return [];
    }
  });
}

async function requireOwnSession(req, res, next) {
  if (!/^[0-9a-fA-F-]{36}$/.test(req.params.id)) return res.status(404).json({ error: 'Session not found' });
  try {
    const result = await pool.query('SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Session not found' });
    next();
  } catch (error) { next(error); }
}

const upload = multer({
  storage: multer.memoryStorage(),
  defParamCharset: 'utf8',
  limits: { fileSize: MAX_UPLOAD_BYTES, files: MAX_FILES_PER_REQUEST }
});

const limits = () => ({
  max_file_mb: MAX_UPLOAD_MB,
  max_files_per_session: MAX_FILES_PER_SESSION,
  extensions: ALLOWED_EXTENSIONS
});

attachmentsRouter.get('/:id/attachments', requireUser, requireOwnSession, async (req, res, next) => {
  try {
    res.json({ attachments: await listSessionAttachments(req.user.id, req.params.id), limits: limits() });
  } catch (error) { next(error); }
});

// Ownership is verified before multer runs, so nothing is buffered for another user's session.
attachmentsRouter.post('/:id/attachments', requireUser, requireOwnSession, upload.array('files', MAX_FILES_PER_REQUEST), async (req, res, next) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'Choose at least one file to attach.' });
  const userId = req.user.id;
  const sessionId = req.params.id;
  try {
    const counts = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE session_id = $2)::int AS in_session, COUNT(*)::int AS total
       FROM ai_documents WHERE user_id = $1 AND source_type = 'upload'`,
      [userId, sessionId]
    );
    const { in_session: inSession, total } = counts.rows[0];
    if (inSession + files.length > MAX_FILES_PER_SESSION) {
      return res.status(400).json({ error: `A chat can hold up to ${MAX_FILES_PER_SESSION} attachments. Remove one before adding more.` });
    }
    if (total + files.length > MAX_FILES_PER_USER) {
      return res.status(400).json({ error: `You have reached the limit of ${MAX_FILES_PER_USER} attached documents. Delete old chats or attachments first.` });
    }

    const results = [];
    for (const file of files) {
      try {
        results.push({ ok: true, ...(await processFile(userId, sessionId, file)) });
      } catch (error) {
        if (!(error instanceof UploadError)) console.error('[CampusOS attachments]', error?.message || 'Processing failed');
        results.push({
          ok: false,
          name: safeFileName(file.originalname),
          error: error instanceof UploadError ? error.message : 'This file could not be processed. Please try again.'
        });
      }
    }

    const attachments = await listSessionAttachments(userId, sessionId);
    if (!results.some(item => item.ok)) return res.status(422).json({ error: results[0].error, results, attachments });
    const warnings = [...new Set(results.flatMap(item => item.warnings || []))];
    res.status(201).json({ results, attachments, warnings, limits: limits() });
  } catch (error) { next(error); }
});

attachmentsRouter.delete('/:id/attachments/:docId', requireUser, requireOwnSession, async (req, res, next) => {
  if (!/^[\w-]{1,64}$/.test(req.params.docId)) return res.status(404).json({ error: 'Attachment not found' });
  try {
    const found = await pool.query(
      `SELECT id FROM ai_documents
       WHERE id::text = $1 AND user_id = $2 AND session_id = $3 AND source_type = 'upload'`,
      [req.params.docId, req.user.id, req.params.id]
    );
    if (!found.rowCount) return res.status(404).json({ error: 'Attachment not found' });
    const documentId = found.rows[0].id;
    await pool.query('DELETE FROM ai_chunks WHERE document_id = $1 AND user_id = $2', [documentId, req.user.id]);
    await pool.query('DELETE FROM ai_documents WHERE id = $1 AND user_id = $2', [documentId, req.user.id]);
    res.status(204).end();
  } catch (error) { next(error); }
});

attachmentsRouter.use((error, _req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `Each file must be ${MAX_UPLOAD_MB} MB or smaller.` });
    return res.status(400).json({ error: `Attach up to ${MAX_FILES_PER_REQUEST} files at a time, using the “files” field.` });
  }
  next(error);
});