/* ============================================================
   AdaptPractice — single-page learning environment
   Data lives in this browser (localStorage). AI answers come from
   Claude through the artifact runtime's `sample` capability.
   ============================================================ */

/* ---------- storage ---------- */
const KEY = 'adaptpractice.v1';
const blank = () => ({
  profile: null,
  courses: [],
  behaviour: { answers:0, correct:0, hints:0, explains:0, confusions:0, revisions:0, secs:0, modes:{} },
  events: [],
  settings: { theme:'light', focus:false }
});
let D = blank();
try { const raw = localStorage.getItem(KEY); if (raw) D = Object.assign(blank(), JSON.parse(raw)); } catch(e) {}
let saveWarned = false;
function save(){
  try { localStorage.setItem(KEY, JSON.stringify(D)); }
  catch(e){ if(!saveWarned){ saveWarned = true; toast('This browser blocked local storage. Your work stays only for this visit.'); } }
}
const uid = () => Math.random().toString(36).slice(2,10);
const PLACEHOLDER_BATCH = 15; // how many "Video N" slots a titleless playlist starts with
const now = () => Date.now();

/* ---------- small utils ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp = (n,a,b) => Math.max(a, Math.min(b, n));
const pct = n => Math.round(n) + '%';
const mmss = s => { s = Math.max(0, Math.floor(s||0)); const m = Math.floor(s/60); return String(m).padStart(2,'0')+':'+String(s%60).padStart(2,'0'); };
const parseTime = t => { const p = String(t||'').split(':').map(Number); if(p.some(isNaN)) return 0; return p.length===3 ? p[0]*3600+p[1]*60+p[2] : p.length===2 ? p[0]*60+p[1] : p[0]; };
const dayLabel = ts => new Date(ts).toLocaleDateString(undefined,{month:'short', day:'numeric'});
function toast(msg, ms){ const el = document.createElement('div'); el.className='toast'; el.textContent = msg; document.body.appendChild(el); setTimeout(()=>el.remove(), ms||3200); }
const GREEK = {times:'\u00d7', cdot:'\u00b7', div:'\u00f7', pm:'\u00b1', leq:'\u2264', le:'\u2264', geq:'\u2265', ge:'\u2265',
  neq:'\u2260', ne:'\u2260', approx:'\u2248', infty:'\u221e', alpha:'\u03b1', beta:'\u03b2', gamma:'\u03b3', delta:'\u03b4',
  epsilon:'\u03b5', theta:'\u03b8', lambda:'\u03bb', mu:'\u03bc', pi:'\u03c0', rho:'\u03c1', sigma:'\u03c3', phi:'\u03c6',
  omega:'\u03c9', Delta:'\u0394', Sigma:'\u03a3', Omega:'\u03a9', rightarrow:'\u2192', to:'\u2192', Rightarrow:'\u21d2',
  leftarrow:'\u2190', in:'\u2208', notin:'\u2209', subset:'\u2282', cup:'\u222a', cap:'\u2229', sum:'\u03a3', prod:'\u03a0',
  int:'\u222b', partial:'\u2202', nabla:'\u2207', forall:'\u2200', exists:'\u2203', therefore:'\u2234', circ:'\u00b0',
  degree:'\u00b0', ldots:'\u2026', dots:'\u2026', log:'log', ln:'ln', sin:'sin', cos:'cos', tan:'tan', max:'max', min:'min' };
const SUP = { '0':'\u2070','1':'\u00b9','2':'\u00b2','3':'\u00b3','4':'\u2074','5':'\u2075','6':'\u2076','7':'\u2077','8':'\u2078','9':'\u2079','+':'\u207a','-':'\u207b','n':'\u207f','i':'\u2071' };
const SUB = { '0':'\u2080','1':'\u2081','2':'\u2082','3':'\u2083','4':'\u2084','5':'\u2085','6':'\u2086','7':'\u2087','8':'\u2088','9':'\u2089','+':'\u208a','-':'\u208b','n':'\u2099','i':'\u1d62','j':'\u2c7c','k':'\u2096','x':'\u2093' };
const mapRun = (str, table, fallback) => [...str].every(ch => table[ch]) ? [...str].map(ch => table[ch]).join('') : fallback + (str.length > 1 ? '(' + str + ')' : str);
/* Models sometimes answer in LaTeX. Turn it into readable plain notation. */
function mathText(t){
  let s = String(t == null ? '' : t);
  if (!/[\\$^_]/.test(s)) return s;
  s = s.replace(/\\\[|\\\]|\\\(|\\\)/g, '');
  s = s.replace(/\$\$?([^$]*?)\$\$?/g, '$1');
  for (let i = 0; i < 3; i++){
    s = s.replace(/\\(?:d)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (m,a,b) => '(' + a + ')/(' + b + ')');
  }
  s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, (m,a) => '\u221a(' + a + ')');
  s = s.replace(/\\(?:text|mathrm|mathbf|operatorname)\s*\{([^{}]*)\}/g, '$1');
  s = s.replace(/\\(?:left|right)(?![A-Za-z])|\\!|\\,|\\;/g, '');
  s = s.replace(/\\([A-Za-z]+)/g, (m,k) => GREEK[k] !== undefined ? GREEK[k] : k);
  s = s.replace(/\^\s*\{([^{}]*)\}/g, (m,a) => mapRun(a, SUP, '^'));
  s = s.replace(/\^\s*(-?[A-Za-z0-9])/g, (m,a) => mapRun(a, SUP, '^'));
  s = s.replace(/_\s*\{([^{}]*)\}/g, (m,a) => mapRun(a, SUB, '_'));
  s = s.replace(/_\s*([A-Za-z0-9])/g, (m,a) => mapRun(a, SUB, '_'));
  return s;
}
function mdLite(t){
  t = mathText(t);
  return esc(t)
    .replace(/^### (.+)$/gm,'<h4>$1</h4>')
    .replace(/^## (.+)$/gm,'<h4>$1</h4>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/^[-*] (.+)$/gm,'<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g,'<ul>$1</ul>')
    .replace(/\n{2,}/g,'</p><p>');
}

/* ---------- YouTube helpers ---------- */
function ytVideoId(u){
  const m = String(u||'').match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : (/^[A-Za-z0-9_-]{11}$/.test(String(u||'').trim()) ? u.trim() : null);
}
function ytListId(u){ const m = String(u||'').match(/[?&]list=([A-Za-z0-9_-]+)/); return m ? m[1] : null; }

/* Turns a raw copy-paste of a YouTube playlist sidebar (title, channel name,
   view count and duration all jumbled together, one thing per line) into a
   clean one-title-per-line list. Only removes lines that are unambiguously
   metadata (a duration, a view count, "3 years ago", a bare bullet or index
   number). It never merges or drops a line just because it repeats or sits
   next to an identical one — two videos can legitimately share a title, and
   guessing otherwise would quietly cut a real entry out of the playlist. */
function cleanPlaylistPaste(raw){
  const lines = String(raw||'').split(/\r?\n/).map(s => s.trim());
  const noise = [
    /^\d{1,2}:\d{2}(:\d{2})?$/,                          // 3:45 or 1:02:33 durations
    /^\d[\d,.]*\s*[KMB]?\+?\s*(views?|watching)$/i,       // "1.2M views", "42 watching"
    /^\d[\d,.]*\s*[KMB]?\+?\s*subscribers?$/i,
    /^[•·|·⋅]+$/,                                         // bare separators
    /^\d+\s*(second|minute|hour|day|week|month|year)s?\s*ago$/i,
    /^(mix|playlist|live now|live|new|shorts|premieres.*|scheduled.*)$/i,
    /^\d+$/                                              // a lone index or count
  ];
  const out = [];
  for (const l of lines){
    if (!l || l.length < 2) continue;
    if (noise.some(re => re.test(l))) continue;
    // YouTube often joins two noise fields on one line with a bullet,
    // e.g. "8.3K views • 2 years ago" — drop it only if every piece is noise.
    const parts = l.split(/\s*[•·⋅]\s*/).map(p => p.trim()).filter(Boolean);
    if (parts.length > 1 && parts.every(p => noise.some(re => re.test(p)))) continue;
    out.push(l);
  }
  return out;
}
let ytTime = 0, ytPoll = null, ytAlive = false;
window.addEventListener('message', ev => {
  if (!/youtube(-nocookie)?\.com$/.test(String(ev.origin).replace(/^https?:\/\/(www\.)?/,''))) return;
  try { const d = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data;
    if (d && d.info && typeof d.info.currentTime === 'number') ytTime = d.info.currentTime;
    if (d && (d.info || d.event)){ ytAlive = true; const n = document.getElementById('playnote'); if (n) n.classList.add('live'); }
    // The embedded player broadcasts its own metadata over this same channel.
    // When a lesson is still an untitled placeholder, that's the real title —
    // not scraped from anywhere, just what the player is already telling us.
    if (d && d.info && d.info.videoData && d.info.videoData.title) captureAutoTitle(d.info.videoData.title, d.info.videoData.video_id);
  } catch(e){}
});
/* Two separate jobs, both from the same broadcast: give a placeholder
   "Video N" lesson its real title (only when it doesn't have one yet), and
   remember the real video id for ANY playlist lesson the first time it
   plays — titled or not. Once a lesson has a remembered id, vLesson() embeds
   it directly instead of by playlist position, so only the very first play
   of a given lesson ever has to "seek into" the playlist; every visit after
   that opens the exact video straight away. Never touches a title that was
   pasted or written by Claude — only fills one in when it's still blank. */
function captureAutoTitle(title, videoId){
  if (S.view !== 'lesson' || !S.course || !S.lesson) return;
  const c = getCourse(S.course); if (!c) return;
  const r = rawLesson(c, S.lesson); if (!r) return;
  const lesson = r.lesson;
  let changed = false;

  if (lesson.auto && title){
    const clean = String(title).trim();
    if (clean){ lesson.title = clean; lesson.auto = false; changed = true; }
  }
  if (videoId && !lesson.url){
    lesson.url = 'https://www.youtube.com/watch?v=' + videoId;
    changed = true;
  }
  if (!changed) return;

  save();
  const t1 = document.querySelector('[data-role="lesson-title"]'); if (t1) t1.textContent = lesson.title;
  document.querySelectorAll('[data-lesson-li="'+lesson.id+'"] .lbl').forEach(el => { el.textContent = lesson.title; });
}
function ytHandshake(){
  clearInterval(ytPoll);
  ytAlive = false;
  ytPoll = setInterval(() => {
    const f = document.getElementById('ytframe');
    if (!f || !f.contentWindow) return;
    try { f.contentWindow.postMessage(JSON.stringify({event:'listening', id:1, channel:'widget'}), '*'); } catch(e){}
  }, 1000);
}

/* ---------- Claude, via our own backend (server/server.js) ----------
   In the Claude artifact runtime this used window.claude.use('sample').
   Outside it — run from VS Code, deployed anywhere — there is no such
   capability, so every AI call instead goes to our own small server,
   which holds the real ANTHROPIC_API_KEY and calls the Claude API.
   SAMPLE stays a plain boolean here: every other place in this file that
   checks `if (SAMPLE)` or `SAMPLE ? ... : ...` keeps working unchanged. */
const API_BASE = (window.ADAPTPRACTICE_API_BASE || '').replace(/\/$/, ''); // same-origin by default
let SAMPLE = false, aiChecked = false, booted = false;
(async () => {
  try {
    const res = await fetch(API_BASE + '/api/health');
    SAMPLE = res.ok && (await res.json()).ok === true;
  } catch (e) { SAMPLE = false; }
  aiChecked = true;
  if (booted) render();
})();
const AI_COPY = {
  not_granted:'The AI backend is not reachable. Check that the server is running and ANTHROPIC_API_KEY is set.',
  sampling_disabled:'Claude is not available on this account.',
  not_declared:'This page no longer has Claude access.',
  capability_disabled:'Claude is unavailable in this view.',
  capability_removed:'Claude is unavailable in this view.',
  rate_limited:'Too many AI requests. Wait a minute and try again.',
  credits_exhausted:'Your Anthropic API account has no available credit. Add credit in Anthropic Console → Plans & Billing, then retry.',
  invalid_api_key:'The Anthropic API key was rejected. Check ANTHROPIC_API_KEY and restart the server.',
  invalid_model:'The configured Claude model is unavailable. Update CLAUDE_MODEL and restart the server.',
  provider_overloaded:'Anthropic is temporarily overloaded. Please retry in a moment.',
  session_expired:'Sign in to Claude again, then retry.',
  refused:'Claude declined this request. Try rephrasing your source or question.',
  empty_completion:'Claude returned nothing. Ask for a smaller piece at a time.',
  invalid_json:'Claude returned a malformed answer. Try again.',
  prompt_too_large:'That source is too long. Use a shorter excerpt.',
  cancelled:'Stopped.',
  upstream_error:'The AI request failed. Try again.'
};
const aiErr = e => AI_COPY[e && e.code] || (e && e.message) || AI_COPY.upstream_error;
function aiAvailable(){ return !!SAMPLE; }

/** Plain-text completion. Supports opts.onText(u) for streaming, where u.text is the growing full text so far — same shape the rest of this file already expects. */
async function ask(input, opts){
  opts = opts || {};
  if (!SAMPLE) throw { code:'not_granted', message:'backend unreachable' };
  if (!opts.onText) {
    const res = await fetch(API_BASE + '/api/ai/text', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ prompt: input }) });
    if (!res.ok) throw await backendError(res);
    const data = await res.json();
    return { text: data.text || '' };
  }
  return new Promise((resolve, reject) => {
    fetch(API_BASE + '/api/ai/stream', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ prompt: input }) })
      .then(async res => {
        if (!res.ok || !res.body) return reject(await backendError(res));
        const reader = res.body.getReader(); const decoder = new TextDecoder();
        let full = '', buf = '';
        while (true){
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream:true });
          const lines = buf.split('\n\n'); buf = lines.pop();
          for (const line of lines){
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6);
            if (payload === '[DONE]') { resolve({ text: full }); return; }
            try {
              const j = JSON.parse(payload);
              if (j.delta) { full += j.delta; opts.onText({ text: full }); }
              if (j.error) { reject({ code:'upstream_error', message:j.error }); return; }
            } catch(e) {}
          }
        }
        resolve({ text: full });
      }).catch(err => reject({ code:'upstream_error', message: String(err && err.message || err) }));
  });
}
/** JSON completion — the backend extracts/repairs JSON from Claude's reply and returns the parsed value directly. */
async function askJson(input, opts){
  if (!SAMPLE) throw { code:'not_granted', message:'backend unreachable' };
  const res = await fetch(API_BASE + '/api/ai/json', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ prompt: input }) });
  if (!res.ok) throw await backendError(res);
  return res.json();
}
async function backendError(res){
  let code = 'upstream_error', message = 'Request failed (' + res.status + ')';
  try { const j = await res.json(); if (j && j.error) message = j.error; if (j && j.code) code = j.code; if (res.status === 429) code = 'rate_limited'; if (res.status === 413) code = 'prompt_too_large'; }
  catch(e) {}
  return { code, message };
}

/* ---------- learning events ---------- */
function ev(type, payload){
  const e = Object.assign({ id:uid(), t:now(), type }, payload||{});
  D.events.unshift(e);
  if (D.events.length > 600) D.events.length = 600;
  save();
  return e;
}

/* ---------- concept model ---------- */
function conceptOf(course, name){
  const k = String(name||'General').trim();
  if (!course.concepts[k]) course.concepts[k] = {
    name:k, mastery:35, attempts:0, correct:0, errors:0, hints:0, confusion:0,
    status:'new', source:null, lastSeen:0, history:[], errorTypes:{}
  };
  return course.concepts[k];
}
/* Evidence-based update. One mistake is a signal, not a diagnosis. */
function recordAttempt(course, name, res){
  const c = conceptOf(course, name);
  c.attempts++; c.lastSeen = now();
  if (res.hint) c.hints++;
  const m = c.mastery;
  if (res.verdict === 'correct'){ c.correct++; c.mastery = m + (res.hint ? (80-m)*0.14 : (94-m)*0.30); }
  else if (res.verdict === 'partial'){ c.errors += 0.5; c.mastery = m + (68-m)*0.10; }
  else { c.errors++; c.mastery = Math.max(3, m*0.78 - 2); }
  c.mastery = clamp(Math.round(c.mastery), 0, 100);
  if (res.errorType && res.verdict !== 'correct') c.errorTypes[res.errorType] = (c.errorTypes[res.errorType]||0) + 1;
  if (res.source) c.source = res.source;
  c.history.push({ t:now(), v:res.verdict, m:c.mastery, d:res.difficulty||'medium' });
  if (c.history.length > 40) c.history.shift();
  restatus(c);
  return c;
}
function restatus(c){
  const prev = c.status;
  if (c.attempts >= 3 && c.errors >= 2 && c.mastery < 65) c.status = 'weakness';
  else if (c.errors >= 1 && c.mastery < 70) c.status = 'watch';
  else if (c.attempts >= 4 && c.mastery >= 82 && c.errors <= 1) c.status = 'mastered';
  else if (c.attempts >= 2 && c.mastery >= 70) c.status = 'improving';
  else c.status = c.attempts ? 'learning' : 'new';
  return prev !== c.status;
}
function priority(c){
  let p = (100 - c.mastery) * 0.6 + c.errors * 7 + c.confusion * 6;
  if (c.status === 'weakness') p += 18;
  if (c.status === 'mastered') p -= 40;
  const ageDays = (now() - (c.lastSeen||now())) / 864e5;
  p += clamp(ageDays * 1.5, 0, 12);
  return Math.round(p);
}
const prioBand = p => p >= 58 ? 'high' : p >= 36 ? 'medium' : 'low';
function conceptList(course){ return Object.values(course.concepts||{}); }
function weakList(course){
  return conceptList(course)
    .filter(c => c.attempts > 0 || c.confusion > 0)
    .sort((a,b) => priority(b) - priority(a));
}
function courseProgress(course){
  const lessons = allLessons(course);
  const done = lessons.filter(l => l.done).length;
  const cs = conceptList(course).filter(c => c.attempts > 0);
  const mastery = cs.length ? Math.round(cs.reduce((s,c)=>s+c.mastery,0)/cs.length) : 0;
  return { done, total: lessons.length, coverage: lessons.length ? Math.round(done/lessons.length*100) : 0, mastery, tracked: cs.length };
}
function allLessons(course){
  const out = [];
  (course.sources||[]).forEach(s => (s.lessons||[]).forEach(l => out.push(Object.assign({ sourceId:s.id, sourceTitle:s.title, sourceType:s.type }, l))));
  return out;
}
function findLesson(course, id){ return allLessons(course).find(l => l.id === id); }
function rawLesson(course, id){
  for (const s of course.sources||[]) { const l = (s.lessons||[]).find(x => x.id === id); if (l) return { src:s, lesson:l }; }
  return null;
}
const getCourse = id => D.courses.find(c => c.id === id);

/* ---------- router ---------- */
const S = { view:'landing', course:null, lesson:null, work:null, busy:'', modal:null, wizard:null, session:null };
function go(view, patch){
  Object.assign(S, patch||{});
  S.view = view;
  window.scrollTo(0,0);
  render();
}
function boot(){
  booted = true;
  if (!D.profile) { S.view = 'landing'; }
  else S.view = 'dash';
  applyTheme();
  render();
}
function applyTheme(){ document.documentElement.setAttribute('data-theme', D.settings.theme || 'light'); }

/* ============================ RENDER ============================ */
function render(){
  const app = $('#app');
  if (S.view === 'landing'){ app.innerHTML = vLanding(); return; }
  if (S.view === 'onboard'){ app.innerHTML = vOnboard(); return; }
  if (S.view === 'lesson'){ app.innerHTML = vLesson(); ytHandshake(); return; }
  const f = D.settings.focus;
  app.innerHTML = '<div class="shell' + (f?' focus':'') + '">' + (f ? '' : rail()) + '<main class="main">' + (f ? focusExit() : '') + body() + '</main></div>' + (S.modal || '');
  if (S.modal) { const ta = document.querySelector('.modal textarea, .modal input'); if (ta) ta.focus(); }
}
function focusExit(){
  return '<div class="row between" style="margin-bottom:18px"><div class="tag md">Focus mode on</div><button class="btn sec sm" data-act="focus-off">Leave focus mode</button></div>';
}
function body(){
  switch(S.view){
    case 'dash': return vDash();
    case 'newcourse': return vWizard();
    case 'course': return vCourse();
    case 'work': return vWork();
    case 'weakness': return vWeakness();
    case 'revision': return vRevision();
    case 'roadmap': return vRoadmap();
    case 'progress': return vProgress();
    case 'history': return vHistory();
    case 'shield': return vShield();
    case 'profile': return vProfile();
    default: return vDash();
  }
}
function rail(){
  const due = D.courses.reduce((n,c) => n + weakList(c).filter(x => prioBand(priority(x))==='high').length, 0);
  const item = (v,g,label,count) =>
    '<button class="nav" data-act="go" data-view="'+v+'" aria-current="'+(S.view===v)+'"><span class="g">'+g+'</span>'+label+
    (count ? '<span class="ct">'+count+'</span>' : '') + '</button>';
  return '<nav class="rail">'
    + '<div class="brand" data-act="go" data-view="dash"><b>AdaptPractice</b><i>BETA</i></div>'
    + item('dash','◇','Dashboard')
    + '<button class="nav" data-act="go" data-view="course" data-clear="1" aria-current="'+(S.view==='course')+'"><span class="g">▤</span>My courses</button>'
    + '<button class="nav" data-act="new-course"><span class="g">+</span>New course</button>'
    + '<div class="railsep"></div>'
    + item('work','✎','Practice')
    + item('weakness','◈','Weakness matrix', due)
    + item('revision','↻','Revision')
    + item('roadmap','⌖','My roadmap')
    + item('progress','▦','Progress')
    + item('history','☰','Learning history')
    + '<div class="railsep"></div>'
    + item('shield','⛨','Focus shield')
    + item('profile','◉','Profile')
    + '<div class="railfoot">' + (aiChecked ? (SAMPLE ? 'Claude is connected. AI features are live.' : 'Claude is unavailable in this view — AI features are hidden.') : 'Checking Claude…') + '</div>'
    + '</nav>';
}

/* ============================ LANDING ============================ */
function vLanding(){
  return '<div class="land"><div class="landwrap">'
  + '<header class="landnav"><div class="brand" style="padding:0"><b style="color:#fff">AdaptPractice</b><i>BETA</i></div>'
  + '<button class="btn" style="background:#fff;color:#111B2E;border-color:#fff" data-act="start">Create your profile</button></header>'
  + '<section class="hero"><h1>You came to study. The feed had other plans.</h1>'
  + '<p class="lede">Bring the playlist or the PDF you were going to learn from anyway. AdaptPractice wraps it in a workspace that asks you questions, remembers exactly where you went wrong, and builds the next set of questions out of those mistakes.</p>'
  + '<div class="loops">'
  + '<div class="loop bad"><h4>How the evening usually goes</h4><ol>'
  + '<li>Open YouTube to watch one lecture</li><li>Watch the lecture</li><li>Autoplay, Shorts, a thumbnail you didn\'t choose</li>'
  + '<li class="drop">40 minutes gone</li><li class="drop">Nothing practised, nothing recorded</li></ol></div>'
  + '<div class="loop good"><h4>How it goes here</h4><ol>'
  + '<li>Open your course — no feed, no sidebar</li><li>Watch the lesson you picked</li><li>Answer questions written from that lesson</li>'
  + '<li class="win">Every mistake is classified and stored</li><li class="win">Tomorrow\'s questions come from today\'s mistakes</li></ol></div></div>'
  + '<div class="row"><button class="btn" style="background:#6BBFA5;color:#08211B;border-color:#6BBFA5;padding:12px 22px" data-act="start">Start learning</button>'
  + '<span style="color:var(--onink-2);font-size:.85rem">Takes about a minute. Everything stays in this browser.</span></div>'
  + '<div class="landgrid">'
  + card4('Say where you are, and where you\'re going','A commerce student aiming at CAT and an engineering student aiming at a hackathon get different questions from the same page of the same book.')
  + card4('“I don\'t understand this”','Press it at 18:42 and you get an explanation of that idea — simply, as an example, as an analogy, step by step — not a summary of the whole video.')
  + card4('A weakness matrix, not a score','Mastery, attempts, error count and what kind of error it was, per concept, with a link back to the minute of the video it came from.')
  + card4('The next assignment reads the last one','Three wrong answers on recursion base cases turns into a worked example, a scaffolded problem, then an independent one — and the questions tell you why you got them.')
  + '</div></section></div></div>';
}
const card4 = (h,p) => '<div><h4>'+esc(h)+'</h4><p>'+esc(p)+'</p></div>';

/* ============================ ONBOARDING ============================ */
const BACKGROUNDS = ['School (CBSE / ICSE / State board)','Arts','Commerce','Science','Engineering','Medicine / Nursing','Law','Management','Computer Science','Design','Working professional','Other'];
const GOALS = ['Board exam','Competitive exam (JEE / NEET / CAT / GATE / UPSC / SSC / NDA)','University exam','Job interview','Hackathon','Learn a skill','Career change','Mastery of a subject','Something else'];
function vOnboard(){
  const w = S.wizard || (S.wizard = { step:1, name:'', background:'', level:'', goal:'', goalText:'', target:'' });
  const step = w.step;
  let inner = '';
  if (step === 1){
    inner = '<h2>First, who is learning?</h2><p class="muted">This is stored in your browser only.</p>'
      + f('Your name','<input type="text" id="o-name" value="'+esc(w.name)+'" placeholder="Ananya">')
      + f('Your background','<select id="o-bg">'+opts(BACKGROUNDS, w.background)+'</select>')
      + f('Anything else about where you are right now <span class="dim">(optional)</span>','<textarea id="o-level" placeholder="Second year BCom. Comfortable with arithmetic, shaky on algebra. Haven\'t studied maths seriously since class 10.">'+esc(w.level)+'</textarea>')
      + '<div class="row"><button class="btn" data-act="ob-next">Continue</button></div>';
  } else {
    inner = '<h2>Where do you want to end up?</h2><p class="muted">The goal changes the questions you get, not just the wording.</p>'
      + f('Your goal','<select id="o-goal">'+opts(GOALS, w.goal)+'</select>')
      + f('Describe it in your own words','<textarea id="o-gt" placeholder="CAT 2026, aiming for 95+ percentile in quant.">'+esc(w.goalText)+'</textarea>')
      + f('Target date <span class="dim">(optional)</span>','<input type="text" id="o-target" value="'+esc(w.target)+'" placeholder="November 2026">')
      + '<div class="row"><button class="btn sec" data-act="ob-back">Back</button><button class="btn go" data-act="ob-done">Create profile</button></div>';
  }
  return '<div style="max-width:620px;margin:6vh auto">'
    + '<div class="brand" style="padding-left:0"><b>AdaptPractice</b></div>'
    + '<div class="steps"><span class="'+(step===1?'on':'')+'">Present state</span><span class="'+(step===2?'on':'')+'">Future state</span></div>'
    + '<div class="sheet pad">'+inner+'</div></div>';
}
const f = (label, control) => '<div class="field"><label class="f">'+label+'</label>'+control+'</div>';
const opts = (arr, sel) => '<option value="">Choose…</option>' + arr.map(o => '<option'+(o===sel?' selected':'')+'>'+esc(o)+'</option>').join('');

/* ============================ DASHBOARD ============================ */
function greet(){ const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }
function vDash(){
  const p = D.profile;
  let h = '<div class="between" style="margin-bottom:22px"><div>'
    + '<h1>'+greet()+', '+esc((p.name||'there').split(' ')[0])+'</h1>'
    + '<p class="muted" style="margin-top:6px">'+esc(p.goalText || p.goal || 'No goal set')+'</p></div>'
    + '<div class="row"><button class="btn sec sm" data-act="focus-on">Focus mode</button><button class="btn sm" data-act="new-course">New course</button></div></div>';

  if (!D.courses.length){
    return h + '<div class="sheet empty"><h3>No courses yet</h3><p class="muted" style="max-width:44ch;margin:0 auto 16px">A course is one thing you are learning, plus the playlists and PDFs you are learning it from. Add the playlist you already had open.</p><button class="btn go" data-act="new-course">Create your first course</button></div>';
  }

  /* resume */
  const resumeCourse = D.courses.filter(c => c.resume && c.resume.lessonId).sort((a,b)=>(b.resume.t||0)-(a.resume.t||0))[0];
  if (resumeCourse){
    const l = findLesson(resumeCourse, resumeCourse.resume.lessonId);
    if (l) h += '<div class="sheet pad" style="margin-bottom:16px;border-left:3px solid var(--pine)">'
      + '<div class="between"><div><div class="pill">Continue where you stopped</div>'
      + '<h3 style="margin:6px 0 4px">'+esc(l.title)+'</h3>'
      + '<p class="muted tiny" style="margin:0">'+esc(resumeCourse.name)+(resumeCourse.resume.at ? ' · paused at '+mmss(resumeCourse.resume.at) : '')+'</p></div>'
      + '<button class="btn go" data-act="open-lesson" data-c="'+resumeCourse.id+'" data-l="'+l.id+'">Resume lesson</button></div></div>';
  }

  /* today's plan */
  h += '<div class="grid g2" style="align-items:start">';
  h += '<div class="sheet pad"><div class="between"><h3>Today\'s plan</h3><span class="dim">'+planMinutes()+' min</span></div><ol style="padding-left:18px;margin:12px 0 0;font-size:.9rem">'
    + todayPlan().map(x => '<li style="margin:7px 0">'+esc(x.text)+' <span class="dim">· '+x.mins+' min</span></li>').join('')
    + '</ol></div>';

  /* weak spots across courses */
  const weak = [];
  D.courses.forEach(c => weakList(c).slice(0,3).forEach(x => weak.push({ c, x })));
  weak.sort((a,b) => priority(b.x) - priority(a.x));
  h += '<div class="sheet pad"><h3>Needs attention</h3>'
    + (weak.length ? '<table style="margin-top:10px"><tbody>' + weak.slice(0,5).map(({c,x}) =>
        '<tr><td><b style="font-weight:500">'+esc(x.name)+'</b><div class="dim">'+esc(c.name)+'</div></td>'
        + '<td class="n">'+pct(x.mastery)+'</td>'
        + '<td class="n"><span class="tag '+({high:'hi',medium:'md',low:'lo'}[prioBand(priority(x))])+'">'+prioBand(priority(x))+'</span></td>'
        + '<td class="n"><button class="btn sec sm" data-act="target" data-c="'+c.id+'" data-k="'+esc(x.name)+'">Practise</button></td></tr>').join('')
      + '</tbody></table>'
      : '<p class="muted tiny" style="margin-top:8px">Nothing flagged yet. Attempt an assignment and mistakes will show up here.</p>')
    + '</div></div>';

  /* courses */
  h += '<h3 style="margin:26px 0 12px">My courses</h3><div class="grid g3">';
  D.courses.forEach(c => {
    const pr = courseProgress(c);
    h += '<div class="sheet pad" style="cursor:pointer" data-act="open-course" data-c="'+c.id+'">'
      + '<h4 style="margin-bottom:4px">'+esc(c.name)+'</h4>'
      + '<div class="dim" style="margin-bottom:12px">'+esc(c.goalType||'')+'</div>'
      + '<div class="bar"><i style="width:'+pr.coverage+'%"></i></div>'
      + '<div class="row tiny muted" style="margin-top:8px;gap:14px"><span>'+pr.done+'/'+pr.total+' lessons</span><span>Mastery '+pct(pr.mastery)+'</span></div></div>';
  });
  h += '</div>';
  return h;
}
function todayPlan(){
  const out = [];
  D.courses.forEach(c => {
    const w = weakList(c);
    if (w.length && prioBand(priority(w[0])) !== 'low') out.push({ text: c.name + ' — practise ' + w[0].name, mins:25, p: priority(w[0]) });
    const next = allLessons(c).find(l => !l.done);
    if (next) out.push({ text: c.name + ' — ' + next.title, mins:30, p: 30 });
    const due = w.filter(x => x.status === 'watch').slice(0,1);
    if (due.length) out.push({ text: c.name + ' — revise ' + due[0].name, mins:15, p: 20 });
  });
  out.sort((a,b) => b.p - a.p);
  return out.slice(0,4);
}
const planMinutes = () => todayPlan().reduce((s,x) => s + x.mins, 0);

/* ============================ NEW COURSE WIZARD ============================ */
const MODES = [
  ['exam','Exam','Important concepts, exam-style questions, common traps'],
  ['competitive','Competitive exam','Speed, accuracy, high-yield topics'],
  ['interview','Interview','Why and how questions, follow-ups, scenarios'],
  ['hackathon','Hackathon','Implementation, debugging, edge cases'],
  ['academic','Academic','Curriculum coverage, progressive difficulty'],
  ['skill','Skill building','Practical application, small projects'],
  ['mastery','Mastery','Deep understanding, transfer, retention'],
  ['custom','Custom','Describe the objective yourself']
];
function vWizard(){
  const w = S.wizard || (S.wizard = { step:1, name:'', level:'', known:'', mode:'', modeText:'', target:'', srcType:'playlist', url:'', titles:'', text:'', fileName:'' });
  const stepNames = ['Course','Present state','Goal','Source'];
  let inner = '';
  if (w.step === 1){
    inner = '<h2>What are you learning?</h2>'
      + f('Course name','<input type="text" id="w-name" value="'+esc(w.name)+'" placeholder="DSA in Python">')
      + '<div class="row"><button class="btn" data-act="w-next">Continue</button><button class="btn ghost" data-act="go" data-view="dash">Cancel</button></div>';
  } else if (w.step === 2){
    inner = '<h2>Where are you starting from?</h2><p class="muted">Rough answers are fine. A diagnostic can correct them later.</p>'
      + f('Your level in this subject','<select id="w-level">'+opts(['Complete beginner','Some exposure','Intermediate','Advanced but rusty','Strong, want mastery'], w.level)+'</select>')
      + f('What do you already know?','<textarea id="w-known" placeholder="Loops, functions, lists. Never written a recursive function.">'+esc(w.known)+'</textarea>')
      + '<div class="row"><button class="btn sec" data-act="w-back">Back</button><button class="btn" data-act="w-next">Continue</button></div>';
  } else if (w.step === 3){
    inner = '<h2>What is this course for?</h2><p class="muted">The same video produces different questions for an interview than for a board exam.</p>'
      + '<div class="row" style="gap:8px;margin-bottom:16px">'
      + MODES.map(m => '<button class="chip'+(w.mode===m[0]?' on':'')+'" data-act="w-mode" data-m="'+m[0]+'" title="'+esc(m[2])+'">'+esc(m[1])+'</button>').join('')
      + '</div>'
      + f('Describe the goal in your own words','<textarea id="w-modetext" placeholder="Campus placements in December. Need to be able to code and explain DSA on a whiteboard.">'+esc(w.modeText)+'</textarea>')
      + f('Target date <span class="dim">(optional)</span>','<input type="text" id="w-target" value="'+esc(w.target)+'" placeholder="December 2026">')
      + '<div class="row"><button class="btn sec" data-act="w-back">Back</button><button class="btn" data-act="w-next">Continue</button></div>';
  } else {
    const tab = (k,l) => '<button class="chip'+(w.srcType===k?' on':'')+'" data-act="w-src" data-s="'+k+'">'+l+'</button>';
    let src = '';
    if (w.srcType === 'playlist'){
      src = f('Playlist link','<input type="url" id="w-url" value="'+esc(w.url)+'" placeholder="https://www.youtube.com/playlist?list=…">')
        + '<div class="note">Paste just the link and press Build — the playlist plays right here, and each video\'s real title fills itself in as you watch it. No titles required, no trip to YouTube.</div>'
        + '<details style="margin:12px 0"><summary class="dim" style="cursor:pointer;font-size:.85rem">Prefer real titles from the start? Add them here</summary>'
        + '<div class="sheet pad" style="margin-top:10px;background:var(--wash)">'
        + '<b style="font-size:.85rem">Paste the whole playlist sidebar</b>'
        + '<p class="muted tiny" style="margin:6px 0 10px">On the playlist\'s YouTube page, click into the list of videos, press Ctrl/Cmd+A then Ctrl/Cmd+C, and paste the block below — durations and view counts get stripped automatically.</p>'
        + '<textarea id="w-rawpaste" style="min-height:100px" placeholder="Paste the raw copied playlist block here"></textarea>'
        + '<div class="row" style="margin-top:8px"><button class="btn sec sm" data-act="w-clean-paste" type="button">Clean up into a title list ↓</button>'
        + (S.cleanMsg ? '<span class="dim tiny">'+esc(S.cleanMsg)+'</span>' : '') + '</div></div>'
        + f('Video titles, one per line','<textarea id="w-titles" style="min-height:120px" placeholder="Leave this empty to start immediately — or list titles here to have them ready from lesson one.">'+esc(w.titles)+'</textarea>')
        + '</details>';
    } else if (w.srcType === 'video'){
      src = f('Video link','<input type="url" id="w-url" value="'+esc(w.url)+'" placeholder="https://www.youtube.com/watch?v=…">')
        + f('Transcript or your notes <span class="dim">(optional but makes every question source-grounded)</span>','<textarea id="w-text" style="min-height:140px" placeholder="Paste the transcript from YouTube\'s “Show transcript” panel, or your own notes.">'+esc(w.text)+'</textarea>');
    } else {
      src = '<div class="field"><label class="f">PDF file</label><input type="file" id="w-pdf" accept="application/pdf"><div class="dim" id="w-pdfstat" style="margin-top:6px">'+(w.fileName ? esc(w.fileName)+' · '+w.text.length.toLocaleString()+' characters read' : 'The text is read inside this browser. The file is never uploaded anywhere.')+'</div></div>'
        + f('Or paste the text','<textarea id="w-text" style="min-height:140px" placeholder="Paste chapter text here if the PDF is scanned or the reader cannot open it.">'+esc(w.text)+'</textarea>');
    }
    inner = '<h2>Bring your material</h2>'
      + '<div class="row" style="gap:8px;margin-bottom:16px">'+tab('playlist','YouTube playlist')+tab('video','Single video')+tab('pdf','PDF')+'</div>'
      + src
      + (SAMPLE ? '' : '<div class="note bad">Claude is not available in this view, so the course map and questions cannot be generated. You can still create the course and add material.</div>')
      + '<div class="row"><button class="btn sec" data-act="w-back">Back</button><button class="btn go" data-act="w-build"'+(S.busy?' disabled':'')+'>'+(S.busy ? '<span class="spin"></span> '+esc(S.busy) : 'Build the course')+'</button></div>';
  }
  return '<div style="max-width:660px">'
    + '<div class="steps">'+stepNames.map((n,i) => '<span class="'+(w.step===i+1?'on':'')+'">'+n+'</span>').join('')+'</div>'
    + '<div class="sheet pad">'+inner+'</div></div>';
}

/* ============================ COURSE ============================ */
function vCourse(){
  if (!S.course && D.courses.length === 1) S.course = D.courses[0].id;
  const c = getCourse(S.course);
  if (!c){
    if (!D.courses.length) return '<div class="sheet empty"><h3>No courses yet</h3><button class="btn go" data-act="new-course">Create a course</button></div>';
    return '<h1>My courses</h1><div class="grid g3" style="margin-top:16px">' + D.courses.map(x => {
      const pr = courseProgress(x);
      return '<div class="sheet pad" data-act="open-course" data-c="'+x.id+'" style="cursor:pointer"><h4>'+esc(x.name)+'</h4><div class="dim" style="margin:4px 0 12px">'+esc(x.goalType||'')+'</div><div class="bar"><i style="width:'+pr.coverage+'%"></i></div><div class="tiny muted" style="margin-top:8px">'+pr.done+'/'+pr.total+' lessons · mastery '+pct(pr.mastery)+'</div></div>';
    }).join('') + '</div>';
  }
  const pr = courseProgress(c);
  const weak = weakList(c).filter(x => x.status === 'weakness' || x.status === 'watch').slice(0,3);
  const nextLesson = allLessons(c).find(l => !l.done);
  const rec = recommend(c);

  let h = '<div class="crumb"><b data-act="go" data-view="course" data-clear="1">My courses</b> › '+esc(c.name)+'</div>'
    + '<div class="between" style="margin-bottom:20px"><div><h1>'+esc(c.name)+'</h1>'
    + '<p class="muted" style="margin-top:6px">'+esc(c.modeText || (MODES.find(m=>m[0]===c.goalType)||[])[1] || '')+'</p></div>'
    + '<div class="row"><button class="btn sec sm" data-act="add-source" data-c="'+c.id+'">Add material</button>'
    + (nextLesson ? '<button class="btn sm" data-act="open-lesson" data-c="'+c.id+'" data-l="'+nextLesson.id+'">Open next lesson</button>' : '') + '</div></div>';

  h += '<div class="grid g3" style="margin-bottom:18px">'
    + kpi('Lessons done', pr.done + ' / ' + pr.total, pr.coverage)
    + kpi('Average mastery', pct(pr.mastery), pr.mastery)
    + kpi('Concepts tracked', String(pr.tracked), null)
    + kpi('Assignments', String((c.assignments||[]).length), null)
    + '</div>';

  h += '<div class="sheet pad" style="margin-bottom:18px;border-left:3px solid var(--gold)"><div class="between">'
    + '<div><div class="pill">Recommended next</div><h3 style="margin:6px 0 4px">'+esc(rec.label)+'</h3><p class="muted tiny" style="margin:0">'+esc(rec.why)+'</p></div>'
    + '<button class="btn go" data-act="'+rec.act+'" data-c="'+c.id+'"'+(rec.l?' data-l="'+rec.l+'"':'')+(rec.k?' data-k="'+esc(rec.k)+'"':'')+'>'+esc(rec.cta)+'</button></div></div>';

  h += '<div class="grid split">';

  /* course map */
  h += '<div class="sheet pad"><div class="between"><h3>Course map</h3><span class="dim">'+(c.sources||[]).length+' source'+((c.sources||[]).length===1?'':'s')+'</span></div>';
  (c.sources||[]).forEach(s => {
    h += '<div style="margin-top:14px"><div class="row tiny muted" style="gap:6px"><span class="tag">'+(s.type==='pdf'?'PDF':s.type==='playlist'?'Playlist':'Video')+'</span><span>'+esc(s.title)+'</span>'
      + (s.dynamic ? '<span class="dim">· titles fill in as you watch</span>' : '') + '</div><ul class="playlist" style="margin-top:6px">';
    (s.lessons||[]).forEach(l => {
      h += '<li data-act="open-lesson" data-c="'+c.id+'" data-l="'+l.id+'" data-lesson-li="'+l.id+'"><span class="mk '+(l.done?'done':'')+'">'+(l.done?'✓':'○')+'</span><span class="lbl">'+esc(l.title)+'</span>'
        + (l.auto ? ' <span class="dim tiny">auto</span>' : '')
        + (l.concepts && l.concepts.length ? '<span class="dim" style="margin-left:auto">'+l.concepts.length+' concepts</span>' : '') + '</li>';
    });
    h += '</ul>' + (s.dynamic ? '<button class="btn ghost sm" data-act="extend-playlist" data-c="'+c.id+'" data-s="'+s.id+'" style="margin-top:6px">+ Add 15 more lesson slots</button>' : '') + '</div>';
  });
  if (!(c.sources||[]).length) h += '<p class="muted tiny" style="margin-top:12px">No material yet. Add a playlist, a video or a PDF.</p>';
  h += '</div>';

  /* side */
  h += '<div class="stack">';
  h += '<div class="sheet pad"><h3>Weak concepts</h3>'
    + (weak.length ? '<ul style="list-style:none;padding:0;margin:10px 0 0;font-size:.88rem">' + weak.map(x =>
        '<li style="padding:7px 0;border-bottom:1px solid var(--rule-soft)"><div class="between" style="gap:8px"><span>'+esc(x.name)+'</span><span class="tag '+({high:'hi',medium:'md',low:'lo'}[prioBand(priority(x))])+'">'+pct(x.mastery)+'</span></div>'
        + (x.source ? '<div class="dim" style="margin-top:3px">'+esc(sourceLabel(c,x.source))+'</div>' : '') + '</li>').join('') + '</ul>'
      : '<p class="muted tiny" style="margin-top:8px">Nothing flagged. A single wrong answer is not enough to call something a weakness — it takes a repeated pattern.</p>')
    + '<button class="btn sec sm" style="margin-top:12px" data-act="go" data-view="weakness">Open weakness matrix</button></div>';

  h += '<div class="sheet pad"><h3>Assignments</h3>'
    + ((c.assignments||[]).length ? '<ul style="list-style:none;padding:0;margin:10px 0 0;font-size:.86rem">' + c.assignments.slice(0,6).map(a =>
        '<li class="between" style="padding:7px 0;border-bottom:1px solid var(--rule-soft)"><span>'+esc(a.title||'Assignment')+'<div class="dim">'+dayLabel(a.created)+'</div></span>'
        + (a.submitted ? '<b style="font-weight:600">'+a.score+'/'+a.questions.length+'</b>' : '<button class="btn sec sm" data-act="open-work" data-c="'+c.id+'" data-a="'+a.id+'">Resume</button>') + '</li>').join('') + '</ul>'
      : '<p class="muted tiny" style="margin-top:8px">No assignments yet.</p>')
    + (SAMPLE ? '<button class="btn sec sm" style="margin-top:12px" data-act="new-assign" data-c="'+c.id+'">Generate an assignment</button>' : '')
    + '</div>';
  h += '</div></div>';
  return h;
}
const kpi = (label, val, bar) => '<div class="sheet pad"><div class="pill">'+esc(label)+'</div><div class="kpi" style="margin:8px 0">'+esc(val)+'</div>'
  + (bar==null ? '' : '<div class="bar '+(bar<50?'bad':bar<75?'warn':'')+'"><i style="width:'+clamp(bar,0,100)+'%"></i></div>') + '</div>';
function sourceLabel(c, src){
  if (!src) return '';
  const l = findLesson(c, src.lessonId);
  const base = l ? l.title : (src.title || 'source');
  if (src.at != null) return base + ' — ' + mmss(src.at);
  if (src.page) return base + ' — page ' + src.page;
  return base;
}
function recommend(c){
  const w = weakList(c);
  const hot = w.find(x => x.status === 'weakness');
  if (hot) return { label:'Targeted practice on ' + hot.name, why:'You have missed this ' + Math.round(hot.errors) + ' times across ' + hot.attempts + ' attempts. Mastery sits at ' + pct(hot.mastery) + '.', act:'target', k:hot.name, cta:'Start intervention' };
  const watch = w.find(x => x.status === 'watch');
  if (watch) return { label:'Check ' + watch.name + ' again', why:'One mistake is a signal, not a diagnosis. A few more questions will tell us whether it is a real gap.', act:'target', k:watch.name, cta:'Collect evidence' };
  const next = allLessons(c).find(l => !l.done);
  if (next) return { label:next.title, why:'Nothing is flagged right now, so the useful move is new material.', act:'open-lesson', l:next.id, cta:'Open lesson' };
  return { label:'Mixed recall across the whole course', why:'Every lesson is done. Spaced practice keeps it there.', act:'new-assign', cta:'Generate practice' };
}

/* ============================ LESSON WORKSPACE ============================ */
function vLesson(){
  const c = getCourse(S.course); if (!c) return '<div class="pad">Course not found.</div>';
  const found = rawLesson(c, S.lesson); if (!found) return '<div class="pad">Lesson not found.</div>';
  const { src, lesson } = found;
  const list = allLessons(c);
  const i = list.findIndex(l => l.id === lesson.id);
  const prev = list[i-1], next = list[i+1];
  const vid = ytVideoId(lesson.url) || (src.type !== 'playlist' ? ytVideoId(src.url) : null);
  const listId = src.listId || ytListId(src.url);
  const a = (c.assignments||[]).find(x => x.id === S.work);

  let embedSrc = null;
  const common = 'rel=0&modestbranding=1&enablejsapi=1&origin=' + encodeURIComponent(location.origin) + (lesson.at ? '&start='+Math.floor(lesson.at) : '');
  const embedBase = 'https://www.youtube.com/embed';
  if (vid) embedSrc = embedBase + '/' + vid + '?' + common;
  else if (src.type === 'playlist' && listId) embedSrc = embedBase + '/videoseries?list=' + encodeURIComponent(listId) + '&index=' + (lesson.index||1) + '&' + common;

  let watchUrl = null;
  if (vid) watchUrl = 'https://www.youtube.com/watch?v=' + vid;
  else if (src.type === 'playlist' && listId) watchUrl = 'https://www.youtube.com/playlist?list=' + encodeURIComponent(listId);

  let stage;
  if ((vid || (src.type === 'playlist' && listId)) && false){
    stage = '<div class="stage"><iframe id="ytframe" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" src="'+esc(embedSrc)+'" onerror="this.style.display=\'none\'; var note=this.parentNode.parentNode.querySelector(\'#playnote\'); if(note){ note.classList.add(\'error\'); var txt=note.querySelector(\'span\'); if(txt){ txt.textContent=\'This video cannot be embedded in the current browser or network. Open it on YouTube instead.\'; } }"></iframe></div>'
      + '<div class="playnote" id="playnote"><span>Blank player or a connection error? Some preview frames and networks block embedded video.</span>'
      + '<a href="'+esc(watchUrl)+'" target="_blank" rel="noopener">Open lesson ' + (lesson.index||1) + ' on YouTube</a>'
      + '<span class="dim">Practice, the timestamp box and everything else on this page keep working.</span></div>';
  } else if (vid || (src.type === 'playlist' && listId)){
    const thumb = vid ? 'https://img.youtube.com/vi/' + vid + '/hqdefault.jpg' : 'https://img.youtube.com/vi/' + ytVideoId(src.url || '') + '/hqdefault.jpg';
    stage = '<div class="stage" style="display:flex;align-items:center;justify-content:center;padding:18px;background:linear-gradient(180deg, rgba(15,23,42,0.02), rgba(15,23,42,0.08));">'
      + '<div style="width:min(100%, 760px); background:var(--sheet); border:1px solid var(--rule); border-radius:16px; overflow:hidden; box-shadow:0 12px 28px rgba(15,23,42,0.08);">'
      + '<img src="'+esc(thumb || '')+'" alt="'+esc(lesson.title)+'" style="display:block;width:100%;height:auto;max-height:420px;object-fit:cover;filter:saturate(.9);">'
      + '<div style="padding:18px 20px 20px;">'
      + '<div class="pill">Video unavailable in this browser</div>'
      + '<h3 style="margin:10px 0 8px;">'+esc(lesson.title)+'</h3>'
      + '<p class="muted" style="margin:0 0 14px;">Your browser or network is blocking YouTube embeds. Open the video directly on YouTube to continue learning.</p>'
      + '<a class="btn" href="'+esc(watchUrl)+'" target="_blank" rel="noopener" style="display:inline-block;">Open lesson ' + (lesson.index||1) + ' on YouTube</a>'
      + '</div></div></div>'
      + '<div class="playnote" id="playnote"><span>The embedded player is blocked here, so this lesson opens directly on YouTube instead.</span>'
      + '<a href="'+esc(watchUrl)+'" target="_blank" rel="noopener">Open lesson ' + (lesson.index||1) + ' on YouTube</a>'
      + '<span class="dim">Practice, the timestamp box and everything else on this page still work normally.</span></div>';
  } else if (src.type === 'pdf'){
    stage = '<div class="stage" style="background:var(--sheet);aspect-ratio:auto;min-height:280px;overflow-y:auto;padding:22px">'
      + '<h3 style="font-family:var(--serif)">'+esc(lesson.title)+'</h3>'
      + '<div class="md muted" style="margin-top:10px;font-size:.9rem;white-space:pre-wrap;max-width:70ch">'+esc((lesson.text||src.text||'').slice(0,4000))+'</div></div>';
  } else {
    stage = '<div class="stage"><div class="stagefall">No playable link on this lesson — the playlist link did not contain a list id. Everything else on this page still works.</div></div>';
  }

  let left = '<div style="min-width:0">'
    + '<div class="lbar"><div><div class="t" data-role="lesson-title">'+esc(lesson.title)+(lesson.auto ? ' <span class="dim" style="font-size:.7rem;color:var(--onink-2)">· fills in as it plays</span>' : '')+'</div><div class="s">'+esc(c.name)+' · lesson '+(i+1)+' of '+list.length+'</div></div>'
    + '<div class="row" style="margin-left:auto;gap:8px">'
    + '<button class="btn sec sm" style="border-color:var(--ink-3);color:var(--onink-2);background:transparent" data-act="close-lesson" data-c="'+c.id+'">Close</button>'
    + '<button class="btn sm" style="background:var(--pine);border-color:var(--pine)" data-act="toggle-done" data-c="'+c.id+'" data-l="'+lesson.id+'">'+(lesson.done?'Done ✓':'Mark done')+'</button></div></div>'
    + stage
    + '<div style="padding:14px 16px;background:var(--sheet);border-bottom:1px solid var(--rule)">'
    + '<div class="row"><button class="confuse" data-act="confuse" data-c="'+c.id+'" data-l="'+lesson.id+'">🤔 I don\'t understand this</button>'
    + '<div class="dim" style="max-width:40ch">Press it while the idea is still on screen. The timestamp is captured and the explanation is written for that moment only.</div></div></div>'
    + '<div style="padding:16px">'
    + (lesson.concepts && lesson.concepts.length ? '<div class="row tiny" style="gap:6px;margin-bottom:14px">'+lesson.concepts.map(k => {
        const cc = c.concepts[k]; const band = cc ? ({high:'hi',medium:'md',low:'lo'}[prioBand(priority(cc))]) : '';
        return '<span class="tag '+band+'">'+esc(k)+(cc&&cc.attempts?' '+pct(cc.mastery):'')+'</span>';
      }).join('')+'</div>' : '')
    + (lesson.summary ? '<div class="sheet pad md" style="margin-bottom:14px"><h3>Summary</h3><div style="margin-top:8px;font-size:.9rem"><p>'+mdLite(lesson.summary)+'</p></div></div>'
        : (SAMPLE ? '<button class="btn sec sm" data-act="summarize" data-c="'+c.id+'" data-l="'+lesson.id+'" style="margin-bottom:14px">'+(S.busy==='summary'?'<span class="spin"></span> Reading…':'Summarise this lesson')+'</button>' : ''))
    + '<div class="sheet pad"><h4 style="margin-bottom:8px">Course map</h4><ul class="playlist">'
    + list.map(l => '<li data-act="open-lesson" data-c="'+c.id+'" data-l="'+l.id+'" data-lesson-li="'+l.id+'" aria-current="'+(l.id===lesson.id)+'"><span class="mk '+(l.done?'done':'')+'">'+(l.done?'✓':l.id===lesson.id?'▸':'○')+'</span><span class="lbl">'+esc(l.title)+'</span>'+(l.auto?' <span class="dim tiny">auto</span>':'')+'</li>').join('')
    + '</ul></div>'
    + '<div class="row between" style="margin-top:16px">'
    + (prev ? '<button class="btn sec sm" data-act="open-lesson" data-c="'+c.id+'" data-l="'+prev.id+'">← '+esc(prev.title.slice(0,28))+'</button>' : '<span></span>')
    + (next ? '<button class="btn sm" data-act="open-lesson" data-c="'+c.id+'" data-l="'+next.id+'">'+esc(next.title.slice(0,28))+' →</button>' : '<span></span>')
    + '</div></div></div>';

  let pane = '<aside class="lpane">';
  pane += '<div class="between" style="margin-bottom:12px"><h3>Practice</h3>'
    + (a && a.submitted ? '<button class="btn sec sm" data-act="new-assign" data-c="'+c.id+'" data-l="'+lesson.id+'">New set</button>' : '') + '</div>';
  if (S.explain){ pane += explainBlock(); }
  if (a){ pane += assignmentHtml(c, a, true); }
  else if (S.busy === 'assign'){ pane += '<div class="think"><span class="spin"></span> Writing questions from this lesson and your last mistakes…</div>'; }
  else {
    pane += '<div class="note">Questions are written from this lesson, your goal, and the concepts you have been getting wrong. Nothing here is random.</div>'
      + (SAMPLE ? '<button class="btn go" style="margin-top:14px;width:100%" data-act="new-assign" data-c="'+c.id+'" data-l="'+lesson.id+'">Practise this lesson</button>'
                : '<div class="note bad" style="margin-top:12px">Claude is unavailable in this view, so questions cannot be generated.</div>');
  }
  pane += '</aside>';
  return '<div class="lesson">' + left + pane + '</div>' + (S.modal || '');
}
function explainBlock(){
  const x = S.explain;
  return '<div class="sheet pad" style="margin-bottom:16px;border-left:3px solid var(--gold)">'
    + '<div class="between"><div class="pill">Explaining at '+mmss(x.at)+'</div><button class="btn ghost sm" data-act="close-explain">Close</button></div>'
    + '<div class="md" style="margin-top:10px;font-size:.92rem"><p>'+(x.text ? mdLite(x.text) : '<span class="think"><span class="spin"></span> Thinking about that moment…</span>')+'</p></div>'
    + (x.done ? '<div class="row" style="gap:6px;margin-top:12px">'
        + [['simple','Explain simply'],['example','Give an example'],['analogy','Use an analogy'],['steps','Step by step'],['test','Test me'],['different','Still don\'t understand']]
          .map(m => '<button class="chip'+(x.mode===m[0]?' on':'')+'" data-act="explain-mode" data-m="'+m[0]+'">'+m[1]+'</button>').join('')
        + '</div>' : '')
    + '</div>';
}

/* ============================ ASSIGNMENT ============================ */
function vWork(){
  if (!S.course && D.courses.length) S.course = D.courses[0].id;
  const c = getCourse(S.course);
  if (!c) return '<div class="sheet empty"><h3>Nothing to practise yet</h3><p class="muted">Create a course first.</p><button class="btn go" data-act="new-course">New course</button></div>';
  const a = (c.assignments||[]).find(x => x.id === S.work) || (c.assignments||[])[0];
  let h = '<div class="crumb"><b data-act="open-course" data-c="'+c.id+'">'+esc(c.name)+'</b> › Practice</div>';
  h += '<div class="between" style="margin-bottom:18px"><h1>Practice</h1><div class="row">'
    + D.courses.map(x => '<button class="chip'+(x.id===c.id?' on':'')+'" data-act="pick-course" data-c="'+x.id+'">'+esc(x.name)+'</button>').join('')
    + '</div></div>';
  if (S.busy === 'assign') return h + '<div class="sheet pad"><div class="think"><span class="spin"></span> Building your next assignment from what you got wrong last time…</div></div>';
  if (!a) return h + '<div class="sheet empty"><h3>No assignment yet</h3><p class="muted" style="max-width:46ch;margin:0 auto 14px">The first set is drawn from your material. Every set after that is drawn from your mistakes in the one before it.</p>'
    + (SAMPLE ? '<button class="btn go" data-act="new-assign" data-c="'+c.id+'">Generate an assignment</button>' : '<div class="note bad">Claude is unavailable in this view.</div>') + '</div>';
  return h + assignmentHtml(c, a, false)
    + (a.submitted ? '<div class="row" style="margin-top:16px"><button class="btn go" data-act="new-assign" data-c="'+c.id+'">Next assignment</button><span class="dim">Written from what just happened.</span></div>' : '');
}
function assignmentHtml(c, a, compact){
  let h = '<div class="between" style="margin-bottom:10px"><div><h3 style="font-size:1.05rem">'+esc(a.title||'Assignment')+'</h3>'
    + '<div class="dim">'+(a.focus&&a.focus.length ? 'Focused on '+esc(a.focus.join(', ')) : 'Mixed practice')+'</div></div>'
    + (a.submitted ? '<div class="kpi" style="font-size:1.4rem">'+a.score+'/'+a.questions.length+'</div>' : '') + '</div>';
  a.questions.forEach((q, i) => { h += questionHtml(c, a, q, i); });
  if (!a.submitted){
    const answered = a.questions.filter((q,i) => a.answers[i] !== undefined && a.answers[i] !== '').length;
    h += '<div class="row between" style="margin-top:14px"><span class="dim">'+answered+' of '+a.questions.length+' answered</span>'
      + '<button class="btn go" data-act="submit" data-c="'+c.id+'" data-a="'+a.id+'"'+(S.busy==='grade'?' disabled':'')+'>'
      + (S.busy==='grade' ? '<span class="spin"></span> Marking…' : 'Submit assignment') + '</button></div>';
  } else if (a.report){
    h += '<div class="sheet pad" style="margin-top:16px;border-left:3px solid var(--pine)"><h3>What this tells us</h3>'
      + '<div class="md" style="margin-top:8px;font-size:.9rem"><p>'+mdLite(a.report)+'</p></div></div>';
  }
  return h;
}
function questionHtml(c, a, q, i){
  const ans = a.answers[i];
  const r = a.results ? a.results[i] : null;
  let h = '<div class="q"><div class="qh"><span class="qn">Q'+(i+1)+' · '+esc(q.concept||'')+' · '+esc(q.difficulty||'medium')+'</span>'
    + (a.hints && a.hints[i] ? '' : (!a.submitted && q.hint ? '<button class="btn ghost sm" data-act="hint" data-c="'+c.id+'" data-a="'+a.id+'" data-i="'+i+'">Hint</button>' : '')) + '</div>'
    + '<div class="qt'+(q.type==='code'?' mono':'')+'">'+esc(mathText(q.text))+'</div>';
  if (a.hints && a.hints[i]) h += '<div class="note warn" style="margin-bottom:10px">'+esc(mathText(q.hint))+'</div>';

  const type = q.type || 'mcq';
  if (type === 'mcq' || type === 'tf'){
    const opt = type === 'tf' ? ['True','False'] : (q.options||[]);
    opt.forEach((o, j) => {
      let cls = 'opt' + (ans === j ? ' sel' : '');
      if (r){ if (j === q.answer) cls = 'opt right'; else if (ans === j) cls = 'opt wrong'; }
      h += '<label class="'+cls+'"><input type="radio" name="q'+a.id+i+'" '+(ans===j?'checked':'')+(a.submitted?' disabled':'')+' data-act="ans" data-c="'+c.id+'" data-a="'+a.id+'" data-i="'+i+'" data-v="'+j+'"><span>'+esc(mathText(o))+'</span></label>';
    });
  } else if (type === 'multi'){
    const sel = Array.isArray(ans) ? ans : [];
    (q.options||[]).forEach((o, j) => {
      const correct = Array.isArray(q.answer) && q.answer.includes(j);
      let cls = 'opt' + (sel.includes(j) ? ' sel' : '');
      if (r){ if (correct) cls = 'opt right'; else if (sel.includes(j)) cls = 'opt wrong'; }
      h += '<label class="'+cls+'"><input type="checkbox" '+(sel.includes(j)?'checked':'')+(a.submitted?' disabled':'')+' data-act="ansmulti" data-c="'+c.id+'" data-a="'+a.id+'" data-i="'+i+'" data-v="'+j+'"><span>'+esc(mathText(o))+'</span></label>';
    });
  } else if (type === 'numeric'){
    h += '<input type="text" style="max-width:220px" value="'+esc(ans||'')+'" '+(a.submitted?'disabled':'')+' data-act="anstext" data-c="'+c.id+'" data-a="'+a.id+'" data-i="'+i+'" placeholder="Your answer">';
  } else {
    h += '<textarea '+(a.submitted?'disabled':'')+' data-act="anstext" data-c="'+c.id+'" data-a="'+a.id+'" data-i="'+i+'" placeholder="'+(type==='code'?'Write your code or a dry run':'Answer in a few lines')+'">'+esc(ans||'')+'</textarea>';
  }

  if (r){
    const vc = r.verdict === 'correct' ? 'ok' : r.verdict === 'partial' ? 'part' : 'no';
    const vl = r.verdict === 'correct' ? 'Correct' : r.verdict === 'partial' ? 'Partly right' : 'Not right';
    h += '<div style="margin-top:12px;border-top:1px solid var(--rule-soft);padding-top:10px">'
      + '<div class="verdict '+vc+'">'+vl+(r.errorType && r.verdict!=='correct' ? ' · '+esc(r.errorType)+(r.confidence?' ('+esc(r.confidence)+' confidence)':'') : '')+'</div>'
      + '<div class="tiny muted" style="white-space:pre-wrap">'+esc(mathText(r.feedback||q.explanation||''))+'</div>'
      + (q.answer!=null && (type==='short'||type==='numeric'||type==='code') ? '<div class="tiny" style="margin-top:6px"><b>Expected:</b> '+esc(mathText(String(q.answer)))+'</div>' : '')
      + '</div>';
  } else if (q.why){
    h += '<details style="margin-top:10px"><summary class="dim" style="cursor:pointer">Why am I getting this question?</summary><div class="note why" style="margin-top:8px">'+esc(mathText(q.why))+'</div></details>';
  }
  return h + '</div>';
}

/* ============================ WEAKNESS MATRIX ============================ */
function vWeakness(){
  const rows = [];
  D.courses.forEach(c => weakList(c).forEach(x => rows.push({ c, x })));
  rows.sort((a,b) => priority(b.x) - priority(a.x));
  let h = '<h1>Weakness matrix</h1><p class="muted" style="margin:8px 0 20px;max-width:64ch">Each row needs evidence before it is called a weakness: repeated errors across separate attempts, not one bad answer. Confidence rises as the pattern repeats.</p>';
  if (!rows.length) return h + '<div class="sheet empty"><h3>Nothing recorded yet</h3><p class="muted">Attempt an assignment and every concept you touch appears here.</p></div>';
  h += '<div class="sheet scroll" style="padding:16px"><table><thead><tr><th>Concept</th><th>Course</th><th class="n">Mastery</th><th class="n">Attempts</th><th class="n">Errors</th><th>Typical error</th><th>Status</th><th>Back to source</th><th></th></tr></thead><tbody>';
  rows.forEach(({c,x}) => {
    const et = Object.entries(x.errorTypes||{}).sort((a,b)=>b[1]-a[1])[0];
    const band = prioBand(priority(x));
    h += '<tr><td><b style="font-weight:500">'+esc(x.name)+'</b>'+(x.confusion?'<div class="dim">'+x.confusion+' confusion event'+(x.confusion>1?'s':'')+'</div>':'')+'</td>'
      + '<td class="muted tiny">'+esc(c.name)+'</td>'
      + '<td class="n" style="min-width:90px"><div>'+pct(x.mastery)+'</div><div class="bar '+(x.mastery<50?'bad':x.mastery<75?'warn':'')+'" style="margin-top:4px"><i style="width:'+x.mastery+'%"></i></div></td>'
      + '<td class="n">'+x.attempts+'</td><td class="n">'+Math.round(x.errors)+'</td>'
      + '<td class="tiny muted">'+(et ? esc(et[0]) : '—')+'</td>'
      + '<td><span class="tag '+({high:'hi',medium:'md',low:'lo'}[band])+'">'+esc(x.status)+'</span></td>'
      + '<td class="tiny">'+(x.source ? '<button class="btn ghost sm" data-act="review" data-c="'+c.id+'" data-k="'+esc(x.name)+'">'+esc(sourceLabel(c, x.source))+'</button>' : '<span class="dim">—</span>')+'</td>'
      + '<td class="n">'+(SAMPLE?'<button class="btn sec sm" data-act="target" data-c="'+c.id+'" data-k="'+esc(x.name)+'">Practise</button>':'')+'</td></tr>';
  });
  return h + '</tbody></table></div>';
}

/* ============================ REVISION ============================ */
function vRevision(){
  const rows = [];
  D.courses.forEach(c => weakList(c).filter(x => x.status !== 'mastered' && (x.errors > 0 || x.confusion > 0)).forEach(x => rows.push({ c, x, p:priority(x) })));
  rows.sort((a,b) => b.p - a.p);
  let h = '<h1>My revision</h1><p class="muted" style="margin:8px 0 20px;max-width:64ch">Ordered by how much it costs you, not by when you added it. Every item links back to the exact minute or page it came from.</p>';
  if (!rows.length) return h + '<div class="sheet empty"><h3>The queue is empty</h3><p class="muted">Items arrive here when a mistake repeats or you flag confusion during a lesson.</p></div>';
  const groups = { high:[], medium:[], low:[] };
  rows.forEach(r => groups[prioBand(r.p)].push(r));
  ['high','medium','low'].forEach(band => {
    if (!groups[band].length) return;
    h += '<div class="pill" style="margin:20px 0 8px">'+({high:'High priority',medium:'Medium priority',low:'Improving'}[band])+'</div><div class="stack">';
    groups[band].forEach(({c,x}) => {
      h += '<div class="sheet pad between" style="align-items:center"><div><h4>'+esc(x.name)+'</h4>'
        + '<div class="dim" style="margin-top:3px">'+esc(c.name)+(x.source?' · '+esc(sourceLabel(c,x.source)):'')+' · mastery '+pct(x.mastery)+'</div></div>'
        + '<div class="row">'+(x.source?'<button class="btn sec sm" data-act="review" data-c="'+c.id+'" data-k="'+esc(x.name)+'">Review the source</button>':'')
        + (SAMPLE?'<button class="btn sm" data-act="target" data-c="'+c.id+'" data-k="'+esc(x.name)+'">Practise now</button>':'')+'</div></div>';
    });
    h += '</div>';
  });
  return h;
}

/* ============================ ROADMAP ============================ */
function vRoadmap(){
  if (!S.course && D.courses.length) S.course = D.courses[0].id;
  const c = getCourse(S.course);
  if (!c) return '<div class="sheet empty"><h3>No courses yet</h3><button class="btn go" data-act="new-course">New course</button></div>';
  let h = '<div class="between" style="margin-bottom:18px"><h1>My roadmap</h1><div class="row">'
    + D.courses.map(x => '<button class="chip'+(x.id===c.id?' on':'')+'" data-act="pick-course" data-c="'+x.id+'">'+esc(x.name)+'</button>').join('') + '</div></div>';
  const road = c.roadmap || [];
  if (!road.length) return h + '<div class="sheet empty"><h3>No roadmap for this course yet</h3><p class="muted" style="max-width:48ch;margin:0 auto 14px">A roadmap is the bridge from what you said you already know to what your goal needs. Claude reads the gap and lays out the order.</p>'
    + (SAMPLE ? '<button class="btn go" data-act="gen-roadmap" data-c="'+c.id+'">'+(S.busy==='road'?'<span class="spin"></span> Working out the gap…':'Build my roadmap')+'</button>' : '') + '</div>';

  const score = n => {
    const ks = (n.concepts||[]).map(k => c.concepts[k]).filter(Boolean);
    if (!ks.length) return null;
    return Math.round(ks.reduce((s,k)=>s+k.mastery,0)/ks.length);
  };
  const done = road.filter(n => (score(n)||0) >= 80).length;
  h += '<div class="sheet pad" style="margin-bottom:18px"><div class="between"><div><div class="pill">Target</div><h3 style="margin-top:4px">'+esc(c.modeText || c.goalType || 'Your goal')+'</h3></div>'
    + '<div style="text-align:right"><div class="pill">Roadmap progress</div><div class="kpi">'+pct(road.length?done/road.length*100:0)+'</div></div></div>'
    + '<div class="bar" style="margin-top:12px"><i style="width:'+(road.length?done/road.length*100:0)+'%"></i></div></div>';
  if (c.gap) h += '<div class="note" style="margin-bottom:18px"><b>Gap analysis.</b> '+esc(c.gap)+'</div>';
  h += '<div class="sheet pad"><ul class="road">';
  let currentMarked = false;
  road.forEach((n, i) => {
    const s = score(n);
    const isDone = (s||0) >= 80;
    const isNow = !isDone && !currentMarked; if (isNow) currentMarked = true;
    h += '<li class="'+(isDone?'done':isNow?'now':'')+'"><span class="dot">'+(isDone?'✓':i+1)+'</span><div style="flex:1">'
      + '<div class="between"><b style="font-weight:500">'+esc(n.title)+'</b>'+(s!=null?'<span class="tag '+(s>=80?'lo':s>=55?'md':'hi')+'">'+pct(s)+'</span>':'<span class="dim tiny">not started</span>')+'</div>'
      + '<div class="muted tiny" style="margin-top:3px">'+esc(n.why||'')+'</div>'
      + ((n.concepts||[]).length ? '<div class="row tiny" style="gap:5px;margin-top:6px">'+n.concepts.map(k=>'<span class="tag">'+esc(k)+'</span>').join('')+'</div>' : '')
      + (isNow && SAMPLE ? '<button class="btn sec sm" style="margin-top:9px" data-act="target" data-c="'+c.id+'" data-k="'+esc((n.concepts||[])[0]||n.title)+'">Work on this</button>' : '')
      + '</div></li>';
  });
  return h + '</ul></div>';
}

/* ============================ PROGRESS ============================ */
function vProgress(){
  let h = '<h1>Progress</h1><p class="muted" style="margin:8px 0 20px;max-width:62ch">Several indicators rather than one number, because one number hides which part moved.</p>';
  const b = D.behaviour;
  const acc = b.answers ? Math.round(b.correct/b.answers*100) : 0;
  h += '<div class="grid g3" style="margin-bottom:22px">'
    + kpi('Questions answered', String(b.answers), null)
    + kpi('Accuracy', pct(acc), acc)
    + kpi('Hints used', String(b.hints), null)
    + kpi('Times you flagged confusion', String(b.confusions), null)
    + '</div>';
  D.courses.forEach(c => {
    const pr = courseProgress(c);
    const cs = conceptList(c).filter(x => x.attempts > 0).sort((a,b)=>b.mastery-a.mastery);
    const mastered = cs.filter(x => x.status === 'mastered').length;
    h += '<div class="sheet pad" style="margin-bottom:16px"><div class="between"><div><h3>'+esc(c.name)+'</h3>'
      + '<div class="dim" style="margin-top:3px">'+esc(c.modeText||c.goalType||'')+'</div></div>'
      + '<button class="btn sec sm" data-act="open-course" data-c="'+c.id+'">Open</button></div>'
      + '<div class="grid g3" style="margin-top:14px">'
      + mini('Lesson coverage', pr.coverage) + mini('Average mastery', pr.mastery) + mini('Concepts mastered', cs.length?Math.round(mastered/cs.length*100):0)
      + '</div>'
      + (cs.length ? '<div style="margin-top:16px">'+cs.map(x =>
          '<div class="row" style="gap:10px;margin:6px 0;font-size:.85rem"><span style="width:170px;flex:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(x.name)+'</span>'
          + '<span class="bar '+(x.mastery<50?'bad':x.mastery<75?'warn':'')+'" style="flex:1"><i style="width:'+x.mastery+'%"></i></span>'
          + '<span class="n dim" style="width:42px;text-align:right">'+pct(x.mastery)+'</span></div>').join('')+'</div>' : '')
      + '</div>';
  });
  return h;
}
const mini = (l,v) => '<div><div class="pill">'+esc(l)+'</div><div class="row" style="gap:8px;margin-top:6px"><span class="bar '+(v<50?'bad':v<75?'warn':'')+'" style="flex:1"><i style="width:'+clamp(v,0,100)+'%"></i></span><b class="tiny">'+pct(v)+'</b></div></div>';

/* ============================ HISTORY ============================ */
const EV_LABEL = {
  lesson_opened:['Opened','ask'], lesson_done:['Completed','ok'], confusion:['Asked for an explanation','ask'],
  assignment_created:['New assignment generated','ask'], assignment_submitted:['Submitted assignment','ok'],
  mistake:['Got a question wrong','no'], concept_mastered:['Reached mastery','ok'], concept_flagged:['Flagged as a weakness','no'],
  revision:['Revised from the source','ok'], course_created:['Created course','ok'], summary:['Read a summary','ask'], diagnostic:['Diagnostic','ask']
};
function vHistory(){
  let h = '<h1>Learning history</h1><p class="muted" style="margin:8px 0 20px">Every event, in order. This is what the adaptive engine reads.</p>';
  if (!D.events.length) return h + '<div class="sheet empty"><h3>Nothing yet</h3></div>';
  const days = {};
  D.events.forEach(e => { const k = dayLabel(e.t); (days[k] = days[k] || []).push(e); });
  Object.entries(days).forEach(([day, list]) => {
    h += '<div class="sheet pad" style="margin-bottom:14px"><h3>'+esc(day)+'</h3><ul class="timeline" style="margin-top:10px">'
      + list.map(e => { const L = EV_LABEL[e.type] || [e.type,'']; return '<li class="'+L[1]+'">'+esc(L[0])+(e.label?' — '+esc(e.label):'')+(e.detail?'<div class="dim">'+esc(e.detail)+'</div>':'')+'</li>'; }).join('')
      + '</ul></div>';
  });
  return h;
}

/* ============================ FOCUS SHIELD ============================ */
const EXT_FILES = {
  'manifest.json': '{\n  "manifest_version": 3,\n  "name": "AdaptPractice Focus Shield",\n  "version": "1.0",\n  "description": "Removes Shorts, recommendations and autoplay from YouTube so a study session stays a study session.",\n  "content_scripts": [\n    {\n      "matches": ["*://*.youtube.com/*"],\n      "css": ["shield.css"],\n      "js": ["shield.js"],\n      "run_at": "document_start"\n    }\n  ]\n}\n',
  'shield.css': '/* Shorts: shelf, tab, sidebar entry, reels */\nytd-guide-entry-renderer:has(a[title="Shorts"]),\nytd-mini-guide-entry-renderer:has(a[title="Shorts"]),\nytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]),\nytd-reel-shelf-renderer,\nyt-tab-shape[tab-title="Shorts"],\nytd-compact-video-renderer:has(a[href*="/shorts/"]),\n\n/* The recommendation rail beside a lecture */\n#secondary,\n/* The wall of thumbnails after a video ends */\n.ytp-endscreen-content,\n.ytp-ce-element,\n/* Home feed */\nytd-browse[page-subtype="home"] #contents {\n  display: none !important;\n}\n',
  'shield.js': 'function offRamp(){\n  // A /shorts/ link becomes an ordinary watch page\n  if (location.pathname.startsWith("/shorts/")) {\n    const id = location.pathname.split("/shorts/")[1];\n    if (id) location.replace("https://www.youtube.com/watch?v=" + id);\n  }\n  // Autoplay off\n  const t = document.querySelector(".ytp-autonav-toggle-button[aria-checked=true]");\n  if (t) t.click();\n}\noffRamp();\nwindow.addEventListener("yt-navigate-finish", offRamp);\n'
};
function vShield(){
  const s = S.session;
  let h = '<h1>Focus shield</h1><p class="muted" style="margin:8px 0 22px;max-width:64ch">Two layers. Inside AdaptPractice, focus mode strips the page down to the lesson. Outside it, on youtube.com itself, a small browser extension removes the parts of the page that were built to pull you away.</p>';

  h += '<div class="grid g2" style="align-items:start">';
  h += '<div class="sheet pad"><h3>Focus session</h3><p class="muted tiny" style="margin:6px 0 14px">A session is a block with an end. Pick a length and the timer sits in the corner while you work.</p>';
  if (s && s.until > now()){
    const left = Math.max(0, Math.round((s.until - now())/1000));
    h += '<div class="kpi" style="font-size:2.6rem">'+mmss(left)+'</div><p class="muted tiny" style="margin:8px 0 14px">'+esc(s.plan||'')+'</p>'
      + '<button class="btn sec sm" data-act="end-session">End session</button>';
  } else {
    h += '<div class="row" style="gap:8px">'+[15,30,45,60].map(m => '<button class="chip" data-act="start-session" data-m="'+m+'">'+m+' min</button>').join('')+'</div>'
      + '<div class="note" style="margin-top:14px">A 45-minute block usually splits: 20 minutes of lecture, 5 minutes of quick recall, 15 minutes of assignment, 5 minutes reading your mistakes.</div>';
  }
  h += '<hr><h4>Inside the app</h4><p class="muted tiny" style="margin:6px 0 10px">Hides navigation and counters, keeps the lesson and the practice panel.</p>'
    + '<button class="btn '+(D.settings.focus?'sec':'')+' sm" data-act="'+(D.settings.focus?'focus-off':'focus-on')+'">'+(D.settings.focus?'Turn focus mode off':'Turn focus mode on')+'</button></div>';

  h += '<div class="sheet pad"><h3>The YouTube extension</h3>'
    + '<p class="muted tiny" style="margin:6px 0 12px">Three files. Save them into one folder, open <code>chrome://extensions</code>, turn on developer mode, and choose “Load unpacked”. It removes Shorts, the recommendation rail, the end-screen thumbnail wall and the home feed, and turns autoplay off.</p>'
    + '<div class="row" style="gap:8px;margin-bottom:12px">'
    + Object.keys(EXT_FILES).map(n => '<button class="chip'+(S.extFile===n?' on':'')+'" data-act="ext-show" data-n="'+n+'">'+n+'</button>').join('')
    + '</div>';
  const cur = S.extFile || 'manifest.json';
  h += '<pre>'+esc(EXT_FILES[cur])+'</pre>'
    + '<div class="row" style="margin-top:10px"><button class="btn sec sm" data-act="ext-copy" data-n="'+cur+'">Copy '+cur+'</button>'
    + '<button class="btn sec sm" data-act="ext-save" data-n="'+cur+'">Save as a file</button></div>'
    + '<div class="note" style="margin-top:12px">A page cannot block another site by itself — only an extension you install can. Nothing here touches your YouTube account or its history.</div></div>';
  return h + '</div>';
}

/* ============================ PROFILE ============================ */
function vProfile(){
  const p = D.profile || {};
  const b = D.behaviour;
  const hintRate = b.answers ? Math.round(b.hints/b.answers*100) : 0;
  const signals = [];
  if (b.answers >= 6){
    signals.push(hintRate > 35 ? 'You open the hint on about '+hintRate+'% of questions. Scaffolding is doing the work; the target is to shrink that number.' : 'You mostly answer before asking for a hint ('+hintRate+'% hint rate).');
  }
  if (b.confusions >= 3) signals.push('You stop and ask for an explanation often — '+b.confusions+' times so far. Those moments are feeding your practice sets.');
  if (b.revisions >= 2) signals.push('You go back to the source when told to. '+b.revisions+' revisions completed.');
  if (!signals.length) signals.push('Not enough evidence yet. This fills in after a few assignments, and only from things you actually did.');

  return '<h1>Profile</h1>'
    + '<div class="grid g2" style="margin-top:18px;align-items:start">'
    + '<div class="sheet pad"><h3>Present state</h3>'
      + f('Name','<input type="text" id="p-name" value="'+esc(p.name||'')+'">')
      + f('Background','<select id="p-bg">'+opts(BACKGROUNDS, p.background)+'</select>')
      + f('Where you are right now','<textarea id="p-level">'+esc(p.level||'')+'</textarea>')
      + '<h3 style="margin-top:20px">Future state</h3>'
      + f('Goal','<select id="p-goal">'+opts(GOALS, p.goal)+'</select>')
      + f('In your words','<textarea id="p-gt">'+esc(p.goalText||'')+'</textarea>')
      + f('Target date','<input type="text" id="p-target" value="'+esc(p.target||'')+'">')
      + '<button class="btn" data-act="save-profile">Save changes</button></div>'
    + '<div class="stack">'
      + '<div class="sheet pad"><h3>How you learn</h3><p class="muted tiny" style="margin:6px 0 10px">Observed behaviour only, kept separate from what you know in any one subject.</p>'
        + '<ul style="padding-left:18px;margin:0;font-size:.88rem">'+signals.map(s=>'<li style="margin:6px 0">'+esc(s)+'</li>').join('')+'</ul></div>'
      + '<div class="sheet pad"><h3>Appearance</h3><div class="row" style="margin-top:10px">'
        + ['light','dark'].map(t=>'<button class="chip'+(D.settings.theme===t?' on':'')+'" data-act="theme" data-t="'+t+'">'+t+'</button>').join('')+'</div></div>'
      + '<div class="sheet pad"><h3>Your data</h3><p class="muted tiny" style="margin:6px 0 12px">Everything lives in this browser. Nothing is sent anywhere except the text of a question when you ask Claude.</p>'
        + '<div class="row"><button class="btn sec sm" data-act="export">Copy my data as JSON</button><button class="btn sec sm" data-act="reset">Delete everything</button></div></div>'
    + '</div></div>';
}

/* ======================= AI SERVICES ======================= */
function learnerCtx(c){
  const p = D.profile || {};
  const w = weakList(c).slice(0, 6);
  const recent = (c.assignments||[]).filter(a => a.submitted).slice(0,2);
  let s = 'LEARNER\n';
  s += 'Background: ' + (p.background||'unspecified') + '. ' + (p.level||'') + '\n';
  s += 'Overall goal: ' + (p.goalText || p.goal || 'unspecified') + '\n';
  s += 'COURSE: ' + c.name + '\n';
  s += 'Stated level in this course: ' + (c.level||'unspecified') + '. Already knows: ' + (c.known||'unspecified') + '\n';
  s += 'Purpose of this course: ' + (c.goalType||'general') + '. ' + (c.modeText||'') + (c.target ? ' Target date: '+c.target : '') + '\n';
  if (w.length){
    s += 'CONCEPT RECORD (mastery, attempts, errors, status):\n';
    w.forEach(x => { s += '- ' + x.name + ': ' + x.mastery + '%, ' + x.attempts + ' attempts, ' + Math.round(x.errors) + ' errors, ' + x.status
      + (Object.keys(x.errorTypes||{}).length ? ', usual error: ' + Object.entries(x.errorTypes).sort((a,b)=>b[1]-a[1])[0][0] : '')
      + (x.confusion ? ', flagged confusing ' + x.confusion + 'x' : '') + '\n'; });
  } else s += 'CONCEPT RECORD: nothing yet — this is the first practice.\n';
  if (recent.length){
    s += 'LAST ASSIGNMENT(S):\n';
    recent.forEach(a => {
      const missed = a.questions.filter((q,i) => a.results && a.results[i] && a.results[i].verdict !== 'correct').map(q => q.concept);
      s += '- "' + (a.title||'set') + '" scored ' + a.score + '/' + a.questions.length + '. Missed: ' + (missed.length ? missed.join(', ') : 'nothing') + '\n';
    });
  }
  const b = D.behaviour;
  if (b.answers >= 5) s += 'BEHAVIOUR: hint used on ' + Math.round(b.hints/b.answers*100) + '% of questions; ' + b.confusions + ' confusion flags.\n';
  return s;
}
const MODE_BRIEF = {
  exam:'Exam preparation: high-yield concepts, exam-style phrasing, common traps, time pressure.',
  competitive:'Competitive exam: speed and accuracy, tricky distractors, elimination, quantitative rigour.',
  interview:'Interview: why and how questions, trade-offs, scenarios, follow-ups, explaining out loud.',
  hackathon:'Hackathon: implementation, debugging, constraints, edge cases, working code under pressure.',
  academic:'Academic: curriculum coverage, recall then application, progressive difficulty.',
  skill:'Skill building: practical application on realistic small tasks.',
  mastery:'Mastery: deep understanding, transfer to unfamiliar problems, long-term retention.',
  custom:'Follow the learner\'s own stated objective.'
};
const JSON_RULE = 'Reply with only the JSON value. No prose before or after, no code fence.';

async function buildCourse(w){
  const src = w.srcType;
  const excerpt = (w.text||'').slice(0, 14000);
  const titles = src === 'playlist' ? (w.titles||'').split('\n').map(s=>s.trim()).filter(Boolean) : [];

  if (src === 'playlist' && titles.length){
    // The learner's pasted list IS the playlist — exact titles, exact order,
    // exact count, one-to-one with real positions in the real playlist.
    // Claude is only asked to tag concepts onto each entry, never to
    // shorten, merge, reorder or drop any of them, however long the list
    // is — a fixed lesson cap here would silently break that correspondence
    // for anything past the cap.
    const prompt = 'A learner pasted the full, ordered list of video titles from their own YouTube playlist. Attach concept tags to each one.\n\n'
      + 'COURSE: ' + w.name + '\nLEARNER LEVEL: ' + (w.level||'unspecified') + '\nALREADY KNOWS: ' + (w.known||'unspecified')
      + '\nPURPOSE: ' + (MODE_BRIEF[w.mode] || 'general learning') + ' ' + (w.modeText||'') + '\n\n'
      + 'VIDEO TITLES, IN ORDER (' + titles.length + ' total — this is the real playlist order, do not resequence it):\n'
      + titles.map((t,i)=>(i+1)+'. '+t).join('\n') + '\n\n'
      + 'Rules: do not shorten, merge, reorder, renumber or drop any title, no matter how many there are. Do not invent facts about a video from its title alone beyond a reasonable concept tag.\n\n'
      + 'Return JSON of this exact shape:\n'
      + '{"conceptsByLesson":[["concept a","concept b"], ...],'
      + '"gap":"2 to 3 sentences naming what stands between this learner\'s stated starting point and their purpose",'
      + '"roadmap":[{"title":"string","why":"one sentence","concepts":["concept names"]}]}\n'
      + '"conceptsByLesson" MUST have exactly ' + titles.length + ' entries — one per title above, in the same order, each 2 to 5 short concept names. At most 10 roadmap steps. ' + JSON_RULE;
    return askJson(prompt, { modelTier:'default' });
  }

  let sourceBlock;
  if (src === 'playlist'){
    sourceBlock = 'The learner gave only a playlist link, no titles, and no transcript is available. Do not invent video titles for a playlist you cannot see — return "lessons" as an empty array. Still write the gap analysis and roadmap from the course name, level and goal alone.';
  } else if (src === 'video'){
    sourceBlock = excerpt ? 'Transcript or notes for one video:\n"""\n' + excerpt + '\n"""' : 'A single video with no transcript supplied. Propose the sections such a lecture usually has, and say they are proposed.';
  } else {
    sourceBlock = excerpt ? 'Text extracted from the learner\'s PDF:\n"""\n' + excerpt + '\n"""' : 'No text was extracted.';
  }
  const prompt = 'You are the content analyser of an adaptive learning platform. Build a course map from one learner\'s own material.\n\n'
    + 'COURSE: ' + w.name + '\nLEARNER LEVEL: ' + (w.level||'unspecified') + '\nALREADY KNOWS: ' + (w.known||'unspecified')
    + '\nPURPOSE: ' + (MODE_BRIEF[w.mode] || 'general learning') + ' ' + (w.modeText||'') + '\n\n' + sourceBlock + '\n\n'
    + 'Rules: stay inside the material given. Where you must add something the material does not contain, mark it proposed:true. '
    + 'For a PDF, use the document\'s own chapters or sections as lessons, and give the page where each starts if the text shows it.\n\n'
    + 'Return JSON of this shape:\n'
    + '{"lessons":[{"title":"string","concepts":["2 to 5 concept names"],"page":number|null,"proposed":boolean}],'
    + '"gap":"2 to 3 sentences naming what stands between this learner\'s stated starting point and their purpose",'
    + '"roadmap":[{"title":"string","why":"one sentence","concepts":["concept names"]}]}\n'
    + 'At most 60 lessons and 10 roadmap steps. ' + JSON_RULE;
  return askJson(prompt, { modelTier:'default' });
}

async function genAssignment(c, opts){
  opts = opts || {};
  const lesson = opts.lessonId ? findLesson(c, opts.lessonId) : null;
  const focusConcepts = opts.concept ? [opts.concept]
    : (lesson && lesson.concepts && lesson.concepts.length ? lesson.concepts.slice(0,4)
      : weakList(c).slice(0,3).map(x=>x.name));
  const srcText = lesson ? (lesson.text || (rawLesson(c, lesson.id)||{}).src?.text || '') : (c.sources||[]).map(s=>s.text||'').join('\n');
  const n = opts.count || (opts.concept ? 6 : 5);

  let brief;
  if (opts.concept){
    const cc = c.concepts[opts.concept] || {};
    brief = 'This is a TARGETED INTERVENTION on one concept the learner keeps missing: "' + opts.concept + '" '
      + '(mastery ' + (cc.mastery||0) + '%, ' + Math.round(cc.errors||0) + ' errors in ' + (cc.attempts||0) + ' attempts'
      + (Object.keys(cc.errorTypes||{}).length ? ', usually a ' + Object.entries(cc.errorTypes).sort((a,b)=>b[1]-a[1])[0][0] : '') + ').\n'
      + 'Build a ladder, in this order: (1) a question that only checks the underlying idea, (2) a worked example with one step left blank, '
      + '(3) a guided problem with the method named in the question, (4) a scaffolded problem, (5) the same kind of problem with no support, '
      + '(6) one step harder. Do not give the answer away inside the question.';
  } else {
    brief = 'Standard adaptive set. Weight it towards concepts with low mastery or repeated errors; include one or two questions on concepts that are going well so the set is not all pain. '
      + 'If a concept has only one error so far, treat it as unproven and write a question that would settle whether the gap is real.';
  }
  const prompt = 'You are the adaptive assignment engine of a learning platform. Write the learner\'s next assignment.\n\n'
    + learnerCtx(c) + '\n'
    + (lesson ? 'CURRENT LESSON: ' + lesson.title + '\n' : '')
    + (focusConcepts.length ? 'FOCUS CONCEPTS: ' + focusConcepts.join(', ') + '\n' : '')
    + 'PURPOSE: ' + (MODE_BRIEF[c.goalType] || 'general learning') + '\n\n'
    + (srcText ? 'SOURCE MATERIAL (ground every question in this; do not invent facts it does not support):\n"""\n' + srcText.slice(0, 9000) + '\n"""\n\n'
               : 'No transcript or document text is available for this lesson. Write questions from the lesson title and concept names, and keep them conceptual rather than quoting specifics you cannot verify.\n\n')
    + brief + '\n\n'
    + 'Notation: write mathematics as plain readable text using Unicode symbols (x\u00b2, \u221a9, \u2264, \u03c0, 3/4, \u2192, \u2211). Never use LaTeX, backslash commands, dollar signs or \\frac \u2014 the learner sees them literally. Write code as plain indented lines, without fences.\n'
    + 'Write ' + n + ' questions. Mix the types that suit the subject and purpose: mcq, multi, tf, short, numeric, code. '
    + 'For mcq and tf, "answer" is the index of the right option. For multi, an array of indices. For short, numeric and code, "answer" is the expected answer or key points. '
    + 'Every question carries "why": one sentence, addressed to the learner, saying why they are getting this question now — cite their record when it applies '
    + '("you missed two recursion base-case questions in the last set"), not a generic reason.\n\n'
    + 'Return JSON:\n{"title":"short title for the set","questions":[{"type":"mcq|multi|tf|short|numeric|code","text":"string","options":["only for mcq and multi"],"answer":0,"concept":"string","difficulty":"easy|medium|hard","why":"string","hint":"a nudge, not the answer","explanation":"why the right answer is right"}]}\n'
    + JSON_RULE;
  return askJson(prompt, { modelTier:'default' });
}

function localVerdict(q, ans){
  const t = q.type || 'mcq';
  if (ans === undefined || ans === '' || (Array.isArray(ans) && !ans.length)) return 'incorrect';
  if (t === 'mcq' || t === 'tf') return ans === q.answer ? 'correct' : 'incorrect';
  if (t === 'multi'){
    const A = (Array.isArray(ans)?ans:[]).slice().sort(), B = (Array.isArray(q.answer)?q.answer:[]).slice().sort();
    if (A.join() === B.join()) return 'correct';
    const hit = A.filter(x => B.includes(x)).length, bad = A.filter(x => !B.includes(x)).length;
    return (hit && !bad) ? 'partial' : 'incorrect';
  }
  if (t === 'numeric'){
    const a = parseFloat(String(ans).replace(/[^0-9.eE+-]/g,'')), b = parseFloat(q.answer);
    if (isNaN(a) || isNaN(b)) return null;
    return Math.abs(a-b) <= Math.max(0.01, Math.abs(b)*0.01) ? 'correct' : 'incorrect';
  }
  return null;
}
async function gradeAssignment(c, a){
  const items = a.questions.map((q,i) => ({
    i, type:q.type||'mcq', concept:q.concept, question:q.text,
    options:q.options||null, expected:q.answer,
    learner: Array.isArray(a.answers[i]) ? a.answers[i].map(j=>(q.options||[])[j]) :
             (q.type==='mcq'||q.type==='tf') ? ((q.type==='tf'?['True','False']:(q.options||[]))[a.answers[i]] ?? '(no answer)') :
             (a.answers[i] || '(no answer)'),
    objectiveVerdict: localVerdict(q, a.answers[i]),
    usedHint: !!(a.hints && a.hints[i])
  }));
  const prompt = 'You are the grading and mistake-analysis engine of a learning platform. Mark this assignment and say what each mistake was.\n\n'
    + learnerCtx(c) + '\nANSWERS:\n' + JSON.stringify(items, null, 1) + '\n\n'
    + 'Where objectiveVerdict is given, keep it — it was checked mechanically. Where it is null, judge the answer yourself and allow "partial".\n'
    + 'Classify each mistake as one of: conceptual, application, calculation, logical reasoning, recall, misreading, syntax, implementation, edge case, careless, incomplete. '
    + 'Give a confidence of low, medium or high, and use low when one answer is not enough to tell. Do not claim certainty you do not have.\n'
    + 'Feedback is two or three sentences, addressed to the learner, naming the specific step that went wrong. No praise padding.\n'
    + 'The report is three or four sentences: what the pattern across these answers suggests, what is now worth practising, and what would count as evidence that it is fixed. '
    + 'If the evidence is thin, say so rather than declaring a weakness.\n\n'
    + 'Notation: write mathematics as plain readable text using Unicode symbols (x\u00b2, \u221a9, \u2264, \u03c0, 3/4, \u2192, \u2211). Never use LaTeX, backslash commands, dollar signs or \\frac \u2014 the learner sees them literally. Write code as plain indented lines, without fences.\n'
    + 'Return JSON:\n{"results":[{"i":0,"verdict":"correct|partial|incorrect","errorType":"string or null","confidence":"low|medium|high","feedback":"string"}],"report":"string"}\n'
    + JSON_RULE;
  return askJson(prompt, { modelTier:'default' });
}

async function explainMoment(c, lesson, at, mode, prior, onText){
  const modeLine = {
    simple:'Explain it as simply as possible, for someone meeting it for the first time.',
    example:'Lead with one concrete worked example and walk through it.',
    analogy:'Use one everyday analogy, then say exactly where the analogy breaks down.',
    steps:'Break it into numbered steps, smallest useful steps.',
    test:'Ask one short comprehension question and nothing else, then give the answer below a line.',
    different:'The previous explanation did not land. Take a genuinely different route — different angle, different starting point, different vocabulary. Do not paraphrase what was said before.'
  }[mode] || 'Explain it simply.';
  const src = lesson.text || (rawLesson(c, lesson.id)||{}).src?.text || '';
  const prompt = 'A learner pressed "I don\'t understand this" while watching a lecture.\n\n'
    + 'COURSE: ' + c.name + '\nLESSON: ' + lesson.title + '\nMOMENT: ' + mmss(at) + '\n'
    + (lesson.concepts && lesson.concepts.length ? 'CONCEPTS IN THIS LESSON: ' + lesson.concepts.join(', ') + '\n' : '')
    + 'LEARNER: ' + ((D.profile||{}).level || 'unspecified') + '. Purpose: ' + (c.modeText || c.goalType || 'learning') + '\n'
    + (src ? '\nNEARBY SOURCE TEXT:\n"""\n' + src.slice(0, 6000) + '\n"""\n' : '\nNo transcript is available, so work from the lesson title and concepts and say plainly if something cannot be pinned down.\n')
    + (prior ? '\nALREADY TRIED:\n' + prior.slice(0, 1500) + '\n' : '')
    + '\nExplain the one idea that is most likely on screen at that moment. Do not summarise the whole lesson. ' + modeLine + '\n'
    + 'Notation: write mathematics as plain readable text using Unicode symbols (x\u00b2, \u221a9, \u2264, \u03c0, 3/4, \u2192, \u2211). Never use LaTeX, backslash commands, dollar signs or \\frac \u2014 the learner sees them literally. Write code as plain indented lines, without fences.\n'
    + 'Keep it under 220 words. End with one short question the learner can answer in their head to check it landed. Plain prose with short bold headings if useful.';
  const r = await ask(prompt, { onText, modelTier:'default', cache:false });
  return r.text;
}

async function summarizeLesson(c, lesson){
  const src = lesson.text || (rawLesson(c, lesson.id)||{}).src?.text || '';
  const prompt = 'Summarise one lesson for a learner, point by point, never as a wall of prose.\n\n'
    + 'COURSE: ' + c.name + '\nLESSON: ' + lesson.title + '\nPURPOSE: ' + (MODE_BRIEF[c.goalType]||'learning') + '\n'
    + (src ? 'SOURCE:\n"""\n' + src.slice(0, 11000) + '\n"""\n' : 'No source text is available. Say so in one line, then give only what the title and concepts support, marked as general rather than from the source.\n')
    + 'Notation: write mathematics as plain readable text using Unicode symbols (x\u00b2, \u221a9, \u2264, \u03c0, 3/4, \u2192, \u2211). Never use LaTeX, backslash commands, dollar signs or \\frac \u2014 the learner sees them literally. Write code as plain indented lines, without fences.\n'
    + '\nUse short headings and bullets: definition, key points, the formula or rule if there is one, an example, and what tends to be asked about it. '
    + 'Stay inside the source. Under 300 words.';
  const r = await ask(prompt, { modelTier:'default', cache:{ gcTime: 86400000 } });
  return r.text;
}

async function genRoadmap(c){
  const prompt = 'You are the roadmap engine of an adaptive learning platform. Work out the bridge between where this learner is and where they want to be.\n\n'
    + learnerCtx(c) + '\nMATERIAL IN THE COURSE: ' + allLessons(c).map(l=>l.title).join('; ').slice(0,2000) + '\n\n'
    + 'Do not assume they can start at target level. Name any missing prerequisite explicitly and put it first.\n'
    + 'Return JSON:\n{"gap":"2 to 3 sentences","roadmap":[{"title":"string","why":"one sentence","concepts":["names that match the course concepts where possible"]}]}\nAt most 10 steps. ' + JSON_RULE;
  return askJson(prompt, { modelTier:'default' });
}

/* ======================= ACTIONS ======================= */
function val(id){ const el = document.getElementById(id); return el ? el.value.trim() : ''; }
async function guard(fn, busyKey){
  S.busy = busyKey; render();
  try { await fn(); }
  catch(err){ toast(aiErr(err)); console.warn(err); }
  finally { S.busy = ''; render(); }
}

document.addEventListener('click', async e => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const a = t.dataset.act, c = t.dataset.c ? getCourse(t.dataset.c) : null;

  switch(a){
    case 'start': S.wizard = null; go('onboard'); break;
    case 'go': if (t.dataset.clear) S.course = null; go(t.dataset.view); break;
    case 'theme': D.settings.theme = t.dataset.t; save(); applyTheme(); render(); break;
    case 'focus-on': D.settings.focus = true; save(); render(); toast('Focus mode on. Navigation is hidden.'); break;
    case 'focus-off': D.settings.focus = false; save(); render(); break;

    /* onboarding */
    case 'ob-next':
      S.wizard.name = val('o-name'); S.wizard.background = val('o-bg'); S.wizard.level = val('o-level');
      if (!S.wizard.name){ toast('A name helps — anything you answer to.'); return; }
      S.wizard.step = 2; render(); break;
    case 'ob-back': S.wizard.step = 1; render(); break;
    case 'ob-done': {
      const w = S.wizard;
      w.goal = val('o-goal'); w.goalText = val('o-gt'); w.target = val('o-target');
      D.profile = { name:w.name, background:w.background, level:w.level, goal:w.goal, goalText:w.goalText, target:w.target, created:now() };
      save(); S.wizard = null; go('dash'); toast('Profile created. Now bring something to learn from.');
      break;
    }

    /* course wizard */
    case 'new-course': S.wizard = { step:1, name:'', level:'', known:'', mode:'', modeText:'', target:'', srcType:'playlist', url:'', titles:'', text:'', fileName:'' }; S.cleanMsg = ''; go('newcourse'); break;
    case 'add-source': S.wizard = { step:4, addTo:c.id, name:c.name, level:c.level, known:c.known, mode:c.goalType, modeText:c.modeText, srcType:'playlist', url:'', titles:'', text:'', fileName:'' }; S.cleanMsg = ''; go('newcourse'); break;
    case 'w-next': {
      const w = S.wizard;
      if (w.step === 1){ w.name = val('w-name'); if (!w.name){ toast('Give the course a name.'); return; } }
      if (w.step === 2){ w.level = val('w-level'); w.known = val('w-known'); }
      if (w.step === 3){ w.modeText = val('w-modetext'); w.target = val('w-target'); if (!w.mode){ toast('Pick what this course is for.'); return; } }
      w.step++; render(); break;
    }
    case 'w-back': {
      const w = S.wizard;
      if (w.step === 3){ w.modeText = val('w-modetext'); w.target = val('w-target'); }
      if (w.step === 4){ grabSource(); }
      w.step--; render(); break;
    }
    case 'w-mode': S.wizard.modeText = val('w-modetext'); S.wizard.target = val('w-target'); S.wizard.mode = t.dataset.m; render(); break;
    case 'w-src': grabSource(); S.wizard.srcType = t.dataset.s; render(); break;
    case 'extend-playlist': {
      const src = (c.sources||[]).find(s => s.id === t.dataset.s);
      if (!src) return;
      const start = (src.lessons||[]).length;
      for (let i = 0; i < PLACEHOLDER_BATCH; i++){
        src.lessons.push({ id:uid(), title:'Video ' + (start+i+1), concepts:[], done:false, index:start+i+1, auto:true });
      }
      save(); render();
      break;
    }
    case 'w-clean-paste': {
      const raw = document.getElementById('w-rawpaste');
      const titles = cleanPlaylistPaste(raw ? raw.value : '');
      grabSource();
      if (!titles.length){
        S.cleanMsg = 'Nothing recognisable in that paste — try pasting again, or type titles in directly.';
      } else {
        S.wizard.titles = (S.wizard.titles ? S.wizard.titles.trim() + '\n' : '') + titles.join('\n');
        S.cleanMsg = 'Found ' + titles.length + ' likely title' + (titles.length===1?'':'s') + ' — check the list below before continuing.';
      }
      render();
      break;
    }
    case 'w-build': await buildFromWizard(); break;

    /* course + lesson */
    case 'open-course': go('course', { course:t.dataset.c }); break;
    case 'pick-course': S.course = t.dataset.c; S.work = null; render(); break;
    case 'open-lesson': {
      const course = c || getCourse(S.course);
      const l = findLesson(course, t.dataset.l);
      course.resume = { lessonId:l.id, t:now(), at:course.resume && course.resume.lessonId===l.id ? course.resume.at : 0 };
      save();
      ev('lesson_opened', { label:l.title, detail:course.name, courseId:course.id });
      S.explain = null;
      const open = (course.assignments||[]).find(x => x.lessonId === l.id && !x.submitted);
      go('lesson', { course:course.id, lesson:l.id, work: open ? open.id : null });
      break;
    }
    case 'close-lesson': clearInterval(ytPoll); go('course', { course:c.id, lesson:null, work:null }); break;
    case 'toggle-done': {
      const r = rawLesson(c, t.dataset.l); r.lesson.done = !r.lesson.done;
      if (r.lesson.done) ev('lesson_done', { label:r.lesson.title, detail:c.name, courseId:c.id });
      save(); render(); break;
    }
    case 'summarize': {
      const l = findLesson(c, t.dataset.l);
      await guard(async () => {
        const text = await summarizeLesson(c, l);
        rawLesson(c, l.id).lesson.summary = text;
        ev('summary', { label:l.title, courseId:c.id });
        save();
      }, 'summary');
      break;
    }

    /* confusion */
    case 'confuse': {
      const l = findLesson(c, t.dataset.l);
      const at = Math.round(ytTime || (c.resume && c.resume.at) || 0);
      S.modal = confuseModal(c, l, at); render(); break;
    }
    case 'confuse-go': {
      const l = findLesson(c, t.dataset.l);
      const at = parseTime(val('cf-at'));
      S.modal = null;
      await runExplain(c, l, at, 'simple');
      break;
    }
    case 'confuse-cancel': S.modal = null; render(); break;
    case 'explain-mode': {
      const x = S.explain; if (!x) return;
      await runExplain(getCourse(x.courseId), findLesson(getCourse(x.courseId), x.lessonId), x.at, t.dataset.m, x.text);
      break;
    }
    case 'close-explain': S.explain = null; render(); break;

    /* assignments */
    case 'new-assign': {
      const course = c || getCourse(S.course);
      await guard(async () => {
        const out = await genAssignment(course, { lessonId: t.dataset.l || (S.view==='lesson' ? S.lesson : null) });
        const asg = newAssignment(course, out, { lessonId: t.dataset.l || (S.view==='lesson' ? S.lesson : null) });
        S.work = asg.id; S.course = course.id;
        if (S.view !== 'lesson') S.view = 'work';
      }, 'assign');
      break;
    }
    case 'target': {
      const k = t.dataset.k;
      await guard(async () => {
        const out = await genAssignment(c, { concept:k, count:6 });
        const asg = newAssignment(c, out, { concept:k });
        asg.title = out.title || ('Intervention — ' + k);
        S.work = asg.id; S.course = c.id; S.view = 'work'; S.lesson = null;
      }, 'assign');
      break;
    }
    case 'open-work': go('work', { course:c.id, work:t.dataset.a }); break;
    case 'hint': {
      const asg = c.assignments.find(x => x.id === t.dataset.a);
      asg.hints = asg.hints || {}; asg.hints[t.dataset.i] = true;
      D.behaviour.hints++; save(); render(); break;
    }
    case 'ans': {
      const asg = c.assignments.find(x => x.id === t.dataset.a);
      asg.answers[t.dataset.i] = Number(t.dataset.v); save(); render(); break;
    }
    case 'ansmulti': {
      const asg = c.assignments.find(x => x.id === t.dataset.a);
      const i = t.dataset.i, v = Number(t.dataset.v);
      const cur = Array.isArray(asg.answers[i]) ? asg.answers[i] : [];
      asg.answers[i] = cur.includes(v) ? cur.filter(x => x !== v) : cur.concat(v);
      save(); render(); break;
    }
    case 'submit': await submitAssignment(c, c.assignments.find(x => x.id === t.dataset.a)); break;

    /* revision */
    case 'review': {
      const k = c.concepts[t.dataset.k];
      D.behaviour.revisions++;
      ev('revision', { label:t.dataset.k, detail:sourceLabel(c, k.source), courseId:c.id });
      save();
      if (k.source && k.source.lessonId){
        const l = findLesson(c, k.source.lessonId);
        if (l){ const r = rawLesson(c, l.id); if (k.source.at) r.lesson.at = k.source.at; go('lesson', { course:c.id, lesson:l.id, work:null }); return; }
      }
      toast('No source location was recorded for that concept.');
      break;
    }
    case 'gen-roadmap': await guard(async () => {
      const out = await genRoadmap(c);
      c.roadmap = out.roadmap || []; c.gap = out.gap || ''; save();
    }, 'road'); break;

    /* focus shield */
    case 'start-session': {
      const m = Number(t.dataset.m);
      S.session = { until: now() + m*60000, plan: sessionPlan(m) };
      render(); toast('Session started. ' + m + ' minutes.'); break;
    }
    case 'end-session': S.session = null; render(); break;
    case 'ext-show': S.extFile = t.dataset.n; render(); break;
    case 'ext-copy':
      try { await navigator.clipboard.writeText(EXT_FILES[t.dataset.n]); toast('Copied ' + t.dataset.n); }
      catch(err){ toast('Copying was blocked. Select the text and copy it.'); }
      break;
    case 'ext-save': {
      let dl = null;
      try { dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch(err){}
      if (dl){
        try { await dl.save({ filename: t.dataset.n, data: EXT_FILES[t.dataset.n] }); }
        catch(err){ toast('The file was not saved.'); }
        break;
      }
      // Plain browser download — works standalone, no special capability needed.
      try {
        const blob = new Blob([EXT_FILES[t.dataset.n]], { type:'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = t.dataset.n;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch(err){ toast('The file was not saved. Use the copy button instead.'); }
      break;
    }

    /* profile */
    case 'save-profile':
      Object.assign(D.profile, { name:val('p-name'), background:val('p-bg'), level:val('p-level'), goal:val('p-goal'), goalText:val('p-gt'), target:val('p-target') });
      save(); toast('Saved.'); render(); break;
    case 'export':
      try { await navigator.clipboard.writeText(JSON.stringify(D, null, 2)); toast('Your data is on the clipboard.'); }
      catch(err){ toast('Copying was blocked by the browser.'); }
      break;
    case 'reset':
      if (confirm('Delete every course, assignment and record in this browser? This cannot be undone.')){
        D = blank(); save(); S.course = S.work = S.lesson = null; go('landing');
      }
      break;
  }
});

document.addEventListener('input', e => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  if (t.dataset.act === 'anstext'){
    const c = getCourse(t.dataset.c); const asg = c.assignments.find(x => x.id === t.dataset.a);
    asg.answers[t.dataset.i] = t.value; save();
  }
});
document.addEventListener('change', async e => {
  if (e.target.id !== 'w-pdf') return;
  const file = e.target.files && e.target.files[0]; if (!file) return;
  const stat = document.getElementById('w-pdfstat');
  if (!window.pdfjsLib){ stat.textContent = 'The PDF reader could not load. Paste the text instead.'; return; }
  stat.innerHTML = '<span class="spin"></span> Reading ' + esc(file.name) + '…';
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const buf = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: buf }).promise;
    let text = '';
    const max = Math.min(doc.numPages, 60);
    for (let p = 1; p <= max; p++){
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      text += '\n[page ' + p + ']\n' + tc.items.map(i => i.str).join(' ');
      stat.innerHTML = '<span class="spin"></span> Page ' + p + ' of ' + max + '…';
    }
    S.wizard.text = text.trim();
    S.wizard.fileName = file.name;
    if (!S.wizard.text){ stat.textContent = 'No text layer found — this PDF is probably scanned images. Paste the text below instead.'; return; }
    stat.textContent = file.name + ' · ' + S.wizard.text.length.toLocaleString() + ' characters read from ' + max + ' pages';
  } catch(err){
    stat.textContent = 'That file could not be read. Paste the text below instead.';
  }
});

/* ---------- action helpers ---------- */
function grabSource(){
  const w = S.wizard; if (!w) return;
  const u = document.getElementById('w-url'); if (u) w.url = u.value.trim();
  const ti = document.getElementById('w-titles'); if (ti) w.titles = ti.value;
  const tx = document.getElementById('w-text'); if (tx && tx.value.trim()) w.text = tx.value;
}
async function buildFromWizard(){
  const w = S.wizard; grabSource();
  if (w.srcType !== 'pdf' && !w.url && !w.titles && !w.text){ toast('Add a link, some titles, or the text.'); return; }
  if (w.srcType === 'pdf' && !w.text){ toast('Load a PDF or paste its text.'); return; }
  if (!SAMPLE){
    const titles = (w.titles||'').split('\n').map(s=>s.trim()).filter(Boolean);
    let lessons;
    if (w.srcType === 'pdf') lessons = [{ title: w.fileName || 'Document', concepts:[] }];
    else if (w.srcType === 'video') lessons = [{ title: w.name + ' — lesson 1', concepts:[] }];
    else if (titles.length) lessons = titles.map(t => ({ title:t, concepts:[] }));
    else lessons = []; // playlist, no titles — finishCourse turns this into placeholder slots
    finishCourse(w, { lessons, roadmap:[], gap:'' });
    return;
  }
  await guard(async () => {
    const out = await buildCourse(w);
    finishCourse(w, out);
  }, 'Reading your material…');
}
function finishCourse(w, out){
  let c = w.addTo ? getCourse(w.addTo) : null;
  if (!c){
    c = { id:uid(), name:w.name, level:w.level, known:w.known, goalType:w.mode, modeText:w.modeText, target:w.target,
          created:now(), sources:[], concepts:{}, assignments:[], roadmap:[], gap:'', resume:null };
    D.courses.push(c);
    ev('course_created', { label:c.name, courseId:c.id });
  }
  const titles = (w.titles||'').split('\n').map(s=>s.trim()).filter(Boolean);
  const src = {
    id:uid(),
    type:w.srcType,
    title: w.srcType==='pdf' ? (w.fileName || 'Uploaded document') : (w.srcType==='video' ? 'Single video' : 'YouTube playlist'),
    url:w.url, listId: w.srcType==='playlist' ? ytListId(w.url) : null, text:w.text || '', lessons:[]
  };
  let lessons;
  if (w.srcType === 'playlist' && titles.length){
    // Ground truth: the pasted list, exactly, in order, one lesson per
    // title, no matter how many there are. Claude's job here was only to
    // suggest concepts per title (conceptsByLesson) — used only when it
    // lines up position-for-position with what was actually pasted.
    const enrich = Array.isArray(out.conceptsByLesson) && out.conceptsByLesson.length === titles.length ? out.conceptsByLesson : null;
    lessons = titles.map((t, i) => ({ title:t, concepts: enrich ? (enrich[i]||[]) : [] }));
  } else if (out.lessons && out.lessons.length){
    lessons = out.lessons;
  } else if (titles.length){
    lessons = titles.map(t => ({ title:t, concepts:[] }));
  } else {
    lessons = [];
  }
  if (!lessons.length && w.srcType === 'playlist'){
    // Nothing to go on but the link — start the playlist right away with
    // honest placeholder slots. Each one picks up its real title from the
    // player itself the moment the student opens and plays it.
    lessons = Array.from({ length: PLACEHOLDER_BATCH }, (_, i) => ({ title: 'Video ' + (i+1), concepts: [], auto: true }));
    src.dynamic = true;
  }
  lessons.forEach((l, i) => {
    const lesson = { id:uid(), title:l.title || ('Lesson ' + (i+1)), concepts:(l.concepts||[]).slice(0,6), done:false, proposed:!!l.proposed, auto:!!l.auto };
    if (w.srcType === 'video') lesson.url = w.url;
    if (w.srcType === 'playlist') lesson.index = i + 1;
    if (l.page) lesson.page = l.page;
    if (w.srcType === 'pdf' && w.text){
      const mark = '[page ' + l.page + ']';
      const at = l.page ? w.text.indexOf(mark) : -1;
      lesson.text = at >= 0 ? w.text.slice(at, at + 9000) : '';
    }
    lesson.concepts.forEach(k => { const cc = conceptOf(c, k); if (!cc.source) cc.source = { lessonId:lesson.id, title:lesson.title, page:l.page || null }; });
    src.lessons.push(lesson);
  });
  c.sources.push(src);
  if (out.roadmap && out.roadmap.length && !(c.roadmap||[]).length){ c.roadmap = out.roadmap; c.gap = out.gap || ''; }
  save();
  S.wizard = null;
  go('course', { course:c.id });
  toast(src.dynamic ? 'Playlist ready — open lesson 1 and titles will fill in as you watch.' : src.lessons.length + ' lessons ready. Open one and the practice panel fills itself.');
}
function newAssignment(c, out, opts){
  const qs = (out.questions || []).filter(q => q && q.text).map(q => {
    if (q.type === 'tf'){
      q.options = ['True','False'];
      if (typeof q.answer !== 'number') q.answer = /^(true|yes|t)$/i.test(String(q.answer).trim()) ? 0 : 1;
    }
    if (q.type === 'mcq' || q.type === 'multi'){
      if (!q.options || q.options.length < 2){ q.type = 'short'; }
      else {
        const idxOf = v => {
          if (typeof v === 'number') return v;
          const str = String(v).trim();
          let k = q.options.findIndex(o => String(o).trim().toLowerCase() === str.toLowerCase());
          if (k < 0 && /^[A-Ha-h][).:]?$/.test(str)) k = str.toUpperCase().charCodeAt(0) - 65;
          if (k < 0) k = q.options.findIndex(o => String(o).toLowerCase().includes(str.toLowerCase()) && str.length > 2);
          return k;
        };
        if (q.type === 'mcq'){
          const k = idxOf(q.answer);
          if (k >= 0 && k < q.options.length) q.answer = k; else q.type = 'short';
        } else {
          const arr = (Array.isArray(q.answer) ? q.answer : [q.answer]).map(idxOf).filter(k => k >= 0);
          if (arr.length) q.answer = [...new Set(arr)]; else q.type = 'short';
        }
      }
    }
    return q;
  });
  const a = {
    id:uid(), created:now(), title: out.title || 'Practice set',
    lessonId: opts.lessonId || null, concept: opts.concept || null,
    focus: opts.concept ? [opts.concept] : [...new Set(qs.map(q => q.concept).filter(Boolean))].slice(0,3),
    questions: qs, answers:{}, hints:{}, results:null, report:'', score:0, submitted:false, started:now()
  };
  c.assignments.unshift(a);
  qs.forEach(q => { const cc = conceptOf(c, q.concept || 'General'); if (!cc.source && opts.lessonId) cc.source = { lessonId:opts.lessonId }; });
  ev('assignment_created', { label:a.title, detail:(a.focus||[]).join(', '), courseId:c.id });
  save();
  return a;
}
async function submitAssignment(c, a){
  const unanswered = a.questions.filter((q,i) => a.answers[i] === undefined || a.answers[i] === '').length;
  if (unanswered && !confirm(unanswered + ' question' + (unanswered>1?'s are':' is') + ' unanswered. Submit anyway? Blanks are marked wrong.')) return;
  await guard(async () => {
    let out;
    if (SAMPLE) out = await gradeAssignment(c, a);
    else out = { results: a.questions.map((q,i) => ({ i, verdict: localVerdict(q, a.answers[i]) || 'incorrect', errorType:null, confidence:'low', feedback:q.explanation||'' })), report:'' };
    const byI = {};
    (out.results||[]).forEach(r => { byI[r.i] = r; });
    a.results = a.questions.map((q,i) => byI[i] || { verdict: localVerdict(q, a.answers[i]) || 'incorrect', feedback:q.explanation||'', confidence:'low' });
    a.report = out.report || '';
    a.score = a.results.filter(r => r.verdict === 'correct').length;
    a.submitted = true; a.submittedAt = now();
    a.timeSec = Math.round((now() - a.started)/1000);

    a.questions.forEach((q,i) => {
      const r = a.results[i];
      const src = a.lessonId ? { lessonId:a.lessonId } : (c.concepts[q.concept] || {}).source;
      const before = c.concepts[q.concept] ? c.concepts[q.concept].status : 'new';
      const cc = recordAttempt(c, q.concept || 'General', {
        verdict:r.verdict, hint:!!(a.hints && a.hints[i]), errorType:r.errorType, difficulty:q.difficulty, source:src
      });
      D.behaviour.answers++;
      if (r.verdict === 'correct') D.behaviour.correct++;
      if (r.verdict !== 'correct') ev('mistake', { label:q.concept, detail:(r.errorType||'') + (r.confidence ? ' · ' + r.confidence + ' confidence' : ''), courseId:c.id });
      if (before !== 'weakness' && cc.status === 'weakness') ev('concept_flagged', { label:cc.name, detail:'repeated errors across separate attempts', courseId:c.id });
      if (before !== 'mastered' && cc.status === 'mastered') ev('concept_mastered', { label:cc.name, courseId:c.id });
    });
    ev('assignment_submitted', { label:a.title, detail:a.score + '/' + a.questions.length, courseId:c.id });
    save();
  }, 'grade');
}
function confuseModal(c, l, at){
  return '<div class="modal"><div class="box pad">'
    + '<h3>What moment lost you?</h3>'
    + '<p class="muted tiny" style="margin:6px 0 14px">The player\'s current position is filled in below. Adjust it if the idea started a little earlier.</p>'
    + f('Timestamp','<input type="text" id="cf-at" style="max-width:140px" value="'+mmss(at)+'" placeholder="18:42">')
    + '<div class="row"><button class="btn go" data-act="confuse-go" data-c="'+c.id+'" data-l="'+l.id+'">Explain this</button>'
    + '<button class="btn ghost" data-act="confuse-cancel">Cancel</button></div></div></div>';
}
async function runExplain(c, l, at, mode, prior){
  S.explain = { courseId:c.id, lessonId:l.id, at, mode, text:'', done:false };
  render();
  try {
    const text = await explainMoment(c, l, at, mode, prior, u => {
      if (S.explain){ S.explain.text = u.text; const box = document.querySelector('.lpane .md p'); if (box) box.innerHTML = mdLite(u.text); }
    });
    if (!S.explain) return;
    S.explain.text = text; S.explain.done = true;
    const cc = conceptOf(c, (l.concepts||[])[0] || l.title);
    cc.confusion++; cc.source = cc.source || { lessonId:l.id, at };
    if (cc.source && at) cc.source.at = at;
    restatus(cc);
    D.behaviour.confusions++;
    ev('confusion', { label:cc.name, detail:l.title + ' — ' + mmss(at), courseId:c.id });
    save(); render();
  } catch(err){
    if (S.explain){ S.explain.done = true; S.explain.text = (err && err.text) ? err.text + '\n\n' + aiErr(err) : aiErr(err); }
    render();
  }
}
function sessionPlan(m){
  if (m <= 15) return '10 min lecture, 5 min quick recall.';
  if (m <= 30) return '15 min lecture, 5 min quiz, 10 min assignment.';
  if (m <= 45) return '20 min lecture, 5 min quiz, 15 min assignment, 5 min reading your mistakes.';
  return '25 min lecture, 10 min assignment, 15 min targeted practice, 10 min revision from your weakest concept.';
}
setInterval(() => { if (S.session && S.view === 'shield'){ if (S.session.until <= now()){ S.session = null; toast('Session finished.'); } render(); } }, 1000);

/* ---------- lesson position memory ---------- */
setInterval(() => {
  if (S.view === 'lesson' && ytTime > 0){
    const c = getCourse(S.course);
    if (c && c.resume && c.resume.lessonId === S.lesson){ c.resume.at = Math.round(ytTime); c.resume.t = now(); save(); }
  }
}, 8000);

boot();
