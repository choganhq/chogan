'use strict';
// The report form at playchogan.com/report/ (#757). Players in Iran often cannot reach
// GitHub, so their reports came through Telegram and were retyped by hand (#756). The
// Worker that served only a redirect (#615) now also takes a report: files to a draft
// release in the private inbox repo, the text to a public issue. These tests run the
// Worker's own code under Node against a fake GitHub, and tools/inbox-fetch.sh against a
// fake `gh`. Nothing here reaches the network.
module.exports = function (T) {
  const { ok, head, fs, path, os, spawnSync, ROOT, LOCALE_CODES } = T;
  const DIR = path.join(ROOT, 'worker/report');
  const APP = path.join(DIR, 'src/app.js');
  const read = (rel) => { try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch (e) { return ''; } };

  const NOW = Date.parse('2026-11-10T12:00:00Z');
  const ORIGIN = 'https://playchogan.com';
  const INBOX = 'choganhq/inbox';
  const ISSUES = 'choganhq/chogan';

  // A small GitHub: releases in the inbox, issues in the public repo, every call logged.
  function fakeGitHub() {
    const st = { releases: [], issues: [], calls: [], nextId: 5000, nextIssue: 800, deleteKeeps: false };
    const res = (status, data) => new Response(data === undefined ? null : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    st.fetch = async function (url, init) {
      const u = new URL(url);
      const m = (init && init.method) || 'GET';
      const auth = init && init.headers && init.headers.Authorization;
      st.calls.push({ m, host: u.host, path: u.pathname, search: u.search, auth, headers: init && init.headers });
      if (auth !== 'Bearer test-token') return res(401, { message: 'Bad credentials' });
      let r;
      if (u.host === 'uploads.github.com' && m === 'POST' && (r = /^\/repos\/choganhq\/inbox\/releases\/(\d+)\/assets$/.exec(u.pathname))) {
        const rel = st.releases.find((x) => x.id === Number(r[1]));
        if (!rel) return res(404, {});
        const bytes = new Uint8Array(await new Response(init.body).arrayBuffer());
        const name = u.searchParams.get('name');
        if (rel.assets.some((a) => a.name === name)) return res(422, { errors: [{ code: 'already_exists' }] });
        const a = { id: st.nextId++, name, size: bytes.length, content_type: init.headers['Content-Type'], bytes };
        rel.assets.push(a);
        return res(201, { id: a.id, name });
      }
      if (u.host !== 'api.github.com') return res(404, {});
      const p = u.pathname;
      if (p === '/repos/choganhq/inbox/releases' && m === 'GET') {
        const per = Number(u.searchParams.get('per_page') || 30);
        const page = Number(u.searchParams.get('page') || 1);
        const list = st.releases.slice().sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
        return res(200, list.slice((page - 1) * per, page * per));
      }
      if (p === '/repos/choganhq/inbox/releases' && m === 'POST') {
        const b = JSON.parse(init.body);
        // Like GitHub: a draft's tag_name is a placeholder, only `name` survives.
        const rel = { id: st.nextId++, tag_name: b.draft ? 'untagged-' + String(st.nextId * 7919).padStart(8, '0') : b.tag_name, name: b.name, draft: !!b.draft, body: b.body, created_at: new Date(st.now || NOW).toISOString(), assets: [] };
        st.releases.push(rel);
        return res(201, rel);
      }
      if ((r = /^\/repos\/choganhq\/inbox\/releases\/(\d+)$/.exec(p))) {
        const i = st.releases.findIndex((x) => x.id === Number(r[1]));
        if (i < 0) return res(404, {});
        if (m === 'GET') return res(200, st.releases[i]);
        if (m === 'PATCH') { Object.assign(st.releases[i], JSON.parse(init.body)); return res(200, st.releases[i]); }
        if (m === 'DELETE') { if (!st.deleteKeeps) st.releases.splice(i, 1); return res(204); }
      }
      if (m === 'DELETE' && /^\/repos\/choganhq\/inbox\/git\/refs\/tags\//.test(p)) return res(204);
      if (p === '/repos/choganhq/chogan/issues' && m === 'POST') {
        const b = JSON.parse(init.body);
        const issue = Object.assign({ number: st.nextIssue++, html_url: 'https://github.com/choganhq/chogan/issues/' + st.nextIssue }, b);
        st.issues.push(issue);
        return res(201, issue);
      }
      return res(404, { message: 'not in the fake' });
    };
    return st;
  }

  function envFor(limiter) {
    return {
      GITHUB_TOKEN: 'test-token', INBOX_REPO: INBOX, ISSUE_REPO: ISSUES, DAILY_CAP: '30', IP_DAILY_CAP: '5',
      REPORT_LIMIT: limiter === undefined ? { limit: async () => ({ success: true }) } : limiter,
    };
  }
  const req = (p, init) => new Request(ORIGIN + p, init);
  const post = (p, body, extra) => req(p, {
    method: 'POST',
    headers: Object.assign({ Origin: ORIGIN, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.7' }, extra || {}),
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const upload = (slot, bytes, ticket, extra) => req('/report/api/file?slot=' + slot, {
    method: 'POST',
    headers: Object.assign({ Origin: ORIGIN, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/octet-stream', 'Content-Length': String(bytes.length), 'X-Report-Ticket': ticket }, extra || {}),
    body: bytes,
  });
  const PNG = () => { const b = new Uint8Array(300); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); for (let i = 8; i < b.length; i++) b[i] = i & 255; return b; };
  const MP4 = () => { const b = new Uint8Array(400); b.set([0, 0, 0, 0x18]); b.set(Buffer.from('ftypisom'), 4); return b; };
  const HTML = () => new Uint8Array(Buffer.from('<html><script>alert(1)</script></html>'));

  async function testReportFormWorker() {
    head('Report form Worker: redirect, routes, limits, escaping (#757)');
    ok(fs.existsSync(APP), 'worker/report/src/app.js exists');
    ok(fs.existsSync(path.join(DIR, 'src/form.html')) && fs.existsSync(path.join(DIR, 'src/index.js')), 'the form page and the Worker entry exist');
    let A = null;
    try { A = await import(APP); } catch (e) { ok(false, 'app.js loads under Node: ' + e.message); }
    if (!A) return;
    const html = read('worker/report/src/form.html');
    const gh = fakeGitHub();
    const W = A.makeWorker(html, { fetch: gh.fetch, now: () => gh.now || NOW });

    // The old Worker (#615): https://choganhq.github.io/chogan + path + query, 301.
    for (const [from, to] of [
      ['https://playchogan.com/', 'https://choganhq.github.io/chogan/'],
      ['https://www.playchogan.com/games/chess/?x=1&y=2', 'https://choganhq.github.io/chogan/games/chess/?x=1&y=2'],
      ['https://playchogan.com/reports', 'https://choganhq.github.io/chogan/reports'],
      ['https://playchogan.com/privacy.html', 'https://choganhq.github.io/chogan/privacy.html'],
    ]) {
      const r = await W.fetch(new Request(from), envFor());
      ok(r.status === 301 && r.headers.get('Location') === to, 'redirect kept: ' + from + ' -> ' + r.status + ' ' + r.headers.get('Location'));
    }
    const r0 = await W.fetch(req('/report?lang=en'), envFor());
    ok(r0.status === 301 && r0.headers.get('Location') === ORIGIN + '/report/?lang=en', '/report goes to /report/ and keeps the query');
    const page = await W.fetch(req('/report/'), envFor());
    const body = await page.text();
    const csp = page.headers.get('Content-Security-Policy') || '';
    ok(page.status === 200 && /text\/html/.test(page.headers.get('Content-Type')) && body === html, '/report/ serves the form page');
    ok(/default-src 'none'/.test(csp) && /connect-src 'self'/.test(csp) && /frame-ancestors 'none'/.test(csp) && !/https?:/.test(csp), 'the page has a CSP that loads nothing from elsewhere: ' + csp);
    ok(page.headers.get('X-Robots-Tag') === 'noindex' && page.headers.get('Referrer-Policy') === 'no-referrer', 'the page is noindex and sends no referrer');
    ok((await W.fetch(req('/report/', { method: 'POST' }), envFor())).status === 405, 'POST to the page is refused');
    ok((await W.fetch(req('/report/api/start'), envFor())).status === 405, 'GET on the API is refused');
    ok((await W.fetch(req('/report/nope'), envFor())).status === 404, 'unknown /report/ paths are 404, not redirected');

    // Magic bytes decide the type, never the name or the claimed type.
    const s = (a) => A.sniff(Uint8Array.from(a));
    ok((A.sniff(PNG()) || {}).ext === 'png', 'sniff: png');
    ok((s([0xff, 0xd8, 0xff, 0xe0]) || {}).ext === 'jpg', 'sniff: jpeg');
    ok((A.sniff(new Uint8Array(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))) || {}).ext === 'webp', 'sniff: webp');
    ok((A.sniff(MP4()) || {}).ext === 'mp4', 'sniff: mp4');
    ok((A.sniff(new Uint8Array(Buffer.from('\0\0\0\x14ftypqt  '))) || {}).ext === 'mov', 'sniff: mov');
    ok((s([0x1a, 0x45, 0xdf, 0xa3, 1]) || {}).ext === 'webm', 'sniff: webm');
    ok(A.sniff(HTML()) === null && A.sniff(new Uint8Array(Buffer.from('GIF89a......'))) === null && A.sniff(new Uint8Array(Buffer.from('RIFF\0\0\0\0WAVE'))) === null, 'sniff: html, gif and wav are refused');

    // Escaping: nothing the player types may render, ping, link or close the fence.
    const evil = 'hi @margani see #1 and https://evil.example <img src=x onerror=alert(1)>\n```\n# heading\n````` long‮exe.png\u0007 nim‌fasele';
    const c = A.clean(evil);
    ok(!/[‮\u0007]/.test(c) && c.includes('‌'), 'clean() drops bidi overrides and control characters, keeps ZWNJ');
    const f = A.fenced(c);
    const fence = f.split('\n')[0].replace(/text$/, '');
    ok(/^`{6,}$/.test(fence) && f.endsWith('\n' + fence) && !c.includes(fence), 'fenced() uses a fence longer than any backtick run inside (' + fence.length + ')');
    ok(A.inline('a`b\nc') === '`a b c`' && A.inline('') === '—', 'inline() strips backticks and line breaks');

    // Tickets: signed, and they expire.
    const env = envFor();
    const tk = await A.makeTicket(env, { r: 1, t: 'report-x', e: NOW / 1000 + 60, i: 1, v: 0 });
    ok((await A.readTicket(env, tk, NOW) || {}).r === 1, 'a fresh ticket reads back');
    ok(await A.readTicket(env, tk, NOW + 61000) === null, 'an expired ticket is refused');
    const [b64, sig] = tk.split('.');
    const forged = Buffer.from(JSON.stringify({ r: 2, t: 'report-x', e: NOW / 1000 + 60, i: 5, v: 1 })).toString('base64url') + '.' + sig;
    ok(await A.readTicket(env, forged, NOW) === null && await A.readTicket(env, b64 + '.' + sig.slice(0, -2) + 'AA', NOW) === null, 'a changed body or signature is refused');
    ok(await A.readTicket(Object.assign({}, env, { GITHUB_TOKEN: 'other' }), tk, NOW) === null, 'a ticket from another token is refused');

    // The honeypot: a bot is told it worked, and GitHub is never called.
    gh.calls.length = 0;
    const hp = await W.fetch(post('/report/api/start', { kind: 'bug', text: 'spam', website: 'http://spam' }), envFor());
    ok(hp.status === 200 && (await hp.json()).done === true && gh.calls.length === 0, 'a filled honeypot gets "ok" and makes no GitHub call (' + gh.calls.length + ')');

    // Same origin only.
    const good = { kind: 'bug', lang: 'en', text: evil, game: 'Chess `x`', contact: 'tg: @someone_private', website: '', files: [{ kind: 'image', size: 300 }, { kind: 'video', size: 400 }] };
    for (const [h, why] of [[{ Origin: 'https://evil.example' }, 'foreign Origin'], [{ Origin: '' }, 'no Origin'], [{ 'Sec-Fetch-Site': 'cross-site' }, 'Sec-Fetch-Site cross-site']]) {
      gh.calls.length = 0;
      const r = await W.fetch(post('/report/api/start', good, h), envFor());
      ok(r.status === 403 && gh.calls.length === 0, 'start refused with ' + why + ' (' + r.status + ')');
    }

    // Validation before any GitHub call.
    const bad = async (d, status, code, why) => {
      gh.calls.length = 0;
      const r = await W.fetch(post('/report/api/start', Object.assign({}, good, d)), envFor());
      const j = await r.json().catch(() => ({}));
      ok(r.status === status && j.error === code && gh.calls.length === 0, why + ' -> ' + r.status + ' ' + j.error);
    };
    await bad({ kind: 'other' }, 400, 'invalid', 'unknown kind');
    await bad({ text: '  ‮ ' }, 400, 'invalid', 'empty text (after cleaning)');
    await bad({ text: 'x'.repeat(A.LIMITS.text + 1) }, 400, 'too_long', 'text over ' + A.LIMITS.text + ' characters');
    ok(A.LIMITS.text === 4000 && A.LIMITS.shots === 5 && A.LIMITS.shotBytes === 5 * 1024 * 1024 && A.LIMITS.videoBytes === 25 * 1024 * 1024, 'limits: 4000 characters, 5 images of 5 MB, a 25 MB video');
    await bad({ contact: 'x'.repeat(A.LIMITS.contact + 1) }, 400, 'too_long', 'contact too long');
    await bad({ files: Array(6).fill({ kind: 'image', size: 10 }) }, 400, 'too_many', 'six images');
    await bad({ files: [{ kind: 'video', size: 10 }, { kind: 'video', size: 10 }] }, 400, 'too_many', 'two videos');
    await bad({ files: [{ kind: 'image', size: A.LIMITS.shotBytes + 1 }] }, 413, 'too_big', 'image over 5 MB');
    await bad({ files: [{ kind: 'video', size: A.LIMITS.videoBytes + 1 }] }, 413, 'too_big', 'video over 25 MB');
    await bad({ files: [{ kind: 'exe', size: 10 }] }, 400, 'invalid', 'unknown file kind');
    const big = await W.fetch(post('/report/api/start', JSON.stringify(good) + ' '.repeat(A.LIMITS.startBytes)), envFor());
    ok(big.status === 413, 'a start body over ' + A.LIMITS.startBytes + ' bytes is refused (' + big.status + ')');

    // Rate limit: the binding is asked per address; missing binding fails closed.
    let asked = null;
    const no = await W.fetch(post('/report/api/start', good), envFor({ limit: async (o) => { asked = o.key; return { success: false }; } }));
    ok(no.status === 429 && (await no.json()).error === 'rate' && asked === '203.0.113.7', 'the rate limit is asked with the client address and refuses with 429');
    const none = await W.fetch(post('/report/api/start', good), envFor(null));
    ok(none.status === 503 && (await none.json()).error === 'config', 'no rate limit binding: refused (503), not unlimited');

    // A full report.
    gh.calls.length = 0;
    const st = await W.fetch(post('/report/api/start', good), envFor());
    const sj = await st.json();
    ok(st.status === 200 && typeof sj.ticket === 'string', 'start returns a ticket (' + st.status + ')');
    const rel = gh.releases[gh.releases.length - 1] || {};
    ok(rel.draft === true && /^report-20261110-120000-[a-z0-9]+$/.test(rel.name || ''), 'a draft inbox release is created: ' + rel.name);
    ok(gh.calls.every((x) => x.auth === 'Bearer test-token') && gh.calls.some((x) => x.m === 'GET' && x.path === '/repos/choganhq/inbox/releases'), 'GitHub is called with the token, after reading the inbox for the caps');
    const parsed = A.parseRelease(rel.body);
    ok(parsed.head.kind === 'bug' && parsed.head.lang === 'en' && parsed.head.issue === 'pending' && /^[0-9a-f]{16}$/.test(parsed.head.sender), 'the release header has kind, language, pending issue and a hashed sender');
    ok(!String(rel.body).includes('203.0.113.7'), 'the client address itself is not stored');
    ok(String(rel.body).includes('tg: @someone_private'), 'the contact is kept in the private inbox release');

    const ticket = sj.ticket;
    const u1 = await W.fetch(upload('shot-1', PNG(), ticket), envFor());
    ok(u1.status === 200 && (await u1.json()).name === 'shot-1.png', 'a png uploads as shot-1.png (' + u1.status + ')');
    const a1 = rel.assets.find((a) => a.name === 'shot-1.png') || {};
    ok(a1.size === 300 && a1.content_type === 'image/png' && Buffer.from(a1.bytes || []).equals(Buffer.from(PNG())), 'every byte arrives, with the sniffed type');
    const up = gh.calls.find((x) => x.host === 'uploads.github.com') || {};
    ok(up.search === '?name=shot-1.png' && up.headers['Content-Length'] === '300', 'the upload names the asset and declares its length');
    const u2 = await W.fetch(upload('shot-1', PNG(), ticket), envFor());
    ok(u2.status === 409, 'the same slot twice is refused (' + u2.status + ')');
    const u3 = await W.fetch(upload('shot-2', PNG(), ticket), envFor());
    ok(u3.status === 400, 'a slot the ticket did not announce is refused (' + u3.status + ')');
    const u4 = await W.fetch(upload('video', HTML(), ticket), envFor());
    ok(u4.status === 415 && !rel.assets.some((a) => a.name.startsWith('video')), 'html sent as the video is refused by its bytes (' + u4.status + ')');
    const u5 = await W.fetch(upload('video', PNG(), ticket), envFor());
    ok(u5.status === 415, 'an image in the video slot is refused (' + u5.status + ')');
    const u6 = await W.fetch(upload('video', MP4(), 'x.y'), envFor());
    ok(u6.status === 403, 'a bad ticket is refused (' + u6.status + ')');
    const u7 = await W.fetch(upload('video', MP4(), ticket, { 'Content-Length': String(A.LIMITS.videoBytes + 1) }), envFor());
    ok(u7.status === 413, 'a declared length over the limit is refused before reading (' + u7.status + ')');
    const u8 = await W.fetch(upload('video', MP4(), ticket, { Origin: 'https://evil.example' }), envFor());
    ok(u8.status === 403, 'an upload from another origin is refused (' + u8.status + ')');
    const u9 = await W.fetch(upload('video', MP4(), ticket), envFor());
    ok(u9.status === 200 && rel.assets.some((a) => a.name === 'video.mp4' && a.content_type === 'video/mp4'), 'an mp4 uploads as video.mp4 (' + u9.status + ')');
    const late = A.makeWorker(html, { fetch: gh.fetch, now: () => NOW + (A.LIMITS.ticketTtl + 5) * 1000 });
    ok((await late.fetch(post('/report/api/finish', { ticket }), envFor())).status === 403, 'an expired ticket cannot finish');

    gh.calls.length = 0;
    const fin = await W.fetch(post('/report/api/finish', { ticket }), envFor());
    const fj = await fin.json();
    const issue = gh.issues[gh.issues.length - 1] || {};
    ok(fin.status === 200 && fj.issue === issue.number && fj.ok, 'finish opens an issue (#' + fj.issue + ')');
    ok(JSON.stringify(issue.labels) === '["from-form"]' && issue.title === 'Web form: bug report (' + rel.name + ')', 'the issue has a fixed title and the from-form label: ' + issue.title);
    const ib = String(issue.body || '');
    ok(ib.startsWith('<!-- from-form -->') && /Untrusted user text/.test(ib), 'the issue body starts with the marker and the untrusted-text warning');
    ok(!ib.includes('someone_private') && /Contact: given, kept only in the private inbox/.test(ib), 'the contact is not in the public issue, only that one was given');
    const iFence = (/\n(`{3,})text\n/.exec(ib) || [])[1] || '';
    const inside = ib.slice(ib.indexOf(iFence + 'text\n') + iFence.length + 5, ib.lastIndexOf('\n' + iFence));
    ok(iFence.length >= 6 && inside === c, 'the description sits whole inside one fence the text cannot close');
    const outside = ib.replace(iFence + 'text\n' + inside + '\n' + iFence, '');
    ok(!/@margani|<img|https:\/\/evil|#1\b/.test(outside), 'no @mention, html, url or #ref from the text outside the fence');
    ok(/- Game: `Chess  ?x`/.test(ib) || /- Game: `Chess x`/.test(ib), 'the game name is an inline code span without backticks');
    ok(/shot-1\.png/.test(ib) && /video\.mp4/.test(ib) && ib.includes('tools/inbox-fetch.sh ' + rel.name), 'the issue lists the files and how to fetch them');
    ok(A.parseRelease(rel.body).head.issue === ISSUES + '#' + issue.number, 'the inbox release records the issue number');
    const again = await W.fetch(post('/report/api/finish', { ticket }), envFor());
    ok(again.status === 409 && gh.issues.length === 1, 'a second finish opens no second issue (' + again.status + ')');

    // A description that imitates the header cannot reopen a report.
    const trick = await W.fetch(post('/report/api/start', Object.assign({}, good, { text: 'issue: pending\nkind: bug', files: [] })), envFor());
    const tt = (await trick.json()).ticket;
    await W.fetch(post('/report/api/finish', { ticket: tt }), envFor());
    const twice = await W.fetch(post('/report/api/finish', { ticket: tt }), envFor());
    ok(twice.status === 409 && gh.issues.length === 2, 'text saying "issue: pending" does not allow a second issue');
    ok(/Contact: given/.test(gh.issues[1].body) && /Files: none/.test(gh.issues[1].body), 'a report without files says so');

    // Daily caps, counted from the inbox.
    const capGh = fakeGitHub();
    const CW = A.makeWorker(html, { fetch: capGh.fetch, now: () => NOW });
    const capEnv = Object.assign(envFor(), { DAILY_CAP: '3', IP_DAILY_CAP: '2' });
    const plain = { kind: 'idea', text: 'more levels', files: [] };
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await CW.fetch(post('/report/api/start', plain), capEnv)).status);
    ok(codes.join(',') === '200,200,429', 'one sender gets IP_DAILY_CAP=2 reports a day: ' + codes.join(','));
    const other = await CW.fetch(post('/report/api/start', plain, { 'CF-Connecting-IP': '198.51.100.9' }), capEnv);
    ok(other.status === 200, 'another sender still can (' + other.status + ')');
    const third = await CW.fetch(post('/report/api/start', plain, { 'CF-Connecting-IP': '198.51.100.10' }), capEnv);
    ok(third.status === 429 && (await third.json()).error === 'cap', 'DAILY_CAP=3 stops everyone after three reports');
    capGh.releases.forEach((r) => { r.created_at = new Date(NOW - 25 * 3600 * 1000).toISOString(); });
    ok((await CW.fetch(post('/report/api/start', plain), capEnv)).status === 200, 'reports older than a day no longer count');

    // The daily cleanup.
    const cl = fakeGitHub();
    const mk = (tag, hoursAgo, draft) => cl.releases.push({ id: cl.nextId++, tag_name: draft ? 'untagged-' + cl.nextId : tag, name: tag, draft, body: '', created_at: new Date(NOW - hoursAgo * 3600 * 1000).toISOString(), assets: [] });
    mk('report-old-draft', 80, true); mk('report-old-pub', 100, false); mk('report-new', 10, true); mk('v1.0.0', 900, false);
    const CL = A.makeWorker(html, { fetch: cl.fetch, now: () => NOW });
    const n = await CL.scheduled({}, envFor(), null);
    ok(n === 2 && cl.releases.map((r) => r.name || r.tag_name).sort().join(',') === 'report-new,v1.0.0', 'the cron deletes report-* releases older than 3 days and nothing else (' + n + ')');
    ok(cl.calls.some((x) => x.m === 'DELETE' && x.path === '/repos/choganhq/inbox/git/refs/tags/report-old-pub') && !cl.calls.some((x) => /tags\/report-old-draft/.test(x.path)), 'a published report also loses its tag; a draft has none');
    const many = fakeGitHub();
    for (let i = 0; i < 80; i++) many.releases.push({ id: i + 1, tag_name: 'untagged-' + i, name: 'report-' + i, draft: true, body: '', created_at: new Date(NOW - 100 * 3600 * 1000).toISOString(), assets: [] });
    await A.cleanup(envFor(), many.fetch, NOW);
    ok(many.calls.length <= 45 && many.releases.length < 80, 'one cron run stays inside the subrequest budget (' + many.calls.length + ' calls, ' + (80 - many.releases.length) + ' deleted)');
  }

  function testReportFormFiles() {
    head('Report form: page, config, app link, privacy (#757)');
    const html = read('worker/report/src/form.html');
    ok(html.length > 1000, 'the form page exists');
    ok(!/<script[^>]+src=|<link[^>]+href=["']https?:|@import|url\(\s*["']?https?:/i.test(html), 'the page loads no external script, font or stylesheet');
    ok(/name="website"/.test(html) && /class="trap"/.test(html), 'the page has the hidden honeypot field');
    ok(/prefers-color-scheme: dark/.test(html) && /dir/.test(html), 'the page has a dark theme and sets the direction');
    // Every language has the same keys as English.
    const tableAt = html.indexOf('var S = {');
    const keysOf = (code) => {
      const m = new RegExp('\\n\\s*' + code + ': \\{([\\s\\S]*?)\\n\\s*\\},?\\n').exec(html.slice(tableAt));
      return m ? [...m[1].matchAll(/(?:^|[,{\s])([a-zA-Z]+): /g)].map((x) => x[1]).sort().join(',') : '';
    };
    const en = keysOf('en');
    ok(tableAt > 0 && en.split(',').length > 20, 'the page has a string table (' + en.split(',').length + ' English keys)');
    for (const code of ['fa', 'zh', 'de', 'es', 'pl']) ok(keysOf(code) === en, 'the form has every string in ' + code);

    const cfg = read('worker/report/wrangler.jsonc');
    ok(/"name": "playchogan-redirect"/.test(cfg), 'the Worker keeps the old name, so a deploy replaces the redirect');
    ok(/"playchogan\.com\/\*"/.test(cfg) && /"www\.playchogan\.com\/\*"/.test(cfg), 'same routes as the redirect');
    ok(/"crons": \["[^"]+"\]/.test(cfg) && /"REPORT_LIMIT"/.test(cfg), 'a daily cron and the rate limit binding');
    ok(!/kv_namespaces|d1_databases|r2_buckets|durable_objects/.test(cfg), 'no KV, D1, R2 or Durable Objects');
    ok(!/ghp_|github_pat_/.test(cfg + read('worker/report/src/app.js') + html), 'no token in the files');

    const menu = read('www/index.html');
    ok(/href: 'https:\/\/playchogan\.com\/report\/\?lang=' \+ C\.state\.settings\.lang/.test(menu) && /C\.t\('reportForm'\)/.test(menu), 'the profile links the form in the app\'s language');
    const core = read('www/lib/chogan.js');
    for (const k of ['reportForm', 'reportNote']) {
      const n = (core.match(new RegExp('[ ,{]' + k + ": '", 'g')) || []).length;
      ok(LOCALE_CODES.length > 0 && n === LOCALE_CODES.length, k + ' exists in all ' + LOCALE_CODES.length + ' languages (' + n + ')');
    }
    for (const page of ['www/privacy.html', 'www/privacy-plus.html']) {
      const p = read(page);
      for (const lang of ['fa', 'en']) {
        const sec = (new RegExp('<section lang="' + lang + '"[\\s\\S]*?</section>').exec(p) || [''])[0];
        ok(/playchogan\.com\/report/.test(sec) && /(hash|هش)/.test(sec) && /(three days|سه روز)/.test(sec), page + ' (' + lang + ') explains the report form, the hashed address and the three days');
        ok(!/(accounts or servers\.|حساب کاربری و سرور نداریم)/.test(sec), page + ' (' + lang + ') no longer says there is no server at all');
      }
    }
  }

  function testInboxFetch() {
    head('tools/inbox-fetch.sh downloads, then deletes and checks (#757)');
    const script = path.join(ROOT, 'tools/inbox-fetch.sh');
    ok(fs.existsSync(script), 'tools/inbox-fetch.sh exists');
    if (!fs.existsSync(script)) return;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chogan-inbox-'));
    try {
      const bin = path.join(tmp, 'bin');
      fs.mkdirSync(bin);
      // A fake `gh` that serves releases from a JSON file and logs every call.
      fs.writeFileSync(path.join(bin, 'gh'), [
        '#!/usr/bin/env node',
        "const fs = require('fs'); const f = process.env.FAKE_GH; const st = JSON.parse(fs.readFileSync(f, 'utf8'));",
        "const a = process.argv.slice(2); fs.appendFileSync(f + '.log', a.join(' ') + '\\n');",
        "let method = 'GET', raw = false, url = '';",
        "for (let i = 1; i < a.length; i++) { if (a[i] === '-X') method = a[++i]; else if (a[i] === '-H') raw = /octet/.test(a[++i]); else url = a[i]; }",
        "const save = () => fs.writeFileSync(f, JSON.stringify(st));",
        "let m;",
        "if (method === 'GET' && /^repos\\/[^/]+\\/[^/]+\\/releases\\?/.test(url)) { process.stdout.write(JSON.stringify(st.releases)); process.exit(0); }",
        "if ((m = /releases\\/assets\\/(\\d+)$/.exec(url))) { for (const r of st.releases) for (const x of r.assets) if (x.id == m[1]) { process.stdout.write(Buffer.from(x.data, 'base64')); process.exit(0); } process.exit(1); }",
        "if ((m = /releases\\/(\\d+)$/.exec(url))) { const i = st.releases.findIndex((r) => r.id == m[1]); if (i < 0) { process.stderr.write('HTTP 404\\n'); process.exit(1); }",
        "  if (method === 'DELETE') { if (!st.keep) st.releases.splice(i, 1); save(); process.exit(0); }",
        "  const r = Object.assign({}, st.releases[i], { assets: st.releases[i].assets.map((x) => ({ id: x.id, name: x.name, size: x.size })) }); process.stdout.write(JSON.stringify(r)); process.exit(0); }",
        "if (method === 'DELETE' && /git\\/refs\\/tags\\//.test(url)) process.exit(0);",
        "process.stderr.write('fake gh: no route ' + url + '\\n'); process.exit(1);",
      ].join('\n'));
      fs.chmodSync(path.join(bin, 'gh'), 0o755);
      const png = Buffer.from(PNG());
      const state = (extra) => Object.assign({ releases: [
        { id: 77, tag_name: 'untagged-0c8f857f', name: 'report-20261110-120000-abcd', draft: true, body: 'Report from the web form (#757).\nkind: bug\n\nContact (untrusted text): `x`',
          assets: [{ id: 901, name: 'shot-1.png', size: png.length, data: png.toString('base64') }, { id: 902, name: 'video.mp4', size: 4, data: Buffer.from('abcd').toString('base64') }] },
        { id: 78, tag_name: 'v0.28.0', name: 'v0.28.0', draft: false, body: 'not a report', assets: [] },
      ] }, extra || {});
      const run = (name, args, st) => {
        const f = path.join(tmp, name + '.json');
        fs.writeFileSync(f, JSON.stringify(st));
        const r = spawnSync('bash', [script].concat(args), { encoding: 'utf8', env: Object.assign({}, process.env, { PATH: bin + ':' + process.env.PATH, FAKE_GH: f }) });
        const log = fs.existsSync(f + '.log') ? fs.readFileSync(f + '.log', 'utf8') : '';
        return { status: r.status, out: (r.stdout || '') + (r.stderr || ''), state: JSON.parse(fs.readFileSync(f, 'utf8')), log };
      };

      const full = path.join(tmp, 'full'); fs.mkdirSync(full); fs.writeFileSync(path.join(full, 'x'), '1');
      const r1 = run('a', ['--delete', '77', full], state());
      ok(r1.status === 2 && r1.log === '' && r1.state.releases.length === 2, 'a non-empty directory: exit 2, nothing asked or deleted (' + r1.status + ')');

      const r2 = run('b', ['78', path.join(tmp, 'b')], state());
      ok(r2.status === 2 && /not a form report/.test(r2.out), 'a release that is not a report is refused (' + r2.status + ')');

      const d3 = path.join(tmp, 'c');
      const r3 = run('c', ['report-20261110-120000-abcd', d3], state());
      ok(r3.status === 0 && r3.state.releases.length === 2, 'fetch by tag without --delete keeps the release (' + r3.status + ')');
      ok(fs.existsSync(path.join(d3, 'shot-1.png')) && fs.readFileSync(path.join(d3, 'shot-1.png')).equals(png) && fs.readFileSync(path.join(d3, 'video.mp4'), 'utf8') === 'abcd', 'every file arrives byte for byte');
      ok(/kind: bug/.test(fs.existsSync(path.join(d3, 'report.md')) ? fs.readFileSync(path.join(d3, 'report.md'), 'utf8') : ''), 'report.md holds the release text');

      const r4 = run('d', ['--delete', '77', path.join(tmp, 'd')], state());
      ok(r4.status === 0 && !r4.state.releases.some((r) => r.id === 77) && /checked gone/.test(r4.out), '--delete removes the release and reads it back (' + r4.status + ')');
      ok(/-X DELETE repos\/choganhq\/inbox\/releases\/77/.test(r4.log) && !/refs\/tags/.test(r4.log), 'a draft is deleted without a tag call');

      const r5 = run('e', ['--delete', '77', path.join(tmp, 'e')], state({ keep: true }));
      ok(r5.status === 1 && /still there/.test(r5.out), 'a delete that did not happen fails (' + r5.status + ')');

      const broken = state(); broken.releases[0].assets[1].size = 99;
      const r6 = run('f', ['--delete', '77', path.join(tmp, 'f')], broken);
      ok(r6.status === 1 && r6.state.releases.some((r) => r.id === 77) && !/DELETE/.test(r6.log), 'a short download deletes nothing (' + r6.status + ')');

      const odd = state(); odd.releases[0].assets[0].name = '../escape.png';
      const r7 = run('g', ['77', path.join(tmp, 'g')], odd);
      ok(r7.status === 1 && !fs.existsSync(path.join(tmp, 'escape.png')), 'an asset name with a path is not written (' + r7.status + ')');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  return { testReportFormWorker, testReportFormFiles, testInboxFetch };
};
