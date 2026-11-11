'use strict';
// The staging web app on staging.playchogan.com (#762): the staging branch on its own
// origin, so new games are tried there before main. These groups prove that production's
// build is untouched, that the staging build is marked and kept out of search engines,
// that the workflow deploys each branch only where it belongs, and that a pull request
// into main cannot add a game the staging branch has not had.
module.exports = function (T) {
  const { ok, head, fs, path, vm, os, spawnSync, ROOT } = T;
  const read = (rel) => { try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch (e) { return ''; } };
  const SHA = '0123456789abcdef0123456789abcdef01234567';
  const STAMP_ENV = { GITHUB_SHA: SHA, GITHUB_RUN_ID: '987654321', GITHUB_RUN_ATTEMPT: '2', DEPLOYED_AT: '2026-11-06T18:30:00Z' };

  function cleanEnv(extra) {
    const env = Object.assign({}, process.env);
    for (const k of ['GITHUB_SHA', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'APP_ENV', 'DEPLOYED_AT', 'GITHUB_EVENT_NAME', 'GITHUB_BASE_REF', 'GATE_REMOTE']) delete env[k];
    return Object.assign(env, extra);
  }

  // Runs the stamp scripts on a copy of www/version.js, the way the jobs do
  function build(appEnv, withMarker) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chogan-staging-'));
    const file = path.join(dir, 'version.js');
    fs.writeFileSync(file, read('www/version.js'));
    const a = spawnSync('bash', [path.join(ROOT, 'tools/stamp-version.sh'), file], { env: cleanEnv(Object.assign({ APP_ENV: appEnv }, STAMP_ENV)), encoding: 'utf8' });
    let b = null;
    if (withMarker) b = spawnSync('bash', [path.join(ROOT, 'tools/stamp-staging.sh'), file], { env: cleanEnv({}), encoding: 'utf8' });
    const out = fs.readFileSync(file, 'utf8');
    fs.rmSync(dir, { recursive: true, force: true });
    return { stamp: a.status, marker: b && b.status, markerErr: b && b.stderr, out };
  }

  function fakeDocument(readyState) {
    const listeners = {};
    const body = { children: [], appendChild(el) { this.children.push(el); } };
    return {
      readyState, title: 'Chogan', body, listeners,
      addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
      getElementById(id) { return body.children.find((c) => c.id === id) || null; },
      createElement(tag) { return { tagName: tag, style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }; }
    };
  }

  function testStagingBuild() {
    head('Staging build: production unchanged, staging marked (#762)');
    const repoSrc = read('www/version.js');
    ok(repoSrc.length > 0 && repoSrc.indexOf('ch-staging') < 0, 'the repository version.js carries no staging marker');
    const marker = path.join(ROOT, 'tools/stamp-staging.sh');
    ok(fs.existsSync(marker), 'tools/stamp-staging.sh exists');

    // Production: exactly the identity block stamp-version.sh always wrote, and nothing else
    const prod = build('production', false);
    const expected = repoSrc + '\n// Deploy identity, stamped by tools/stamp-version.sh. Present only in the published build.\n' +
      "self.APP_BUILD = '0123456789ab';\nself.APP_COMMIT = '" + SHA + "';\nself.APP_ENV = 'production';\n" +
      "self.APP_DEPLOY = '987654321-2';\nself.APP_DEPLOYED_AT = '2026-11-06T18:30:00Z';\n";
    ok(prod.stamp === 0 && prod.out === expected, 'the production version.js is byte for byte what it was before staging existed');
    ok(!/STAGING|ch-staging/.test(prod.out), 'the production build has no staging marker');

    // The marker refuses a build that is not stamped for staging
    const refused = build('production', true);
    ok(refused.marker !== 0 && refused.out === expected, 'the marker refuses a production build and leaves it untouched (exit ' + refused.marker + ')');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chogan-staging-'));
    const bare = path.join(dir, 'version.js');
    fs.writeFileSync(bare, repoSrc);
    const r0 = spawnSync('bash', [marker, bare], { env: cleanEnv({}), encoding: 'utf8' });
    ok(r0.status !== 0 && fs.readFileSync(bare, 'utf8') === repoSrc, 'the marker refuses an unstamped version.js (exit ' + r0.status + ')');
    fs.rmSync(dir, { recursive: true, force: true });

    const st = build('staging', true);
    ok(st.stamp === 0 && st.marker === 0, 'the staging build stamps and marks (exits ' + st.stamp + ', ' + st.marker + ')');
    ok(st.out.indexOf(expected.replace("APP_ENV = 'production'", "APP_ENV = 'staging'")) === 0, 'staging keeps the same identity block with APP_ENV staging');

    // The service worker importScripts version.js: no document there, and it must not throw
    const sw = { self: {} };
    vm.createContext(sw);
    let swErr = null;
    try { vm.runInContext(st.out, sw); } catch (e) { swErr = e; }
    ok(!swErr && sw.self.APP_ENV === 'staging', 'the staging version.js runs in a worker without a document' + (swErr ? ': ' + swErr.message : ''));

    for (const state of ['complete', 'loading']) {
      const doc = fakeDocument(state);
      const ctx = { self: {}, document: doc };
      vm.createContext(ctx);
      let err = null;
      try {
        vm.runInContext(st.out, ctx);
        (doc.listeners.DOMContentLoaded || []).forEach((fn) => fn());
        vm.runInContext(st.out, ctx); // a second copy must not add a second label
      } catch (e) { err = e; }
      const labels = doc.body.children.filter((c) => c.id === 'ch-staging');
      ok(!err && labels.length === 1, state + ': exactly one staging label is added' + (err ? ': ' + err.message : ' (' + labels.length + ')'));
      const el = labels[0] || { style: {}, attrs: {} };
      ok(el.textContent === 'STAGING 0123456', state + ': the label names the build (' + el.textContent + ')');
      ok(/pointer-events:none/.test(el.style.cssText || '') && /position:fixed/.test(el.style.cssText || '') && el.attrs['aria-hidden'] === 'true',
        state + ': the label is fixed, hidden from screen readers and lets taps through');
      ok(doc.title === '[STAGING] Chogan', state + ': the title is prefixed once (' + doc.title + ')');
    }
  }

  function testStagingWorker() {
    head('Staging Worker serves www like Pages and says noindex (#762)');
    const cfgSrc = read('worker/staging/wrangler.jsonc');
    let cfg = null;
    try { cfg = JSON.parse(cfgSrc.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')); } catch (e) { /* asserted below */ }
    ok(!!cfg, 'worker/staging/wrangler.jsonc parses');
    cfg = cfg || {};
    const a = cfg.assets || {};
    ok(cfg.name === 'chogan-staging' && cfg.main === 'index.js', 'the Worker is chogan-staging with index.js');
    ok(path.resolve(ROOT, 'worker/staging', a.directory || '') === path.join(ROOT, 'www'), 'it serves www/, the same files Pages serves (' + a.directory + ')');
    ok(a.binding === 'ASSETS' && a.html_handling === 'none' && a.not_found_handling === 'none' && a.run_worker_first === true,
      'assets: no automatic redirects, the script runs first for every request');
    const routes = cfg.routes || [];
    ok(routes.length === 1 && routes[0].pattern === 'staging.playchogan.com' && routes[0].custom_domain === true,
      'its only route is the custom domain staging.playchogan.com');
    ok(cfg.workers_dev === false && cfg.preview_urls === false, 'no workers.dev or preview URL, so staging has one origin');
    ok(!/account_id/.test(cfgSrc), 'the account comes from the job, not the file');

    const src = read('worker/staging/index.js');
    ok(/export default \{/.test(src), 'worker/staging/index.js has a default export');
    const ctx = { Response, Request, URL, Headers, module: {} };
    vm.createContext(ctx);
    try { vm.runInContext(src.replace('export default {', 'module.exports = {'), ctx); } catch (e) { ok(false, 'the Worker loads: ' + e.message); }
    const worker = ctx.module.exports;
    ok(worker && typeof worker.fetch === 'function', 'the Worker exports fetch');
    if (!worker || typeof worker.fetch !== 'function') return;

    const files = { '/index.html': 'menu', '/version.js': 'v', '/games/sudoku/index.html': 'sudoku' };
    const asked = [];
    const env = {
      ASSETS: {
        fetch(req) {
          // Workers' Fetcher takes a Request, a URL or a string, like fetch()
          const u = new URL(typeof req === 'string' ? req : (req.url || req.href));
          asked.push(u.pathname);
          return Promise.resolve(u.pathname in files ? new Response(files[u.pathname], { status: 200 }) : new Response('nf', { status: 404 }));
        }
      }
    };
    const get = (p) => worker.fetch(new Request('https://staging.playchogan.com' + p), env);
    const cases = [
      ['/', 200, 'menu'],
      ['/index.html', 200, 'menu'],
      ['/games/sudoku/index.html', 200, 'sudoku'],
      ['/games/sudoku/', 200, 'sudoku'],
      ['/version.js?verify=1', 200, 'v'],
      ['/missing.png', 404, null],
      ['/nothing/', 404, null]
    ];
    return (async function () {
      for (const [p, status, body] of cases) {
        const res = await get(p);
        const text = await res.text();
        ok(res.status === status && (body === null || text === body), p + ' answers ' + status + (body ? ' with its file' : '') + ' (' + res.status + ')');
        ok(res.headers.get('X-Robots-Tag') === 'noindex, nofollow', p + ' carries X-Robots-Tag noindex');
      }
      // The service worker caches games/<id>/index.html; a redirect there breaks offline navigation
      ok(asked.indexOf('/games/sudoku/index.html') >= 0, 'the index.html path was asked of the assets as is');
      const dirNoSlash = await get('/games/sudoku');
      ok(dirNoSlash.status === 301 && dirNoSlash.headers.get('Location') === '/games/sudoku/', 'a folder without its slash gets a 301 to it, as on Pages (' + dirNoSlash.status + ' ' + dirNoSlash.headers.get('Location') + ')');
      const robots = await get('/robots.txt');
      ok(robots.status === 200 && (await robots.text()) === 'User-agent: *\nDisallow: /\n' && robots.headers.get('X-Robots-Tag') === 'noindex, nofollow', 'robots.txt disallows everything');
      ok(!fs.existsSync(path.join(ROOT, 'www/robots.txt')) && !fs.existsSync(path.join(ROOT, 'www/_headers')), 'www/ gains no robots.txt or _headers, so production serves what it did');
    })();
  }

  function testStagingWorkflow() {
    head('Workflow: staging deploys only the staging branch (#762)');
    const yml = read('.github/workflows/test.yml');
    const job = (name) => (yml.match(new RegExp('\\n  ' + name + ':\\n([\\s\\S]*?)(?=\\n  [a-z][a-z0-9_-]*:\\n|$)')) || [])[1] || '';
    const testJob = job('test'), pages = job('pages'), staging = job('staging');
    ok(testJob.length > 0 && pages.length > 0 && staging.length > 0, 'the test, pages and staging jobs are found');
    ok(/\n  push:\n    branches: \[main, staging\]\n/.test(yml) && /\n  pull_request:\n    branches: \[main, staging\]\n/.test(yml), 'pushes and pull requests to staging run the same tests as main');
    // Required checks on main are matched by name
    ok(/^    name: Game engines and page loads$/m.test(testJob) && /\n  android:\n    name: Android debug build\n/.test(yml), 'the required check names are unchanged');
    ok(/\n    if: github\.ref == 'refs\/heads\/main' && \(github\.event_name == 'push' \|\| github\.event_name == 'workflow_dispatch'\)\n/.test(pages),
      'Pages still deploys only main');
    ok(!/stamp-staging|wrangler|CLOUDFLARE/.test(pages), 'the Pages job knows nothing of staging');

    ok(/\n    needs: \[test, android\]\n/.test(staging), 'staging waits for the tests and the Android build');
    ok(/\n    if: github\.ref == 'refs\/heads\/staging' && \(github\.event_name == 'push' \|\| github\.event_name == 'workflow_dispatch'\)\n/.test(staging),
      'staging deploys only the staging branch, never a pull request');
    ok(/\n    environment:\n      name: staging\n/.test(staging), 'it runs in the GitHub environment staging, whose secret only that branch can use');
    const iStamp = staging.indexOf('bash tools/stamp-version.sh www/version.js');
    const iMark = staging.indexOf('bash tools/stamp-staging.sh www/version.js');
    const iDeploy = staging.indexOf('npx --yes wrangler@4.153.0 deploy --config worker/staging/wrangler.jsonc');
    const iVerify = staging.indexOf('bash tools/verify-deploy.sh');
    ok(/APP_ENV: staging\n/.test(staging) && iStamp > 0 && iMark > iStamp && iDeploy > iMark && iVerify > iDeploy,
      'stamp as staging, mark, deploy with a pinned wrangler, then verify, in that order');
    ok(/"https:\/\/staging\.playchogan\.com\/version\.js"\s+"\$GITHUB_SHA" staging "\$GITHUB_RUN_ID-\$GITHUB_RUN_ATTEMPT"/.test(staging), 'the verify step reads staging back for this commit and run');
    ok(/x-robots-tag: noindex/i.test(staging), 'the live noindex header is checked after the deploy');

    const wfDir = path.join(ROOT, '.github/workflows');
    const wfs = fs.readdirSync(wfDir).filter((f) => /\.ya?ml$/.test(f));
    ok(wfs.length > 0, 'the workflow list is not empty');
    const tokenUses = wfs.reduce((n, f) => n + (fs.readFileSync(path.join(wfDir, f), 'utf8').match(/secrets\.CLOUDFLARE_API_TOKEN/g) || []).length, 0);
    const inStaging = (staging.match(/secrets\.CLOUDFLARE_API_TOKEN/g) || []).length;
    ok(inStaging > 0 && tokenUses === inStaging, 'the Cloudflare token is used in the staging job only (' + inStaging + ' of ' + tokenUses + ')');

    const iGate = testJob.indexOf('run: bash tools/new-games-gate.sh');
    ok(iGate > 0 && iGate < testJob.indexOf('run: node tools/test.js'), 'the test job runs the new-games gate');
    ok(/fetch-depth: 0/.test(testJob), 'the test job checks out full history, so the gate can read main and staging');
  }

  // A pull request into main that adds a game must find that game on staging
  function testNewGamesGate() {
    head('New games reach main only through staging (#762)');
    const gate = path.join(ROOT, 'tools/new-games-gate.sh');
    ok(fs.existsSync(gate), 'tools/new-games-gate.sh exists');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chogan-gate-'));
    const G = ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'init.defaultBranch=main'];
    const git = (cwd, ...args) => {
      const r = spawnSync('git', G.concat(args), { cwd, encoding: 'utf8' });
      if (r.status !== 0) throw new Error('git ' + args.join(' ') + ': ' + r.stderr);
      return r.stdout;
    };
    // The real shape is { games: [...] }; a bare array here hid the gate failing on every PR (#769).
    const games = (ids) => JSON.stringify({ games: ids.map((id) => ({ id, path: 'games/' + id + '/index.html' })) }, null, 2) + '\n';
    const commit = (dir, ids, msg) => {
      fs.mkdirSync(path.join(dir, 'www'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'www/games.json'), typeof ids === 'string' ? ids : games(ids));
      git(dir, 'add', '-A');
      // staging may hold exactly what main holds
      git(dir, 'commit', '-q', '--allow-empty', '-m', msg);
    };
    // remote: main has a, b; staging (optional) has a, b plus the given ids
    function scenario(stagingIds, headIds, envExtra) {
      const id = String(Math.random()).slice(2);
      const remote = path.join(tmp, 'r' + id + '.git');
      const work = path.join(tmp, 'w' + id);
      git(tmp, 'init', '-q', '--bare', remote);
      git(tmp, 'init', '-q', work);
      commit(work, ['a', 'b'], 'main');
      git(work, 'remote', 'add', 'origin', remote);
      git(work, 'push', '-q', 'origin', 'main');
      if (stagingIds) {
        git(work, 'switch', '-q', '-c', 'staging');
        commit(work, stagingIds, 'staging');
        git(work, 'push', '-q', 'origin', 'staging');
        git(work, 'switch', '-q', 'main');
      }
      git(work, 'switch', '-q', '-c', 'pr');
      commit(work, headIds, 'pr');
      const r = spawnSync('bash', [gate], {
        cwd: work, encoding: 'utf8',
        env: cleanEnv(Object.assign({ GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: 'main', GATE_REMOTE: 'origin' }, envExtra || {}))
      });
      return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
    }
    const run = (label, fn) => {
      let res = null;
      try { res = fn(); } catch (e) { ok(false, label + ': ' + e.message); }
      return res || { status: -1, out: '' };
    };
    try {
      let r = run('new game missing', () => scenario(['a', 'b'], ['a', 'b', 'chess2']));
      ok(r.status === 1 && /chess2/.test(r.out), 'a new game that is not on staging fails the PR and is named (exit ' + r.status + ')');
      r = run('two new, one staged', () => scenario(['a', 'b', 'x'], ['a', 'b', 'x', 'y']));
      ok(r.status === 1 && /- y\b/.test(r.out) && !/- x\b/.test(r.out), 'only the game missing from staging is listed (exit ' + r.status + ')');
      r = run('new game staged', () => scenario(['a', 'b', 'chess2'], ['a', 'chess2', 'b']));
      ok(r.status === 0 && /every new game is on staging/.test(r.out), 'a new game already on staging passes (exit ' + r.status + ')');
      r = run('no staging branch', () => scenario(null, ['a', 'b', 'chess2']));
      ok(r.status === 0 && /::warning::.*no staging branch/.test(r.out), 'with no staging branch the gate passes with a warning that it is off (exit ' + r.status + ')');
      r = run('no new game', () => scenario(['a', 'b'], games(['a', 'b']).replace('games/b/', 'games/bb/')));
      ok(r.status === 0 && /no new game/.test(r.out), 'a change to an existing game passes (exit ' + r.status + ')');
      r = run('removed game', () => scenario(['a', 'b'], ['a']));
      ok(r.status === 0, 'removing a game passes (exit ' + r.status + ')');
      r = run('push event', () => scenario(['a', 'b'], ['a', 'b', 'chess2'], { GITHUB_EVENT_NAME: 'push' }));
      ok(r.status === 0 && /nothing to check/.test(r.out), 'a push is not gated (exit ' + r.status + ')');
      r = run('PR into staging', () => scenario(['a', 'b'], ['a', 'b', 'chess2'], { GITHUB_BASE_REF: 'staging' }));
      ok(r.status === 0 && /nothing to check/.test(r.out), 'a pull request into staging is not gated (exit ' + r.status + ')');
      r = run('unreachable remote', () => scenario(['a', 'b'], ['a', 'b', 'chess2'], { GATE_REMOTE: path.join(tmp, 'nowhere.git') }));
      ok(r.status === 2, 'an unreachable remote is "cannot test", exit 2 (exit ' + r.status + ')');
      r = run('broken games.json', () => scenario(['a', 'b'], '[{"id": "a"},'));
      ok(r.status === 2, 'an unreadable games.json is "cannot test", exit 2 (exit ' + r.status + ')');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  return { testStagingBuild, testStagingWorker, testStagingWorkflow, testNewGamesGate };
};
