import crypto from 'node:crypto';
import { pool } from '../../../db/pool.js';
import { encryptSecret } from '../../../lib/vault.js';
import { cleanExtractedText } from './extract.js';
import { chunkText } from './chunk.js';
import { embedBatch } from './embeddings.js';

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
