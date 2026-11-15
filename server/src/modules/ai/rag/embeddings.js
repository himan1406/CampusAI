import '../../../config/env.js';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
const EMBEDDING_DIMENSIONS = 768;

export async function embedBatch(texts) {
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
