'use strict';
// #715: the fullscreen button was missing in the Android app, because its WebView has no
// Fullscreen API. The app's ChoganBars bridge now hides the system bars (immersive mode),
// and Chogan.fullscreen drives it there. The Java side builds only in CI, so its source is
// checked here; the JavaScript side runs for real against a fake bridge.
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT } = T;
  function testAndroidFullscreen() {
    head('Android app: fullscreen through the immersive bridge');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const objAt = core.indexOf('  Chogan.fullscreen = {');
    const objEnd = core.indexOf('\n  };\n', objAt);
    ok(objAt > 0 && objEnd > objAt, 'chogan.js has Chogan.fullscreen to test');
    if (objAt > 0 && objEnd > objAt) {
      const run = (bridge) => {
        const events = [];
        let requested = 0;
        const document = {
          fullscreenElement: null, fullscreenEnabled: false,
          documentElement: { requestFullscreen() { requested++; return Promise.resolve(); } },
          dispatchEvent(e) { events.push(e.type); },
        };
        const g = { Capacitor: {}, matchMedia: () => ({ matches: false }) };
        if (bridge) g.ChoganBars = bridge;
        const sb = { global: g, document, Chogan: {}, Promise, Event: function (t) { this.type = t; } };
        vm.runInNewContext(core.slice(objAt, objEnd + 5), sb);
        return { F: sb.Chogan.fullscreen, events, requested: () => requested };
      };
      let state = false;
      const calls = [];
      const bridge = { setImmersive(v) { calls.push(v); state = v; }, isImmersive() { return state; } };
      const r = run(bridge);
      ok(r.F.available() === true, 'with the bridge the app offers fullscreen');
      ok(r.F.on() === false, 'it starts with the bars shown');
      r.F.toggle();
      ok(calls.join() === 'true' && r.F.on() === true, 'a tap asks the app to hide the bars, and on() reads it back from the app');
      ok(r.events.join() === 'fullscreenchange', 'the button hears the change (it listens to fullscreenchange)');
      r.F.toggle();
      ok(calls.join() === 'true,false' && r.F.on() === false, 'a second tap shows the bars again');
      ok(r.requested() === 0, 'the browser Fullscreen API is not touched in the app');
      const old = run({ setDark() {} });
      ok(old.F.available() === false, 'an older APK without setImmersive keeps no button');
    }
    // the carry-over across pages (#370) is for browsers; the app keeps the mode itself
    ok(/if \(!Chogan\.fullscreen\.available\(\) \|\| Chogan\.fullscreen\.native\(\)\) return;/.test(core), 'the browser carry-over skips the app');

    const dir = path.join(ROOT, 'android/app/src/main/java/io/github/choganhq/chogan');
    const bars = fs.readFileSync(path.join(dir, 'BarsBridge.java'), 'utf8');
    const main = fs.readFileSync(path.join(dir, 'MainActivity.java'), 'utf8');
    ok(/@JavascriptInterface\s+public void setImmersive\(boolean on\)/.test(bars) && /@JavascriptInterface\s+public boolean isImmersive\(\)/.test(bars), 'BarsBridge exposes setImmersive and isImmersive to the page');
    ok(/bars\.hide\(WindowInsetsCompat\.Type\.systemBars\(\)\)/.test(bars) && /BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE/.test(bars) && /bars\.show\(WindowInsetsCompat\.Type\.systemBars\(\)\)/.test(bars), 'immersive hides both system bars, a swipe shows them for a moment, and leaving shows them again');
    ok(/runOnUiThread\(this::applyImmersive\)/.test(bars), 'the bars are changed on the UI thread (JavaScript calls arrive on another one)');
    ok(/void reapply\(\) \{[^}]*if \(immersive\) applyImmersive\(\);/.test(bars), 'a configuration change keeps fullscreen');
    ok(/public void onWindowFocusChanged\(boolean hasFocus\) \{\s*super\.onWindowFocusChanged\(hasFocus\);[\s\S]{0,200}if \(hasFocus && bars != null\) bars\.reapply\(\);/.test(main), 'coming back to the app hides the bars again');
  }
  return { testAndroidFullscreen };
};
