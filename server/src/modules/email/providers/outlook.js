import { providerGet } from '../oauth.js';

export async function fetchOutlookMessages(accessToken, limit) {
  const select = 'id,conversationId,subject,from,receivedDateTime,bodyPreview,body,isRead,webLink';
  const url = new URL('https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages');
  url.searchParams.set('$top', String(limit));
  url.searchParams.set('$select', select);
  url.searchParams.set('$orderby', 'receivedDateTime desc');
  const payload = await providerGet(url.toString(), accessToken, {
    Prefer: 'outlook.body-content-type="text", IdType="ImmutableId"'
  });
  return (payload.value || []).map(message => ({
    provider_message_id: message.id,
    provider_thread_id: message.conversationId || null,
    subject: message.subject || '(no subject)',
    from_name: message.from?.emailAddress?.name || null,
    from_email: message.from?.emailAddress?.address || null,
    received_at: message.receivedDateTime || null,
    snippet: message.bodyPreview || '',
    body_text: String(message.body?.content || message.bodyPreview || '').slice(0, 100000),
    is_read: Boolean(message.isRead),
    web_url: message.webLink || null
  }));
}
