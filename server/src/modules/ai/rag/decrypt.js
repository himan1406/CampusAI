import { decryptSecret } from '../../../lib/vault.js';

export function decryptChunk(row) {
  return decryptSecret({ ciphertext: row.content_ciphertext, iv: row.content_iv, tag: row.content_tag });
}

export function decryptDocumentTitle(row) {
  return JSON.parse(decryptSecret({ ciphertext: row.title_ciphertext, iv: row.title_iv, tag: row.title_tag }));
}
