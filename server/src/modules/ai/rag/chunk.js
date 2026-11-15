import '../../../config/env.js';

const CHUNK_SIZE = Math.max(500, Number(process.env.RAG_CHUNK_SIZE || 1600));
const CHUNK_OVERLAP = Math.max(0, Math.min(CHUNK_SIZE - 100, Number(process.env.RAG_CHUNK_OVERLAP || 250)));

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
