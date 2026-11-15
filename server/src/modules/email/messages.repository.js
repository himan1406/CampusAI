import { pool } from '../../db/pool.js';
import { encryptSecret, decryptSecret } from '../../lib/vault.js';
import { indexTextDocuments } from '../ai/rag/indexer.js';

export async function upsertMessages(userId, provider, messages) {
  let count = 0;
  for (const message of messages) {
    // Encrypt all human-readable message content, not just the body.
    const encryptedContent = encryptSecret(JSON.stringify({
      subject: message.subject || '(no subject)',
      from_name: message.from_name || null,
      from_email: message.from_email || null,
      snippet: message.snippet || '',
      body_text: message.body_text || ''
    }));
    await pool.query(
      `INSERT INTO email_messages
        (user_id, provider, provider_message_id, provider_thread_id, received_at,
         content_ciphertext, content_iv, content_tag, is_read, web_url, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
       ON CONFLICT (user_id, provider, provider_message_id) DO UPDATE SET
         provider_thread_id=EXCLUDED.provider_thread_id, received_at=EXCLUDED.received_at,
         content_ciphertext=EXCLUDED.content_ciphertext, content_iv=EXCLUDED.content_iv,
         content_tag=EXCLUDED.content_tag, is_read=EXCLUDED.is_read,
         web_url=EXCLUDED.web_url, synced_at=NOW(), updated_at=NOW()`,
      [userId, provider, message.provider_message_id, message.provider_thread_id,
        message.received_at, encryptedContent.ciphertext, encryptedContent.iv,
        encryptedContent.tag, message.is_read, message.web_url]
    );
    count += 1;
  }
  await pool.query(
    'UPDATE email_accounts SET last_sync_at=NOW(), updated_at=NOW() WHERE user_id=$1 AND provider=$2',
    [userId, provider]
  );
  let indexing = { documents_indexed: 0, chunks_indexed: 0, warnings: [] };
  try {
    indexing = await indexTextDocuments(userId, messages.map(message => ({
      sourceType: 'email',
      sourceId: `email:${provider}:${message.provider_message_id}`,
      title: `${message.subject || '(no subject)'} — ${message.from_name || message.from_email || provider}`,
      sourceUrl: message.web_url || null,
      text: `Subject: ${message.subject || ''}\nFrom: ${message.from_name || ''} <${message.from_email || ''}>\nDate: ${message.received_at || ''}\n\n${message.snippet || ''}\n\n${String(message.body_text || '').slice(0, 18000)}`
    })));
  } catch (error) {
    indexing.warnings = [`Email sync succeeded, but AI indexing failed: ${String(error.message || error).slice(0, 200)}`];
  }
  return { count, indexing };
}

export async function listMessages(userId, { provider, limit, search }) {
  const values = [userId];
  let where = 'user_id=$1';
  if (provider) { values.push(provider); where += ` AND provider=$${values.length}`; }
  // Search is applied after decryption so message content never needs plaintext DB indexes.
  const candidateLimit = search ? Math.min(500, limit * 10) : limit;
  values.push(candidateLimit);
  const result = await pool.query(
    `SELECT id, provider, provider_message_id, provider_thread_id, received_at,
      content_ciphertext, content_iv, content_tag, is_read, web_url, synced_at
     FROM email_messages WHERE ${where}
     ORDER BY received_at DESC NULLS LAST LIMIT $${values.length}`,
    values
  );
  let messages = result.rows.map(row => {
    const { content_ciphertext, content_iv, content_tag, ...metadata } = row;
    const content = JSON.parse(decryptSecret({ ciphertext: content_ciphertext, iv: content_iv, tag: content_tag }));
    return { ...metadata, ...content };
  });
  if (search) {
    messages = messages.filter(message =>
      [message.subject, message.from_name, message.from_email, message.snippet, message.body_text]
        .some(value => String(value || '').toLowerCase().includes(search))
    );
  }
  return messages.slice(0, limit);
}
