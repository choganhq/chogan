'use strict';
// #1205 (after #1129): in the Android app the page stopped at the status bar, and in
// fullscreen at the camera strip, which only showed the app's colour. Capacitor 8.6.0's
// SystemBars pads the whole decor view by the bars and the cutout unless the WebView is 140
// or newer, and Android 14 and older lay the window out below the status bar anyway. Now the
// app draws under the bars and the cutout on every version, hands the insets to the page as
// --ch-inset-*, and chogan.css folds them into --safe-*. The Java side builds only in CI, so
// its source is checked here; early.js runs for real against a fake bridge.
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT } = T;
  const read = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };

  function testEdgeToEdgeAndroid() {
    head('Android app: edge to edge under the bars and the camera (#1205)');
    const dir = 'android/app/src/main/java/io/github/choganhq/chogan/';
    const bars = read(dir + 'BarsBridge.java'), main = read(dir + 'MainActivity.java');
    ok(bars.length > 0 && main.length > 0, 'BarsBridge.java and MainActivity.java found');
    let cfg = {};
    try { cfg = JSON.parse(read('capacitor.config.json')); } catch (e) { cfg = {}; }
    ok(((cfg.plugins || {}).SystemBars || {}).insetsHandling === 'disable',
      'Capacitor\'s SystemBars does not pad the WebView by the bars (insetsHandling "disable")');
    const inst = (bars.match(/void install\(WebView webView\) \{[\s\S]*?\n {4}\}\n/) || [''])[0];
    ok(inst.length > 0, 'BarsBridge has install(WebView)');
    ok(/WindowCompat\.setDecorFitsSystemWindows\(window, false\);/.test(inst), 'the window is laid out under the bars on Android 14 and older too');
    ok(/layoutInDisplayCutoutMode = WindowManager\.LayoutParams\.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;/.test(inst), 'and under the camera cutout, bars shown or hidden');
    ok(/ViewCompat\.setOnApplyWindowInsetsListener\(decor,/.test(inst) &&
      /v\.setPadding\(0, 0, 0, keyboard \? all\.getInsets\(WindowInsetsCompat\.Type\.ime\(\)\)\.bottom : 0\);/.test(inst),
      'the decor view is padded only for the keyboard, never for the bars or the camera');
    ok(/WindowInsetsCompat\.Type\.systemBars\(\) \| WindowInsetsCompat\.Type\.displayCutout\(\)/.test(inst) &&
      /setInsets\(types, Insets\.of\(0, 0, 0, 0\)\)/.test(inst) && !/return WindowInsetsCompat\.CONSUMED/.test(inst),
      'the WebView sees zero insets (the page pads itself), zeroed rather than consumed');
    ok(/Math\.ceil\(bars\.top \/ density\)/.test(inst) && /keyboard \? 0 : \(int\) Math\.ceil\(bars\.bottom \/ density\)/.test(inst),
      'the insets go to the page in CSS pixels, rounded up, with no bottom inset under the keyboard');
    ok(/classList\.add\('ch-edge'\)/.test(inst) && ['t', 'r', 'b', 'l'].every((k) => inst.indexOf("--ch-inset-" + k) > 0),
      'a change of insets is pushed to the open page as --ch-inset-t/r/b/l');
    ok(/@JavascriptInterface\s+public String insets\(\)/.test(bars), 'each new page can read the insets (ChoganBars.insets())');
    ok(/window\.setStatusBarColor\(Color\.TRANSPARENT\);/.test(bars) && /setStatusBarContrastEnforced\(false\)/.test(bars),
      'Android 14 and older do not paint over the page under the status bar');
    ok(/setNavigationBarColor\(Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.O \? Color\.TRANSPARENT : bg\)/.test(bars),
      'the navigation bar is see-through where its buttons can turn dark (Android 8+)');
    ok(/setAppearanceLightStatusBars\(!d\)/.test(bars), 'the status icons still follow the page\'s light or dark theme');
    ok(/addJavascriptInterface\(bars, "ChoganBars"\);[\s\S]{0,200}bars\.install\(getBridge\(\)\.getWebView\(\)\);/.test(main),
      'MainActivity installs it right after registering the bridge');
  }

  function testEdgeToEdgePage() {
    head('Pages take the app\'s insets before the first paint; the web is unchanged (#1205)');
    const early = read('www/lib/early.js');
    ok(early.length > 0, 'early.js found');
    const run = (bridge) => {
      const props = {}, classes = [];
      const sb = {
        localStorage: { getItem: () => null },
        document: { documentElement: { setAttribute() {}, removeAttribute() {},
          classList: { add: (c) => classes.push(c) }, style: { setProperty: (k, v) => { props[k] = v; } } } }
      };
      if (bridge) sb.ChoganBars = bridge;
      vm.createContext(sb);
      try { vm.runInContext(early, sb); } catch (e) { return { threw: e.message, props, classes }; }
      return { props, classes };
    };
    const app = run({ insets: () => '31 0 48 0' });
    ok(!app.threw && app.classes.join() === 'ch-edge', 'in the app the page is marked edge to edge');
    ok(app.props['--ch-inset-t'] === '31px' && app.props['--ch-inset-r'] === '0px' && app.props['--ch-inset-b'] === '48px' && app.props['--ch-inset-l'] === '0px',
      'and gets the four insets in pixels (' + JSON.stringify(app.props) + ')');
    const web = run(null);
    ok(!web.threw && !web.classes.length && !Object.keys(web.props).length, 'on the web (no bridge) nothing is set');
    const old = run({ setDark() {} });
    ok(!old.threw && !old.classes.length, 'an older APK without insets() keeps its padded WebView and no mark');
    const bad = ['', '1 2 3', 'a b c d', '1 2 3 4 5', '1;x 2 3 4', '-1 0 0 0'].map((s) => run({ insets: () => s }));
    ok(bad.every((r) => !r.threw && !r.classes.length && !Object.keys(r.props).length), 'a malformed answer sets nothing (' + bad.length + ' cases)');
    const thr = run({ insets: () => { throw new Error('gone'); } });
    ok(!thr.threw && !thr.classes.length, 'a bridge that throws breaks nothing');

    const css = read('www/lib/chogan.css');
    const sides = { t: 'top', r: 'right', b: 'bottom', l: 'left' };
    ok(Object.keys(sides).every((k) => css.indexOf('--safe-' + k + ': max(env(safe-area-inset-' + sides[k] + ', 0px), var(--ch-inset-' + k + ', 0px));') > 0),
      'each --safe-* is the larger of the browser\'s env() and the app\'s inset (0 on the web)');
    // every other use of env(safe-area-inset-*) would miss the app's insets
    const envUses = (css.match(/[^\n]*env\(safe-area-inset-[^\n]*/g) || []);
    // (the desktop window-controls-overlay rule, var(--tb-h), never meets the Android app)
    const stray = envUses.filter((l) => !/var\(--ch-inset-[trbl], 0px\)/.test(l) && !/var\(--tb-h\)/.test(l));
    ok(envUses.length >= 4 && !stray.length, 'chogan.css reads env(safe-area-inset-*) only beside the app\'s inset (' + envUses.length + ' uses' + (stray.length ? '; stray: ' + stray.join(' | ') : '') + ')');
    let pages = [];
    const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).forEach((e) => {
      const p = d + '/' + e.name;
      if (e.isDirectory()) walk(p); else if (/\.(html|css|js)$/.test(e.name) && p !== 'www/lib/chogan.css') pages.push(p);
    });
    walk('www');
    const direct = pages.filter((p) => /env\(safe-area-inset/.test(read(p)));
    ok(pages.length > 100 && !direct.length, 'no page or game reads env(safe-area-inset-*) itself, so all of them get the app\'s insets through --safe-* (' + pages.length + ' files' + (direct.length ? '; direct: ' + direct.join(', ') : '') + ')');
    const scrim = (css.match(/html\.ch-edge body:not\(\.ch-noscroll\)::after \{[\s\S]*?\n\}/) || [''])[0];
    ok(/position: fixed;/.test(scrim) && /pointer-events: none;/.test(scrim) && /z-index: 35;/.test(scrim) &&
      /top \/ 100% var\(--ch-inset-t, 0px\)/.test(scrim) && /bottom \/ 100% var\(--ch-inset-b, 0px\)/.test(scrim),
      'scrolling pages lay a see-through strip of the page colour under the status and navigation bars, in the app only, below the bottom bar (40)');
    const scripts = ['www/index.html', 'www/privacy.html'].map(read);
    ok(scripts.every((h) => h.indexOf('lib/early.js') > 0 && h.indexOf('lib/early.js') < h.indexOf('<body')), 'the menu and the privacy page load early.js in their head');
  }
  return { testEdgeToEdgeAndroid, testEdgeToEdgePage };
};
