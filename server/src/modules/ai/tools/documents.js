import '../../../config/env.js';
import { pool } from '../../../db/pool.js';
import { decryptChunk, decryptDocumentTitle } from '../rag/decrypt.js';
import { embedQuery } from '../rag/embeddings.js';
import { keywordScore, source } from './helpers.js';

const ATTACHMENT_PART_CHUNKS = 3;

export async function searchIndexedChunks(userId, args, scope) {
  const query = String(args.query || '').trim().slice(0, 1000);
  if (!query) return { data: { results: [], note: 'A search query is required.' }, sources: [] };
  const limit = Math.max(1, Math.min(6, Number(args.limit) || 5));
  const scopeValues = [userId, scope.sourceType];
  let scopeSql = 'c.user_id=$1 AND d.user_id=$1 AND d.source_type=$2';
  if (scope.sessionId) { scopeValues.push(scope.sessionId); scopeSql += ` AND d.session_id=$${scopeValues.length}`; }
  const embedding = await embedQuery(query);
  let candidates = [];
  if (embedding) {
    const vector = `[${embedding.join(',')}]`;
    const vectorParam = `$${scopeValues.length + 1}`;
    const semantic = await pool.query(
      `SELECT c.id,c.content_ciphertext,c.content_iv,c.content_tag,c.document_id,
              d.title_ciphertext,d.title_iv,d.title_tag,d.source_id,
              c.embedding <=> ${vectorParam}::vector AS distance
       FROM ai_chunks c JOIN ai_documents d ON d.id=c.document_id
       WHERE ${scopeSql} AND c.embedding IS NOT NULL
       ORDER BY c.embedding <=> ${vectorParam}::vector LIMIT 30`, [...scopeValues, vector]
    );
    candidates = semantic.rows.map(row => ({ ...row, semanticScore: 1 - Number(row.distance || 1) }));
  }
  const fallback = await pool.query(
    `SELECT c.id,c.content_ciphertext,c.content_iv,c.content_tag,c.document_id,
            d.title_ciphertext,d.title_iv,d.title_tag,d.source_id
     FROM ai_chunks c JOIN ai_documents d ON d.id=c.document_id
     WHERE ${scopeSql}
     ORDER BY d.updated_at DESC,c.chunk_index ASC LIMIT 500`, scopeValues
  );
  const byId = new Map(candidates.map(row => [row.id, row]));
  for (const row of fallback.rows) if (!byId.has(row.id)) byId.set(row.id, row);
  const courseFilter = String(args.course_name || '').toLowerCase();
  const ranked = [...byId.values()].map(row => {
    const content = decryptChunk(row);
    const title = decryptDocumentTitle(row);
    const titleText = `${title.title || ''} ${title.course_name || ''}`;
    const lexical = keywordScore(query, `${titleText}\n${content}`);
    const courseMatch = !courseFilter || titleText.toLowerCase().includes(courseFilter);
    return { row, content, title, score: (Number(row.semanticScore || 0) * 0.75) + (lexical * 0.25) + (courseFilter && courseMatch ? 0.2 : 0), courseMatch };
  }).filter(item => item.courseMatch && item.score > 0.03)
    .sort((a, b) => b.score - a.score).slice(0, limit);
  const results = ranked.map(item => ({ title: item.title.title, course_name: item.title.course_name, excerpt: item.content.slice(0, 1800), source_url: item.title.source_url, score: Number(item.score.toFixed(3)) }));
  return {
    data: { count: results.length, retrieval: embedding ? 'hybrid semantic + keyword' : 'keyword fallback', results, note: results.length ? undefined : scope.emptyNote },
    sources: results.map(item => source(scope.label, item.title, item.source_url, item.title))
  };
}

export function searchCourseMaterials(userId, args) {
  return searchIndexedChunks(userId, args, {
    sourceType: 'course', label: 'course material',
    emptyNote: 'No indexed course material matched. Ask the student to sync iLearn course contents and check that the embedding model is installed.'
  });
}

export function searchAttachments(userId, args, ctx) {
  if (!ctx.sessionId) return { data: { count: 0, results: [], note: 'No chat session is active.' }, sources: [] };
  return searchIndexedChunks(userId, args, {
    sourceType: 'upload', sessionId: ctx.sessionId, label: 'attachment',
    emptyNote: 'No passage in the attached documents matched. Try different keywords, or use read_attachment to read the document in order.'
  });
}

// Chunks overlap by up to RAG_CHUNK_OVERLAP characters; remove the repeated part so the text reads continuously.
export function stitchChunks(texts) {
  if (!texts.length) return '';
  let result = texts[0];
  for (const next of texts.slice(1)) {
    let joined = false;
    for (let k = Math.min(result.length, next.length, 800); k >= 20; k -= 1) {
      if (result.endsWith(next.slice(0, k))) { result += next.slice(k); joined = true; break; }
    }
    if (!joined) result += `\n\n${next}`;
  }
  return result;
}

export async function readAttachment(userId, args, ctx) {
  if (!ctx.sessionId) return { data: { note: 'No chat session is active.' }, sources: [] };
  const docs = await pool.query(
    `SELECT d.id,d.title_ciphertext,d.title_iv,d.title_tag FROM ai_documents d
     WHERE d.user_id=$1 AND d.session_id=$2 AND d.source_type='upload' ORDER BY d.indexed_at ASC, d.id ASC`,
    [userId, ctx.sessionId]
  );
  if (!docs.rowCount) return { data: { count: 0, note: 'No documents are attached to this chat.' }, sources: [] };
  const named = docs.rows.map(row => ({ id: row.id, name: decryptDocumentTitle(row).title || 'document' }));
  const wanted = String(args.file_name || '').toLowerCase();
  const pick = (wanted && named.find(item => item.name.toLowerCase().includes(wanted))) || named[0];
  const part = Math.max(1, Number(args.part) || 1);
  const totalChunks = (await pool.query('SELECT COUNT(*)::int AS n FROM ai_chunks WHERE user_id=$1 AND document_id=$2', [userId, pick.id])).rows[0].n;
  const totalParts = Math.max(1, Math.ceil(totalChunks / ATTACHMENT_PART_CHUNKS));
  const attached = named.map(item => item.name);
  if (part > totalParts) {
    return { data: { file: pick.name, part, total_parts: totalParts, attached_files: attached, note: 'There are no more parts. The whole document has been read.' }, sources: [] };
  }
  // From part 2 on, also fetch the chunk just before this part so the overlap with the previous part can be removed.
  const withContext = part > 1;
  const firstChunk = (part - 1) * ATTACHMENT_PART_CHUNKS - (withContext ? 1 : 0);
  const chunks = await pool.query(
    `SELECT content_ciphertext,content_iv,content_tag FROM ai_chunks
     WHERE user_id=$1 AND document_id=$2 ORDER BY chunk_index ASC OFFSET $3 LIMIT $4`,
    [userId, pick.id, firstChunk, ATTACHMENT_PART_CHUNKS + (withContext ? 1 : 0)]
  );
  const texts = chunks.rows.map(decryptChunk);
  const stitched = stitchChunks(texts);
  const partText = withContext ? stitched.slice(texts[0].length).trim() : stitched;
  return {
    data: {
      file: pick.name, part, total_parts: totalParts, attached_files: attached,
      text: partText,
      note: part < totalParts ? `Call read_attachment with part ${part + 1} to continue.` : 'This is the last part.'
    },
    sources: [source('attachment', pick.name, null, pick.id)]
  };
}
