import { decryptSecret } from '../../../lib/vault.js';

export function decryptLms(row) {
  return JSON.parse(decryptSecret({ ciphertext: row.payload_ciphertext, iv: row.payload_iv, tag: row.payload_tag }));
}

export function source(type, label, url, id) {
  return { type, label: String(label || 'Source').slice(0, 180), url: url || null, id: id || null };
}

export function tokenize(value) {
  return String(value || '').toLowerCase().match(/[a-z0-9][a-z0-9_-]{1,}/g) || [];
}

export function keywordScore(query, content) {
  const stop = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'what', 'when', 'where', 'have', 'about', 'into', 'your', 'please', 'find', 'show', 'tell', 'does', 'can', 'you', 'my', 'are', 'was', 'were']);
  const terms = [...new Set(tokenize(query).filter(term => !stop.has(term)))];
  if (!terms.length) return 0;
  const text = String(content || '').toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (text.includes(term)) score += Math.min(5, text.split(term).length - 1) + (text.startsWith(term) ? 1 : 0);
  }
  return score / terms.length;
}
