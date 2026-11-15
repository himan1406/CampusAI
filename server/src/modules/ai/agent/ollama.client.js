import '../../../config/env.js';
import { campusTools } from '../tools/definitions.js';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b';
// Ollama's default context window is small and silently truncates long prompts (attached documents).
const NUM_CTX = Math.max(2048, Math.min(32768, Number(process.env.OLLAMA_NUM_CTX || 8192)));

export async function callOllama(messages, tools = campusTools) {
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

export async function streamOllamaChat(messages, onToken) {
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages,
      stream: true,
      options: { temperature: 0.3 }
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => 'Unknown Ollama error');
    throw new Error(`Ollama returned ${response.status}: ${detail}`);
  }
  if (!response.body) throw new Error('Ollama returned an empty response stream');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      const payload = JSON.parse(line);
      const token = payload.message?.content || '';
      if (token) {
        fullText += token;
        onToken(token);
      }
      if (payload.error) throw new Error(payload.error);
    }
  }

  if (buffer.trim()) {
    const payload = JSON.parse(buffer);
    const token = payload.message?.content || '';
    if (token) {
      fullText += token;
      onToken(token);
    }
  }

  return fullText;
}

export async function checkOllama() {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2500) });
    return response.ok;
  } catch {
    return false;
  }
}
