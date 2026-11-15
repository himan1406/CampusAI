import { providerGet } from '../oauth.js';

function headerValue(headers, name) {
  return headers?.find(h => String(h.name).toLowerCase() === name.toLowerCase())?.value || '';
}
function decodeBase64Url(value) {
  if (!value) return '';
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}
function stripHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
}
function collectGmailBody(part, output) {
  if (!part) return;
  if (part.mimeType === 'text/plain' && part.body?.data) output.plain.push(decodeBase64Url(part.body.data));
  if (part.mimeType === 'text/html' && part.body?.data) output.html.push(decodeBase64Url(part.body.data));
  for (const child of part.parts || []) collectGmailBody(child, output);
}
function parseFrom(value) {
  const match = String(value || '').match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1].replace(/^"|"$/g, ''), email: match[2] };
  return { name: '', email: String(value || '').trim() };
}

export async function fetchGmailMessages(accessToken, limit) {
  const list = await providerGet(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${limit}&q=${encodeURIComponent('in:inbox')}`,
    accessToken
  );
  const ids = list.messages || [];
  const messages = [];
  for (let i = 0; i < ids.length; i += 5) {
    const batch = ids.slice(i, i + 5);
    const rows = await Promise.all(batch.map(async item => {
      const message = await providerGet(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=full`,
        accessToken
      );
      const headers = message.payload?.headers || [];
      const from = parseFrom(headerValue(headers, 'From'));
      const bodyParts = { plain: [], html: [] };
      collectGmailBody(message.payload, bodyParts);
      const body = bodyParts.plain.join('\n') || stripHtml(bodyParts.html.join('\n')) || message.snippet || '';
      const threadId = message.threadId || item.threadId || null;
      return {
        provider_message_id: message.id,
        provider_thread_id: threadId,
        subject: headerValue(headers, 'Subject') || '(no subject)',
        from_name: from.name || null,
        from_email: from.email || null,
        received_at: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : null,
        snippet: message.snippet || '',
        body_text: body.slice(0, 100000),
        is_read: !(message.labelIds || []).includes('UNREAD'),
        web_url: threadId ? `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(threadId)}` : null
      };
    }));
    messages.push(...rows);
  }
  return messages;
}
