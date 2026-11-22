'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;

  // #1025: playchogan.com shows a landing page at "/" and still redirects every other path to the app
  async function testLanding() {
    head('playchogan.com landing page (#1025)');
    const dir = path.join(ROOT, 'worker/landing');
    // no early return: a missing Worker must fail the group, not hide every check after it
    if (!fs.existsSync(path.join(dir, 'index.js'))) throw new Error('worker/landing/index.js does not exist');
    const mod = await import(require('url').pathToFileURL(path.join(dir, 'index.js')).href);
    const served = [];
    const env = { ASSETS: { fetch: async (req) => { const u = new URL(req.url || req); served.push(u.pathname); return new Response('asset ' + u.pathname, { status: 200 }); } } };
    // HTMLRewriter exists only inside Workers: a stand-in that records what the Worker sets
    const set = {};
    globalThis.HTMLRewriter = class { constructor() { this.h = []; } on(sel, h) { this.h.push([sel, h]); return this; }
      transform(res) { for (const [sel, h] of this.h) h.element({ setAttribute: (k, v) => { set[sel + '|' + k] = v; }, setInnerContent: (v) => { set[sel] = v; } }); return res; } };
    const get = (p) => mod.default.fetch(new Request('https://playchogan.com' + p), env);

    let r = await get('/');
    ok(r.status === 200 && served[served.length - 1] === '/index.html', 'the root serves the landing page');
    r = await get('/?utm=x');
    ok(r.status === 200, 'the root with a query string is still the landing page');
    // #1035: one address per language
    r = await get('/es');
    ok(r.status === 200 && set['link[rel=canonical]|href'] === 'https://playchogan.com/es' && set['html|lang'] === 'es' && set['title'].startsWith('Chogan — juegos'), '/es is the Spanish page with its own canonical and title');
    r = await get('/fa/');
    ok(r.status === 200 && set['html|dir'] === 'rtl', '/fa is served right-to-left');
    r = await get('/');
    ok(set['link[rel=canonical]|href'] === 'https://playchogan.com/' && set['html|lang'] === 'en', '/ is English');
    r = await get('/en');
    ok(r.status === 301 && r.headers.get('Location') === 'https://playchogan.com/', '/en redirects to the root');
    // Existing links (a game's address shared since #615) must keep opening the app.
    for (const p of ['/games/chess/?x=1', '/games/chess/index.html', '/privacy.html', '/lib/chogan.js']) {
      r = await get(p);
      ok(r.status === 301 && r.headers.get('Location') === 'https://choganhq.github.io/chogan' + p, p + ' still redirects to the app with its path and query');
    }
    r = await get('/shots/fa-1.png');
    ok(r.status === 200, 'a listed asset is served');
    // a file that is not listed must not be served from ./public by accident
    r = await get('/wrangler.jsonc');
    ok(r.status === 301, 'an unlisted path is redirected, not served');

    const pub = path.join(dir, 'public');
    const html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
    const FILES = [...fs.readFileSync(path.join(dir, 'index.js'), 'utf8').matchAll(/'(\/[^']+\.(?:png|svg|woff2|txt|xml|js))'/g)].map((m) => m[1]);
    ok(FILES.length >= 10 && FILES.every((f) => fs.existsSync(path.join(pub, f))), 'every file the Worker lists exists in public/ (' + FILES.length + ')');
    const refs = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map((m) => m[1]);
    ok(refs.length > 0 && refs.every((f) => FILES.includes(f)), 'every local file the page uses is one the Worker serves');
    const out = [...html.matchAll(/href="(https:\/\/[^"]+)"/g)].map((m) => m[1]);
    for (const want of ['https://choganhq.github.io/chogan/', 'https://play.google.com/store/apps/details?id=io.github.choganhq.chogan',
      'https://f-droid.org/packages/io.github.choganhq.chogan/', 'https://github.com/choganhq/chogan/releases/latest',
      'https://t.me/chogangamebot', 'https://t.me/chogan_games', 'https://github.com/choganhq/chogan', 'https://issues.playchogan.com']) {
      ok(out.includes(want), 'the page links to ' + want);
    }
    ok(/<html lang="fa" dir="rtl">/.test(html), 'the page starts in Persian, right to left');
    // #1027: the visitor can switch themes against the system setting, and the choice is read before first paint
    ok(/id="theme"/.test(html) && /:root\[data-theme=dark\]/.test(html) && /:root:not\(\[data-theme=light\]\)/.test(html) &&
      /localStorage\.setItem\('theme'/.test(html) && html.indexOf('localStorage.getItem("theme")') < html.indexOf('<style>'),
      'the page has a theme switch that overrides the system theme in both directions and is applied before the styles');
    // #1029: six scrolling screenshots per language, a Telegram badge, and link labels fully in Persian
    ok((html.match(/src="\/shots\/fa-\d\.png"/g) || []).length === 6 && (html.match(/src="\/shots\/en-\d\.png"/g) || []).length === 6,
      'the page shows six screenshots in each language');
    ok(/class="badge" href="https:\/\/t\.me\/chogangamebot"/.test(html), 'the top buttons include the Telegram Mini App');
    ok(/data-l="fa">مینی‌اپ تلگرام</.test(html) && /data-l="fa">گیت‌هاب</.test(html), 'the Persian link labels are written in Persian');
    // #1031: the page speaks every language the app has; the English spans are keys into /i18n.js
    const appLangs = (T.fs.readFileSync(T.path.join(T.ROOT, 'www/lib/chogan.js'), 'utf8').match(/\{ code: '([a-z]{2})', label/g) || []).map(x => x.slice(9, 11));
    const pageLangs = (/var LOC = \[(.*?)\];/s.exec(html) || ['', ''])[1].match(/\['([a-z]{2})'/g) || [];
    ok(appLangs.length >= 9 && JSON.stringify(pageLangs.map(x => x.slice(2, 4))) === JSON.stringify(appLangs), 'the page offers exactly the app languages: ' + appLangs.join(','));
    const i18n = {};
    new Function('window', T.fs.readFileSync(T.path.join(T.ROOT, 'worker/landing/public/i18n.js'), 'utf8'))(i18n);
    const keys = [...html.matchAll(/data-l="en">([^<]+)</g)].map(m => m[1]).filter(k => !['Chogan', 'Google Play', 'F-Droid', 'GitHub'].includes(k));
    ok(keys.length >= 20, 'the page has English source texts to translate');
    for (const l of appLangs.filter(x => x !== 'fa' && x !== 'en')) {
      const d = (i18n.I18N || {})[l] || {};
      const missing = [...keys, 'title', 'Light', 'Dark'].filter(k => !d[k]);
      ok(missing.length === 0, 'i18n.js covers every text in ' + l + (missing.length ? ', missing: ' + missing.slice(0, 3).join(' | ') : ''));
    }
    // #1033: the theme and language controls carry small icons
    ok(/id="langbox"[^>]*><svg class="ic"/.test(html) && /tb\.innerHTML = \(d \? sun : moon\)/.test(html), 'the theme and language controls have icons');
    const cfg = fs.readFileSync(path.join(dir, 'wrangler.jsonc'), 'utf8');
    ok(/"name":\s*"playchogan-redirect"/.test(cfg) && !/"routes"/.test(cfg.replace(/\/\/.*$/gm, '')), 'the Worker keeps its name, so its existing routes stay bound');
  }
  return { testLanding };
};
