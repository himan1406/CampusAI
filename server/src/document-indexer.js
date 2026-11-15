import crypto from 'node:crypto';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
import JSZip from 'jszip';
import { pool } from './db.js';
import { encryptSecret, decryptSecret } from './vault.js';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
const EMBEDDING_DIMENSIONS = 768;
const CHUNK_SIZE = Math.max(500, Number(process.env.RAG_CHUNK_SIZE || 1600));
const CHUNK_OVERLAP = Math.max(0, Math.min(CHUNK_SIZE - 100, Number(process.env.RAG_CHUNK_OVERLAP || 250)));

export function cleanExtractedText(value = '') {
  return String(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|section)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => { const point = Number(code); return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : ' '; })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function chunkText(text) {
  const normalized = String(text || '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim();
  if (!normalized) return [];
  const chunks = [];
  let start = 0;
  while (start < normalized.length && chunks.length < 120) {
    let end = Math.min(normalized.length, start + CHUNK_SIZE);
    if (end < normalized.length) {
      const boundary = normalized.lastIndexOf('\n', end);
      const sentence = normalized.lastIndexOf('. ', end);
      const preferred = Math.max(boundary, sentence);
      if (preferred > start + Math.floor(CHUNK_SIZE * 0.55)) end = preferred + 1;
    }
    const part = normalized.slice(start, end).trim();
    if (part.length >= 40) chunks.push(part);
    if (end >= normalized.length) break;
    start = Math.max(start + 1, end - CHUNK_OVERLAP);
  }
  return chunks;
}

export async function extractDocumentText(buffer, filename, mimeType = '') {
  const ext = String(filename || '').toLowerCase().split('.').pop();
  const mime = String(mimeType || '').toLowerCase();
  if (ext === 'pdf' || mime.includes('application/pdf')) {
    // pdf-parse bundles an old pdf.js that ignores a Buffer's byteOffset. Small Buffers (< 4 KB, e.g. from an
    // upload) are slices of Node's shared memory pool, so parsing them directly fails or reads neighbouring bytes.
    // A Uint8Array copy owns its memory and parses correctly.
    const parsed = await pdfParse(new Uint8Array(buffer));
    return cleanExtractedText(parsed.text || '');
  }
  if (ext === 'docx' || mime.includes('wordprocessingml')) {
    const parsed = await mammoth.extractRawText({ buffer });
    return cleanExtractedText(parsed.value || '');
  }
  if (ext === 'pptx' || mime.includes('presentationml')) {
    const zip = await JSZip.loadAsync(buffer);
    const slideNames = Object.keys(zip.files)
      .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
      .sort((a, b) => Number(a.match(/slide(\d+)/i)?.[1] || 0) - Number(b.match(/slide(\d+)/i)?.[1] || 0));
    const slides = [];
    for (const name of slideNames) {
      const xml = await zip.files[name].async('string');
      const text = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(match => match[1]).join(' ');
      if (text.trim()) slides.push(text);
    }
    return cleanExtractedText(slides.join('\n\n'));
  }
  if (['txt', 'md', 'csv', 'html', 'htm', 'xml'].includes(ext) || mime.startsWith('text/')) {
    return cleanExtractedText(buffer.toString('utf8'));
  }
  return '';
}

async function embedBatch(texts) {
  if (!texts.length) return [];
  const response = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
    signal: AbortSignal.timeout(60000)
  });
  if (!response.ok) throw new Error(`Embedding model ${EMBED_MODEL} is unavailable (${response.status}).`);
  const payload = await response.json();
  const embeddings = payload.embeddings || [];
  if (embeddings.length !== texts.length) throw new Error('Ollama returned an unexpected embedding count.');
  if (embeddings.some(item => !Array.isArray(item) || item.length !== EMBEDDING_DIMENSIONS || item.some(value => !Number.isFinite(value)))) {
    throw new Error(`Expected ${EMBEDDING_DIMENSIONS}-dimension embeddings from ${EMBED_MODEL}.`);
  }
  return embeddings;
}

export async function embedQuery(text) {
  try {
    const [embedding] = await embedBatch([String(text).slice(0, 6000)]);
    return embedding || null;
  } catch {
    return null;
  }
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export async function indexTextDocuments(userId, documents) {
  const summary = { documents_indexed: 0, chunks_indexed: 0, skipped: 0, embedding_available: false, warnings: [] };
  const prepared = [];

  for (const document of documents) {
    const text = cleanExtractedText(document.text || '');
    const chunks = chunkText(text);
    if (!chunks.length) { summary.skipped += 1; continue; }
    const sourceType = String(document.sourceType || 'course').slice(0, 30);
    const sourceId = String(document.sourceId || '').slice(0, 500);
    if (!sourceId) { summary.skipped += 1; continue; }
    prepared.push({
      sourceType,
      sourceId,
      sessionId: document.sessionId || null,
      title: String(document.title || 'Untitled document').slice(0, 500),
      sourceUrl: document.sourceUrl || null,
      courseName: document.courseName || null,
      contentHash: digest(text),
      chunks
    });
  }

  const changed = [];
  for (const document of prepared) {
    const existing = await pool.query(
      `SELECT d.id, d.content_hash, EXISTS (SELECT 1 FROM ai_chunks c WHERE c.document_id=d.id AND c.embedding IS NULL) AS missing_embeddings
       FROM ai_documents d WHERE d.user_id=$1 AND d.source_type=$2 AND d.source_id=$3`,
      [userId, document.sourceType, document.sourceId]
    );
    if (existing.rowCount && existing.rows[0].content_hash === document.contentHash && !existing.rows[0].missing_embeddings) {
      summary.skipped += 1;
      continue;
    }
    changed.push({ ...document, existingId: existing.rows[0]?.id || null });
  }

  if (!changed.length) return summary;

  const allChunks = changed.flatMap(document => document.chunks.map((content, index) => ({ document, content, index })));
  let embeddings = new Array(allChunks.length).fill(null);
  try {
    const batchSize = 24;
    const computed = [];
    for (let offset = 0; offset < allChunks.length; offset += batchSize) {
      computed.push(...await embedBatch(allChunks.slice(offset, offset + batchSize).map(item => item.content)));
    }
    embeddings = computed;
    summary.embedding_available = true;
  } catch (error) {
    summary.warnings.push(`Documents were indexed for keyword search, but semantic embeddings are unavailable: ${error.message}`);
  }

  let cursor = 0;
  for (const document of changed) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let documentId = document.existingId;
      const titleEncrypted = encryptSecret(JSON.stringify({
        title: document.title,
        source_url: document.sourceUrl,
        course_name: document.courseName
      }));
      if (documentId) {
        await client.query(
          `UPDATE ai_documents SET title_ciphertext=$2,title_iv=$3,title_tag=$4,content_hash=$5,indexed_at=NOW(),updated_at=NOW()
           WHERE id=$1 AND user_id=$6`,
          [documentId, titleEncrypted.ciphertext, titleEncrypted.iv, titleEncrypted.tag, document.contentHash, userId]
        );
        await client.query('DELETE FROM ai_chunks WHERE document_id=$1 AND user_id=$2', [documentId, userId]);
      } else {
        const inserted = await client.query(
          `INSERT INTO ai_documents (user_id,source_type,source_id,title_ciphertext,title_iv,title_tag,content_hash)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [userId, document.sourceType, document.sourceId, titleEncrypted.ciphertext, titleEncrypted.iv, titleEncrypted.tag, document.contentHash]
        );
        documentId = inserted.rows[0].id;
        // Chat attachments are tagged with their session (column added by migration 008).
        if (document.sessionId) {
          await client.query('UPDATE ai_documents SET session_id=$1 WHERE id=$2 AND user_id=$3', [document.sessionId, documentId, userId]);
        }
      }
      for (let chunkIndex = 0; chunkIndex < document.chunks.length; chunkIndex += 1) {
        const content = document.chunks[chunkIndex];
        const encrypted = encryptSecret(content);
        const embedding = embeddings[cursor++];
        const vectorValue = embedding ? `[${embedding.join(',')}]` : null;
        await client.query(
          `INSERT INTO ai_chunks (user_id,document_id,chunk_index,content_ciphertext,content_iv,content_tag,embedding)
           VALUES ($1,$2,$3,$4,$5,$6,$7::vector)`,
          [userId, documentId, chunkIndex, encrypted.ciphertext, encrypted.iv, encrypted.tag, vectorValue]
        );
      }
      await client.query('COMMIT');
      summary.documents_indexed += 1;
      summary.chunks_indexed += document.chunks.length;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
  return summary;
}

export function decryptChunk(row) {
  return decryptSecret({ ciphertext: row.content_ciphertext, iv: row.content_iv, tag: row.content_tag });
}

export function decryptDocumentTitle(row) {
  return JSON.parse(decryptSecret({ ciphertext: row.title_ciphertext, iv: row.title_iv, tag: row.title_tag }));
}