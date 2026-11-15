import '../../config/env.js';

import crypto from 'node:crypto';
import multer from 'multer';
import JSZip from 'jszip';
import { pool } from '../../db/pool.js';
import { extractDocumentText } from '../ai/rag/extract.js';
import { chunkText } from '../ai/rag/chunk.js';
import { indexTextDocuments } from '../ai/rag/indexer.js';
import { decryptDocumentTitle } from '../ai/rag/decrypt.js';

// Documents attached to a single chat conversation.
// Files are never written to disk: the text is extracted in memory, encrypted, chunked and
// embedded through the existing indexer, tagged source_type='upload' and scoped to the session.

const clampNumber = (value, fallback, min, max) => Math.max(min, Math.min(max, Number(value) || fallback));
export const MAX_UPLOAD_MB = clampNumber(process.env.CHAT_MAX_UPLOAD_MB, 12, 1, 25);
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
export const MAX_FILES_PER_REQUEST = 3;
export const MAX_FILES_PER_SESSION = clampNumber(process.env.CHAT_MAX_FILES_PER_SESSION, 5, 1, 20);
export const MAX_FILES_PER_USER = clampNumber(process.env.CHAT_MAX_FILES_PER_USER, 50, 1, 500);
const MAX_TEXT_CHARS = 180000;
const EXTRACT_TIMEOUT_MS = 60000;
const MAX_ZIP_ENTRIES = 3000;
const MAX_UNCOMPRESSED_BYTES = 250 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'pptx', 'txt', 'md', 'csv'];

export class UploadError extends Error {}

export function safeFileName(original) {
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

export async function processFile(userId, sessionId, file) {
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

export const upload = multer({
  storage: multer.memoryStorage(),
  defParamCharset: 'utf8',
  limits: { fileSize: MAX_UPLOAD_BYTES, files: MAX_FILES_PER_REQUEST }
});

export const limits = () => ({
  max_file_mb: MAX_UPLOAD_MB,
  max_files_per_session: MAX_FILES_PER_SESSION,
  extensions: ALLOWED_EXTENSIONS
});
