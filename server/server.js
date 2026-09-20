// server/server.js
//
// The backend behind AdaptPractice. It holds ANTHROPIC_API_KEY and exposes
// three generic AI routes — text, JSON, and a streamed explanation — that
// the frontend in public/app.js calls instead of the Claude-artifact-only
// "sample" capability the app used when it lived inside claude.ai.
//
// Every prompt AdaptPractice sends (course maps, assignments, grading,
// roadmaps, explanations, summaries) is already fully built client-side in
// app.js — this server doesn't know or care what feature is calling it, it
// just forwards the prompt to Claude and hands back text, JSON, or a stream.
//
// Run it:
//   npm install
//   cp .env.example .env      (then paste your key into .env)
//   npm start
//   open http://localhost:8787

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

const { askText, askJSON, streamText, MODEL } = require('./claude');

const app = express();
const PORT = process.env.PORT || 8787;
const ALLOWED = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const MAX_PROMPT_CHARS = 40000; // generous — course text and transcripts can be long

app.use(express.json({ limit: '4mb' }));

app.use(cors({
  origin(origin, cb) {
    if (!origin || ALLOWED.length === 0 || ALLOWED.includes(origin)) return cb(null, true);
    cb(new Error('Origin not allowed: ' + origin));
  }
}));

// Every route here calls a paid API, so rate-limit per IP.
app.use('/api/', rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Wait a minute and try again.' }
}));

app.use(express.static(path.join(__dirname, '..', 'public')));

function bad(res, status, message, code) {
  return res.status(status).json({ error: message, ...(code ? { code } : {}) });
}

// The Anthropic SDK puts useful provider detail in the error message, but
// forwarding that whole message produces a scary raw JSON blob in the UI.
// Turn the common actionable cases into stable, client-safe error codes.
function aiFailure(err) {
  const message = String((err && err.message) || '');
  if (/credit balance is too low|purchase credits|plans?\s*&?\s*billing/i.test(message)) {
    return { status: 402, code: 'credits_exhausted', message: 'Your Anthropic API account has no available credit. Add credit in Anthropic Console → Plans & Billing, then try again.' };
  }
  if (/authentication_error|invalid.*api key|api[_ ]key/i.test(message)) {
    return { status: 401, code: 'invalid_api_key', message: 'The Anthropic API key was rejected. Check ANTHROPIC_API_KEY and restart the server.' };
  }
  if (/not_found_error|model.*not found|unknown model/i.test(message)) {
    return { status: 400, code: 'invalid_model', message: 'The configured Claude model is unavailable. Set CLAUDE_MODEL to an active Anthropic model and restart the server.' };
  }
  if (/overloaded_error|overloaded/i.test(message)) {
    return { status: 529, code: 'provider_overloaded', message: 'Anthropic is temporarily overloaded. Please retry in a moment.' };
  }
  return { status: 502, code: 'upstream_error', message: 'The AI provider could not complete the request. Please try again.' };
}
function asyncRoute(fn) {
  return (req, res) => fn(req, res).catch(err => {
    console.error(err);
    const failure = aiFailure(err);
    bad(res, failure.status, failure.message, failure.code);
  });
}
function readPrompt(req, res) {
  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== 'string') { bad(res, 400, 'prompt is required'); return null; }
  if (prompt.length > MAX_PROMPT_CHARS) { bad(res, 413, 'That request is too long.'); return null; }
  return prompt;
}

const YT_DLP_PATH = process.env.YT_DLP_PATH || [
  '/Users/vinayak/Library/Python/3.9/bin/yt-dlp',
  '/opt/homebrew/bin/yt-dlp',
  '/usr/local/bin/yt-dlp',
  'yt-dlp'
].find(candidate => candidate && (candidate === 'yt-dlp' || fs.existsSync(candidate))) || 'yt-dlp';

function getPlaylistItems(url) {
  return new Promise((resolve, reject) => {
    execFile(YT_DLP_PATH, ['--flat-playlist', '--print', '%(playlist_index)s|%(title)s|%(id)s|%(duration)s|%(url)s', url], { timeout: 30000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const msg = (stderr || err.message || '').trim() || 'Could not read that YouTube playlist.';
        return reject(new Error(msg));
      }
      const items = [];
      for (const line of String(stdout || '').split(/\r?\n/)) {
        const row = line.trim();
        if (!row) continue;
        const parts = row.split('|');
        if (parts.length < 5) continue;
        const index = Number(parts[0]);
        const title = parts.slice(1, -3).join('|').trim();
        const videoId = parts[parts.length - 3];
        const duration = parts[parts.length - 2];
        const watchUrl = parts[parts.length - 1];
        if (!title || !watchUrl) continue;
        items.push({ index: Number.isFinite(index) ? index : items.length + 1, title, id: videoId, duration, url: watchUrl });
      }
      if (!items.length) return reject(new Error('No videos were found in that playlist.'));
      resolve(items);
    });
  });
}

app.get('/api/health', (req, res) => res.json({ ok: true, model: MODEL }));

app.get('/api/playlist', asyncRoute(async (req, res) => {
  const url = String(req.query.url || '').trim();
  if (!url) return bad(res, 400, 'A YouTube playlist URL is required.');
  const items = await getPlaylistItems(url);
  res.json({ ok: true, items });
}));

/** Plain text completion. body: { prompt } -> { text } */
app.post('/api/ai/text', asyncRoute(async (req, res) => {
  const prompt = readPrompt(req, res); if (prompt === null) return;
  const text = await askText(prompt, 1500);
  res.json({ text });
}));

/** JSON completion, with extraction + one repair attempt built in. body: { prompt } -> parsed JSON value directly */
app.post('/api/ai/json', asyncRoute(async (req, res) => {
  const prompt = readPrompt(req, res); if (prompt === null) return;
  const out = await askJSON(prompt, 3500);
  res.json(out);
}));

/** Streamed text (Server-Sent Events). body: { prompt } -> data: {"delta": "..."} ... data: [DONE] */
app.post('/api/ai/stream', (req, res) => {
  const prompt = readPrompt(req, res); if (prompt === null) return;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // A response can only be ended once. The SDK can emit more than one
  // terminal event, and the client can also disconnect mid-stream, so
  // every path here is guarded to avoid a write-after-end crash.
  let done = false;
  const finish = (line) => {
    if (done || res.writableEnded) return;
    done = true;
    try { res.write(line); res.end(); } catch (e) {}
  };
  req.on('close', () => { done = true; });

  try {
    streamText(prompt, {
      maxTokens: 700,
      onDelta: (delta) => { if (!done && !res.writableEnded) res.write(`data: ${JSON.stringify({ delta })}\n\n`); },
      onEnd: () => finish('data: [DONE]\n\n'),
      onError: (err) => { console.error('stream error:', err.message || err); finish(`data: ${JSON.stringify({ error: 'stream failed' })}\n\n`); }
    });
  } catch (err) {
    console.error(err);
    finish(`data: ${JSON.stringify({ error: 'stream failed to start' })}\n\n`);
  }
});

app.listen(PORT, () => {
  console.log(`AdaptPractice running: http://localhost:${PORT}`);
  console.log(`Model: ${MODEL}`);
  if (!ALLOWED.length) console.log('ALLOWED_ORIGINS is empty — every origin is currently allowed. Set it before deploying publicly.');
});
