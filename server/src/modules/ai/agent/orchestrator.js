import '../../../config/env.js';
import { campusTools, toolLabels } from '../tools/definitions.js';
import { executeTool } from '../tools/index.js';
import { callOllama } from './ollama.client.js';

const MAX_TOOL_ROUNDS = Math.max(1, Math.min(10, Number(process.env.AI_MAX_TOOL_ROUNDS || 6)));
const MAX_TOOL_CALLS = Math.max(1, Math.min(16, Number(process.env.AI_MAX_TOOL_CALLS || 8)));
const ATTACHMENT_TOOL_NAMES = new Set(['search_attachments', 'read_attachment']);
const DOC_NOUN = '(?:pdf|docx?|document|file|ppt|pptx|slides?|slide deck|presentation|paper|report|notes|assignment|syllabus|attachment|upload)';
const ATTACHMENT_REFERENCE = new RegExp(`\\b(?:attached|uploaded|this|that|the|my|these|those)\\s+${DOC_NOUN}s?\\b|\\b(?:summari[sz]e|explain|review|analy[sz]e|read)\\s+(?:this|it|that)\\b|\\bin\\s+(?:the|this)\\s+(?:document|file|pdf|presentation)\\b`, 'i');
const OVERVIEW_REQUEST = /\b(?:summari[sz]e|summary|overview|explain|review|analy[sz]e|read|what(?:'s| is) (?:this|it) about|key points|main points)\b/i;

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
