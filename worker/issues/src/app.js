// issues.playchogan.com Worker (#768): a read-only mirror of the public issues of
// choganhq/chogan. The report form stays at
// playchogan.com/report/ (#757); this site only links to it.
//
// Stateless: no KV, D1 or R2. GitHub is the only source, read through its REST API
// and cached for five minutes, first in the isolate's memory, then in the
// colocation's Cache API, so a visitor never costs GitHub a call.
//
// Everything that came from GitHub is escaped before it reaches the page, and the page
// runs no inline script at all: the CSP allows scripts and styles from this origin only.

// The repository is a constant, not a setting: a wrong variable must not be able to
// point the mirror at a private repository the token can read.
export const REPO = 'choganhq/chogan';
const REPO_API = 'https://api.github.com/repos/' + REPO;
const REPO_WEB = 'https://github.com/' + REPO;
export const REPORT_URL = 'https://playchogan.com/report/';
const APP_URL = 'https://choganhq.github.io/chogan/';
export const PER_PAGE = 50;     // GitHub items per page; PRs and needs-owner are left out after
export const MAX_PAGE = 40;     // 2000 items, far beyond the repository today
export const TTL = 5 * 60 * 1000;
export const HIDDEN_LABEL = 'needs-owner';
const STATES = ['all', 'open', 'closed'];
const CACHE_HOST = 'https://issues-cache.invalid/';

export const LANGS = [
  ['fa', 'فارسی', 'rtl', 'fa-IR'], ['en', 'English', 'ltr', 'en-GB'], ['zh', '中文', 'ltr', 'zh-Hans'],
  ['de', 'Deutsch', 'ltr', 'de-DE'], ['es', 'Español', 'ltr', 'es-ES'], ['pl', 'Polski', 'ltr', 'pl-PL'],
];

export const S = {
  fa: {
    title: 'گزارش‌های چوگان', lead: 'نسخه‌ی فقط‌خواندنی گزارش‌ها و پیشنهادهای عمومی چوگان.',
    report: 'ثبت گزارش تازه', all: 'همه', open: 'باز', closed: 'بسته',
    stOpen: 'باز', stDone: 'انجام شد', stNotPlanned: 'انجام نمی‌شود',
    opened: 'ثبت: {d}', closedOn: 'بسته: {d}', noBody: '(بدون شرح)',
    allOnGithub: 'همه‌ی گزارش‌ها در گیت‌هاب', newer: 'جدیدتر', older: 'قدیمی‌تر', empty: 'گزارشی نیست.',
    error: 'فهرست از گیت‌هاب نرسید. چند دقیقه‌ی دیگر دوباره امتحان کنید.',
    stale: 'گیت‌هاب در دسترس نبود؛ این آخرین نسخه‌ی ذخیره‌شده است.',
    refresh: 'فهرست هر پنج دقیقه تازه می‌شود. متن گزارش‌ها همان‌طور که نوشته شده‌اند نمایش داده می‌شود.',
    theme: 'پوسته (خودکار، روشن، تاریک)', langGo: 'برو', back: 'بازگشت به چوگان', page: 'صفحه‌ی {n}',
    filter: 'وضعیت', labels: 'برچسب‌ها',
  },
  en: {
    title: 'Chogan issues', lead: 'A read-only copy of Chogan’s public reports and suggestions.',
    report: 'Report a problem or idea', all: 'All', open: 'Open', closed: 'Closed',
    stOpen: 'Open', stDone: 'Done', stNotPlanned: 'Not planned',
    opened: 'Opened {d}', closedOn: 'Closed {d}', noBody: '(no description)',
    allOnGithub: 'All issues on GitHub', newer: 'Newer', older: 'Older', empty: 'No issues here.',
    error: 'Could not load the list from GitHub. Please try again in a few minutes.',
    stale: 'GitHub could not be reached; this is the last saved copy.',
    refresh: 'The list refreshes every five minutes. Issue text is shown as it was written.',
    theme: 'Theme (auto, light, dark)', langGo: 'Go', back: 'Back to Chogan', page: 'Page {n}',
    filter: 'State', labels: 'Labels',
  },
  zh: {
    title: 'Chogan 问题列表', lead: 'Chogan 公开问题和建议的只读副本。',
    report: '报告问题或提出建议', all: '全部', open: '未解决', closed: '已关闭',
    stOpen: '未解决', stDone: '已完成', stNotPlanned: '不予处理',
    opened: '提交于 {d}', closedOn: '关闭于 {d}', noBody: '（无描述）',
    allOnGithub: '在 GitHub 上查看全部问题', newer: '较新', older: '较早', empty: '这里没有问题。',
    error: '无法从 GitHub 加载列表。请几分钟后再试。',
    stale: '无法连接 GitHub；这是最后保存的副本。',
    refresh: '列表每五分钟更新一次。问题内容按原文显示。',
    theme: '主题（自动、浅色、深色）', langGo: '前往', back: '返回 Chogan', page: '第 {n} 页',
    filter: '状态', labels: '标签',
  },
  de: {
    title: 'Chogan-Meldungen', lead: 'Eine schreibgeschützte Kopie der öffentlichen Meldungen und Vorschläge von Chogan.',
    report: 'Problem oder Idee melden', all: 'Alle', open: 'Offen', closed: 'Geschlossen',
    stOpen: 'Offen', stDone: 'Erledigt', stNotPlanned: 'Nicht geplant',
    opened: 'Gemeldet am {d}', closedOn: 'Geschlossen am {d}', noBody: '(keine Beschreibung)',
    allOnGithub: 'Alle Meldungen auf GitHub', newer: 'Neuer', older: 'Älter', empty: 'Hier gibt es keine Meldungen.',
    error: 'Die Liste konnte nicht von GitHub geladen werden. Bitte versuch es in ein paar Minuten erneut.',
    stale: 'GitHub war nicht erreichbar; dies ist die zuletzt gespeicherte Kopie.',
    refresh: 'Die Liste wird alle fünf Minuten aktualisiert. Meldungen erscheinen so, wie sie geschrieben wurden.',
    theme: 'Design (automatisch, hell, dunkel)', langGo: 'Los', back: 'Zurück zu Chogan', page: 'Seite {n}',
    filter: 'Status', labels: 'Labels',
  },
  es: {
    title: 'Incidencias de Chogan', lead: 'Una copia de solo lectura de las incidencias y sugerencias públicas de Chogan.',
    report: 'Informar de un problema o idea', all: 'Todas', open: 'Abiertas', closed: 'Cerradas',
    stOpen: 'Abierta', stDone: 'Hecha', stNotPlanned: 'No prevista',
    opened: 'Abierta el {d}', closedOn: 'Cerrada el {d}', noBody: '(sin descripción)',
    allOnGithub: 'Todas las incidencias en GitHub', newer: 'Más recientes', older: 'Más antiguas', empty: 'No hay incidencias aquí.',
    error: 'No se pudo cargar la lista desde GitHub. Inténtalo de nuevo en unos minutos.',
    stale: 'No se pudo acceder a GitHub; esta es la última copia guardada.',
    refresh: 'La lista se actualiza cada cinco minutos. El texto se muestra tal como se escribió.',
    theme: 'Tema (automático, claro, oscuro)', langGo: 'Ir', back: 'Volver a Chogan', page: 'Página {n}',
    filter: 'Estado', labels: 'Etiquetas',
  },
  pl: {
    title: 'Zgłoszenia Chogan', lead: 'Kopia tylko do odczytu publicznych zgłoszeń i pomysłów Chogan.',
    report: 'Zgłoś problem lub pomysł', all: 'Wszystkie', open: 'Otwarte', closed: 'Zamknięte',
    stOpen: 'Otwarte', stDone: 'Zrobione', stNotPlanned: 'Nieplanowane',
    opened: 'Zgłoszono {d}', closedOn: 'Zamknięto {d}', noBody: '(brak opisu)',
    allOnGithub: 'Wszystkie zgłoszenia na GitHubie', newer: 'Nowsze', older: 'Starsze', empty: 'Brak zgłoszeń.',
    error: 'Nie udało się pobrać listy z GitHuba. Spróbuj ponownie za kilka minut.',
    stale: 'GitHub był niedostępny; to ostatnia zapisana kopia.',
    refresh: 'Lista odświeża się co pięć minut. Treść zgłoszeń jest pokazana tak, jak ją napisano.',
    theme: 'Motyw (auto, jasny, ciemny)', langGo: 'Przejdź', back: 'Wróć do Chogan', page: 'Strona {n}',
    filter: 'Stan', labels: 'Etykiety',
  },
};

// --- Text -----------------------------------------------------------------------
// The only way text from GitHub reaches the page. Quotes too, because some of it ends
// up inside attributes.
export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Bidi overrides would let a title read differently from what it is; control characters
// have no place on the page. ZWNJ (U+200C) stays: Persian needs it.
function plain(s) {
  return String(s == null ? '' : s)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g, '');
}

// The first lines of an issue's text, shown as written (never rendered as markdown or
// HTML). Issues from the web form start with a notice for the agent; for those the
// player's own description is the part worth showing.
export const EXCERPT_CHARS = 240;
export function excerpt(body) {
  let s = plain(body);
  if (s.includes('<!-- from-form -->')) {
    const i = s.indexOf('\nDescription:');
    if (i >= 0) s = s.slice(i + '\nDescription:'.length);
  }
  s = s.replace(/<!--[\s\S]*?(?:-->|$)/g, '');
  const lines = s.split('\n').map((l) => l.trim())
    .filter((l) => l && !/^(?:`{3,}|~{3,})/.test(l) && !/^>\s*\[!\w+\]$/.test(l))
    .slice(0, 3);
  let out = lines.join('\n').replace(/[ \t]+/g, ' ');
  const cp = Array.from(out);
  if (cp.length > EXCERPT_CHARS) out = cp.slice(0, EXCERPT_CHARS).join('').trimEnd() + '…';
  return out;
}

// Only what the page shows is kept and cached: no user ids, avatars or bodies.
export function trim(list) {
  const out = [];
  for (const it of Array.isArray(list) ? list : []) {
    if (!it || typeof it !== 'object') continue;
    if (it.pull_request) continue;                         // GitHub lists PRs as issues too
    if (it.repository_url !== REPO_API) continue;          // nothing from another repository
    const n = it.number;
    if (!Number.isInteger(n) || n < 1) continue;
    const labels = (Array.isArray(it.labels) ? it.labels : []).map((l) => plain(typeof l === 'string' ? l : l && l.name)).filter(Boolean);
    if (labels.some((l) => l.toLowerCase() === HIDDEN_LABEL)) continue;
    out.push({
      n,
      title: plain(it.title).trim(),
      state: it.state === 'closed' ? 'closed' : 'open',
      reason: it.state_reason === 'not_planned' || it.state_reason === 'duplicate' ? 'not_planned' : 'completed',
      labels,
      created: Date.parse(it.created_at) || 0,
      closed: Date.parse(it.closed_at) || 0,
      excerpt: excerpt(it.body),
    });
  }
  return out.sort((a, b) => b.created - a.created || b.n - a.n);
}

// --- GitHub, cached -----------------------------------------------------------------
function gh(env, fetchImpl, url) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'chogan-issues-mirror',
  };
  if (env && env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + env.GITHUB_TOKEN;
  return fetchImpl(url, { method: 'GET', headers });
}

class Unavailable extends Error {}

async function fetchPage(env, fetchImpl, state, page) {
  // Fail closed: the mirror shows nothing unless GitHub itself says the repository is public.
  const meta = await gh(env, fetchImpl, REPO_API);
  if (!meta.ok) throw new Unavailable('repo ' + meta.status);
  const m = await meta.json();
  if (!m || m.private !== false || m.visibility !== 'public' || String(m.full_name).toLowerCase() !== REPO) throw new Unavailable('not public');
  const r = await gh(env, fetchImpl, `${REPO_API}/issues?state=${state}&sort=created&direction=desc&per_page=${PER_PAGE}&page=${page}`);
  if (!r.ok) throw new Unavailable('issues ' + r.status);
  const list = await r.json();
  const next = /<[^>]*>;\s*rel="next"/.test(r.headers.get('Link') || '');
  return { items: trim(list), next, at: 0 };
}

export function makeStore(opts) {
  const o = opts || {};
  const mem = new Map();
  const cache = o.cache !== undefined ? o.cache : (typeof caches !== 'undefined' ? caches.default : null); // eslint-disable-line no-undef
  return {
    async get(env, fetchImpl, now, state, page, waitUntil) {
      const key = state + '-' + page;
      const fresh = (d) => d && now - d.at < TTL && now >= d.at;
      let hit = mem.get(key);
      if (fresh(hit)) return hit;
      if (cache) {
        try {
          const r = await cache.match(new Request(CACHE_HOST + key));
          const d = r ? await r.json() : null;
          if (fresh(d)) { mem.set(key, d); return d; }
          if (d && (!hit || d.at > hit.at)) hit = d;
        } catch (e) { /* a broken cache only costs a GitHub call */ }
      }
      try {
        const d = await fetchPage(env, fetchImpl, state, page);
        d.at = now;
        if (mem.size > 200) mem.clear();
        mem.set(key, d);
        if (cache) {
          const put = cache.put(new Request(CACHE_HOST + key), new Response(JSON.stringify(d), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=' + (TTL / 1000) * 12 },
          })).catch(() => {});
          if (waitUntil) waitUntil(put); else await put;
        }
        return d;
      } catch (e) {
        // A GitHub outage shows the last copy rather than nothing, said so on the page.
        // A repository that is no longer public shows nothing at all.
        if (hit && !(e instanceof Unavailable && e.message === 'not public')) return Object.assign({}, hit, { stale: true });
        throw e;
      }
    },
  };
}

// --- Page -----------------------------------------------------------------------
export const CSS = `:root {
  --bg: #f6f4ef; --card: #ffffff; --ink: #1d1f22; --dim: #5d6168; --line: #d9d5cc;
  --accent: #0f6b5c; --accent-ink: #ffffff; --err: #b3261e; --err-bg: #fdecea;
  --open: #17643a; --open-bg: #e3f3e8; --done: #6639ba; --done-bg: #efe8fb; --np-bg: #ecebe7;
  --focus: #1a73e8;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme=light]) {
    --bg: #15171a; --card: #1f2226; --ink: #eceae6; --dim: #a7abb2; --line: #363a40;
    --accent: #5fc3ad; --accent-ink: #0b1f1b; --err: #ffb4ab; --err-bg: #3b1e1c;
    --open: #7ee2a0; --open-bg: #183323; --done: #cdb5ff; --done-bg: #2c2442; --np-bg: #2a2d32;
    --focus: #8ab4f8;
  }
}
:root[data-theme=dark] {
  --bg: #15171a; --card: #1f2226; --ink: #eceae6; --dim: #a7abb2; --line: #363a40;
  --accent: #5fc3ad; --accent-ink: #0b1f1b; --err: #ffb4ab; --err-bg: #3b1e1c;
  --open: #7ee2a0; --open-bg: #183323; --done: #cdb5ff; --done-bg: #2c2442; --np-bg: #2a2d32;
  --focus: #8ab4f8;
}
:root[data-theme=light] { color-scheme: light; }
:root[data-theme=dark] { color-scheme: dark; }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, "Vazirmatn", Tahoma, "Noto Sans", sans-serif;
}
main { max-width: 720px; margin: 0 auto; padding: 16px 16px 48px; }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin: 8px 0 12px; }
h1 { font-size: 1.4rem; margin: 0; line-height: 1.3; }
.tools { display: flex; align-items: center; gap: 8px; }
.tools form { display: flex; gap: 6px; margin: 0; }
.tbtn { width: 40px; min-height: 40px; padding: 0; font: inherit; font-size: 1.2rem; line-height: 1; border-radius: 10px; background: transparent; color: var(--ink); border: 1px solid var(--line); cursor: pointer; }
.tbtn.go { width: auto; padding: 0 12px; font-size: .95rem; }
select { font: inherit; color: var(--ink); background: var(--bg); border: 1px solid var(--line); border-radius: 10px; min-height: 40px; padding: 6px 10px; }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.lead { color: var(--dim); font-size: .95rem; margin: 0 0 14px; }
.btn { display: block; text-align: center; text-decoration: none; font-weight: 700; border-radius: 12px; padding: 12px 22px; min-height: 48px; background: var(--accent); color: var(--accent-ink); margin: 0 0 16px; }
.tabs { display: flex; gap: 8px; flex-wrap: wrap; list-style: none; margin: 0 0 12px; padding: 0; }
.tabs a { display: flex; align-items: center; min-height: 40px; padding: 4px 16px; border: 1px solid var(--line); border-radius: 999px; color: var(--ink); text-decoration: none; }
.tabs a[aria-current] { border-color: var(--accent); outline: 1px solid var(--accent); font-weight: 600; }
.note { border-radius: 10px; padding: 10px 12px; margin: 0 0 12px; font-weight: 600; background: var(--err-bg); color: var(--err); }
.issues { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.issue { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; min-width: 0; }
.meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; color: var(--dim); font-size: .85rem; }
.num { color: var(--dim); font-weight: 600; }
.st { font-weight: 700; font-size: .78rem; border-radius: 999px; padding: 1px 10px; }
.st-open { background: var(--open-bg); color: var(--open); }
.st-done { background: var(--done-bg); color: var(--done); }
.st-np { background: var(--np-bg); color: var(--dim); }
.issue h2 { font-size: 1.05rem; line-height: 1.45; margin: 6px 0 4px; overflow-wrap: anywhere; }
.issue h2 a { color: var(--ink); text-decoration: none; }
.issue h2 a:hover { text-decoration: underline; }
.ex { margin: 0; color: var(--dim); font-size: .9rem; white-space: pre-line; overflow-wrap: anywhere; }
.labels { list-style: none; display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 0; padding: 0; }
.labels li { border: 1px solid var(--line); border-radius: 999px; padding: 0 9px; font-size: .78rem; color: var(--dim); overflow-wrap: anywhere; }
.empty { color: var(--dim); text-align: center; padding: 24px 0; }
.pager { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 16px 0 0; }
.pager a { display: inline-flex; align-items: center; min-height: 44px; padding: 4px 16px; border: 1px solid var(--accent); border-radius: 12px; color: var(--accent); text-decoration: none; font-weight: 600; }
.pager .here { color: var(--dim); font-size: .9rem; }
.foot { color: var(--dim); font-size: .85rem; margin-top: 20px; }
.foot a { color: var(--accent); }
[hidden] { display: none !important; }
`;

// Served as /app.js, never inline. Theme: auto follows the system; a pick is kept in this
// browser only (no cookie). The language list submits itself; without script its Go
// button does the same.
export const CLIENT = `(function () {
  'use strict';
  var r = document.documentElement, T = ['auto', 'light', 'dark'];
  var ICON = { auto: '\\u25D0', light: '\\u2600', dark: '\\u263E' }, t = 'auto';
  try { t = localStorage.getItem('chogan.issuesTheme') || 'auto'; } catch (e) {}
  if (T.indexOf(t) < 0) t = 'auto';
  function set() {
    if (t === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', t);
    var b = document.getElementById('theme');
    if (b) b.textContent = ICON[t];
  }
  set();
  document.addEventListener('DOMContentLoaded', function () {
    var b = document.getElementById('theme');
    if (b) {
      b.hidden = false;
      set();
      b.addEventListener('click', function () {
        t = T[(T.indexOf(t) + 1) % 3];
        try { localStorage.setItem('chogan.issuesTheme', t); } catch (e) {}
        set();
      });
    }
    var s = document.getElementById('lang'), go = document.getElementById('go');
    if (s && go) {
      go.hidden = true;
      s.addEventListener('change', function () { s.form.submit(); });
    }
  });
})();
`;

function langOf(code) { return LANGS.find((l) => l[0] === code) || LANGS[0]; }

export function pickLang(url, request) {
  const q = (url.searchParams.get('lang') || '').toLowerCase();
  if (S[q]) return q;
  const al = (request.headers.get('Accept-Language') || '').split(',');
  for (const part of al) {
    const c = part.trim().slice(0, 2).toLowerCase();
    if (S[c]) return c;
  }
  return 'fa';
}

function digits(lang, s) { return lang === 'fa' ? String(s).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]) : String(s); }

function fmt(lang, k, v) {
  let s = S[lang][k] || S.en[k] || k;
  for (const x in v || {}) s = s.split('{' + x + '}').join(v[x]);
  return s;
}

function date(lang, ms) {
  try {
    return new Intl.DateTimeFormat(langOf(lang)[3], { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(ms));
  } catch (e) {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

function href(lang, state, page) {
  const p = new URLSearchParams();
  p.set('lang', lang);
  if (state !== 'all') p.set('state', state);
  if (page > 1) p.set('page', String(page));
  return '/?' + p.toString();
}

function item(lang, it) {
  const t = (k, v) => fmt(lang, k, v);
  const link = REPO_WEB + '/issues/' + it.n;
  const st = it.state === 'open' ? ['st-open', t('stOpen')] : it.reason === 'not_planned' ? ['st-np', t('stNotPlanned')] : ['st-done', t('stDone')];
  const when = it.state === 'closed' && it.closed ? t('closedOn', { d: esc(date(lang, it.closed)) }) : t('opened', { d: esc(date(lang, it.created)) });
  return '<li class="issue">'
    + '<div class="meta"><span class="st ' + st[0] + '">' + esc(st[1]) + '</span>'
    + '<a class="num" href="' + esc(link) + '" rel="noopener noreferrer">#' + esc(digits(lang, it.n)) + '</a>'
    + '<time datetime="' + esc(new Date(it.state === 'closed' && it.closed ? it.closed : it.created).toISOString()) + '">' + when + '</time></div>'
    + '<h2 dir="auto"><a href="' + esc(link) + '" rel="noopener noreferrer">' + esc(it.title || '#' + it.n) + '</a></h2>'
    + '<p class="ex" dir="auto">' + esc(it.excerpt || t('noBody')) + '</p>'
    + (it.labels.length ? '<ul class="labels" aria-label="' + esc(t('labels')) + '">' + it.labels.map((l) => '<li dir="auto">' + esc(l) + '</li>').join('') + '</ul>' : '')
    + '</li>';
}

export function render(lang, state, page, data) {
  const t = (k, v) => fmt(lang, k, v);
  const L = langOf(lang);
  const tabs = STATES.map((s) => '<li><a href="' + esc(href(lang, s, 1)) + '"' + (s === state ? ' aria-current="page"' : '') + '>' + esc(t(s)) + '</a></li>').join('');
  let body;
  if (!data) body = '<p class="note" role="alert">' + esc(t('error')) + '</p>';
  else {
    body = (data.stale ? '<p class="note" role="status">' + esc(t('stale')) + '</p>' : '')
      + (data.items.length ? '<ol class="issues">' + data.items.map((it) => item(lang, it)).join('') + '</ol>' : '<p class="empty">' + esc(t('empty')) + '</p>');
    if (page > 1 || data.next) {
      body += '<nav class="pager">'
        + (page > 1 ? '<a href="' + esc(href(lang, state, page - 1)) + '" rel="prev">' + esc(t('newer')) + '</a>' : '<span></span>')
        + '<span class="here">' + esc(t('page', { n: digits(lang, page) })) + '</span>'
        + (data.next && page < MAX_PAGE ? '<a href="' + esc(href(lang, state, page + 1)) + '" rel="next">' + esc(t('older')) + '</a>' : '<span></span>')
        + '</nav>';
    }
  }
  const opts = LANGS.map((l) => '<option value="' + l[0] + '"' + (l[0] === lang ? ' selected' : '') + '>' + esc(l[1]) + '</option>').join('');
  return '<!doctype html>\n<html lang="' + (lang === 'zh' ? 'zh-Hans' : lang) + '" dir="' + L[2] + '">\n<head>\n'
    + '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    + '<meta name="robots" content="noindex">\n<meta name="color-scheme" content="light dark">\n'
    + '<title>' + esc(t('title')) + '</title>\n'
    + '<link rel="stylesheet" href="/style.css">\n<script src="/app.js"></script>\n</head>\n<body>\n<main>\n'
    + '<header><h1>' + esc(t('title')) + '</h1><div class="tools">'
    + '<button type="button" class="tbtn" id="theme" title="' + esc(t('theme')) + '" aria-label="' + esc(t('theme')) + '" hidden>◐</button>'
    + '<form method="get" action="/">' + (state !== 'all' ? '<input type="hidden" name="state" value="' + esc(state) + '">' : '')
    + '<select name="lang" id="lang" aria-label="Language">' + opts + '</select>'
    + '<button class="tbtn go" id="go">' + esc(t('langGo')) + '</button></form>'
    + '</div></header>\n'
    + '<p class="lead">' + esc(t('lead')) + '</p>\n'
    + '<a class="btn" href="' + esc(REPORT_URL + '?lang=' + lang) + '">' + esc(t('report')) + '</a>\n'
    + '<nav aria-label="' + esc(t('filter')) + '"><ul class="tabs">' + tabs + '</ul></nav>\n'
    + body + '\n'
    + '<p class="foot">' + esc(t('refresh')) + '<br><a href="' + esc(REPO_WEB + '/issues') + '" rel="noopener noreferrer">' + esc(t('allOnGithub')) + '</a> · '
    + '<a href="' + esc(APP_URL) + '" rel="noopener noreferrer">' + esc(t('back')) + '</a></p>\n'
    + '</main>\n</body>\n</html>\n';
}

// --- Routing --------------------------------------------------------------------
export const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";
const COMMON = {
  'X-Robots-Tag': 'noindex',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': CSP,
  'Strict-Transport-Security': 'max-age=31536000',
};

function respond(request, status, body, type, extra) {
  const headers = Object.assign({ 'Content-Type': type }, COMMON, extra || {});
  return new Response(request.method === 'HEAD' ? null : body, { status, headers });
}

export function makeWorker(opts) {
  const o = opts || {};
  const store = makeStore(o);
  return {
    async fetch(request, env, execCtx) {
      const url = new URL(request.url);
      // The zone serves plain http too; the mirror never answers over it.
      if (url.protocol === 'http:') return Response.redirect('https://' + url.host + url.pathname + url.search, 301);
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return respond(request, 405, 'Method not allowed', 'text/plain; charset=utf-8', { Allow: 'GET, HEAD' });
      }
      const p = url.pathname;
      if (p === '/style.css') return respond(request, 200, CSS, 'text/css; charset=utf-8', { 'Cache-Control': 'public, max-age=3600' });
      if (p === '/app.js') return respond(request, 200, CLIENT, 'text/javascript; charset=utf-8', { 'Cache-Control': 'public, max-age=3600' });
      if (p !== '/') return respond(request, 404, 'Not found', 'text/plain; charset=utf-8');

      const lang = pickLang(url, request);
      const qs = url.searchParams.get('state');
      const state = STATES.includes(qs) ? qs : 'all';
      const pg = parseInt(url.searchParams.get('page') || '1', 10);
      const page = Number.isInteger(pg) && pg >= 1 && pg <= MAX_PAGE ? pg : 1;
      const now = o.now ? o.now() : Date.now();
      const fetchImpl = o.fetch || ((...a) => fetch(...a));
      const waitUntil = execCtx && execCtx.waitUntil ? (pr) => execCtx.waitUntil(pr) : null;
      let data = null;
      try {
        data = await store.get(env || {}, fetchImpl, now, state, page, waitUntil);
      } catch (e) {
        // The reason goes to the Worker log only; the page says GitHub did not answer.
        console.error('issues mirror: ' + ((e && e.message) || e));
      }
      return respond(request, data ? 200 : 502, render(lang, state, page, data), 'text/html; charset=utf-8', {
        'Cache-Control': 'no-cache',
        Vary: 'Accept-Language',
      });
    },
  };
}
