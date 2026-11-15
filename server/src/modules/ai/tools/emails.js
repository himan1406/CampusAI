import '../../../config/env.js';
import { pool } from '../../../db/pool.js';
import { decryptSecret } from '../../../lib/vault.js';
import { embedQuery } from '../rag/embeddings.js';
import { keywordScore, source } from './helpers.js';

function decryptEmail(row) {
  return JSON.parse(decryptSecret({ ciphertext: row.content_ciphertext, iv: row.content_iv, tag: row.content_tag }));
}

async function loadEmails(userId, args = {}) {
  const values = [userId];
  let where = 'user_id=$1';
  if (args.provider) { values.push(args.provider); where += ` AND provider=$${values.length}`; }
  values.push(Math.max(1, Math.min(250, Number(args.candidate_limit) || 250)));
  const result = await pool.query(
    `SELECT id,provider,provider_message_id,provider_thread_id,received_at,content_ciphertext,content_iv,content_tag,is_read,web_url
     FROM email_messages WHERE ${where} ORDER BY received_at DESC NULLS LAST LIMIT $${values.length}`,
    values
  );
  return result.rows.map(row => ({ ...row, ...decryptEmail(row) }));
}

export async function searchEmails(userId, args) {
  const query = String(args.query || '').trim().slice(0, 1000);
  const messages = await loadEmails(userId, { provider: args.provider, candidate_limit: 250 });
  const semanticScores = new Map();
  const embedding = await embedQuery(query);
  if (embedding) {
    const vector = `[${embedding.join(',')}]`;
    const semantic = await pool.query(
      `SELECT d.source_id,c.embedding <=> $2::vector AS distance
       FROM ai_chunks c JOIN ai_documents d ON d.id=c.document_id
       WHERE c.user_id=$1 AND d.user_id=$1 AND d.source_type='email' AND c.embedding IS NOT NULL
       ORDER BY c.embedding <=> $2::vector LIMIT 60`, [userId, vector]
    );
    for (const row of semantic.rows) {
      const key = String(row.source_id || '').replace(/^email:/, '');
      const score = 1 - Number(row.distance || 1);
      semanticScores.set(key, Math.max(semanticScores.get(key) || 0, score));
    }
  }
  const ranked = messages.map(message => {
    const key = `${message.provider}:${message.provider_message_id}`;
    const semanticScore = semanticScores.get(key) || 0;
    const lexicalScore = keywordScore(query, `${message.subject}\n${message.from_name}\n${message.from_email}\n${message.snippet}\n${message.body_text}`);
    return { message, score: embedding ? semanticScore * 0.72 + lexicalScore * 0.28 : lexicalScore };
  }).filter(item => item.score > 0.03)
    .sort((a, b) => b.score - a.score || new Date(b.message.received_at || 0) - new Date(a.message.received_at || 0));
  const results = ranked.slice(0, Math.max(1, Math.min(6, Number(args.limit) || 5))).map(({ message }) => ({
    id: message.id, provider: message.provider, subject: message.subject, from_name: message.from_name,
    from_email: message.from_email, received_at: message.received_at, snippet: message.snippet,
    body_excerpt: String(message.body_text || '').slice(0, 1200), provider_thread_id: message.provider_thread_id,
    web_url: message.web_url, is_read: message.is_read
  }));
  return { data: { count: results.length, retrieval: embedding ? 'hybrid semantic + keyword' : 'keyword fallback', results, note: results.length ? undefined : 'No synchronized email matched those search terms. Sync the inbox or try different keywords.' }, sources: results.map(item => source('email', `${item.subject} · ${item.from_name || item.from_email || item.provider}`, item.web_url, item.id)) };
}

export async function getRecentEmails(userId, args) {
  const messages = await loadEmails(userId, { provider: args.provider, candidate_limit: Math.max(1, Math.min(10, Number(args.limit) || 8)) });
  const results = messages.map(message => ({ id: message.id, provider: message.provider, subject: message.subject, from_name: message.from_name, from_email: message.from_email, received_at: message.received_at, snippet: message.snippet, body_excerpt: String(message.body_text || '').slice(0, 1800), provider_thread_id: message.provider_thread_id, web_url: message.web_url, is_read: message.is_read }));
  return { data: { count: results.length, results }, sources: results.map(item => source('email', `${item.subject} · ${item.from_name || item.from_email || item.provider}`, item.web_url, item.id)) };
}

export async function getEmailThread(userId, args) {
  const messages = await loadEmails(userId, { provider: args.provider, candidate_limit: 250 });
  const results = messages.filter(message => message.provider_thread_id === args.provider_thread_id)
    .sort((a, b) => new Date(a.received_at || 0) - new Date(b.received_at || 0))
    .slice(0, Math.max(1, Math.min(6, Number(args.limit) || 6)))
    .map(message => ({ id: message.id, provider: message.provider, subject: message.subject, from_name: message.from_name, from_email: message.from_email, received_at: message.received_at, body: String(message.body_text || '').slice(0, 1800), web_url: message.web_url }));
  return { data: { count: results.length, messages: results }, sources: results.map(item => source('email', `${item.subject} · ${item.from_name || item.from_email || item.provider}`, item.web_url, item.id)) };
}
