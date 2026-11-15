import { getFreshTokens } from './oauth.js';
import { fetchGmailMessages } from './providers/gmail.js';
import { fetchOutlookMessages } from './providers/outlook.js';
import { upsertMessages } from './messages.repository.js';

export async function syncProvider(userId, provider, limit) {
  const tokens = await getFreshTokens(userId, provider);
  const messages = provider === 'gmail'
    ? await fetchGmailMessages(tokens.access_token, limit)
    : await fetchOutlookMessages(tokens.access_token, limit);
  const sync = await upsertMessages(userId, provider, messages);
  return {
    provider, synced: sync.count,
    indexed_documents: sync.indexing.documents_indexed || 0,
    indexed_chunks: sync.indexing.chunks_indexed || 0,
    warnings: sync.indexing.warnings || [],
    message: `Synced ${sync.count} messages and indexed ${sync.indexing.documents_indexed || 0} for Campus AI.`
  };
}
