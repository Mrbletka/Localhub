// Localhub Bedrock Studio - mobile-first IDE. Plain ES modules, no build step.
const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, attrs = {}, ...kids) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith('--')) node.style.setProperty(prop, val);
        else node.style[prop] = val;
      }
    }
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'html') node.innerHTML = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return node;
};
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---- access token (LAN mode) --------------------------------------------------
const params = new URLSearchParams(location.search);
let TOKEN = '';
try {
  TOKEN = params.get('token') || localStorage.getItem('lh_token') || '';
  if (params.get('token')) {
    localStorage.setItem('lh_token', TOKEN);
    history.replaceState(null, '', location.pathname);
  }
} catch {
  TOKEN = params.get('token') || '';
}
const withToken = (url) => (TOKEN ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(TOKEN)}` : url);

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', ...(TOKEN ? { 'x-localhub-token': TOKEN } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${res.status} ${res.statusText}`);
  return data;
}
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`lh_${key}`);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`lh_${key}`, JSON.stringify(value));
    } catch {
      // private mode
    }
  },
};

// ---- state ---------------------------------------------------------------------
const S = {
  status: null,
  config: null,
  templates: {},
  roster: [],
  projects: [],
  project: store.get('project', null),
  tree: [],
  expanded: new Set(store.get('expanded', ['BP', 'RP', 'BP/scripts'])),
  file: null, // { path, content, original, encoding }
  view: store.get('view', 'agents'),
  agent: store.get('agent', 'director'),
  sessionId: null,
  run: null, // { runId, es, sessionId, containers: Map }
  lastValidation: null,
  lastBuild: null,
};
const app = $('#app');
const wide = () => matchMedia('(min-width: 1000px)').matches;

function toast(message, isError = false) {
  const t = $('#toast');
  t.textContent = message;
  t.classList.toggle('err', isError);
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), isError ? 5000 : 2600);
}
const guard = (fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (err) {
    toast(err.message, true);
  }
};
const rel = (full) => (S.project && full?.startsWith(`${S.project}/`) ? full.slice(S.project.length + 1) : full);
const full = (relPath) => `${S.project}/${relPath}`;

// ---- views -----------------------------------------------------------------------
function setView(view) {
  if (wide() && (view === 'editor' || view === 'ship')) app.dataset.center = view;
  S.view = view;
  app.dataset.view = view;
  store.set('view', view);
  for (const b of document.querySelectorAll('.tabbar button')) b.classList.toggle('on', b.dataset.view === view);
  if (view === 'ship') renderShip();
  if (view === 'agents') scrollChat(true);
}
for (const b of document.querySelectorAll('.tabbar button')) b.addEventListener('click', () => setView(b.dataset.view));

// ---- sheets (modals) ---------------------------------------------------------------
function openSheet(title, body, { onClose } = {}) {
  const sheet = $('#sheet');
  sheet.replaceChildren(
    el('div', { class: 'grab' }),
    el('div', { class: 'sheet-head' }, el('h2', {}, title), el('button', { class: 'icon-btn sm', 'aria-label': 'Close', onclick: closeSheet }, '✕')),
    body,
  );
  sheet.hidden = false;
  $('#sheet-backdrop').hidden = false;
  closeSheet.onClose = onClose;
}
function closeSheet() {
  $('#sheet').hidden = true;
  $('#sheet-backdrop').hidden = true;
  closeSheet.onClose?.();
  closeSheet.onClose = null;
}
$('#sheet-backdrop').addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet();
});

// ---- projects ----------------------------------------------------------------------
async function loadProjects() {
  S.projects = await api('GET', '/api/projects');
  if (S.project && !S.projects.some((p) => p.slug === S.project)) S.project = null;
  if (!S.project && S.projects.length) S.project = S.projects[0].slug;
  renderHeader();
}

function renderHeader() {
  const p = S.projects.find((x) => x.slug === S.project);
  $('#project-name').textContent = p ? p.name : 'Bedrock Studio';
  $('#project-meta').textContent = p ? `${p.type} · v${p.version} · ${p.namespace ?? ''}` : 'Tap to create a project';
  document.title = p ? `${p.name} · Bedrock Studio` : 'Bedrock Studio';
}

async function selectProject(slug) {
  if (S.file && isDirty() && !confirm('Discard unsaved changes?')) return;
  S.project = slug;
  store.set('project', slug);
  S.file = null;
  S.sessionId = null;
  S.lastValidation = null;
  S.lastBuild = null;
  S.lastUpdate = null;
  detachRun();
  renderHeader();
  renderEditor();
  await Promise.all([loadTree(), openLatestSession()]);
  if (S.view === 'ship') renderShip();
}

function projectSheet() {
  const list = el('div', { class: 'project-list' },
    S.projects.map((p) => el('button', { class: `project${p.slug === S.project ? ' on' : ''}`, onclick: () => { closeSheet(); selectProject(p.slug); } },
      el('img', { src: withToken(`/api/raw?path=${encodeURIComponent(`${p.slug}/RP/pack_icon.png`)}`), alt: '', onerror: (e) => (e.target.style.visibility = 'hidden') }),
      el('span', { class: 'p-text' }, el('b', {}, p.name), el('small', {}, `${p.type} · v${p.version} · ${p.slug}`)))),
  );
  openSheet('Projects', el('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
    el('button', { class: 'btn primary block', onclick: newProjectSheet }, '＋ New project'),
    el('button', { class: 'btn block', onclick: () => { closeSheet(); setView('ship'); } }, "⟳ Get projects Claude made"),
    S.projects.length ? list : el('p', { class: 'hint' }, 'No projects yet. Create your first add-on!'),
  ));
}
$('#btn-projects').addEventListener('click', projectSheet);

function newProjectSheet() {
  let template = 'tycoon';
  const name = el('input', { placeholder: 'e.g. Volcano Tycoon', maxlength: 48, autocomplete: 'off' });
  const ns = el('input', { placeholder: 'auto (from name)', maxlength: 32, autocomplete: 'off', autocapitalize: 'off' });
  const desc = el('input', { placeholder: 'One line for your library', maxlength: 140 });
  const idea = el('textarea', { placeholder: 'Optional: describe your idea and the Studio Director will design and build it right away.' });
  const tpls = el('div', { class: 'templates' });
  const drawTemplates = () => tpls.replaceChildren(...Object.entries(S.templates).map(([key, t]) =>
    el('button', { type: 'button', class: `tpl${key === template ? ' on' : ''}`, onclick: () => { template = key; drawTemplates(); } }, el('b', {}, t.label), el('span', {}, t.description))));
  drawTemplates();
  const create = guard(async (e) => {
    e.preventDefault();
    if (!name.value.trim()) return name.focus();
    const res = await api('POST', '/api/projects', { name: name.value.trim(), template, namespace: ns.value.trim() || undefined, description: desc.value.trim() });
    closeSheet();
    await loadProjects();
    await selectProject(res.slug);
    toast(`Created ${res.slug}`);
    if (idea.value.trim()) {
      setView('agents');
      selectAgent('director', false);
      await send(`New ${S.templates[template].label.toLowerCase()} project. Here is my idea:\n\n${idea.value.trim()}\n\nDesign it in DESIGN.md, then build it on top of the template so it is playable, original and polished.`);
    }
  });
  openSheet('New project', el('form', { style: { display: 'flex', flexDirection: 'column', gap: '12px' }, onsubmit: create },
    el('label', { class: 'field' }, 'Name', name),
    el('div', { class: 'field' }, 'Template', tpls),
    el('label', { class: 'field' }, 'Your idea', idea),
    el('details', {}, el('summary', { class: 'hint' }, 'More options'),
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' } },
        el('label', { class: 'field' }, 'Namespace (identifier prefix)', ns),
        el('label', { class: 'field' }, 'Short description', desc))),
    el('button', { class: 'btn primary block', type: 'submit' }, 'Create project'),
  ));
  setTimeout(() => name.focus(), 50);
}

// ---- file tree ---------------------------------------------------------------------
async function loadTree() {
  if (!S.project) {
    S.tree = [];
    return renderTree();
  }
  const { entries } = await api('GET', `/api/projects/${encodeURIComponent(S.project)}/tree`);
  S.tree = entries;
  renderTree();
}

function fileIcon(p) {
  if (p.endsWith('.png')) return '🖼';
  if (p.endsWith('.js')) return '⚡';
  if (p.endsWith('.json')) return '{}';
  if (p.endsWith('.lang')) return '🌐';
  if (p.endsWith('.md')) return '📝';
  if (p.endsWith('.mcfunction')) return '⌘';
  return '·';
}

function renderTree(flash) {
  const root = $('#tree');
  if (!S.project) return root.replaceChildren(el('p', { class: 'empty' }, 'Create a project to start.'));
  const base = S.project.split('/').length;
  const rows = [];
  const hiddenUnder = new Set();
  for (const e of S.tree) {
    const r = rel(e.path);
    const parts = r.split('/');
    const parent = parts.slice(0, -1).join('/');
    if (parent && (hiddenUnder.has(parent) || !S.expanded.has(parent))) {
      if (e.type === 'dir') hiddenUnder.add(r);
      continue;
    }
    const depth = e.path.split('/').length - base - 1;
    const isDir = e.type === 'dir';
    const open = S.expanded.has(r);
    const row = el('button', {
      class: `node${S.file?.path === e.path ? ' active' : ''}${flash?.has(e.path) ? ' flash' : ''}`,
      style: { paddingLeft: `${12 + depth * 16}px` },
      onclick: () => (isDir ? toggleDir(r) : openFile(e.path)),
    },
    el('span', { class: 'ico' }, isDir ? (open ? '▾' : '▸') : fileIcon(r)),
    el('span', { class: 'name' }, parts.at(-1)),
    !isDir && e.size > 0 ? el('span', { class: 'size' }, e.size > 1024 ? `${(e.size / 1024).toFixed(1)}k` : `${e.size}`) : null,
    el('span', { class: 'more', role: 'button', 'aria-label': 'More', onclick: (ev) => { ev.stopPropagation(); fileMenu(e); } }, '⋯'));
    rows.push(row);
  }
  root.replaceChildren(...rows);
}

function toggleDir(r) {
  if (S.expanded.has(r)) S.expanded.delete(r);
  else S.expanded.add(r);
  store.set('expanded', [...S.expanded]);
  renderTree();
}

function fileMenu(entry) {
  const r = rel(entry.path);
  const name = el('input', { value: r, autocapitalize: 'off', autocomplete: 'off' });
  openSheet(r, el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
    el('label', { class: 'field' }, 'Rename / move to', name),
    el('button', { class: 'btn block', onclick: guard(async () => {
      if (!name.value.trim() || name.value.trim() === r) return closeSheet();
      await api('POST', '/api/file/move', { from: entry.path, to: full(name.value.trim()) });
      closeSheet();
      if (S.file?.path === entry.path) S.file = null, renderEditor();
      await loadTree();
    }) }, 'Rename'),
    entry.type === 'file' ? el('button', { class: 'btn block', onclick: () => { closeSheet(); askAgentAbout(entry.path); } }, 'Ask an agent about this file') : null,
    el('button', { class: 'btn block danger', onclick: guard(async () => {
      if (!confirm(`Delete ${r}?`)) return;
      await api('DELETE', `/api/file?path=${encodeURIComponent(entry.path)}`);
      closeSheet();
      if (S.file?.path === entry.path) S.file = null, renderEditor();
      await loadTree();
    }) }, 'Delete'),
  ));
}

$('#btn-refresh').addEventListener('click', guard(loadTree));
$('#btn-new-file').addEventListener('click', () => {
  if (!S.project) return toast('Create a project first', true);
  const input = el('input', { placeholder: 'BP/scripts/systems/pets.js', autocapitalize: 'off', autocomplete: 'off' });
  openSheet('New file or folder', el('form', { style: { display: 'flex', flexDirection: 'column', gap: '10px' }, onsubmit: guard(async (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) return;
    if (v.endsWith('/')) await api('POST', '/api/file/mkdir', { path: full(v) });
    else await api('PUT', '/api/file', { path: full(v), content: '' });
    closeSheet();
    v.split('/').slice(0, -1).reduce((acc, part) => (S.expanded.add(acc ? `${acc}/${part}` : part), acc ? `${acc}/${part}` : part), '');
    await loadTree();
    if (!v.endsWith('/')) openFile(full(v));
  }) }, el('label', { class: 'field' }, 'Path (end with / for a folder)', input), el('button', { class: 'btn primary block' }, 'Create')));
  setTimeout(() => input.focus(), 50);
});
$('#btn-search').addEventListener('click', () => {
  const f = $('#search-form');
  f.hidden = !f.hidden;
  if (!f.hidden) $('#search-input').focus();
  else renderTree();
});
$('#search-form').addEventListener('submit', guard(async (e) => {
  e.preventDefault();
  const q = $('#search-input').value.trim();
  if (!q) return renderTree();
  const { results } = await api('GET', `/api/search?q=${encodeURIComponent(q)}&path=${encodeURIComponent(S.project)}`);
  $('#tree').replaceChildren(...(results.length ? results.map((r) => el('button', { class: 'hit', onclick: () => openFile(r.path, r.line) }, el('b', {}, `${rel(r.path)}:${r.line}`), el('code', {}, r.text))) : [el('p', { class: 'empty' }, 'No matches')]));
}));

// ---- editor ------------------------------------------------------------------------
const editor = $('#editor');
const isDirty = () => S.file && S.file.encoding === 'utf8' && editor.value !== S.file.original;

async function openFile(path, line) {
  if (S.file && S.file.path !== path && isDirty() && !confirm('Discard unsaved changes?')) return;
  const data = await api('GET', `/api/file?path=${encodeURIComponent(path)}`).catch((err) => toast(err.message, true));
  if (!data) return;
  S.file = { path: data.path, encoding: data.encoding, original: data.content, size: data.size };
  renderEditor();
  renderTree();
  setView('editor');
  if (line && data.encoding === 'utf8') {
    const offset = data.content.split('\n').slice(0, line - 1).join('\n').length + (line > 1 ? 1 : 0);
    editor.focus();
    editor.setSelectionRange(offset, offset);
    editor.scrollTop = Math.max(0, (line - 5) * 20);
  }
}

function renderEditor() {
  const f = S.file;
  $('#editor-banner').hidden = true;
  $('#editor-empty').hidden = Boolean(f);
  $('#file-path').textContent = f ? rel(f.path) : 'No file open';
  const isText = f?.encoding === 'utf8';
  editor.hidden = !isText;
  $('#gutter').hidden = !isText;
  $('#image-view').hidden = !(f && !isText);
  $('#btn-save').disabled = true;
  $('#btn-format').hidden = !(isText && f.path.endsWith('.json'));
  $('#btn-ask').hidden = !f;
  $('#keybar').hidden = !isText;
  if (isText) {
    editor.value = f.original;
    editor.scrollTop = 0;
    updateGutter();
    lint();
  } else if (f) {
    const src = withToken(`/api/raw?path=${encodeURIComponent(f.path)}&t=${Date.now()}`);
    const img = el('img', { src, alt: rel(f.path) });
    const info = el('div', { class: 'hint' }, `${(f.size / 1024).toFixed(1)} KB`);
    img.onload = () => (info.textContent = `${img.naturalWidth}×${img.naturalHeight} px · ${(f.size / 1024).toFixed(1)} KB`);
    $('#image-view').replaceChildren(f.path.endsWith('.png') ? img : el('p', {}, 'Binary file'), info,
      f.path.endsWith('.png') ? el('button', { class: 'btn sm', onclick: () => askAgentAbout(f.path, 'Repaint this texture so it looks better: ') }, 'Ask the Pixel Artist to repaint') : null);
    $('#status-line').textContent = '';
  } else {
    $('#status-line').textContent = '';
  }
  $('#file-dirty').hidden = true;
}

function updateGutter() {
  const lines = editor.value.split('\n').length;
  const g = $('#gutter');
  if (g.dataset.lines !== String(lines)) {
    g.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
    g.dataset.lines = String(lines);
  }
  g.scrollTop = editor.scrollTop;
}

function stripJsonc(text) {
  return text.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str ?? m.replace(/[^\n]/g, ' ')).replace(/,(\s*[}\]])/g, '$1');
}

function lint() {
  if (!S.file || S.file.encoding !== 'utf8') return;
  const line = $('#status-line');
  const pos = editor.value.slice(0, editor.selectionStart).split('\n');
  const where = `Ln ${pos.length}, Col ${pos.at(-1).length + 1}`;
  line.classList.remove('err');
  if (S.file.path.endsWith('.json')) {
    try {
      JSON.parse(stripJsonc(editor.value));
      line.textContent = `${where} · JSON ok`;
    } catch (err) {
      line.textContent = `${where} · ${err.message}`;
      line.classList.add('err');
    }
  } else line.textContent = where;
}

editor.addEventListener('input', () => {
  const dirty = isDirty();
  $('#file-dirty').hidden = !dirty;
  $('#btn-save').disabled = !dirty;
  updateGutter();
  clearTimeout(lint.t);
  lint.t = setTimeout(lint, 250);
});
editor.addEventListener('scroll', () => ($('#gutter').scrollTop = editor.scrollTop));
editor.addEventListener('click', lint);
editor.addEventListener('keyup', (e) => e.key.startsWith('Arrow') && lint());
editor.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    save();
  } else if (e.key === 'Tab') {
    e.preventDefault();
    insertText('  ');
  } else if (e.key === 'Enter') {
    const before = editor.value.slice(0, editor.selectionStart);
    const indent = before.split('\n').at(-1).match(/^\s*/)[0];
    const extra = /[{[(]\s*$/.test(before) ? '  ' : '';
    e.preventDefault();
    insertText(`\n${indent}${extra}`);
  }
});

function insertText(text) {
  editor.focus();
  // execCommand keeps the native undo stack working on mobile and desktop.
  if (!document.execCommand('insertText', false, text)) {
    const { selectionStart: s, selectionEnd: e } = editor;
    editor.setRangeText(text, s, e, 'end');
    editor.dispatchEvent(new Event('input'));
  }
}

const KEYS = ['⇥', '{', '}', '[', ']', '(', ')', '"', "'", ':', ',', ';', '=', '.', '/', '<', '>', '`', '$', '_', '-', '!', '&', '|', '§'];
$('#keybar').replaceChildren(...KEYS.map((k) => el('button', {
  type: 'button',
  onmousedown: (e) => e.preventDefault(),
  onclick: () => insertText(k === '⇥' ? '  ' : k),
}, k)));

const save = guard(async () => {
  if (!S.file || !isDirty()) return;
  const content = editor.value;
  await api('PUT', '/api/file', { path: S.file.path, content });
  S.file.original = content;
  $('#file-dirty').hidden = true;
  $('#btn-save').disabled = true;
  toast('Saved');
});
$('#btn-save').addEventListener('click', save);
$('#btn-format').addEventListener('click', () => {
  try {
    const formatted = JSON.stringify(JSON.parse(stripJsonc(editor.value)), null, 2) + '\n';
    editor.select();
    insertText(formatted);
  } catch (err) {
    toast(`Cannot format: ${err.message}`, true);
  }
});
$('#btn-ask').addEventListener('click', () => S.file && askAgentAbout(S.file.path));
window.addEventListener('beforeunload', (e) => {
  if (isDirty()) e.preventDefault();
});

function askAgentAbout(path, prefix = '') {
  setView('agents');
  const p = $('#prompt');
  p.value = `${prefix}${prefix ? '' : `About ${rel(path)}: `}`;
  p.focus();
  autoGrow();
}

// ---- agents ------------------------------------------------------------------------
const AGENT_SUGGESTIONS = {
  director: ['Add a new feature to this add-on', 'Make it more fun and unique', 'Plan the next update', 'Build and ship a release'],
  scripter: ['Add a daily reward system', 'Add a pets system with multipliers', 'Optimize the tick loops'],
  content: ['Add 3 new items with recipes', 'Add a custom mob', 'Add a new block set'],
  artist: ['Repaint all textures in one cohesive style', 'Make a better pack icon', 'Paint textures for new items'],
  economy: ['Balance the progression for the first 30 minutes', 'Add a new upgrade tier', 'Tune rebirth rewards'],
  qa: ['Run a full QA pass and fix bugs', 'Look for economy exploits', 'Write an in-game test checklist'],
};
const agentInfo = (key) => S.roster.find((a) => a.key === key) || { name: key, short: key, color: '#999' };

function renderAgentChips() {
  $('#agent-chips').replaceChildren(...S.roster.map((a) => el('button', {
    class: `agent-chip${a.key === S.agent ? ' on' : ''}`,
    role: 'tab',
    'aria-selected': a.key === S.agent ? 'true' : 'false',
    style: { '--c': a.color },
    title: a.blurb,
    onclick: () => selectAgent(a.key),
  }, el('i', { style: { background: a.color } }), a.short)));
  $('#suggestions').replaceChildren(...(AGENT_SUGGESTIONS[S.agent] || []).map((s) => el('button', { type: 'button', onclick: () => { $('#prompt').value = s; autoGrow(); $('#prompt').focus(); } }, s)));
  $('#prompt').placeholder = `Message the ${agentInfo(S.agent).name}…`;
}

async function selectAgent(key, loadChat = true) {
  if (S.run && S.agent !== key) detachRun();
  S.agent = key;
  store.set('agent', key);
  renderAgentChips();
  if (loadChat) await openLatestSession();
}

async function openLatestSession() {
  if (!S.project) return renderChatEmpty();
  const [list, runs] = await Promise.all([
    api('GET', `/api/projects/${encodeURIComponent(S.project)}/sessions`).catch(() => []),
    api('GET', `/api/projects/${encodeURIComponent(S.project)}/runs`).catch(() => []),
  ]);
  const running = runs.find((r) => r.agent === S.agent);
  const latest = list.find((s) => s.agent === S.agent && !s.parent);
  if (running) return openSession(running.sessionId, running);
  if (latest) return openSession(latest.id);
  S.sessionId = null;
  renderChatEmpty();
}

function renderChatEmpty() {
  const a = agentInfo(S.agent);
  const chat = $('#chat');
  chat.replaceChildren(el('div', { class: 'welcome' },
    el('h3', {}, S.project ? a.name : 'Welcome to Bedrock Studio'),
    el('p', {}, S.project ? a.blurb || '' : 'Create a project (tap the title above), describe your idea and the AI studio team builds it: scripts, items, blocks, textures, balance and a ready-to-import .mcaddon.'),
    S.config && !S.config.apiKeySet ? el('div', { class: 'card' },
      el('h3', {}, 'Use your Claude subscription'),
      el('p', {}, 'Open the Claude app > Code, pick this GitHub repo and describe your add-on. Claude works as this studio team, then you get its work in Build > Sync with Claude.'),
      el('div', { class: 'row', style: { flexWrap: 'wrap' } },
        el('button', { class: 'btn sm primary', onclick: () => setView('ship') }, "Get Claude's work"),
        el('button', { class: 'btn sm', onclick: settingsSheet }, 'Or add an API key'))) : null,
  ));
  updateMeter(null);
}

async function openSession(id, running) {
  detachRun();
  const session = await api('GET', `/api/projects/${encodeURIComponent(S.project)}/sessions/${id}`);
  S.sessionId = session.id;
  renderHistory(session, running ? running.messageIndex : session.messages.length);
  updateMeter(session.usage, session.model);
  if (running) attachRun(running.runId, session.id, 0);
}

function historySheet() {
  if (!S.project) return;
  guard(async () => {
    const list = await api('GET', `/api/projects/${encodeURIComponent(S.project)}/sessions`);
    const rows = list.map((s) => {
      const a = agentInfo(s.agent);
      return el('div', { class: 'session-row' },
        el('button', { class: `project${s.id === S.sessionId ? ' on' : ''}`, onclick: () => { closeSheet(); if (s.agent !== S.agent) { S.agent = s.agent; renderAgentChips(); } openSession(s.id); } },
          el('span', { class: 'p-text' },
            el('b', { style: { color: a.color } }, `${a.short}${s.parent ? ' (delegated)' : ''}`),
            el('span', {}, s.title),
            el('small', {}, `${new Date(s.updated).toLocaleString()} · ${s.messages} msgs · $${(s.usage?.costUsd || 0).toFixed(3)}`))),
        el('button', { class: 'icon-btn sm', 'aria-label': 'Delete chat', onclick: guard(async () => {
          if (!confirm('Delete this chat?')) return;
          await api('DELETE', `/api/projects/${encodeURIComponent(S.project)}/sessions/${s.id}`);
          closeSheet();
          if (s.id === S.sessionId) openLatestSession();
        }) }, '🗑'));
    });
    openSheet('Chats', el('div', { class: 'project-list' }, rows.length ? rows : el('p', { class: 'hint' }, 'No chats yet.')));
  })();
}
$('#btn-history').addEventListener('click', historySheet);
$('#btn-new-chat').addEventListener('click', () => {
  detachRun();
  S.sessionId = null;
  renderChatEmpty();
  $('#prompt').focus();
});

// Lightweight markdown: code fences, inline code, bold, headings, lists, tables as monospace.
function md(text) {
  const blocks = String(text).split(/```/);
  let html = '';
  blocks.forEach((part, i) => {
    if (i % 2 === 1) {
      const body = part.replace(/^[\w-]*\n/, '');
      html += `<pre><code>${escapeHtml(body.replace(/\n$/, ''))}</code></pre>`;
      return;
    }
    const lines = part.split('\n');
    let list = null;
    let para = [];
    let table = [];
    const flushPara = () => {
      if (para.length) html += `<p>${para.join('<br>')}</p>`;
      para = [];
    };
    const flushTable = () => {
      if (table.length) html += `<pre><code>${escapeHtml(table.join('\n'))}</code></pre>`;
      table = [];
    };
    const closeList = () => {
      if (list) html += `</${list}>`;
      list = null;
    };
    const flushAll = () => {
      flushPara();
      flushTable();
      closeList();
    };
    const inline = (s) => escapeHtml(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])_([^_]+)_(?=[\s).,!?]|$)/g, '$1<i>$2</i>');
    for (const raw of lines) {
      const line = raw.trimEnd();
      const h = /^(#{1,4})\s+(.*)/.exec(line);
      const li = /^\s*(?:[-*]|\d+\.)\s+(.*)/.exec(line);
      if (/^\s*\|/.test(line)) {
        flushPara();
        closeList();
        table.push(line);
        continue;
      }
      flushTable();
      if (h) {
        flushAll();
        html += `<h4>${inline(h[2])}</h4>`;
      } else if (li) {
        flushPara();
        const type = /^\s*\d+\./.test(line) ? 'ol' : 'ul';
        if (list !== type) {
          closeList();
          html += `<${type}>`;
          list = type;
        }
        html += `<li>${inline(li[1])}</li>`;
      } else if (!line.trim()) flushAll();
      else {
        closeList();
        para.push(inline(line));
      }
    }
    flushAll();
  });
  return html;
}

function agentBlock(agentKey) {
  const a = agentInfo(agentKey);
  const body = el('div', { class: 'msg agent', style: { '--c': a.color } }, el('div', { class: 'who' }, el('i'), a.name));
  return body;
}

function toolChip(name, summary, state = 'run') {
  const chip = el('div', { class: `tool${state === 'ok' ? ' ok' : state === 'err' ? ' err' : ''}` },
    el('span', { class: 't-name' }, name),
    el('span', { class: 't-sum' }, summary || ''),
    el('span', { class: 't-state' }, state === 'run' ? el('span', { class: 'spin' }) : state === 'ok' ? '✓' : '✕'));
  return chip;
}

function setChipState(chip, ok, detail, path) {
  chip.classList.remove('ok', 'err');
  chip.classList.add(ok ? 'ok' : 'err');
  chip.querySelector('.t-state').replaceChildren(ok ? '✓' : '✕');
  if (path) {
    chip.classList.add('link');
    chip.onclick = () => openFile(path);
  } else if (detail) {
    chip.classList.add('link');
    chip.onclick = () => {
      const next = chip.nextElementSibling;
      if (next?.classList.contains('tool-detail')) return next.remove();
      chip.after(el('div', { class: 'tool-detail' }, detail));
    };
  }
}

function pathFromToolInput(name, input) {
  if (!input?.path || !['write_file', 'edit_file', 'paint_texture', 'read_file'].includes(name)) return null;
  const p = String(input.path).replace(/^\/+/, '');
  return p.startsWith(`${S.project}/`) ? p : `${S.project}/${p}`;
}

/** Render a stored session (messages up to `upto`). */
function renderHistory(session, upto) {
  const chat = $('#chat');
  chat.replaceChildren();
  const results = new Map();
  for (const m of session.messages) {
    if (m.role === 'user' && Array.isArray(m.content)) for (const b of m.content) if (b.type === 'tool_result') results.set(b.tool_use_id, b);
  }
  let current = null;
  session.messages.slice(0, upto).forEach((m) => {
    if (m.role === 'user') {
      if (typeof m.content === 'string') {
        current = null;
        chat.append(el('div', { class: 'msg user' }, m.content.replace(/\n\n\(The user has .* open in the editor\.\)$/, '')));
      }
      return;
    }
    if (m.role !== 'assistant') return;
    if (!current) {
      current = agentBlock(session.agent);
      chat.append(current);
    }
    for (const b of m.content || []) {
      if (b.type === 'text' && b.text.trim()) current.append(el('div', { class: 'md', html: md(b.text) }));
      else if (b.type === 'thinking' && b.thinking?.trim()) current.append(el('div', { class: 'note' }, b.thinking.trim()));
      else if (b.type === 'compaction') current.append(el('div', { class: 'sys' }, '— earlier context summarized —'));
      else if (b.type === 'tool_use') {
        const r = results.get(b.id);
        const ok = r ? !r.is_error : null;
        const text = r ? (Array.isArray(r.content) ? r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n') : String(r.content)) : '';
        if (b.name === 'delegate') {
          const a = agentInfo(b.input?.agent);
          const childId = /\(chat ([a-z0-9-]+)\)/.exec(text)?.[1];
          current.append(el('details', { class: 'delegate', style: { '--c': a.color } },
            el('summary', {}, el('b', {}, a.name), el('span', { class: 'd-task' }, b.input?.task || ''), el('span', {}, ok == null ? '…' : ok ? '✓' : '✕')),
            el('div', { class: 'd-body' },
              el('div', { class: 'md', html: md(text.replace(/^.*?\n\n/, '')) }),
              childId ? el('button', { class: 'btn sm', onclick: () => { S.agent = b.input.agent; renderAgentChips(); openSession(childId); } }, `Open ${a.short} chat`) : null)));
        } else {
          const chip = toolChip(b.name, summarize(b.name, b.input), ok == null ? 'run' : ok ? 'ok' : 'err');
          if (ok != null) setChipState(chip, ok, text, ok ? pathFromToolInput(b.name, b.input) : null);
          if (ok == null) chip.querySelector('.t-state').replaceChildren('…');
          current.append(chip);
        }
      }
    }
  });
  if (!chat.childElementCount) renderChatEmpty();
  scrollChat(true);
}

function summarize(name, input = {}) {
  if (name === 'write_file' || name === 'edit_file' || name === 'read_file' || name === 'paint_texture' || name === 'delete_path') return input.path || '';
  if (name === 'search_files') return `"${input.query}"`;
  if (name === 'bedrock_reference') return input.topic || '';
  if (name === 'move_path') return `${input.from} → ${input.to}`;
  if (name === 'build_project') return input.bump && input.bump !== 'none' ? `bump ${input.bump}` : '';
  return '';
}

function scrollChat(force) {
  const chat = $('#chat');
  const nearBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 160;
  if (force || nearBottom) requestAnimationFrame(() => (chat.scrollTop = chat.scrollHeight));
}

function updateMeter(usage, model) {
  const m = $('#meter');
  if (!usage) return (m.textContent = '');
  const k = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));
  m.textContent = `${model ? `${model} · ` : ''}in ${k(usage.input + usage.cacheRead + usage.cacheWrite)} (cached ${k(usage.cacheRead)}) · out ${k(usage.output)} · ~$${usage.costUsd.toFixed(3)}`;
}

// ---- live runs -------------------------------------------------------------------------
function setRunning(on) {
  $('#run-dot').hidden = !on;
  const b = $('#btn-send');
  b.classList.toggle('stop', on);
  b.textContent = on ? '■' : '➤';
  b.setAttribute('aria-label', on ? 'Stop' : 'Send');
}

function detachRun() {
  if (S.run?.es) S.run.es.close();
  S.run = null;
  setRunning(false);
}

function attachRun(runId, sessionId, after) {
  detachRun();
  const run = { runId, sessionId, containers: new Map(), chips: new Map(), streams: new Map(), es: null, delegates: new Map() };
  S.run = run;
  setRunning(true);
  const es = new EventSource(withToken(`/api/runs/${runId}/events?after=${after}`));
  run.es = es;
  es.onmessage = (msg) => {
    const e = JSON.parse(msg.data);
    if (e.type === 'end' || e.type === 'gone') {
      es.close();
      if (S.run === run) {
        setRunning(false);
        S.run = null;
        // The server restarted mid-run: show whatever was saved.
        if (e.type === 'gone') openSession(run.sessionId).catch(() => {});
      }
      return;
    }
    handleRunEvent(run, e);
  };
  es.onerror = () => {
    // EventSource reconnects by itself and resumes from the last event id.
  };
}

function containerFor(run, e) {
  const key = e.sessionId || run.sessionId;
  let c = run.containers.get(key);
  if (!c) {
    if (e.depth > 0) {
      const d = run.delegates.get(key);
      c = d ? d.body : $('#chat');
    } else {
      const block = agentBlock(e.agent);
      $('#chat').append(block);
      c = block;
    }
    run.containers.set(key, c);
  }
  return c;
}

function streamTarget(run, e, kind) {
  const key = `${e.sessionId}:${kind}`;
  let node = run.streams.get(key);
  if (!node) {
    const c = containerFor(run, e);
    node = el('div', { class: kind === 'text' ? 'md' : 'note' });
    node.raw = '';
    c.append(node);
    run.streams.set(key, node);
  }
  return node;
}

function handleRunEvent(run, e) {
  switch (e.type) {
    case 'run_start':
      if ($('#chat').firstElementChild?.classList.contains('welcome')) $('#chat').replaceChildren();
      $('#chat').append(el('div', { class: 'msg user' }, e.message || ''));
      break;
    case 'text_start':
    case 'thinking_start':
    case 'turn_start':
      run.streams.delete(`${e.sessionId}:text`);
      run.streams.delete(`${e.sessionId}:note`);
      break;
    case 'text_delta': {
      const node = streamTarget(run, e, 'text');
      node.raw += e.text;
      clearTimeout(node.t);
      node.t = setTimeout(() => (node.innerHTML = md(node.raw)), 60);
      break;
    }
    case 'thinking_delta': {
      const node = streamTarget(run, e, 'note');
      node.raw += e.text;
      node.textContent = node.raw.trim();
      break;
    }
    case 'tool_start': {
      run.streams.delete(`${e.sessionId}:text`);
      run.streams.delete(`${e.sessionId}:note`);
      if (e.name === 'delegate') break;
      const chip = toolChip(e.name, '');
      containerFor(run, e).append(chip);
      run.chips.set(e.id, chip);
      break;
    }
    case 'tool_call': {
      const chip = run.chips.get(e.id);
      if (chip) {
        chip.querySelector('.t-sum').textContent = e.summary || '';
        chip.dataset.path = e.path || '';
      }
      break;
    }
    case 'tool_result': {
      const chip = run.chips.get(e.id);
      if (chip) {
        const p = e.ok && chip.dataset.path ? pathFromToolInput(e.name, { path: chip.dataset.path }) : null;
        setChipState(chip, e.ok, e.summary, p);
      }
      break;
    }
    case 'delegate_start': {
      run.streams.delete(`${run.sessionId}:text`);
      run.streams.delete(`${run.sessionId}:note`);
      const a = agentInfo(e.target);
      const body = el('div', { class: 'd-body' });
      const status = el('span', {}, el('span', { class: 'spin' }));
      const card = el('details', { class: 'delegate', open: true, style: { '--c': a.color } },
        el('summary', {}, el('b', {}, a.name), el('span', { class: 'd-task' }, e.task), status), body);
      containerFor(run, { agent: e.agent, depth: 0, sessionId: run.sessionId }).append(card);
      run.delegates.set(e.sessionId, { body, status, card });
      break;
    }
    case 'delegate_end': {
      const d = run.delegates.get(e.sessionId);
      if (d) {
        d.status.replaceChildren(e.status === 'completed' ? '✓' : '✕');
        d.card.open = false;
      }
      break;
    }
    case 'build':
      S.lastBuild = { ok: true, outputs: e.outputs, download: e.download };
      toast('Build ready - see the Build tab');
      break;
    case 'usage':
      if (e.depth === 0) updateMeter(e.total);
      break;
    case 'notice':
      containerFor(run, e).append(el('div', { class: 'sys' }, e.message));
      break;
    case 'refusal':
      $('#chat').append(el('div', { class: 'sys err' }, `The request was declined by a safety filter${e.category ? ` (${e.category})` : ''}. Try rephrasing.`));
      break;
    case 'error':
      $('#chat').append(el('div', { class: 'sys err' }, e.message));
      break;
    case 'done':
      if (e.usage) updateMeter(e.usage);
      if (e.status === 'cancelled') $('#chat').append(el('div', { class: 'sys' }, 'Stopped.'));
      loadProjects().catch(() => {});
      break;
  }
  scrollChat();
}

async function send(text) {
  if (!S.project) return toast('Create or pick a project first', true);
  if (S.config && !S.config.apiKeySet) {
    settingsSheet();
    return toast('Add your Anthropic API key first', true);
  }
  const editorFile = S.file ? rel(S.file.path) : undefined;
  const res = await api('POST', `/api/projects/${encodeURIComponent(S.project)}/runs`, { sessionId: S.sessionId, agent: S.agent, message: text, editorFile });
  if (!S.sessionId) $('#chat').replaceChildren();
  S.sessionId = res.sessionId;
  attachRun(res.runId, res.sessionId, 0);
}

function autoGrow() {
  const p = $('#prompt');
  p.style.height = 'auto';
  p.style.height = `${Math.min(p.scrollHeight, window.innerHeight * 0.4)}px`;
}
$('#prompt').addEventListener('input', autoGrow);
$('#prompt').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(pointer: fine)').matches) {
    e.preventDefault();
    $('#composer').requestSubmit();
  }
});
$('#composer').addEventListener('submit', guard(async (e) => {
  e.preventDefault();
  if (S.run) {
    await api('POST', `/api/runs/${S.run.runId}/cancel`);
    return;
  }
  const p = $('#prompt');
  const text = p.value.trim();
  if (!text) return;
  p.value = '';
  autoGrow();
  await send(text);
}));

// ---- live workspace updates ---------------------------------------------------------
const pendingFlash = new Set();
function onFileChanged(e) {
  if (!S.project || !e.path?.startsWith(S.project)) return;
  pendingFlash.add(e.path);
  clearTimeout(onFileChanged.t);
  onFileChanged.t = setTimeout(async () => {
    const flash = new Set(pendingFlash);
    pendingFlash.clear();
    await loadTree().catch(() => {});
    renderTree(flash);
    if (S.file && flash.has(S.file.path) && e.source !== 'editor') {
      if (e.action === 'delete') return;
      if (!isDirty()) {
        const data = await api('GET', `/api/file?path=${encodeURIComponent(S.file.path)}`).catch(() => null);
        if (data && data.content !== S.file.original) {
          S.file = { path: data.path, encoding: data.encoding, original: data.content, size: data.size };
          const top = editor.scrollTop;
          renderEditor();
          editor.scrollTop = top;
        }
      } else {
        const b = $('#editor-banner');
        b.replaceChildren(el('span', {}, 'An agent changed this file.'), el('button', { class: 'btn sm', onclick: () => { b.hidden = true; S.file.original = '\0'; openFile(S.file.path); } }, 'Reload'));
        b.hidden = false;
      }
    }
  }, 250);
}
function connectWorkspaceEvents() {
  const es = new EventSource(withToken('/api/events'));
  // This stream also tells the server a studio window is open (app mode stops it when none are).
  es.onopen = () => {
    if (!$('#offline').hidden) location.reload();
  };
  es.onerror = () => {
    clearTimeout(connectWorkspaceEvents.check);
    connectWorkspaceEvents.check = setTimeout(async () => {
      if (!(await serverAlive())) showOffline();
    }, 1500);
  };
  es.onmessage = (msg) => {
    const e = JSON.parse(msg.data);
    if (e.type === 'file_changed') onFileChanged(e);
    if (e.type === 'synced') loadProjects().then(() => (S.project ? loadTree() : null)).catch(() => {});
    if (e.type === 'file_changed' && e.path && !e.path.includes('/') && e.action !== 'write') loadProjects().catch(() => {});
  };
}

// ---- build & publish ------------------------------------------------------------------
function issueList(report) {
  if (!report) return null;
  const order = { error: 0, warning: 1, info: 2 };
  const issues = [...report.issues].sort((a, b) => order[a.level] - order[b.level]);
  return el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
    issues.length ? issues.slice(0, 80).map((i) => el('button', {
      class: `issue ${i.level}`,
      onclick: () => i.file && /\.[a-z]+$/.test(i.file) && openFile(i.file),
    }, el('b', {}, i.level), el('span', {}, i.message, el('small', {}, rel(i.file))))) : el('p', {}, 'No problems found.'),
    issues.some((i) => i.level === 'error') ? el('button', { class: 'btn sm', onclick: () => { selectAgent('qa'); setView('agents'); $('#prompt').value = 'Fix every validation error and warning, then validate again.'; autoGrow(); } }, 'Ask QA to fix these') : null);
}

const ago = (iso) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(s)) return '';
  if (s < 90) return 'just now';
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
};

/** GitHub sync card: get what Claude Code pushed (claude/* or ccr-* branches, or main), push phone edits. */
function syncPanel() {
  const box = el('div', { class: 'card' }, el('h3', {}, 'Sync with Claude (GitHub)'), el('p', {}, 'Checking…'));
  let status = null;
  const after = async (msg) => {
    toast(msg);
    const before = S.project;
    await loadProjects();
    // A first project (or a different one) arrived: open it everywhere, which also redraws this tab.
    if (S.project && S.project !== before) return selectProject(S.project);
    await loadTree().catch(() => {});
    await load(false);
  };
  const action = (label, fn, cls = 'btn sm') => {
    const b = el('button', { class: cls, onclick: guard(async () => {
      b.disabled = true;
      b.textContent = '…';
      try {
        await fn();
      } finally {
        b.disabled = false;
        b.textContent = label;
      }
    }) }, label);
    return b;
  };
  const render = () => {
    const st = status;
    const head = el('h3', {}, 'Sync with Claude (GitHub)');
    if (!st.isRepo) return box.replaceChildren(head, el('p', {}, 'This studio folder is not a git clone, so it cannot sync. Clone the repo with git to use Claude from the Claude app.'));
    const parts = [`Branch ${st.branch}`];
    if (st.behind) parts.push(`${st.behind} new on GitHub`);
    if (st.ahead) parts.push(`${st.ahead} not pushed`);
    if (st.localChanges) parts.push(`${st.localChanges} changed file${st.localChanges === 1 ? '' : 's'} here`);
    if (!st.behind && !st.ahead && !st.localChanges) parts.push('up to date');
    box.replaceChildren(...[head,
      el('p', {}, 'Ask Claude in the Claude app (Code tab, this repo) to build or change an add-on. When it has pushed, get it here.'),
      el('p', {}, parts.join(' · ')),
      st.fetchError ? el('p', { class: 'hint', style: { color: 'var(--danger)' } }, st.fetchError) : null,
      st.claude.length ? el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
        el('b', { style: { fontSize: '13px' } }, "Claude's work"),
        st.claude.map((c) => el('div', { class: 'download' },
          el('span', { style: { display: 'flex', flexDirection: 'column', minWidth: 0 } }, el('b', { style: { fontFamily: 'inherit' } }, c.subject),
            el('small', { class: 'hint' }, `${c.branch} · ${c.commits} commit${c.commits === 1 ? '' : 's'} · ${c.projectFiles} project files · ${ago(c.date)}`)),
          action('Get it', async () => {
            await api('POST', '/api/git/merge', { branch: c.branch });
            await after(`Got "${c.subject}"`);
          }, 'btn sm primary')))) : null,
      el('div', { class: 'row', style: { flexWrap: 'wrap' } },
        action('Check for updates', () => load(true)),
        st.behind ? action(`Pull ${st.behind} update${st.behind === 1 ? '' : 's'}`, async () => {
          await api('POST', '/api/git/pull');
          await after('Updated from GitHub');
        }, 'btn sm primary') : null,
        st.ahead || st.localChanges ? action('Push my changes', async () => {
          const res = await api('POST', '/api/git/push');
          toast(res.committed ? `Pushed ${res.committed} changed files` : 'Pushed');
          await load(false);
        }) : null)].filter(Boolean));
  };
  const load = async (fetch) => {
    status = await api('GET', `/api/git/status${fetch ? '?fetch=1' : ''}`);
    render();
  };
  // Show the local state right away, then refresh from GitHub.
  load(false).then(() => load(true)).catch((err) => box.replaceChildren(el('h3', {}, 'Sync with Claude (GitHub)'), el('p', {}, err.message)));
  return box;
}

async function renderShip() {
  const root = $('#ship');
  if (!S.project) return root.replaceChildren(syncPanel(), el('p', { class: 'empty' }, 'Create a project, or get one Claude made.'));
  const p = S.projects.find((x) => x.slug === S.project) || {};
  const builds = await api('GET', `/api/projects/${encodeURIComponent(S.project)}/builds`).catch(() => []);
  const library = await api('GET', '/api/library').catch(() => ({ items: [] }));
  const v = S.lastValidation;
  const bump = el('select', { 'aria-label': 'Version bump' }, ['none', 'patch', 'minor', 'major'].map((x) => el('option', { value: x }, x === 'none' ? `Keep v${p.version}` : `Bump ${x}`)));
  const validateBtn = el('button', { class: 'btn', onclick: guard(async () => {
    validateBtn.disabled = true;
    S.lastValidation = await api('POST', `/api/projects/${encodeURIComponent(S.project)}/validate`).finally(() => (validateBtn.disabled = false));
    renderShip();
  }) }, 'Validate');
  const buildBtn = el('button', { class: 'btn primary', onclick: guard(async () => {
    buildBtn.disabled = true;
    const res = await api('POST', `/api/projects/${encodeURIComponent(S.project)}/build`, { bump: bump.value }).finally(() => (buildBtn.disabled = false));
    S.lastValidation = res.report;
    S.lastBuild = res;
    if (!res.ok) toast('Build blocked by validation errors', true);
    else toast(`Built v${res.version}`);
    await loadProjects();
    renderShip();
  }) }, 'Build .mcaddon');
  const published = el('input', { type: 'checkbox', checked: p.published !== false, onchange: guard(async () => {
    await api('PATCH', `/api/projects/${encodeURIComponent(S.project)}`, { library: { published: published.checked } });
    await loadProjects();
  }) });
  const summary = el('textarea', { rows: 2, placeholder: 'Short summary for your library page' }, p.description || '');
  const updateBtn = el('button', { class: 'btn primary block', onclick: guard(async () => {
    updateBtn.disabled = true;
    updateBtn.textContent = "Getting Claude's changes and building…";
    let res;
    try {
      res = await api('POST', `/api/projects/${encodeURIComponent(S.project)}/update-game`);
    } finally {
      updateBtn.disabled = false;
      updateBtn.textContent = '⬇ Update in Minecraft';
    }
    S.lastValidation = res.report;
    const got = res.sync?.merged?.length ? `Got ${res.sync.merged.length} update${res.sync.merged.length === 1 ? '' : 's'} from Claude. ` : res.sync?.pulled ? 'Got the latest from GitHub. ' : '';
    if (!res.ok) {
      toast(`${got}Can't build: fix the errors below (or ask QA).`, true);
      return renderShip();
    }
    // Download the .mcaddon; opening it from Chrome's download message imports it into Minecraft.
    const a = el('a', { href: withToken(`/api/download?file=${encodeURIComponent(res.download)}`), download: '' });
    document.body.append(a);
    a.click();
    a.remove();
    S.lastUpdate = { version: res.version, note: `${got}${res.sync?.error ? `(${res.sync.error}) ` : ''}` };
    toast(`${got}v${res.version} ready - tap Open on the download`);
    renderShip();
  }) }, '⬇ Update in Minecraft');
  const deploy = S.config?.minecraftDir ? el('button', { class: 'btn', onclick: guard(async () => {
    const res = await api('POST', `/api/projects/${encodeURIComponent(S.project)}/deploy`);
    toast(`Deployed ${res.deployed.length} packs - run /reload in game`);
  }) }, 'Deploy to Minecraft (dev packs)') : null;

  root.replaceChildren(
    syncPanel(),
    el('div', { class: 'card' },
      el('h3', {}, `${p.name || S.project}`),
      el('p', {}, `${p.type || 'addon'} · v${p.version || '1.0.0'} · namespace ${p.namespace || '?'}`),
      updateBtn,
      el('p', { class: 'hint' }, S.lastUpdate
        ? `${S.lastUpdate.note}Built test version ${S.lastUpdate.version}. Tap Open on the download (Minecraft imports it), then leave and rejoin your world.`
        : "Gets Claude's latest changes, builds a new test version and downloads it. Open the download to import into Minecraft, then rejoin your world."),
      el('div', { class: 'row', style: { flexWrap: 'wrap' } }, validateBtn, bump, buildBtn, deploy),
      v ? el('div', { class: 'row' }, el('span', { class: `pill ${v.ok ? 'ok' : 'bad'}` }, v.ok ? 'Valid' : 'Has errors'), el('span', { class: 'pill' }, `${v.counts.error} errors · ${v.counts.warning} warnings`)) : el('p', {}, 'Validate to check manifests, identifiers, textures, scripts and more.'),
      issueList(v)),
    el('div', { class: 'card' },
      el('h3', {}, 'Downloads'),
      el('p', {}, 'Open a .mcaddon on your phone or PC and Minecraft imports both packs.'),
      builds.length ? builds.slice(0, 8).map((b) => el('a', { class: 'download', href: withToken(`/api/download?file=${encodeURIComponent(b.file)}`), download: '' },
        el('b', {}, b.file.split('/').pop()), el('span', { class: 'pill' }, `${(b.size / 1024).toFixed(1)} KB`))) : el('p', {}, 'No builds yet.')),
    el('div', { class: 'card' },
      el('h3', {}, 'Studio library'),
      el('p', {}, 'Export every published project as a ready-to-upload gallery (index.html + library.json + downloads) for your website.'),
      el('label', { class: 'toggle' }, 'Publish this project in the library', published),
      el('label', { class: 'field' }, 'Library summary', summary),
      el('button', { class: 'btn sm', onclick: guard(async () => {
        await api('PATCH', `/api/projects/${encodeURIComponent(S.project)}`, { description: summary.value.trim(), library: { summary: summary.value.trim() } });
        await loadProjects();
        toast('Saved');
      }) }, 'Save summary'),
      el('button', { class: 'btn primary', onclick: guard(async (e) => {
        e.target.disabled = true;
        const res = await api('POST', '/api/library/export', {}).finally(() => (e.target.disabled = false));
        toast(`Library exported: ${res.count} add-ons${res.skipped.length ? `, ${res.skipped.length} skipped` : ''}`);
        renderShip();
      }) }, 'Export library'),
      library.generated ? el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
        el('p', {}, `Last export ${new Date(library.generated).toLocaleString()} · ${library.items.length} add-ons`),
        el('a', { class: 'download', href: withToken('/api/download?file=library.zip'), download: '' }, el('b', {}, 'library.zip'), el('span', { class: 'pill' }, 'upload to your site'))) : null),
  );
}

// ---- settings ---------------------------------------------------------------------------
function settingsSheet() {
  const c = S.config;
  const key = el('input', { type: 'password', placeholder: c.apiKeySet ? `${c.apiKeyHint} (saved in ${c.apiKeySource})` : 'sk-ant-…', autocomplete: 'off' });
  const opt = (list, value) => list.map((m) => el('option', { value: m.id ?? m, selected: (m.id ?? m) === value }, m.label ?? m));
  const model = el('select', {}, opt(c.models, c.model));
  const specialistModel = el('select', {}, el('option', { value: '' }, 'Same as Director'), opt(c.models, c.specialistModel));
  const effD = el('select', {}, opt(c.efforts, c.effort.director));
  const effS = el('select', {}, opt(c.efforts, c.effort.specialists));
  const feat = (k, label) => el('label', { class: 'toggle' }, label, el('input', { type: 'checkbox', 'data-f': k, checked: c.features[k] }));
  const author = el('input', { value: c.author || '', placeholder: 'Your name or studio handle' });
  const studio = el('input', { value: c.studioName || '' });
  const studioUrl = el('input', { value: c.studioUrl || '', placeholder: 'https://your-site.example' });
  const mcDir = el('input', { value: c.minecraftDir || '', placeholder: '…/games/com.mojang', autocapitalize: 'off' });
  const theme = el('select', {}, ['auto', 'dark', 'light'].map((t) => el('option', { value: t, selected: store.get('theme', 'auto') === t }, t)));
  const origin = location.origin;
  const mcp = `claude mcp add --transport http localhub ${origin}/mcp${TOKEN ? ` --header "Authorization: Bearer ${TOKEN}"` : ''}`;
  const features = el('div', {}, feat('progressUpdates', 'Show progress notes while agents work'), feat('fallbacks', 'Retry on a fallback model if a request is declined'), feat('compaction', 'Summarize very long chats automatically'));
  openSheet('Settings', el('form', { style: { display: 'flex', flexDirection: 'column', gap: '12px' }, onsubmit: guard(async (e) => {
    e.preventDefault();
    const patch = {
      model: model.value,
      specialistModel: specialistModel.value,
      effort: { director: effD.value, specialists: effS.value },
      features: Object.fromEntries([...features.querySelectorAll('input')].map((i) => [i.dataset.f, i.checked])),
      author: author.value.trim(),
      studioName: studio.value.trim(),
      studioUrl: studioUrl.value.trim(),
      minecraftDir: mcDir.value.trim(),
    };
    if (key.value.trim()) patch.apiKey = key.value.trim();
    S.config = await api('PUT', '/api/config', patch);
    store.set('theme', theme.value);
    applyTheme();
    closeSheet();
    toast('Settings saved');
    if (!S.sessionId) renderChatEmpty();
  }) },
  el('label', { class: 'field' }, 'Anthropic API key', key, el('span', { class: 'hint' }, 'Stored only on this device in .localhub/config.json. Get one at console.anthropic.com.')),
  el('label', { class: 'field' }, 'Director model', model),
  el('label', { class: 'field' }, 'Specialist model', specialistModel),
  el('div', { class: 'row' }, el('label', { class: 'field', style: { flex: 1 } }, 'Director effort', effD), el('label', { class: 'field', style: { flex: 1 } }, 'Specialist effort', effS)),
  el('span', { class: 'hint' }, 'Higher effort = deeper thinking, slower and more tokens. "medium" is a strong default for specialists.'),
  features,
  el('label', { class: 'field' }, 'Author', author),
  el('label', { class: 'field' }, 'Studio name (library title)', studio),
  el('label', { class: 'field' }, 'Studio website', studioUrl),
  el('label', { class: 'field' }, 'Minecraft com.mojang folder (optional, for one-tap deploy)', mcDir),
  el('label', { class: 'field' }, 'Theme', theme),
  el('div', { class: 'field' }, 'Connect external agents (Claude Code, Claude Desktop, any MCP client)', el('div', { class: 'copy' }, mcp),
    el('button', { type: 'button', class: 'btn sm', onclick: () => navigator.clipboard?.writeText(mcp).then(() => toast('Copied'), () => toast('Copy failed', true)) }, 'Copy command')),
  el('span', { class: 'hint' }, `Workspace: ${S.status?.workspace || ''}`),
  el('button', { class: 'btn primary block', type: 'submit' }, 'Save settings')));
}
$('#btn-settings').addEventListener('click', settingsSheet);
$('#btn-reconnect').addEventListener('click', () => location.reload());

const serverAlive = () => fetch('/api/status', { headers: TOKEN ? { 'x-localhub-token': TOKEN } : {} }).then((r) => r.ok).catch(() => false);

/** Server is off: show the start screen and open the studio as soon as it answers again. */
function showOffline() {
  $('#offline').hidden = false;
  clearInterval(showOffline.poll);
  showOffline.poll = setInterval(async () => {
    if (await serverAlive()) location.reload();
  }, 2000);
}

// The service worker keeps the app shell cached so the installed app still opens when the server is off.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

function applyTheme() {
  const t = store.get('theme', 'auto');
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

// Wide screens: a topbar toggle switches the center column between code and build.
const centerToggle = el('button', { class: 'btn sm center-switch', onclick: () => setView(app.dataset.center === 'ship' ? 'editor' : 'ship') }, 'Build ⇄ Code');
$('.topbar-actions').prepend(centerToggle);

// ---- boot -------------------------------------------------------------------------------
async function boot() {
  applyTheme();
  try {
    [S.status, S.templates, S.roster] = await Promise.all([api('GET', '/api/status'), api('GET', '/api/templates'), api('GET', '/api/agents')]);
  } catch {
    showOffline();
    return;
  }
  S.config = S.status.config;
  app.dataset.center = 'editor';
  if (!S.roster.some((a) => a.key === S.agent)) S.agent = 'director';
  renderAgentChips();
  await loadProjects();
  setView(S.view);
  renderEditor();
  if (S.project) await Promise.all([loadTree(), openLatestSession()]);
  else {
    renderTree();
    renderChatEmpty();
    projectSheet();
  }
  connectWorkspaceEvents();
}
boot();
