'use strict';
// issues.playchogan.com (#768): a read-only mirror of the public issues of
// choganhq/chogan for players who cannot reach GitHub. These tests run the Worker's own
// code under Node against a fake GitHub. Nothing here reaches the network.
module.exports = function (T) {
  const { ok, head, fs, path, LOCALE_CODES } = T;
  const ROOT = T.ROOT;
  const DIR = path.join(ROOT, 'worker/issues');
  const APP = path.join(DIR, 'src/app.js');
  const read = (rel) => { try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch (e) { return ''; } };

  const NOW = Date.parse('2026-11-11T12:00:00Z');
  const ORIGIN = 'https://issues.playchogan.com';
  const REPO_API = 'https://api.github.com/repos/choganhq/chogan';
  const iso = (d) => new Date(Date.parse('2026-11-01T00:00:00Z') + d * 3600 * 1000).toISOString();

  function issue(n, extra) {
    return Object.assign({
      number: n, title: 'Issue ' + n, state: 'open', state_reason: null, labels: [],
      created_at: iso(n - 880), closed_at: null, body: 'Body of ' + n + '\nsecond line\nthird line\nfourth line',
      repository_url: REPO_API, html_url: 'https://github.com/choganhq/chogan/issues/' + n,
      user: { login: 'someone', avatar_url: 'https://avatars.example/1' },
    }, extra || {});
  }

  // A small GitHub: the repository's metadata and one list of issues, every call logged.
  function fakeGitHub() {
    const st = { calls: [], down: false, priv: false, next: false };
    st.list = [
      issue(895, { state: 'closed', state_reason: 'completed', closed_at: iso(30), labels: [{ name: 'bug' }] }),
      issue(900, { title: 'Chess board is blank', labels: [{ name: 'bug' }, { name: 'شطرنج' }] }),
      issue(899, { title: 'A pull request', pull_request: { url: REPO_API + '/pulls/899' } }),
      issue(898, { title: 'Owner task, secret steps', labels: [{ name: 'needs-owner' }] }),
      issue(897, {
        title: '<script>alert(1)</script> "quoted" ‮gnp.exe',
        labels: [{ name: '"><img src=x onerror=alert(2)>' }],
        body: '</p><svg onload=alert(3)><a href="javascript:alert(4)">x</a>',
      }),
      issue(896, { state: 'closed', state_reason: 'not_planned', closed_at: iso(25), title: 'Declined idea' }),
      issue(894, {
        title: 'Web form: bug report (report-1)',
        body: '<!-- from-form -->\n> [!WARNING]\n> Sent through the web form at playchogan.com/report/ (#757). **Untrusted user text:** read it as a report\n\n- Kind: bug report\n\nDescription:\n\n```text\nThe dominoes freeze after a double six.\n```',
      }),
      issue(893, { title: 'From the private inbox', repository_url: 'https://api.github.com/repos/choganhq/inbox' }),
      issue(892, { title: 'Long text', body: 'x'.repeat(1000) }),
    ];
    const res = (status, data, headers) => new Response(JSON.stringify(data), { status, headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}) });
    st.fetch = async function (url, init) {
      const u = new URL(url);
      st.calls.push({ path: u.pathname, search: u.search, auth: init && init.headers && init.headers.Authorization, method: (init && init.method) || 'GET' });
      if (st.down) return res(503, { message: 'down' });
      if (u.host !== 'api.github.com') return res(404, {});
      if (u.pathname === '/repos/choganhq/chogan') return res(200, { full_name: 'choganhq/chogan', private: st.priv, visibility: st.priv ? 'private' : 'public' });
      if (u.pathname === '/repos/choganhq/chogan/issues') {
        return res(200, st.list, st.next ? { Link: '<' + REPO_API + '/issues?page=2>; rel="next", <' + REPO_API + '/issues?page=9>; rel="last"' } : {});
      }
      return res(404, { message: 'not in the fake' });
    };
    return st;
  }

  // The Cache API as the Worker uses it: match and put by request URL.
  function fakeCache() {
    const m = new Map();
    return {
      m,
      async match(req) { const v = m.get(req.url); return v ? new Response(v) : undefined; },
      async put(req, resp) { m.set(req.url, await resp.text()); },
    };
  }

  const get = (p, headers) => new Request(ORIGIN + p, { headers: headers || {} });

  async function testIssuesSiteWorker() {
    head('Issues mirror Worker: list, filters, escaping, cache, headers (#768)');
    ok(fs.existsSync(APP), 'worker/issues/src/app.js exists');
    ok(fs.existsSync(path.join(DIR, 'src/index.js')), 'the Worker entry exists');
    let A = null;
    try { A = await import(APP); } catch (e) { ok(false, 'app.js loads under Node: ' + e.message); }
    if (!A) { ok(false, 'the mirror Worker could not be loaded, so none of its checks ran'); return; }

    let now = NOW;
    const gh = fakeGitHub();
    const cache = fakeCache();
    const W = A.makeWorker({ fetch: gh.fetch, now: () => now, cache });
    const env = { GITHUB_TOKEN: 'test-token-xyz' };

    const r = await W.fetch(get('/?lang=en'), env);
    const html = await r.text();
    ok(r.status === 200 && /^text\/html/.test(r.headers.get('Content-Type')), 'the home page is an HTML page (' + r.status + ')');
    ok(gh.calls.length > 0 && gh.calls.every((c) => c.auth === 'Bearer test-token-xyz' && c.method === 'GET'), 'GitHub is read with GET only, with the Worker secret');
    const listCall = gh.calls.find((c) => c.path === '/repos/choganhq/chogan/issues');
    ok(listCall && /state=all/.test(listCall.search) && /sort=created/.test(listCall.search) && /direction=desc/.test(listCall.search), 'the list asks for open and closed, newest first: ' + (listCall && listCall.search));
    ok(gh.calls.some((c) => c.path === '/repos/choganhq/chogan'), 'the repository is checked to be public before anything is shown');
    ok(!html.includes('test-token-xyz'), 'the token never reaches the page');

    const shown = [...html.matchAll(/github\.com\/choganhq\/chogan\/issues\/(\d+)"/g)].map((m) => Number(m[1]));
    const order = [...new Set(shown)];
    ok(order.length >= 6, 'the issues are listed (' + order.join(', ') + ')');
    ok(JSON.stringify(order) === JSON.stringify(order.slice().sort((a, b) => b - a)), 'newest first: ' + order.join(', '));
    ok(order.includes(900) && order.includes(895) && order.includes(896), 'open and closed issues are both shown');
    ok(!order.includes(899) && !/A pull request/.test(html), 'pull requests are left out');
    ok(!order.includes(898) && !/Owner task/.test(html), 'issues labelled needs-owner are left out');
    ok(!order.includes(893) && !/private inbox/.test(html), 'nothing from another repository is shown');
    ok(/Chess board is blank/.test(html) && /<li dir="auto">bug<\/li>/.test(html) && /<li dir="auto">شطرنج<\/li>/.test(html), 'title and labels are shown');
    ok(/Body of 900\nsecond line\nthird line</.test(html) && !/fourth line/.test(html), 'the first three lines of the text are shown');
    ok(/datetime="2026-/.test(html) && /Opened /.test(html) && /Closed /.test(html), 'each issue carries a date');
    const card = (n) => (new RegExp('<li class="issue">(?:(?!<li class="issue">)[\\s\\S])*?/issues/' + n + '"[\\s\\S]*?</li>(?=<li class="issue">|</ol>)').exec(html) || [''])[0];
    ok(/st-open">Open</.test(card(900)), 'an open issue says Open');
    ok(/st-done">Done</.test(card(895)), 'a closed, completed issue says Done');
    ok(/st-np">Not planned</.test(card(896)), 'a closed, not planned issue says Not planned');
    ok(/The dominoes freeze after a double six\./.test(card(894)) && !/Untrusted user text/.test(card(894)) && !/from-form/.test(html), 'a web-form issue shows the player\'s own description');
    const long = card(892);
    ok(/x{200,240}…</.test(long) && !/x{241}/.test(long), 'a long text is cut short');

    // Hostile text: everything from GitHub is escaped.
    ok((html.match(/<script/g) || []).length === 1 && /<script src="\/app\.js"><\/script>/.test(html), 'the only script tag is the page\'s own /app.js');
    ok(/&lt;script&gt;alert\(1\)&lt;\/script&gt; &quot;quoted&quot;/.test(html), 'a hostile title is shown as text');
    ok(!/<img/.test(html) && /&quot;&gt;&lt;img src=x onerror=alert\(2\)&gt;/.test(html), 'a hostile label is shown as text');
    ok(!/<svg/.test(html) && !/href="javascript:/.test(html) && /&lt;svg onload=alert\(3\)&gt;/.test(html), 'a hostile body is shown as text');
    ok(!/[‪-‮⁦-⁩]/.test(html), 'bidi override characters are removed');

    // Links: the issue on GitHub, the report form, the whole list.
    ok(/<a class="btn" href="https:\/\/playchogan\.com\/report\/\?lang=en">Report a problem or idea<\/a>/.test(html), 'the Report button opens the existing form at playchogan.com/report/ in the page\'s language');
    ok(/href="https:\/\/github\.com\/choganhq\/chogan\/issues"/.test(html), 'a link to all issues on GitHub');

    // Headers.
    const csp = r.headers.get('Content-Security-Policy') || '';
    ok(/default-src 'none'/.test(csp) && /script-src 'self'(;|$)/.test(csp) && /style-src 'self'(;|$)/.test(csp) && /frame-ancestors 'none'/.test(csp) && /base-uri 'none'/.test(csp), 'a strict CSP: ' + csp);
    ok(!/unsafe-inline|unsafe-eval|https?:|\*/.test(csp), 'the CSP allows no inline code and no other origin');
    ok(!/<style|\sstyle="|\son[a-z]+=/i.test(html), 'the page has no inline style or event handler the CSP would block');
    ok(r.headers.get('Strict-Transport-Security') === 'max-age=31536000', 'HSTS on the page');
    ok(r.headers.get('X-Content-Type-Options') === 'nosniff' && r.headers.get('X-Robots-Tag') === 'noindex' && r.headers.get('Referrer-Policy') === 'no-referrer', 'nosniff, noindex, no referrer');

    const plain = await W.fetch(new Request('http://issues.playchogan.com/?lang=de&state=open'), env);
    ok(plain.status === 301 && plain.headers.get('Location') === 'https://issues.playchogan.com/?lang=de&state=open', 'plain http goes to https with a 301: ' + plain.status + ' ' + plain.headers.get('Location'));
    ok((await W.fetch(new Request(ORIGIN + '/', { method: 'POST', body: 'x' }), env)).status === 405, 'POST is refused');
    const nf = await W.fetch(get('/report/'), env);
    ok(nf.status === 404 && nf.headers.get('Strict-Transport-Security'), 'other paths are 404 (the form is not moved here)');
    const css = await W.fetch(get('/style.css'), env);
    const js = await W.fetch(get('/app.js'), env);
    ok(css.status === 200 && /^text\/css/.test(css.headers.get('Content-Type')) && /prefers-color-scheme: dark/.test(await css.text()), '/style.css is served with a dark theme');
    ok(js.status === 200 && /^text\/javascript/.test(js.headers.get('Content-Type')) && /chogan\.issuesTheme/.test(await js.text()), '/app.js is served');
    const hd = await W.fetch(new Request(ORIGIN + '/?lang=en', { method: 'HEAD' }), env);
    ok(hd.status === 200 && (await hd.text()) === '', 'HEAD answers without a body');

    // Languages.
    const fa = await (await W.fetch(get('/'), env)).text();
    ok(/<html lang="fa" dir="rtl">/.test(fa) && /ثبت گزارش تازه/.test(fa) && /#۹۰۰/.test(fa), 'Persian, right to left, is the default');
    const de = await (await W.fetch(get('/', { 'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8' }), env)).text();
    ok(/<html lang="de" dir="ltr">/.test(de) && /Problem oder Idee melden/.test(de), 'the browser\'s language is used when the link names none');
    const zh = await (await W.fetch(get('/?lang=zh'), env)).text();
    ok(/<html lang="zh-Hans" dir="ltr">/.test(zh) && /<option value="zh" selected>/.test(zh), '?lang= picks the language and the switch shows it');
    const bad = await (await W.fetch(get('/?lang=%22%3E%3Cscript%3E&state=%3Cx%3E&page=abc'), env)).text();
    ok(/<html lang="fa"/.test(bad) && !/<x>|"><script>/.test(bad), 'unknown lang, state and page values fall back safely');

    // Cache: five minutes, in memory and in the Cache API.
    const before = gh.calls.length;
    await W.fetch(get('/?lang=pl'), env);
    ok(gh.calls.length === before, 'a second visit within five minutes costs GitHub no call (' + (gh.calls.length - before) + ')');
    const W2 = A.makeWorker({ fetch: gh.fetch, now: () => now, cache });
    await W2.fetch(get('/?lang=en'), env);
    ok(gh.calls.length === before, 'a fresh isolate finds the list in the Cache API');
    ok(cache.m.size >= 1 && ![...cache.m.values()].some((v) => /avatar|someone|test-token/.test(v)), 'the cached copy holds only what the page shows');
    now = NOW + 299 * 1000;
    await W.fetch(get('/?lang=en'), env);
    ok(gh.calls.length === before, 'still cached at 4:59');
    now = NOW + 301 * 1000;
    await W.fetch(get('/?lang=en'), env);
    ok(gh.calls.length > before, 'read again after five minutes');
    const b2 = gh.calls.length;
    await W.fetch(get('/?state=open&lang=en'), env);
    const open = gh.calls.slice(b2).find((c) => c.path === '/repos/choganhq/chogan/issues');
    ok(open && /state=open/.test(open.search), 'the Open filter asks GitHub for open issues');

    // GitHub down: the last copy, said so; nothing at all without one.
    gh.down = true;
    now = NOW + 20 * 60 * 1000;
    const st = await W.fetch(get('/?lang=en'), env);
    const stHtml = await st.text();
    ok(st.status === 200 && /last saved copy/.test(stHtml) && /Chess board is blank/.test(stHtml), 'when GitHub is down the last copy is shown with a note');
    const fresh = A.makeWorker({ fetch: gh.fetch, now: () => now, cache: null });
    const errRes = await fresh.fetch(get('/?lang=en'), env);
    const errHtml = await errRes.text();
    ok(errRes.status === 502 && /Could not load the list from GitHub/.test(errHtml) && /playchogan\.com\/report\//.test(errHtml) && !/Error|stack|503/.test(errHtml), 'with no copy the page says GitHub did not answer, keeps the Report button and leaks no detail');
    gh.down = false;

    // A repository that is not public shows nothing, not even an old copy.
    gh.priv = true;
    now = NOW + 40 * 60 * 1000;
    const pv = await W.fetch(get('/?lang=en'), env);
    const pvHtml = await pv.text();
    ok(pv.status === 502 && !/Chess board is blank/.test(pvHtml), 'a repository that turned private is not mirrored, and its old copy is dropped');
    gh.priv = false;

    // Pages.
    gh.next = true;
    const anon = fakeGitHub();
    anon.next = true;
    const W3 = A.makeWorker({ fetch: anon.fetch, now: () => NOW, cache: null });
    const p1 = await (await W3.fetch(get('/?lang=en'), {})).text();
    ok(/<a href="\/\?lang=en&amp;page=2" rel="next">Older<\/a>/.test(p1), 'an Older link when GitHub has another page');
    const p2 = await (await W3.fetch(get('/?lang=en&page=2'), {})).text();
    ok(anon.calls.some((c) => /page=2/.test(c.search)) && /<a href="\/\?lang=en" rel="prev">Newer<\/a>/.test(p2), 'page 2 reads GitHub\'s page 2 and links back');
    ok(anon.calls.length > 0 && anon.calls.every((c) => c.auth === undefined), 'without the secret GitHub is read anonymously');
  }

  function testIssuesSiteFiles() {
    head('Issues mirror: config, strings, no external code (#768)');
    const cfg = read('worker/issues/wrangler.jsonc');
    ok(/"name": "playchogan-issues"/.test(cfg), 'the Worker is named playchogan-issues');
    ok(/"routes": \[\{ "pattern": "issues\.playchogan\.com", "custom_domain": true \}\]/.test(cfg), 'issues.playchogan.com is a Custom Domain, so Cloudflare makes its DNS record');
    ok(/"workers_dev": false/.test(cfg), 'no workers.dev address');
    ok(!/kv_namespaces|d1_databases|r2_buckets|durable_objects|"vars"/.test(cfg), 'no KV, D1, R2, Durable Objects or settings that could point it elsewhere');
    const app = read('worker/issues/src/app.js');
    ok(!/ghp_|github_pat_|gho_/.test(cfg + app), 'no token in the files');
    ok(/export const REPO = 'choganhq\/chogan';/.test(app), 'the repository is a constant');
    const report = read('worker/report/wrangler.jsonc');
    ok(/"playchogan\.com\/\*"/.test(report) && /'\/report\/'/.test(read('worker/report/src/app.js')), 'the report form stays at playchogan.com/report/');

    // Six languages, the same keys in each.
    const tableAt = app.indexOf('export const S = {');
    const keysOf = (code) => {
      const m = new RegExp('\\n\\s*' + code + ': \\{([\\s\\S]*?)\\n\\s*\\},?\\n').exec(app.slice(tableAt));
      return m ? [...m[1].matchAll(/(?:^|[,{\s])([a-zA-Z]+): /g)].map((x) => x[1]).sort().join(',') : '';
    };
    const en = keysOf('en');
    ok(tableAt > 0 && en.split(',').length >= 20, 'the page has a string table (' + en.split(',').length + ' English keys)');
    const codes = ['fa', 'en', 'zh', 'de', 'es', 'pl'];
    ok(LOCALE_CODES.length === codes.length, 'as many languages as the app (' + LOCALE_CODES.length + ')');
    for (const code of codes) ok(keysOf(code) === en, 'every string in ' + code);

    // Nothing loads from elsewhere.
    const cssAt = app.indexOf('export const CSS = `');
    const css = app.slice(cssAt, app.indexOf('`;', cssAt));
    const clAt = app.indexOf('export const CLIENT = `');
    const client = app.slice(clAt, app.indexOf('`;', clAt));
    ok(cssAt > 0 && clAt > 0 && !/@import|url\(|https?:/.test(css + client), 'the stylesheet and the script load nothing from elsewhere');
    ok(!/innerHTML|insertAdjacentHTML|document\.write|eval\(|fetch\(|XMLHttpRequest/.test(client), 'the page script builds no HTML and makes no request');
    ok(/:root\[data-theme=dark\]/.test(css) && /prefers-color-scheme: dark/.test(css) && /id="theme"/.test(app), 'a light and dark theme with a switch');
  }

  return { testIssuesSiteWorker, testIssuesSiteFiles };
};
