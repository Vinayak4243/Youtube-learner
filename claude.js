// server/claude.js
//
// The only file that touches the Anthropic SDK and your API key.
// Three capabilities, matching the three things AdaptPractice's frontend
// asks for: plain text, a parsed JSON value, and a live token stream.

const Anthropic = require('@anthropic-ai/sdk');

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY. Copy .env.example to .env and add your key.');
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';

// A light shared system prompt. AdaptPractice's frontend already builds one
// large, fully self-contained prompt per feature (course maps, assignments,
// grading, roadmaps, explanations) — this just tells Claude what app is
// calling and to follow that prompt's own instructions and JSON shape.
const SYSTEM = 'You are Claude, called by AdaptPractice, an adaptive learning platform. ' +
  'Follow the instructions in the user message exactly, including any JSON shape it asks for.';

async function askText(prompt, maxTokens = 1200) {
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }]
  });
  return msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
}

/**
 * Ask for a JSON value and parse it. Retries once, showing Claude its own
 * broken output, if the first reply isn't valid JSON — model output isn't
 * guaranteed to parse cleanly on the first try, especially for long lists.
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
    return extractJSON(repaired); // let this throw if it still fails — caller handles the error
  }
}

function extractJSON(text) {
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = Math.min(...['{', '['].map(c => { const i = t.indexOf(c); return i === -1 ? Infinity : i; }));
  const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (start !== Infinity && end !== -1) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

/**
 * Stream tokens as they arrive. onDelta(text) is called for each chunk.
 * Used for "I don't understand this" so the explanation appears as it's written.
 */
function streamText(prompt, { onDelta, onEnd, onError, maxTokens = 600 }) {
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
