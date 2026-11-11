'use strict';
// #790: on Android 8.1 every board was tiny or pushed to one side. Its WebView, if never
// updated, predates Chrome 87 and drops the inset shorthand (MDN: inset, inset-inline and
// inset-block from Chrome 87), so the fixed game root had no edges, shrank to its
// content, and the fallback of #611 measured that sliver. It also predates aspect-ratio
// (Chrome 88), which is all that gave Chess and Sudoku boards a height.
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT } = T;

  function testOldWebView() {
    head('Boards on WebViews older than Chrome 88 (#790)');

    // 1. No inset shorthand anywhere the app's CSS lives: the core and every page's
    // own <style> and inline styles. inset-inline-start/-end are not covered here.
    const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
    const shorthand = /(^|[\s;{"'])(inset|inset-inline|inset-block)\s*:/m;
    ok(shorthand.test('a { position: fixed; inset: 0; }') && shorthand.test("style: 'inset-inline: 0'") &&
      !shorthand.test('--sh-inset: inset 0 1px 0 #fff; box-shadow: var(--sh-inset); inset-inline-start: 0;'),
      'the detector finds the shorthand and leaves box-shadow insets and the start/end longhands alone');
    const files = ['www/lib/chogan.css', 'www/index.html'];
    for (const g of T.games()) files.push('www/games/' + g.id + '/index.html');
    const bad = [];
    let read = 0;
    for (const f of files) {
      const p = path.join(ROOT, f);
      if (!fs.existsSync(p)) { bad.push(f + ' (missing)'); continue; }
      read++;
      const lines = strip(fs.readFileSync(p, 'utf8')).split('\n');
      lines.forEach((l, i) => { if (shorthand.test(l)) bad.push(f + ':' + (i + 1) + ' ' + l.trim().slice(0, 60)); });
    }
    ok(T.games().length >= 30 && read === files.length, 'the core, the menu and every game page were read (' + read + ' of ' + files.length + ')');
    ok(bad.length === 0, 'no page uses the inset shorthand; top/right/bottom/left give the same box everywhere (' + (bad.slice(0, 6).join(' | ') || 'none') + (bad.length > 6 ? ' … ' + bad.length + ' in all' : '') + ')');
    const css = strip(fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8'));
    const root = (css.match(/\.ch-gameroot \{[^}]*\}/) || [''])[0];
    ok(/position: fixed;/.test(root) && /top: 0; right: 0; bottom: 0; left: 0;/.test(root),
      'the game root is pinned to all four edges with properties every WebView knows');

    // 2. The fallback of #611, run for real on fake boxes: a 366 px square slot holding a
    // board whose height came only from aspect-ratio.
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const at = core.indexOf('  ui.hasContainerQueries = function');
    const end = core.indexOf('\n  Chogan.ui = ui;', at);
    ok(at > 0 && end > at, 'chogan.js has ui.fitFallback to run');
    function run(aspect) {
      const kid = { style: {} };
      const fit = { clientWidth: 366, clientHeight: 366, style: {}, firstElementChild: kid,
        parentNode: { classList: { contains: () => false } } };
      const main = { isConnected: true, clientWidth: 390, clientHeight: 700, classList: { toggle() {} },
        querySelectorAll: (s) => (s === '.ch-fit' ? [fit] : []) };
      const CSS = { supports: (p, v) => (p === 'aspect-ratio' ? aspect : !/cq/.test(String(v))) };
      const sb = {
        ui: {}, CSS,
        window: { CSS, addEventListener() {} },
        document: { documentElement: { classList: { add() {} } } },
        getComputedStyle: () => ({ paddingLeft: '0', paddingRight: '0', paddingTop: '0', paddingBottom: '0', columnGap: '12px', getPropertyValue: () => '1' }),
      };
      vm.runInNewContext(core.slice(at, end), sb);
      sb.ui.fitFallback(main);
      return kid.style;
    }
    if (at > 0 && end > at) {
      const old = run(false), mid = run(true);
      ok(old.width === '366px' && old.height === '366px', 'without aspect-ratio the board gets its height in pixels too (' + old.width + ' × ' + old.height + ')');
      ok(mid.width === '366px' && mid.height === undefined, 'where aspect-ratio works (Chrome 88-104) only the width is set, as before (' + mid.width + ' × ' + mid.height + ')');
    }
  }
  return { testOldWebView };
};
