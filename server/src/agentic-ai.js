import { z } from 'zod';
import { pool } from './db/pool.js';
import { decryptSecret } from './lib/vault.js';
import { decryptChunk, decryptDocumentTitle, embedQuery } from './document-indexer.js';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b';
const MAX_TOOL_ROUNDS = Math.max(1, Math.min(10, Number(process.env.AI_MAX_TOOL_ROUNDS || 6)));
const MAX_TOOL_CALLS = Math.max(1, Math.min(16, Number(process.env.AI_MAX_TOOL_CALLS || 8)));
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';
// Ollama's default context window is small and silently truncates long prompts (attached documents).
const NUM_CTX = Math.max(2048, Math.min(32768, Number(process.env.OLLAMA_NUM_CTX || 8192)));
const ATTACHMENT_PART_CHUNKS = 3;
const ATTACHMENT_TOOL_NAMES = new Set(['search_attachments', 'read_attachment']);
const DOC_NOUN = '(?:pdf|docx?|document|file|ppt|pptx|slides?|slide deck|presentation|paper|report|notes|assignment|syllabus|attachment|upload)';
const ATTACHMENT_REFERENCE = new RegExp(`\\b(?:attached|uploaded|this|that|the|my|these|those)\\s+${DOC_NOUN}s?\\b|\\b(?:summari[sz]e|explain|review|analy[sz]e|read)\\s+(?:this|it|that)\\b|\\bin\\s+(?:the|this)\\s+(?:document|file|pdf|presentation)\\b`, 'i');
const OVERVIEW_REQUEST = /\b(?:summari[sz]e|summary|overview|explain|review|analy[sz]e|read|what(?:'s| is) (?:this|it) about|key points|main points)\b/i;

export const campusTools = [
  { type: 'function', function: { name: 'get_courses', description: 'Get the authenticated student’s enrolled iLearn courses. Use for questions about what courses they take or course names.', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'get_upcoming_events', description: 'Get the student’s iLearn calendar events. Use for exam dates, deadlines, upcoming events, or schedule questions. Optional date range uses YYYY-MM-DD.', parameters: { type: 'object', properties: { start_date: { type: 'string', description: 'Optional inclusive start date, YYYY-MM-DD.' }, end_date: { type: 'string', description: 'Optional inclusive end date, YYYY-MM-DD.' }, course_name: { type: 'string', description: 'Optional course name filter.' }, limit: { type: 'integer', minimum: 1, maximum: 40 } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'search_course_materials', description: 'Search indexed Moodle course resources, PDFs, Word documents, PowerPoints, course pages and course summaries. Use for questions about topics, notes, chapters, course content or explanations grounded in the student’s material.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'What to find in the course materials.' }, course_name: { type: 'string', description: 'Optional enrolled course name filter.' }, limit: { type: 'integer', minimum: 1, maximum: 8 } }, required: ['query'], additionalProperties: false } } },
  { type: 'function', function: { name: 'search_emails', description: 'Search the authenticated student’s synchronized Gmail and Outlook inbox cache by sender, subject and message content. Use for professor instructions, announcements and specific email questions.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Search terms or a description of the email to find.' }, provider: { type: 'string', enum: ['gmail', 'outlook'] }, limit: { type: 'integer', minimum: 1, maximum: 10 } }, required: ['query'], additionalProperties: false } } },
  { type: 'function', function: { name: 'get_recent_emails', description: 'Get the most recently synchronized emails from the student’s connected inboxes. Use when asked to summarize recent inbox activity or show recent messages.', parameters: { type: 'object', properties: { provider: { type: 'string', enum: ['gmail', 'outlook'] }, limit: { type: 'integer', minimum: 1, maximum: 15 } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'get_email_thread', description: 'Retrieve messages from one email conversation/thread after it has been found by search_emails. Requires provider and provider_thread_id from a search result.', parameters: { type: 'object', properties: { provider: { type: 'string', enum: ['gmail', 'outlook'] }, provider_thread_id: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 10 } }, required: ['provider', 'provider_thread_id'], additionalProperties: false } } },
  { type: 'function', function: { name: 'search_attachments', description: 'Search the documents the student attached to THIS chat (PDF, Word, PowerPoint, text, CSV). Use for specific questions about an attached or uploaded file.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'What to find in the attached documents.' }, limit: { type: 'integer', minimum: 1, maximum: 8 } }, required: ['query'], additionalProperties: false } } },
  { type: 'function', function: { name: 'read_attachment', description: 'Read an attached document in order, a few sections at a time. Use to summarize, explain or review a whole attached file. Call again with the next part number until total_parts is reached.', parameters: { type: 'object', properties: { file_name: { type: 'string', description: 'Optional attached file name (or part of it). Defaults to the first attachment.' }, part: { type: 'integer', minimum: 1, maximum: 200, description: 'Part number to read, starting at 1.' } }, additionalProperties: false } } }
];

function decryptLms(row) {
  return JSON.parse(decryptSecret({ ciphertext: row.payload_ciphertext, iv: row.payload_iv, tag: row.payload_tag }));
}

function decryptEmail(row) {
  return JSON.parse(decryptSecret({ ciphertext: row.content_ciphertext, iv: row.content_iv, tag: row.content_tag }));
}

function source(type, label, url, id) {
  return { type, label: String(label || 'Source').slice(0, 180), url: url || null, id: id || null };
}

function tokenize(value) {
  return String(value || '').toLowerCase().match(/[a-z0-9][a-z0-9_-]{1,}/g) || [];
}

function keywordScore(query, content) {
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

async function getCourses(userId) {
  const result = await pool.query(
    `SELECT id,payload_ciphertext,payload_iv,payload_tag FROM lms_items
     WHERE user_id=$1 AND item_type='course' ORDER BY updated_at DESC LIMIT 100`, [userId]
  );
  const courses = result.rows.map(row => {
    const payload = decryptLms(row);
    return { id: payload.metadata?.course_id || payload.external_id, title: payload.title, shortname: payload.metadata?.shortname, url: payload.source_url };
  });
  return { data: { count: courses.length, courses }, sources: courses.map(item => source('course', item.title, item.url, item.id)) };
}

function validDateKey(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : value;
}

function localDateKey(value) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}

async function getUpcomingEvents(userId, args) {
  const now = new Date();
  const startKey = validDateKey(args.start_date) || localDateKey(now);
  const endKey = validDateKey(args.end_date) || localDateKey(new Date(now.getTime() + 30 * 86400000));
  const start = new Date(`${startKey}T00:00:00.000Z`);
  const end = new Date(`${endKey}T00:00:00.000Z`);
  if (end < start || end - start > 366 * 86400000) return { error: 'Choose a valid date range of no more than one year.', data: null, sources: [] };
  const result = await pool.query(
    `SELECT id,payload_ciphertext,payload_iv,payload_tag FROM lms_items
     WHERE user_id=$1 AND item_type='calendar' ORDER BY updated_at DESC LIMIT 500`, [userId]
  );
  const courseFilter = String(args.course_name || '').toLowerCase();
  const events = result.rows.map(row => ({ id: row.id, ...decryptLms(row) }))
    .filter(event => {
      const eventDate = new Date(Number(event.timestart || 0) * 1000);
      const eventKey = localDateKey(eventDate);
      return eventKey >= startKey && eventKey <= endKey && (!courseFilter || String(event.course_name || '').toLowerCase().includes(courseFilter));
    })
    .sort((a, b) => Number(a.timestart) - Number(b.timestart))
    .slice(0, Math.max(1, Math.min(20, Number(args.limit) || 15)))
    .map(event => ({
      id: event.id, title: event.title, course_name: event.course_name,
      start: new Intl.DateTimeFormat('en-IN', { timeZone: APP_TIMEZONE, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(Number(event.timestart) * 1000)),
      end: new Intl.DateTimeFormat('en-IN', { timeZone: APP_TIMEZONE, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(Number(event.timeend || event.timestart) * 1000)),
      timezone: APP_TIMEZONE, description: String(event.content_text || '').slice(0, 400), type: event.eventtype, url: event.source_url
    }));
  return { data: { count: events.length, events }, sources: events.map(event => source('calendar', `${event.title}${event.course_name ? ` · ${event.course_name}` : ''}`, event.url, event.id)) };
}

async function searchIndexedChunks(userId, args, scope) {
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

function searchCourseMaterials(userId, args) {
  return searchIndexedChunks(userId, args, {
    sourceType: 'course', label: 'course material',
    emptyNote: 'No indexed course material matched. Ask the student to sync iLearn course contents and check that the embedding model is installed.'
  });
}

function searchAttachments(userId, args, ctx) {
  if (!ctx.sessionId) return { data: { count: 0, results: [], note: 'No chat session is active.' }, sources: [] };
  return searchIndexedChunks(userId, args, {
    sourceType: 'upload', sessionId: ctx.sessionId, label: 'attachment',
    emptyNote: 'No passage in the attached documents matched. Try different keywords, or use read_attachment to read the document in order.'
  });
}

// Chunks overlap by up to RAG_CHUNK_OVERLAP characters; remove the repeated part so the text reads continuously.
function stitchChunks(texts) {
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

async function readAttachment(userId, args, ctx) {
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

async function searchEmails(userId, args) {
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

async function getRecentEmails(userId, args) {
  const messages = await loadEmails(userId, { provider: args.provider, candidate_limit: Math.max(1, Math.min(10, Number(args.limit) || 8)) });
  const results = messages.map(message => ({ id: message.id, provider: message.provider, subject: message.subject, from_name: message.from_name, from_email: message.from_email, received_at: message.received_at, snippet: message.snippet, body_excerpt: String(message.body_text || '').slice(0, 1800), provider_thread_id: message.provider_thread_id, web_url: message.web_url, is_read: message.is_read }));
  return { data: { count: results.length, results }, sources: results.map(item => source('email', `${item.subject} · ${item.from_name || item.from_email || item.provider}`, item.web_url, item.id)) };
}

async function getEmailThread(userId, args) {
  const messages = await loadEmails(userId, { provider: args.provider, candidate_limit: 250 });
  const results = messages.filter(message => message.provider_thread_id === args.provider_thread_id)
    .sort((a, b) => new Date(a.received_at || 0) - new Date(b.received_at || 0))
    .slice(0, Math.max(1, Math.min(6, Number(args.limit) || 6)))
    .map(message => ({ id: message.id, provider: message.provider, subject: message.subject, from_name: message.from_name, from_email: message.from_email, received_at: message.received_at, body: String(message.body_text || '').slice(0, 1800), web_url: message.web_url }));
  return { data: { count: results.length, messages: results }, sources: results.map(item => source('email', `${item.subject} · ${item.from_name || item.from_email || item.provider}`, item.web_url, item.id)) };
}

const validators = {
  get_courses: z.object({}).strict(),
  get_upcoming_events: z.object({ start_date: z.string().optional(), end_date: z.string().optional(), course_name: z.string().max(160).optional(), limit: z.number().int().min(1).max(40).optional() }).strict(),
  search_course_materials: z.object({ query: z.string().min(1).max(1000), course_name: z.string().max(160).optional(), limit: z.number().int().min(1).max(8).optional() }).strict(),
  search_emails: z.object({ query: z.string().min(1).max(1000), provider: z.enum(['gmail', 'outlook']).optional(), limit: z.number().int().min(1).max(10).optional() }).strict(),
  get_recent_emails: z.object({ provider: z.enum(['gmail', 'outlook']).optional(), limit: z.number().int().min(1).max(15).optional() }).strict(),
  get_email_thread: z.object({ provider: z.enum(['gmail', 'outlook']), provider_thread_id: z.string().min(1).max(500), limit: z.number().int().min(1).max(10).optional() }).strict(),
  search_attachments: z.object({ query: z.string().min(1).max(1000), limit: z.coerce.number().int().min(1).max(8).optional() }).strict(),
  read_attachment: z.object({ file_name: z.string().max(200).optional(), part: z.coerce.number().int().min(1).max(200).optional() }).strict()
};

const toolLabels = {
  get_courses: 'Checking your enrolled courses',
  get_upcoming_events: 'Checking your iLearn calendar',
  search_course_materials: 'Searching your course materials',
  search_emails: 'Searching your synchronized inboxes',
  get_recent_emails: 'Reading your recent inbox activity',
  get_email_thread: 'Opening the email conversation',
  search_attachments: 'Searching your attached documents',
  read_attachment: 'Reading your attached document'
};

async function executeTool(userId, name, rawArgs, ctx = {}) {
  const validator = validators[name];
  if (!validator) throw new Error('Tool is not available.');
  const parsed = validator.safeParse(rawArgs && typeof rawArgs === 'object' ? rawArgs : {});
  if (!parsed.success) return { error: 'The tool arguments were invalid. Please try a narrower request.', sources: [] };
  switch (name) {
    case 'get_courses': return getCourses(userId);
    case 'get_upcoming_events': return getUpcomingEvents(userId, parsed.data);
    case 'search_course_materials': return searchCourseMaterials(userId, parsed.data);
    case 'search_emails': return searchEmails(userId, parsed.data);
    case 'get_recent_emails': return getRecentEmails(userId, parsed.data);
    case 'get_email_thread': return getEmailThread(userId, parsed.data);
    case 'search_attachments': return searchAttachments(userId, parsed.data, ctx);
    case 'read_attachment': return readAttachment(userId, parsed.data, ctx);
    default: throw new Error('Tool is not available.');
  }
}

async function callOllama(messages, tools = campusTools) {
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, tools, stream: false, options: { temperature: 0.2, num_ctx: NUM_CTX } }),
    signal: AbortSignal.timeout(120000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Ollama returned HTTP ${response.status}`);
  if (payload.error) throw new Error(payload.error);
  if (!payload.message) throw new Error('Ollama returned an unexpected chat response.');
  return payload.message;
}

export async function runAgenticChat({ userId, sessionId = null, attachments = [], messages, onEvent = () => {} }) {
  const hasAttachments = Boolean(sessionId) && attachments.length > 0;
  // Only offer the attachment tools when this chat actually has files, so a small model is not tempted to call them.
  const tools = hasAttachments ? campusTools : campusTools.filter(tool => !ATTACHMENT_TOOL_NAMES.has(tool.function.name));
  const workingMessages = [...messages];
  const allSources = new Map();
  const toolHistory = [];
  let totalCalls = 0;
  let finalText = '';
  let forcedAttachmentRead = false;

  async function performToolCall(name, rawArgs) {
    const label = toolLabels[name] || 'Using an AI tool';
    totalCalls += 1;
    onEvent({ type: 'tool.start', name, label });
    let result;
    try {
      result = await executeTool(userId, name, rawArgs, { sessionId });
    } catch (error) {
      result = { error: String(error.message || 'Tool execution failed').slice(0, 240), sources: [] };
    }
    for (const item of (result.sources || [])) {
      const key = `${item.type}:${item.id || item.label}`;
      allSources.set(key, item);
    }
    const compactResult = { ...result };
    delete compactResult.sources;
    const serialized = JSON.stringify(compactResult);
    workingMessages.push({ role: 'tool', content: serialized.slice(0, 14000), tool_name: name || 'unknown' });
    toolHistory.push({ name, label, ok: !result.error });
    onEvent({ type: 'tool.done', name, label, ok: !result.error, count: result.data?.count ?? null });
  }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const assistantMessage = await callOllama(workingMessages, tools);
    workingMessages.push(assistantMessage);
    const calls = Array.isArray(assistantMessage.tool_calls) ? assistantMessage.tool_calls : [];
    if (!calls.length) {
      const latestUserText = [...workingMessages].reverse().find(item => item.role === 'user')?.content || '';

      // Safety net for small models: the student clearly refers to an attached file but the model answered without
      // reading it. Discard that ungrounded answer, run the retrieval ourselves, and let the model answer again.
      if (hasAttachments && totalCalls === 0 && !forcedAttachmentRead && ATTACHMENT_REFERENCE.test(latestUserText)) {
        forcedAttachmentRead = true;
        workingMessages.pop();
        const forced = OVERVIEW_REQUEST.test(latestUserText)
          ? { name: 'read_attachment', args: {} }
          : { name: 'search_attachments', args: { query: latestUserText.slice(0, 500) } };
        workingMessages.push({ role: 'assistant', content: '', tool_calls: [{ function: { name: forced.name, arguments: forced.args } }] });
        await performToolCall(forced.name, forced.args);
        continue;
      }

      finalText = String(assistantMessage.content || '').trim();
      const personalDataIntent = /\b(my|mine|i am enrolled|i'm enrolled|my inbox|my email|my calendar|my course|my notes|my professor|upcoming exam|upcoming deadline|study plan|study week|course materials|course content|professor|deadline|inbox|emails)\b/i.test(latestUserText);
      if (personalDataIntent && totalCalls === 0) {
        finalText = 'I could not retrieve your connected CampusOS data for this question, so I do not want to guess. Try asking me to search your iLearn courses, calendar, course materials, or synchronized inbox explicitly.';
      }
      break;
    }

    for (const call of calls) {
      if (totalCalls >= MAX_TOOL_CALLS) break;
      await performToolCall(call.function?.name, call.function?.arguments || {});
    }
    if (totalCalls >= MAX_TOOL_CALLS) break;
  }

  if (!finalText) {
    const finalMessage = await callOllama(workingMessages, []);
    finalText = String(finalMessage.content || '').trim();
  }
  if (!finalText) finalText = 'I could not produce an answer from the available information. Please try rephrasing your question.';
  const sources = [...allSources.values()].slice(0, 12);
  onEvent({ type: 'message.sources', sources });
  return { answer: finalText, sources, tools_used: toolHistory };
}