'use strict';
// #1137: a puzzle that takes a minute to think over let the phone dim and lock. A game page now
// asks the browser (Screen Wake Lock) or the Android bridge (FLAG_KEEP_SCREEN_ON) to keep the
// screen on, the menu does not, and a profile switch turns it off.
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT, LOCALE_CODES } = T;
  function testKeepAwake() {
    head('Keep the screen on while a game is open (#1137)');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const menu = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
    const java = fs.readFileSync(path.join(ROOT, 'android/app/src/main/java/io/github/choganhq/chogan/BarsBridge.java'), 'utf8');
    ok((core.match(/keepAwake: '[^']+'/g) || []).length === LOCALE_CODES.length, 'the switch has a label in every language');
    ok(/Chogan\.recent\.touch\(cfg\.id\);\s*Chogan\.keepAwake\.hold\(\);/.test(core), 'a game page holds the screen on');
    ok(/C\.keepAwake\.release\(\);/.test(menu) && /C\.keepAwake\.refresh\(\)/.test(menu), 'the menu releases it, and the profile switch applies at once');
    ok(/setKeepAwake\(boolean on\)/.test(java) && /FLAG_KEEP_SCREEN_ON/.test(java) && /clearFlags\(WindowManager\.LayoutParams\.FLAG_KEEP_SCREEN_ON\)/.test(java), 'the Android bridge sets and clears FLAG_KEEP_SCREEN_ON');
    ok(!/KEEP_SCREEN|WAKE_LOCK/.test(fs.readFileSync(path.join(ROOT, 'android/app/src/main/AndroidManifest.xml'), 'utf8')), 'no permission is added (the window flag needs none)');

    const at = core.indexOf('  Chogan.keepAwake = (function');
    const end = core.indexOf('\n  })();\n', at);
    ok(at > 0 && end > at, 'chogan.js has Chogan.keepAwake to run');
    if (!(at > 0 && end > at)) return;
    const src = core.slice(at, end + 9);
    const run = (settings, hasNative, hasLock) => {
      const log = { requests: 0, released: 0, native: [] };
      const listeners = {};
      const doc = { hidden: false, addEventListener: (n, f) => { listeners[n] = f; } };
      const nav = hasLock ? { wakeLock: { request: () => { log.requests++; return Promise.resolve({ addEventListener() {}, release() { log.released++; } }); } } } : {};
      const g = { navigator: nav, ChoganBars: hasNative ? { setKeepAwake: (v) => log.native.push(v) } : {} };
      const ctx = { Chogan: {}, state: { settings }, global: g, document: doc };
      vm.createContext(ctx);
      vm.runInContext(src, ctx);
      return { K: ctx.Chogan.keepAwake, log, doc, listeners };
    };
    const tick = () => new Promise((r) => setTimeout(r, 0));
    return (async () => {
      let r = run({ keepAwake: true }, true, true);
      r.K.hold(); await tick();
      ok(r.log.requests === 1 && r.log.native.join() === 'true' && r.K.active(), 'holding asks the browser and the app for a lit screen');
      r.K.release(); await tick();
      ok(r.log.native.join() === 'true,false' && r.log.released === 1 && !r.K.active(), 'releasing gives both back');
      r = run({ keepAwake: false }, true, true);
      r.K.hold(); await tick();
      ok(r.log.requests === 0 && r.log.native.join() === 'false' && !r.K.active(), 'with the switch off nothing is held');
      r = run({}, false, false);
      r.K.hold(); await tick();
      ok(r.K.active() && r.log.requests === 0, 'a browser without Wake Lock and an older app do not throw (default is on)');
      r = run({ keepAwake: true }, false, true);
      r.K.hold(); await tick(); r.doc.hidden = true; r.listeners.visibilitychange(); r.doc.hidden = false; r.listeners.visibilitychange(); await tick();
      ok(r.log.requests >= 1, 'coming back to the tab asks again');
    })();
  }
  return { testKeepAwake };
};
