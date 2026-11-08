'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT } = T;
  // "Welcome to Chogan Plus" wrapped onto two lines on a 390px phone (#704). The title must
  // not wrap, and the page must shrink it to the width it has, never grow it past the CSS size.
  function testWelcomeTitleFits() {
    head('Welcome screen: the title stays on one line (#704)');
    const css = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8');
    const rule = /\.ch-welcome h1 \{([^}]*)\}/.exec(css);
    ok(!!rule && /white-space:\s*nowrap/.test(rule[1]), 'the welcome title never wraps (white-space: nowrap)');
    const page = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
    const a = page.indexOf('  function fitWelcomeHeads() {');
    const b = a > 0 ? page.indexOf('\n  }\n', a) : -1;
    ok(a > 0 && b > a, 'index.html has fitWelcomeHeads');
    if (!(a > 0 && b > a)) { ok(false, 'the fitting checks could not run'); return; }
    const draw = page.slice(page.indexOf('  function drawWelcome() {'), page.indexOf('  function drawWelcome() {') + 300);
    ok(/WELCOME_STEPS\[wStep\]\(\)\);\s*fitWelcomeHeads\(\);/.test(draw), 'every welcome step is fitted as soon as it is drawn');
    ok(/addEventListener\('resize', fitWelcomeHeads\)/.test(page) && /fonts\.ready\.then\(fitWelcomeHeads\)/.test(page) && /fonts\.addEventListener\('loadingdone', fitWelcomeHeads\)/.test(page),
      'the title is fitted again after a rotation and once the web font arrives');

    // A fake whose width follows the size it is given, plus a fixed overshoot that one
    // proportional pass cannot remove (the Persian 320px case).
    const mk = (client, scroll, extra) => { const h = { clientWidth: client, style: {} }; let size = 32;
      Object.defineProperty(h.style, 'fontSize', { get: () => (size === 32 ? (h._set ? '' : 'stale') : size + 'px'), set: (v) => { h._set = true; size = v === '' ? 32 : parseFloat(v); } });
      Object.defineProperty(h, 'scrollWidth', { get: () => Math.round(scroll * size / 32) + (size < 32 ? (extra || 0) : 0) }); h.size = () => size; return h; };
    const hs = [mk(350, 500), mk(350, 300), mk(0, 0), mk(300, 360, 3)];
    const sb = { wHost: { querySelectorAll: () => hs }, getComputedStyle: (h) => ({ fontSize: h.size() + 'px' }) };
    vm.createContext(sb);
    vm.runInContext(page.slice(a, b + 4) + '\nthis.fit = fitWelcomeHeads;', sb);
    sb.fit();
    ok(hs[0].size() === 22.4 && hs[0].scrollWidth <= 350, 'a title 500px wide in 350px is set to 22.4px (got ' + hs[0].size() + ')');
    ok(hs[1].size() === 32, 'a title that already fits keeps the CSS size');
    ok(hs[2].size() === 32, 'a hidden title (no width) is left alone');
    ok(hs[3].scrollWidth <= 300, 'a title still too wide after one proportional pass is shrunk again until it fits (' + hs[3].scrollWidth + ' in 300)');
    const tiny = [mk(100, 1000)];
    sb.wHost = { querySelectorAll: () => tiny };
    sb.fit();
    ok(tiny[0].size() === 14, 'the size never drops below 14px');
  }
  return { testWelcomeTitleFits };
};
