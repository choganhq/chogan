'use strict';
// #788: a player on an old iPad behind a restricted network could not tell "no update",
// "the check failed" and "stuck on an old build" apart, because the automatic update
// check is silent. The Profile now shows the result of the same check and a button that
// runs it again. Chogan.updates runs here for real against a fake service worker
// registration; the Profile's row is read from its source.
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT, LOCALE_CODES } = T;
  function testUpdateStatus() {
    head('Profile: update status and a check button (#788)');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const at = core.indexOf('  Chogan.updates = {');
    const end = core.indexOf('\n  };\n', at);
    ok(at > 0 && end > at, 'chogan.js has Chogan.updates to test');
    if (!(at > 0 && end > at)) return;
    const src = core.slice(at, end + 5);

    // A fake registration: update() resolves, rejects (no network) or finds a new worker
    // that installs after a moment, as Chrome does.
    function worker(state) {
      const w = { state, ls: [], posted: [], addEventListener(t, f) { if (t === 'statechange') this.ls.push(f); }, postMessage(m) { this.posted.push(m); } };
      w.go = function (s) { w.state = s; w.ls.forEach((f) => f()); };
      return w;
    }
    function make(opts) {
      const sb = { Chogan: {}, Promise, setTimeout, clearTimeout };
      vm.runInNewContext(src, sb);
      const U = sb.Chogan.updates;
      const reg = { waiting: null, installing: null, calls: 0 };
      reg.update = function () {
        reg.calls++;
        const o = opts.next ? opts.next() : 'same';
        if (o === 'offline') return Promise.reject(new TypeError('Failed to update a ServiceWorker: network error'));
        if (o === 'new') {
          const w = worker('installing');
          reg.installing = w;
          setTimeout(() => { reg.installing = null; reg.waiting = w; w.go('installed'); }, 5);
        }
        return Promise.resolve(reg);
      };
      const found = [], applied = [];
      U.supported = true;
      U.sw = { controller: opts.controller === false ? null : {} };
      U.onFound = (w) => found.push(w);
      U.onApply = (w) => applied.push(w);
      U.ready = Promise.resolve(reg);
      return { U, reg, found, applied };
    }

    return (async () => {
      // 1. the check cannot reach the server; the button can try again, and then it works
      let seq = ['offline', 'offline', 'same'];
      let r = make({ next: () => seq.shift() });
      const a1 = await r.U.check();
      const a2 = await r.U.check();
      const a3 = await r.U.check();
      ok(a1 === 'failed' && a2 === 'failed' && a3 === 'latest' && r.reg.calls === 3, 'no connection reads "failed", and tapping again checks again (' + [a1, a2, a3].join(', ') + '; ' + r.reg.calls + ' checks)');
      ok(!r.found.length, 'no update bar after a failed or empty check');

      // 2. a new version: the check waits for it to install, then offers it once
      seq = ['new'];
      r = make({ next: () => seq.shift() });
      const b1 = await r.U.check();
      ok(b1 === 'new' && r.found.length === 1 && r.U.worker === r.reg.waiting, 'a new version reads "new" once it has installed, and the update bar is offered (' + b1 + ')');
      const b2 = await r.U.check();
      ok(b2 === 'new' && r.reg.calls === 1, 'a second tap still says "new" without asking the server again');
      r.U.apply();
      ok(r.applied.length === 1 && r.applied[0] === r.U.worker, 'the Update button hands the waiting version to the same action as the update bar');

      // 3. an update that is thrown away while installing is a failed check, not "latest"
      r = make({ next: () => 'same' });
      const bad = worker('installing');
      r.reg.update = function () { r.reg.calls++; r.reg.installing = bad; setTimeout(() => bad.go('redundant'), 5); return Promise.resolve(r.reg); };
      const c1 = await r.U.check();
      ok(c1 === 'failed' && !r.found.length, 'a version that fails to install reads "failed" (' + c1 + ')');

      // 3b. #826: a registration whose update() never settles must not leave the button stuck
      r = make({ next: () => 'same' });
      r.reg.update = function () { r.reg.calls++; return new Promise(function () {}); };
      r.U.updateLimitMs = 40;
      const t0 = Date.now();
      // the race makes a regression fail loudly: a check that hangs would end the run silently
      const h1 = await Promise.race([r.U.check(), new Promise((res) => setTimeout(() => res('hung'), 1500))]);
      ok(h1 === 'failed' && Date.now() - t0 < 1500, 'a check that never answers ends as "failed" at its limit instead of hanging (' + h1 + ', ' + (Date.now() - t0) + ' ms)');
      // 3c. #826: an update that installs after the old 30 s limit is still "new"
      seq = ['new'];
      r = make({ next: () => seq.shift() });
      const slow = worker('installing');
      r.reg.update = function () { r.reg.calls++; r.reg.installing = slow; setTimeout(() => { r.reg.installing = null; r.reg.waiting = slow; slow.go('installed'); }, 120); return Promise.resolve(r.reg); };
      r.U.installLimitMs = 600;
      const s1 = await r.U.check();
      ok(s1 === 'new' && r.found.length === 1, 'a slow download that finishes inside the limit reads "new" (' + s1 + ')');
      // 3d. #826: still installing at the limit is "downloading", not "failed", and it is offered when it ends
      r = make({ next: () => 'same' });
      const crawl = worker('installing');
      r.reg.update = function () { r.reg.calls++; r.reg.installing = crawl; return Promise.resolve(r.reg); };
      r.U.installLimitMs = 40;
      const s2 = await r.U.check();
      ok(s2 === 'downloading' && !r.found.length, 'a download still running at the limit reads "downloading" (' + s2 + ')');
      ok(/updateLimitMs: 20000, installLimitMs: 120000/.test(core), 'the real limits are 20 s for the question and 2 min for the download');

      // 4. the first install of the app (no page in control yet) is not an update
      seq = ['new'];
      r = make({ next: () => seq.shift(), controller: false });
      const d1 = await r.U.check();
      ok(d1 === 'latest' && !r.found.length, 'the first install is not offered as an update (' + d1 + ')');

      // 5. no service worker at all (the Android app, or a browser without one)
      const sb = { Chogan: {}, Promise, setTimeout, clearTimeout };
      vm.runInNewContext(src, sb);
      ok(sb.Chogan.updates.supported === false && (await sb.Chogan.updates.check()) === 'failed', 'without a registration the core says "not supported" and never claims to be current');

      // the page side: the registration feeds the same object, so the automatic check and the button agree
      ok(/U\.supported = true; U\.sw = sw; U\.onFound = offer; U\.onApply = apply;/.test(core) && /regOk\(reg\);/.test(core) && /catch\(function \(e\) \{ regFail\(e\);/.test(core), 'the service worker registration is shared with the check');
      ok(/if \(w\.state === 'installed'\) U\.found\(w\);/.test(core), 'an update the automatic check finds is recorded for the Profile too');

      const page = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
      const fn = (page.match(/function updateRow\(\) \{[\s\S]*?\n {2}\}\n/) || [''])[0];
      ok(fn.length > 0 && /updateRow\(\),/.test(page), 'the Profile has an update row under the version');
      ok(/if \(!U \|\| !U\.supported\) return null;/.test(fn), 'the row is left out where there is no service worker (the Android app)');
      ok(/check\.disabled = false; check\.textContent = C\.t\('updCheck'\);/.test(fn) && !/check\.hidden/.test(fn), 'the check button comes back after every result and is never hidden');
      ok(/U\.check\(\)\.then\(show, function \(\) \{ show\('failed'\); \}\)/.test(fn) && /r === 'downloading' \? C\.t\('updDownloading'\)/.test(fn), 'every outcome of the check is shown, a download still running too');
      ok(/show\(U\.worker \? 'new' : null\);/.test(fn), 'an update already found shows when the Profile opens');
      for (const k of ['updRow', 'updCheck', 'updChecking', 'updLatest', 'updNew', 'updFailed', 'updDownloading']) {
        const n = (core.match(new RegExp('[ ,{]' + k + ": '", 'g')) || []).length;
        ok(LOCALE_CODES.length > 0 && n === LOCALE_CODES.length, k + ' in all ' + LOCALE_CODES.length + ' languages (' + n + ')');
        ok(new RegExp("C\\.t\\('" + k + "'\\)").test(fn) || k === 'updRow' && /C\.t\('updRow'\)/.test(fn), k + ' is used by its literal key');
      }
    })();
  }
  return { testUpdateStatus };
};
