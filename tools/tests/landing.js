'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;

  // #1025, #1035, #1039: playchogan.com shows a landing page, one address per language, and still
  // redirects every other path to the app
  async function testLanding() {
    head('playchogan.com landing page (#1025, #1039)');
    const dir = path.join(ROOT, 'worker/landing');
    const pub = path.join(dir, 'public');
    // no early return: a missing Worker must fail the group, not hide every check after it
    if (!fs.existsSync(path.join(dir, 'index.js'))) throw new Error('worker/landing/index.js does not exist');
    const load = (f) => import(require('url').pathToFileURL(path.join(dir, f)).href);
    const mod = await load('index.js');
    const R = await load('render.js');
    const html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
    const env = { ASSETS: { fetch: async (req) => {
      const u = new URL(req.url || req);
      return u.pathname === '/index.html' ? new Response(html, { headers: { 'Content-Type': 'text/html' } }) : new Response('asset ' + u.pathname, { status: 200 });
    } } };
    const get = (p, host) => mod.default.fetch(new Request('https://' + (host || 'playchogan.com') + p), env);
    const loc = (r) => r.headers.get('Location');

    // --- routes (#1039 item 1)
    let r = await get('/');
    let body = await r.text();
    ok(r.status === 200 && /<html lang="en" dir="ltr">/.test(body) && body.includes('<link rel="canonical" href="https://playchogan.com/">'), '/ is English with the root as its canonical, no script needed');
    r = await get('/?utm=x');
    ok(r.status === 200, 'the root with a query string is still the landing page');
    r = await get('/en/');
    body = await r.text();
    ok(r.status === 200 && body.includes('<link rel="canonical" href="https://playchogan.com/en/">') && /<html lang="en"/.test(body), '/en/ is English with its own canonical');
    r = await get('/es/');
    body = await r.text();
    ok(r.status === 200 && /<html lang="es" dir="ltr">/.test(body) && body.includes('href="https://playchogan.com/es/"') && body.includes('<title>Chogan — minijuegos'), '/es/ is the Spanish page with its own title and canonical');
    r = await get('/fa/');
    ok(r.status === 200 && /<html lang="fa" dir="rtl">/.test(await r.text()), '/fa/ is served right-to-left');
    r = await get('/ar/');
    ok(/<html lang="ar" dir="rtl">/.test(await r.text()), '/ar/ is served right-to-left');
    r = await get('/es?x=1');
    ok(r.status === 301 && loc(r) === 'https://playchogan.com/es/?x=1', '/es redirects to /es/ with its query');
    r = await get('/index.html?a=1');
    ok(r.status === 301 && loc(r) === 'https://playchogan.com/?a=1', '/index.html redirects to /');
    r = await get('/games/chess/?x=1', 'www.playchogan.com');
    ok(r.status === 301 && loc(r) === 'https://playchogan.com/games/chess/?x=1', 'www redirects to the apex keeping path and query');
    r = await get('/favicon.ico');
    ok(r.status === 200, '/favicon.ico is served');
    // Existing links (a game's address shared since #615) must keep opening the app.
    for (const p of ['/games/chess/?x=1', '/games/chess/index.html', '/privacy.html', '/lib/chogan.js', '/xx/', '/i18n.js']) {
      r = await get(p);
      ok(r.status === 301 && loc(r) === 'https://choganhq.github.io/chogan' + p, p + ' still redirects to the app with its path and query');
    }
    r = await get('/wrangler.jsonc');
    ok(r.status === 301, 'an unlisted path is redirected, not served');

    // --- headers (item 3)
    const shot = Object.values((await load('shots-data.js')).default.en[0])[0];
    r = await get(shot);
    ok(r.status === 200 && r.headers.get('Cache-Control') === 'public, max-age=31536000, immutable', 'a screenshot is cached for a year, immutable');
    r = await get('/vazirmatn-variable.woff2');
    ok(r.headers.get('Cache-Control') === 'public, max-age=31536000, immutable', 'a font is cached for a year, immutable');
    r = await get('/og/en.png');
    ok(r.headers.get('Cache-Control') === 'public, max-age=31536000, immutable', 'a social card is cached for a year, immutable');
    r = await get('/icon.png');
    ok(/max-age=86400, must-revalidate/.test(r.headers.get('Cache-Control')), 'the icon is revalidated daily');
    r = await get('/');
    ok(r.headers.get('Cache-Control') === 'public, max-age=0, must-revalidate', 'the page itself is always revalidated');
    for (const p of ['/', '/fa/', '/icon.png', '/games/chess/']) {
      r = await get(p);
      ok(/max-age=\d+/.test(r.headers.get('Strict-Transport-Security') || '') && r.headers.get('X-Content-Type-Options') === 'nosniff' &&
        r.headers.get('Referrer-Policy') === 'strict-origin-when-cross-origin', p + ' carries HSTS, nosniff and a referrer policy');
    }

    // --- per-language head (item 2)
    const abs = (u) => u.replace('https://playchogan.com', '');
    for (const l of R.CODES) {
      body = await (await get('/' + l + '/')).text();
      const meta = (re) => (body.match(re) || [])[1];
      const desc = meta(/<meta name="description" content="([^"]+)"/);
      ok(desc && desc.length >= (l === 'zh' ? 50 : 110) && desc.length <= 170, l + ': a description of about 150 characters (' + (desc || '').length + ')');
      ok(meta(/og:description" content="([^"]+)"/) === desc && meta(/twitter:description" content="([^"]+)"/) === desc, l + ': og and twitter descriptions repeat it');
      ok(meta(/name="twitter:title" content="([^"]+)"/) === meta(/<title>([^<]+)<\/title>/) && /twitter:card" content="summary_large_image"/.test(body), l + ': twitter title and the large card');
      ok(/og:image" content="https:\/\/playchogan\.com\/og\/(fa|en)\.png"/.test(body) && /og:image:width" content="1200"/.test(body) && /og:image:height" content="630"/.test(body) && /og:image:alt" content="[^"]+"/.test(body), l + ': a 1200x630 card with alt text');
      const alts = [...body.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => m[1] + ' ' + abs(m[2]));
      ok(alts.length === 10 && alts.includes('x-default /') && alts.includes('en /en/') && R.CODES.every((c) => alts.includes(c + ' /' + c + '/')), l + ': the full hreflang set, reciprocal, x-default is /');
      const ld = JSON.parse(meta(/<script type="application\/ld\+json">(.*?)<\/script>/s));
      const app = ld['@graph'].find((n) => n['@type'] === 'SoftwareApplication');
      ok(app.inLanguage === l && app.url === 'https://playchogan.com/' + l + '/' && ld['@graph'].some((n) => n['@type'] === 'Organization') && ld['@graph'].some((n) => n['@type'] === 'WebSite') && !/aggregateRating|ratingValue/.test(JSON.stringify(ld)), l + ': JSON-LD in its own language with Organization and WebSite and no invented rating');
      // no script needed: every English source span is gone from a translated page
      if (l !== 'en' && l !== 'fa') {
        const src = [...html.matchAll(/<(?:span|p) data-l="en">([^<]+)</g)].map((m) => m[1].trim().replace(/&amp;/g, '&')).filter((k) => !['Chogan', 'Google Play', 'F-Droid', 'GitHub', 'Telegram Mini App'].includes(k));
        const left = src.filter((k) => !body.includes('>' + R.tr(k, l).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')) && !body.includes(R.tr(k, l).replace(/&/g, '&amp;')));
        ok(left.length === 0, l + ': the body is translated on the server' + (left.length ? ', still English: ' + left[0] : ''));
      }
      // item 4: this language's screenshots only
      const srcs = [...body.matchAll(/<img src="(\/shots\/[^"]+)"/g)].map((m) => m[1]);
      ok(srcs.length === 6 && srcs.every((s) => s.startsWith('/shots/' + (l === 'fa' ? 'fa' : 'en') + '-')) && !/\/shots\/(fa|en)-\d\.png/.test(body), l + ': six WebP screenshots, only its own set');
      ok((body.match(/<img src="\/shots[^>]*alt="[^"]{2,}"/g) || []).length === 6 && /role="region" aria-label="[^"%]+"/.test(body) && /<select id="lang" aria-label="[^"%]+"/.test(body), l + ': localized labels on the screenshots, the strip and the language list');
      ok(!/%[A-Z]+%/.test(body) && !/<!--[A-Z]+-->/.test(body), l + ': no placeholder is left in the page');
    }
    body = await (await get('/fa/')).text();
    ok(/rel="preload" href="\/vazirmatn-variable\.woff2" as="font"/.test(body) && !/rel="preload"/.test(await (await get('/de/')).text()), 'only the Persian and Arabic pages preload the Persian font');
    ok(/og:locale" content="ar_SA"/.test(await (await get('/ar/')).text()), 'Arabic is ar_SA');

    // --- sitemap
    const sm = fs.readFileSync(path.join(pub, 'sitemap.xml'), 'utf8');
    const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    ok(locs.length === 10 && locs[0] === 'https://playchogan.com/' && R.CODES.every((c) => locs.includes('https://playchogan.com/' + c + '/')), 'the sitemap lists / and every language page');
    ok((sm.match(/<xhtml:link /g) || []).length === 100 && !locs.some((u) => /\/(fa|es|de|pl|fr|ar|hi|zh)$/.test(u)), 'each sitemap entry carries all ten alternates in the same form as the pages');

    // --- files
    const FILES = [...fs.readFileSync(path.join(dir, 'index.js'), 'utf8').matchAll(/'(\/[^']+\.(?:png|svg|ico|woff2|txt|xml))'/g)].map((m) => m[1])
      .concat(Object.values((await load('shots-data.js')).default).flat().flatMap((s) => Object.values(s)));
    ok(FILES.length >= 20 && FILES.every((f) => fs.existsSync(path.join(pub, f))), 'every file the Worker lists exists in public/ (' + FILES.length + ')');
    ok(fs.readdirSync(path.join(pub, 'shots')).length === 24, 'public/shots holds exactly the 24 listed WebP files, no leftover PNG');
    const refs = [...html.matchAll(/(?:src|href)="(\/[^"/][^"]*)"/g)].map((m) => m[1]).filter((f) => !/^\/(fa|en|zh|de|es|pl|fr|ar|hi)\/$/.test(f));
    ok(refs.length > 0 && refs.every((f) => FILES.includes(f)), 'every local file the page uses is one the Worker serves');
    for (const f of ['fa', 'en']) {
      const png = fs.readFileSync(path.join(pub, 'og', f + '.png'));
      ok(png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630, 'og/' + f + '.png is 1200x630');
    }
    const out = [...html.matchAll(/href="(https:\/\/[^"]+)"/g)].map((m) => m[1]);
    for (const want of ['https://choganhq.github.io/chogan/', 'https://play.google.com/store/apps/details?id=io.github.choganhq.chogan',
      'https://f-droid.org/packages/io.github.choganhq.chogan/', 'https://github.com/choganhq/chogan/releases/latest',
      'https://t.me/chogangamebot', 'https://t.me/chogan_games', 'https://github.com/choganhq/chogan', 'https://issues.playchogan.com']) {
      ok(out.includes(want), 'the page links to ' + want);
    }
    ok(/<html lang="fa" dir="rtl">/.test(html), 'the source page starts in Persian, right to left');
    // #1027: the visitor can switch themes against the system setting, and the choice is read before first paint
    ok(/id="theme"/.test(html) && /:root\[data-theme=dark\]/.test(html) && /:root:not\(\[data-theme=light\]\)/.test(html) &&
      /localStorage\.setItem\('theme'/.test(html) && html.indexOf('localStorage.getItem("theme")') < html.indexOf('<style>'),
      'the page has a theme switch that overrides the system theme in both directions and is applied before the styles');
    ok(/data-l="fa">مینی‌اپ تلگرام</.test(html) && /class="badge" href="https:\/\/t\.me\/chogangamebot"/.test(html), 'the Persian link labels are Persian and the top buttons include Telegram');

    // --- every language the app has
    const appLangs = (fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8').match(/\{ code: '([a-z]{2})', label/g) || []).map((x) => x.slice(9, 11));
    const pageLangs = (/var LOC = \[(.*?)\];/s.exec(html) || ['', ''])[1].match(/\['([a-z]{2})'/g) || [];
    ok(appLangs.length >= 9 && JSON.stringify(pageLangs.map((x) => x.slice(2, 4))) === JSON.stringify(appLangs) && JSON.stringify(R.CODES) === JSON.stringify(appLangs), 'the page offers exactly the app languages: ' + appLangs.join(','));
    const I18N = (await load('i18n-data.js')).default;
    const keys = [...html.matchAll(/<(?:span|p) data-l="en">([^<]+)</g)].map((m) => m[1].trim().replace(/&amp;/g, '&')).filter((k) => !['Chogan', 'Google Play', 'F-Droid', 'GitHub'].includes(k));
    ok(keys.length >= 20, 'the page has English source texts to translate');
    for (const l of appLangs.filter((x) => x !== 'fa' && x !== 'en')) {
      const missing = [...keys, 'Light', 'Dark', 'Language', 'Screenshots', 'The Chogan menu'].filter((k) => !(I18N[l] || {})[k]);
      ok(missing.length === 0, 'i18n-data.js covers every text in ' + l + (missing.length ? ', missing: ' + missing.slice(0, 3).join(' | ') : ''));
    }
    // the games list is real: every name equals the app's, every link is a game the app has
    const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8'));
    const list = Array.isArray(games) ? games : games.games;
    const GD = (await load('games-data.js')).default;
    ok(Object.keys(GD).length >= 20 && Object.entries(GD).every(([id, n]) => { const g = list.find((x) => x.id === id); return g && R.CODES.every((c) => g.name[c] === n[c]) && fs.existsSync(path.join(ROOT, 'www/games', id, 'index.html')); }), 'the listed games exist in the app and keep its names in every language');
    ok(/<h2>[^<]*<span data-l="fa">چند بازی از چوگان<\/span>/.test(html) && (await (await get('/de/')).text()).includes('<a href="https://choganhq.github.io/chogan/games/chess/">Schach</a>'), 'a visible games list under its own heading links to the app');

    // --- structure and layout (items 5, 6, 7)
    ok(/<main>[\s\S]*<h1>[\s\S]*<\/main>/.test(html), 'the content sits in <main>');
    ok(/@media \(min-width: 768px\) \{ \.shots \{ display: grid; grid-template-columns: repeat\(3, 1fr\)/.test(html), 'the screenshots form a 3x2 grid from 768px');
    ok(/@media \(min-width: 560px\) \{ \.facts \{ grid-template-columns: repeat\(2/.test(html) && /\.badges \{ display: grid; grid-template-columns: repeat\(2/.test(html) && /max-width: 339px\) \{ \.badges \{ grid-template-columns: 1fr/.test(html), 'facts and badges are grids that fall back to one column on a narrow phone');
    ok((html.match(/text-wrap: balance/g) || []).length >= 3 && /\.shots img \{ filter: brightness/.test(html.replace(/\s+/g, ' ')), 'headings are balanced and screenshots are dimmed in dark mode');
    ok(/id="theme" type="button" aria-pressed="false"/.test(html) && /setAttribute\('aria-pressed', d \? 'true' : 'false'\)/.test(html), 'the theme button reports its state with aria-pressed');
    ok(/id="langbox"[^>]*><svg class="ic"/.test(html) && /tb\.innerHTML = d \? sun : moon/.test(html) && !/innerHTML = [^;]*<span>/.test(html.slice(html.indexOf('function label'))), 'the theme and language controls are icon only and keep an accessible name');

    // --- device language (the owner's rule): only on "/", never on a language page, once
    const script = (/<script>\n\/\/ "\/" is the English page([\s\S]*?)<\/script>/.exec(html) || [])[0];
    ok(!!script, 'the page script is found');
    // run the script against a fake browser and return where it went
    const run = (pathname, langs, saved, ua, search, hash) => {
      const calls = [];
      const els = {};
      const el = () => ({ appendChild() {}, addEventListener() {}, setAttribute() {}, style: {}, dataset: {} });
      const doc = { documentElement: { lang: pathname === '/' ? 'en' : pathname.slice(1, 3), dataset: {} }, getElementById: (id) => (els[id] = els[id] || el()),
        createElement: el, querySelector: () => null };
      const loc = { pathname, search: search || '', hash: hash || '', replace: (u) => calls.push(u), assign: (u) => calls.push(u) };
      const fn = new Function('document', 'location', 'navigator', 'localStorage', 'matchAll', 'matchMedia', script.replace(/^<script>|<\/script>$/g, ''));
      fn(doc, loc, { languages: langs, language: langs[0], userAgent: ua || 'Mozilla/5.0' }, { getItem: () => saved || null, setItem() {} }, null, () => ({ matches: false }));
      return calls;
    };
    const cases = [['en-US', '/en/'], ['de-DE', '/de/'], ['ar-SA', '/ar/'], ['fa-IR', '/fa/'], ['zh-TW', '/zh/'], ['ja-JP', '/en/']];
    for (const [lang, want] of cases) {
      const c = run('/', [lang], null);
      ok(c.length === 1 && c[0] === want, 'a first visit to / with ' + lang + ' lands on ' + want + ' exactly once (' + c.join(',') + ')');
    }
    ok(run('/', ['fr-FR'], 'de')[0] === '/de/', 'a stored choice beats the device language on /');
    ok(run('/', ['ja-JP', 'es-ES'], null)[0] === '/es/', 'the first supported language in the device list wins');
    ok(run('/', ['de-DE'], null, null, '?utm=1', '#top')[0] === '/de/?utm=1#top', 'the query and the hash survive the jump');
    ok(run('/', ['de-DE'], null, 'Googlebot/2.1').length === 0, 'a crawler is never redirected');
    ok(run('/en/', ['fa-IR'], null).length === 0 && run('/de/', ['fa-IR'], 'fa').length === 0, 'a language page never redirects, whatever the device or the stored choice');
  }
  return { testLanding };
};
