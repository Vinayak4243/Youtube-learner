# AdaptPractice — full source, self-hosted with a real Claude API backend

This is the complete AdaptPractice app — landing page, onboarding, dashboard,
course creation, YouTube playlist/PDF/video ingestion, the lesson workspace,
"I don't understand this," adaptive assignments, grading and mistake
classification, the weakness matrix, revision, roadmap, progress, learning
history, and the Focus Shield browser extension — exported from the Claude
artifact into plain files you can open in VS Code, edit, and host anywhere.

The only thing that changed from the artifact version is *how* it talks to
Claude. Inside claude.ai, AI calls went through a built-in capability that
only exists on that page. Outside it, there's no such thing — so this
version calls a small Node server instead, which holds your own
`ANTHROPIC_API_KEY` and forwards requests to the real Claude API. Every
prompt, every feature, every piece of UI is otherwise identical to what was
published.

```
Browser (public/index.html + app.js)  →  this Node server  →  Claude API
                                            (holds your key)
```

## 1. Open in VS Code and install

```bash
cd adaptpractice
npm install
cp .env.example .env
```

Open `.env` and paste your key:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Get one at https://console.anthropic.com/settings/keys if you don't have one.

## 2. Run it

```bash
npm start
```

```
AdaptPractice running: http://localhost:8787
Model: claude-sonnet-5
```

Open **http://localhost:8787** — that's the real app, all of it, running
locally. Use `npm run dev` while editing (restarts on save).

## 3. Files

```
server/
  server.js     Express app: serves the frontend + 3 AI routes. Start here.
  claude.js     The only file that touches the Anthropic SDK and your key.
public/
  index.html    Page shell (head, fonts, div#app).
  styles.css    All styling — design tokens, layout, components.
  app.js        The entire application: state, rendering, every view,
                the adaptive engine, event tracking — everything.
.env.example    Copy to .env and fill in your key. Never commit .env.
```

Nothing in `app.js` was restructured — it's the same file that ran inside
the Claude artifact, with one block changed (how `ask()`/`askJson()` reach
Claude) and one small change to how the Focus Shield extension files get
saved to disk (a plain browser download instead of an artifact-only API).
Every prompt, every screen, every algorithm (the weakness matrix, mastery
scoring, the "one mistake is evidence, not a diagnosis" rule, the adaptive
assignment engine, the playlist auto-title discovery) is untouched.

## 4. How the AI wiring works

`server.js` exposes three routes, and `app.js`'s `ask()`/`askJson()`
functions call them instead of the old `window.claude.use('sample')`:

- **`POST /api/ai/json`** — body `{ prompt }`, returns the parsed JSON value
  directly. Used for course maps, assignments, grading, and roadmaps.
  `server/claude.js` extracts JSON from Claude's reply and retries once
  with a repair prompt if the first attempt doesn't parse.
- **`POST /api/ai/text`** — body `{ prompt }`, returns `{ text }`. Used
  where the app just needs prose back (this one's barely used — most
  features ask for streamed text instead).
- **`POST /api/ai/stream`** — body `{ prompt }`, returns Server-Sent Events
  (`data: {"delta": "..."}` per chunk, then `data: [DONE]`). Used for
  lesson summaries and "I don't understand this," so the explanation
  appears as it's written rather than all at once.

Every prompt is still built entirely in `app.js`, per feature, exactly as
it was in the artifact — the server doesn't know or care which AdaptPractice
feature is calling it. That's why there are only three server routes
instead of one per feature: this server is a thin, dumb pipe to Claude, and
all of AdaptPractice's actual logic and prompt engineering lives in the
frontend, same as before.

If the server isn't running or the request fails, `app.js`'s `SAMPLE` flag
goes `false`, and the whole app degrades the same way it did on claude.ai
when Claude access was declined: courses, lessons, the weakness matrix, and
navigation all still work, and every AI-only button (generate a quiz,
summarize, ask a roadmap, the "I don't understand this" flow) is hidden or
shows a plain note instead of failing silently.

## 5. Before you deploy this for real

- **Set `ALLOWED_ORIGINS`** in `.env` to your real domain once you deploy —
  left empty, any origin can call your API.
- **Data is stored in the browser's `localStorage`**, same as the artifact
  version — there's no database. That's fine for a single person on one
  device; for real multi-user accounts you'd add a database and
  authentication in front of this, and move course/assignment data there.
- **Rate limiting** is on (30 requests/minute/IP by default) — adjust `max`
  in `server/server.js` for your traffic.
- **Deploy** anywhere that runs Node — Render, Railway, Fly.io, a VPS, or
  behind your existing site. `server.js` serves the frontend and the API
  from the same origin, so no CORS configuration is needed unless your
  frontend and backend end up on different domains.
- **Model**: set via `CLAUDE_MODEL` in `.env` (defaults to `claude-sonnet-5`).

## 6. Editing the app

Everything is in three files. Some starting points:
- The design tokens (colors, fonts) are CSS variables at the top of `styles.css`.
- The adaptive engine — mastery scoring, weakness detection, priority
  ordering — is in the functions around `recordAttempt`, `restatus`, and
  `priority` in `app.js`.
- Every screen is a `v*()` function (`vDash`, `vCourse`, `vLesson`,
  `vWeakness`, etc.) that returns an HTML string; `render()` picks which
  one to show.
- Every prompt sent to Claude is fully readable and editable — search for
  `buildCourse`, `genAssignment`, `gradeAssignment`, `explainMoment`,
  `summarizeLesson`, and `genRoadmap` in `app.js`.
