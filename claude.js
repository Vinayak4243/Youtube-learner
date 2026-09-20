// server/claude.js
//
// Local free-model backend for AdaptPractice.
// By default this prefers Ollama so the app works without paid Anthropic API credits.
// If ANTHROPIC_API_KEY is set and USE_OLLAMA is not true, Anthropic is used instead.

let Anthropic = null;
try {
  Anthropic = require('@anthropic-ai/sdk');
} catch (e) {
  Anthropic = null;
}

const USE_OLLAMA = String(process.env.USE_OLLAMA || '').toLowerCase() === 'true' || !process.env.ANTHROPIC_API_KEY;
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b';
const MODEL = USE_OLLAMA ? OLLAMA_MODEL : (process.env.CLAUDE_MODEL || 'claude-sonnet-5');

let anthropic = null;
if (!USE_OLLAMA && Anthropic && process.env.ANTHROPIC_API_KEY) {
  anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

const SYSTEM = 'You are acting as the AI backend for AdaptPractice, an adaptive learning platform. ' +
  'Follow the instructions in the user message exactly, including any JSON structure it asks for.';

async function askTextOllama(prompt, maxTokens = 1200) {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      options: { num_predict: maxTokens }
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error: ${res.status} ${text}`);
  }

  const data = await res.json();
  const reply = data.message?.content || data.response || '';
  return String(reply).trim();
}

async function askText(prompt, maxTokens = 1200) {
  if (USE_OLLAMA) {
    return askTextOllama(prompt, maxTokens);
  }

  if (!anthropic) {
    throw new Error('No AI backend configured. Set ANTHROPIC_API_KEY or enable Ollama via USE_OLLAMA=true.');
  }

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }]
  });
  return msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
}

/**
 * Ask for a JSON value and parse it. Retries once, showing the model its own
 * broken output, if the first reply isn't valid JSON.
 */
async function askJSON(prompt, maxTokens = 3000) {
  const jsonPrompt = prompt + '\n\nReply with ONLY the JSON value. No prose, no markdown code fences, nothing before or after it.';
  let raw = await askText(jsonPrompt, maxTokens);

  try {
    return extractJSON(raw);
  } catch (firstErr) {
    const repaired = await askText(
      'Your previous reply was:\n' + raw + '\n\nThat was not valid JSON. Return the corrected value as JSON only, nothing else.',
      maxTokens
    );
    return extractJSON(repaired);
  }
}

function extractJSON(text) {
  let t = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const candidateStarts = ['{', '['];
  const start = Math.min(...candidateStarts.map(c => { const i = t.indexOf(c); return i === -1 ? Infinity : i; }));
  const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (start !== Infinity && end !== -1) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

function streamTextOllama(prompt, { onDelta, onEnd, onError, maxTokens = 600 }) {
  fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      options: { num_predict: maxTokens }
    })
  })
    .then(async (res) => {
      if (!res.ok || !res.body) {
        const text = await res.text();
        throw new Error(`Ollama stream error: ${res.status} ${text}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          const line = part.trim();
          if (!line || line === 'data: [DONE]') continue;
          if (!line.startsWith('data:')) continue;

          try {
            const payload = JSON.parse(line.slice(5));
            const delta = payload.message?.content || payload.response || '';
            if (delta) onDelta && onDelta(delta);
            if (payload.done) {
              onEnd && onEnd();
              return;
            }
          } catch (err) {
            // Ignore incomplete partial payloads from the stream.
          }
        }
      }

      onEnd && onEnd();
    })
    .catch((err) => onError && onError(err));
}

/**
 * Stream tokens as they arrive. onDelta(text) is called for each chunk.
 * Used for "I don't understand this" so the explanation appears as it's written.
 */
function streamText(prompt, { onDelta, onEnd, onError, maxTokens = 600 }) {
  if (USE_OLLAMA) {
    return streamTextOllama(prompt, { onDelta, onEnd, onError, maxTokens });
  }

  if (!anthropic) {
    onError && onError(new Error('No AI backend configured. Set ANTHROPIC_API_KEY or enable Ollama via USE_OLLAMA=true.'));
    return null;
  }

  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: maxTokens,
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }]
  });
  stream.on('text', (delta) => onDelta && onDelta(delta));
  stream.on('end', () => onEnd && onEnd());
  stream.on('error', (err) => onError && onError(err));
  return stream;
}

module.exports = { askText, askJSON, streamText, MODEL };
