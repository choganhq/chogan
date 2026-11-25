'use strict';
// #875: one colour theme for the whole app, chosen in the Profile. Each theme swaps the
// core's neutral tokens (--c-bg … --c-text-faint) under :root[data-colors="<id>"], once
// for the light app theme and twice for the dark one (system and chosen), so the
// existing Auto / Light / Dark choice keeps working on top of every palette.
//
// Thresholds (WCAG 2.x): body and secondary text 4.5:1 on the surfaces it sits on; the
// faint tone, which the core uses for icons, stars and small hints, 3:1 (non-text).
// --c-line is a decorative card edge in the soft palettes (cards are told apart by their
// fill and shadow), so 3:1 for it is asked of the high-contrast palette only, which is
// the one meant for people who need visible edges.
//
// Game accents are not part of a palette: the menu palette and each game set them. They
// were chosen against the default surfaces (white text on the accent in light, the accent
// lightened by Chogan.textOnDark against #342C22 in dark), so a palette may not make
// those surfaces darker in light or lighter in dark; otherwise accent text would drop
// under the contrast the accents were checked for.
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT, LOCALE_CODES } = T;
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  // a missing file fails the checks that need it instead of throwing the whole run away
  const readOpt = (rel) => (fs.existsSync(path.join(ROOT, rel)) ? read(rel) : '');
  const TOKENS = ['bg', 'bg-tint', 'surface', 'surface-2', 'surface-3', 'line', 'text', 'text-dim', 'text-faint'];
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const lum = (h) => { const c = [1, 3, 5].map((i) => lin(parseInt(h.slice(i, i + 2), 16) / 255)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const decls = (body) => {
    const o = {};
    for (const m of body.matchAll(/--c-([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)) o[m[1]] = m[2].toUpperCase();
    return o;
  };
  // the bodies of every rule whose selector list contains `sel` exactly, in source order,
  // so later declarations win as they do in the cascade
  const rule = (css, sel) => {
    const re = /([^{}]+)\{([^{}]*)\}/g;
    const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
    let m, out = '';
    while ((m = re.exec(src))) {
      if (m[1].split(',').map((s) => s.trim()).indexOf(sel) >= 0) out += m[2] + '\n';
    }
    return out;
  };
  const block = (src, re) => (src.match(re) || [''])[0];
  const idList = (src) => {
    const m = src.match(/var COLOR_THEMES = \[([^\]]*)\]/);
    return m ? [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]) : [];
  };
  const cap = (id) => id[0].toUpperCase() + id.slice(1);

  function palettes() {
    const css = read('www/lib/chogan.css');
    const media = block(css, /@media \(prefers-color-scheme: dark\) \{\n  :root:not\(\[data-theme="light"\]\) \{[\s\S]*?\n\}/);
    const out = { default: {
      light: decls(rule(css, ':root') || ''),
      auto: decls(rule(media, ':root:not([data-theme="light"])') || ''),
      forced: decls(rule(css, ':root[data-theme="dark"]') || '')
    } };
    const ids = [...css.matchAll(/^:root\[data-colors="([a-z]+)"\](?:,| \{)/gm)].map((m) => m[1]);
    const autoAll = [...css.matchAll(/@media \(prefers-color-scheme: dark\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join('\n');
    for (const id of ids) {
      out[id] = {
        light: decls(rule(css, ':root[data-colors="' + id + '"]')),
        auto: decls(rule(autoAll, ':root[data-colors="' + id + '"]:not([data-theme="light"])')),
        forced: decls(rule(css, ':root[data-colors="' + id + '"][data-theme="dark"]'))
      };
    }
    // the Profile's swatches draw each palette inside the current one
    for (const id of Object.keys(out)) {
      const sw = '.ch-swatch[data-colors="' + id + '"]';
      out[id].swatch = {
        light: decls(rule(css.replace(/@media[^{]*\{[\s\S]*?\n\}/g, ''), sw)),
        auto: decls(rule(autoAll, ':root:not([data-theme="light"]) ' + sw)),
        forced: decls(rule(css, ':root[data-theme="dark"] ' + sw))
      };
    }
    return out;
  }

  function testColorThemeContrast() {
    head('Colour themes: every palette readable in light and dark (#875)');
    const P = palettes();
    const ids = Object.keys(P);
    ok(ids.length >= 6 && ids[0] === 'default', 'the default and at least five colour themes in chogan.css (' + ids.join(', ') + ')');
    ok(ids.indexOf('contrast') > 0, 'one of them is a high-contrast palette');
    const core = read('www/lib/chogan.js'), early = readOpt('www/lib/early.js');
    const fromCore = idList(core), fromEarly = idList(early);
    ok(fromCore.length > 0 && fromCore.join() === ids.join(), 'COLOR_THEMES in chogan.js lists exactly the palettes in the stylesheet (' + fromCore.join(', ') + ')');
    ok(fromEarly.length > 0 && fromEarly.join() === ids.join(), 'early.js knows the same palettes (' + fromEarly.join(', ') + ')');

    const DEF_DARK_TOP = lum('#342C22'), DEF_LIGHT_LOW = lum('#EFE6D9');
    let pairs = 0;
    for (const id of ids) {
      for (const mode of ['light', 'auto', 'forced']) {
        const v = P[id][mode], name = id + ' ' + (mode === 'light' ? 'light' : mode === 'auto' ? 'dark (system)' : 'dark (chosen)');
        const missing = TOKENS.filter((k) => !v[k]);
        ok(!missing.length, name + ': every neutral token is set' + (missing.length ? ' (missing ' + missing.join(', ') + ')' : ''));
        if (missing.length) continue;
        const low = [];
        const need = (fg, bgs, min) => bgs.forEach((bg) => { pairs++; const r = cr(v[fg], v[bg]); if (r < min) low.push(fg + ' on ' + bg + ' ' + r.toFixed(2)); });
        const hc = id === 'contrast';
        need('text', ['bg', 'bg-tint', 'surface', 'surface-2', 'surface-3'], hc ? 7 : 4.5);
        need('text-dim', ['bg', 'surface', 'surface-2'], hc ? 7 : 4.5);
        need('text-faint', ['bg', 'surface', 'surface-2'], hc ? 4.5 : 3);
        if (hc) need('line', ['bg', 'surface', 'surface-2'], 3);
        ok(!low.length, name + ': text 4.5:1 and icons 3:1 on its surfaces' + (hc ? ' (7:1 and 4.5:1, edges 3:1)' : '') + (low.length ? ' (' + low.join('; ') + ')' : ''));
        // accents were checked against the default surfaces; see the note at the top
        const surf = ['bg', 'surface', 'surface-2'].concat(mode === 'light' ? [] : ['surface-3']);
        const off = surf.filter((k) => (mode === 'light' ? lum(v[k]) < DEF_LIGHT_LOW - 1e-9 : lum(v[k]) > DEF_DARK_TOP + 1e-9));
        ok(!off.length, name + ': game accents keep their contrast (' + (mode === 'light' ? 'no surface darker than #EFE6D9' : 'no surface lighter than #342C22') + ')' + (off.length ? ' (' + off.map((k) => k + ' ' + v[k]).join(', ') + ')' : ''));
      }
      ok(JSON.stringify(P[id].auto) === JSON.stringify(P[id].forced), id + ': the system dark and the chosen dark values are the same');
      const same = (a, b) => TOKENS.every((k) => a[k] && a[k] === b[k]);
      ok(same(P[id].swatch.light, P[id].light) && same(P[id].swatch.auto, P[id].auto) && same(P[id].swatch.forced, P[id].forced),
        id + ': its Profile swatch shows the palette\'s own light and dark colours');
    }
    ok(pairs >= ids.length * 3 * 11, 'contrast pairs checked: ' + pairs);
  }

  function testColorThemeApplied() {
    head('Colour themes: saved in the settings, applied before the first paint (#875)');
    const core = read('www/lib/chogan.js'), early = readOpt('www/lib/early.js');
    const ids = idList(core);
    ok(ids.length >= 6, 'the core lists its colour themes (' + ids.length + ')');

    // early.js against a fake storage and root element
    const runEarly = (stored, throws) => {
      const attrs = {};
      const sb = {
        localStorage: { getItem: (k) => { if (throws) throw new Error('blocked'); return k === 'chogan.app.settings' ? stored : null; } },
        document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; } } }
      };
      vm.createContext(sb);
      vm.runInContext(early, sb);
      return attrs;
    };
    const j = (o) => JSON.stringify(o);
    ok(runEarly(j({ colors: 'forest' }))['data-colors'] === 'forest', 'early.js sets data-colors from the saved choice');
    const bad = [j({ colors: 'neon' }), j({ colors: 'default' }), j({ colors: 7 }), j({ colors: '__proto__' }), j({}), '{oops', null, j('slate')];
    ok(bad.every((s) => runEarly(s)['data-colors'] === undefined), 'an unknown, default, missing or broken value leaves no attribute, so the default palette shows (' + bad.length + ' cases)');
    ok(runEarly(null, true)['data-colors'] === undefined, 'blocked storage throws nothing out of early.js');
    ok(runEarly(j({ theme: 'dark' }))['data-theme'] === 'dark' && runEarly(j({ theme: 'light' }))['data-theme'] === 'light', 'early.js sets a chosen light or dark theme too');
    ok(runEarly(j({ theme: 'auto' }))['data-theme'] === undefined && runEarly(j({ theme: 'x' }))['data-theme'] === undefined, 'Auto (and junk) leave data-theme unset, as Chogan.applyTheme does');
    const keyM = core.match(/var NS = '([a-z]+)';\s*var APP = '([a-z]+)';/);
    ok(!!keyM && early.indexOf("'" + keyM[1] + '.' + keyM[2] + ".settings'") > 0, 'early.js reads the same settings key the core store writes');

    // the core's apply function, with the same cases
    const ap = block(core, /Chogan\.applyColors = function \(\) \{[\s\S]*?\n  \};/);
    ok(ap.length > 0, 'Chogan.applyColors exists');
    if (ap) {
      const attrs = {};
      const sb = { Chogan: {}, state: { settings: {} }, COLOR_THEMES: ids,
        document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; } } } };
      vm.runInNewContext(ap, sb);
      const set = (v) => { sb.state.settings.colors = v; sb.Chogan.applyColors(); return attrs['data-colors']; };
      ok(set('rose') === 'rose' && set('contrast') === 'contrast', 'applyColors writes a known palette to the root');
      ok(set('default') === undefined && set('neon') === undefined && set(undefined) === undefined && set('rose') === 'rose' && set('constructor') === undefined, 'the default, junk and a missing value remove it');
    }
    ok(/colors: 'default'/.test(block(core, /var DEFAULT_SETTINGS = \{[\s\S]*?\};/)), 'the default setting is the default palette');
    ok(/Chogan\.applyColors\(\);/.test(block(core, /Chogan\.boot = function[\s\S]*?Chogan\.cards\.applyBack\(\);/)), 'boot applies the choice again (the source of truth after early.js)');
    ok(/Chogan\.setColors = function \(c\) \{[\s\S]*?saveSettings\(\);[\s\S]*?Chogan\.applyColors\(\);/.test(core), 'setColors saves through the core store and applies');

    // the existing light / dark / auto behaviour
    const at = block(core, /Chogan\.applyTheme = function \(\) \{[\s\S]*?\n  \};/);
    ok(at.length > 0, 'Chogan.applyTheme is still there');
    if (at) {
      const attrs = {}, meta = { v: '' };
      const sb = { Chogan: {}, state: { settings: {} }, getComputedStyle: () => ({ getPropertyValue: () => '' }),
        global: { matchMedia: () => ({ matches: false }) },
        document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; } },
          querySelector: () => ({ setAttribute: (k, v) => { meta.v = v; } }) } };
      vm.runInNewContext(at, sb);
      const set = (t) => { sb.state.settings.theme = t; sb.Chogan.applyTheme(); return [attrs['data-theme'], meta.v]; };
      ok(j(set('dark')) === j(['dark', '#15120E']) && j(set('light')) === j(['light', '#FBF6EF']) && j(set('auto')) === j([undefined, '#FBF6EF']),
        'Light, Dark and Auto set the same attribute and bar colour as before');
      sb.getComputedStyle = () => ({ getPropertyValue: (n) => (n === '--c-bg' ? ' #0F141A ' : '') });
      ok(set('dark')[1] === '#0F141A', 'the browser bar takes the palette\'s background once the stylesheet gives one');
    }

    // every page loads early.js in its head, before the stylesheet paints anything
    const pages = ['www/index.html', 'www/privacy.html', 'www/privacy-plus.html', 'template/game/index.html']
      .concat(T.games().map((g) => 'www/games/' + g.id + '/index.html'));
    ok(pages.length > 4, 'pages to check: ' + pages.length);
    const lacking = pages.filter((p) => {
      const h = read(p), headEnd = h.indexOf('</head>');
      const i = h.search(/<script src="(?:\.\.\/\.\.\/)?lib\/early\.js"><\/script>/);
      return !(i > 0 && i < headEnd);
    });
    ok(!lacking.length, 'every page runs lib/early.js inside <head>' + (lacking.length ? ' (not: ' + lacking.join(', ') + ')' : ''));
    ok(/'\.\/lib\/early\.js'/.test(read('www/sw.js')), 'the service worker caches lib/early.js with the shell, so it works offline');

    // names in every language
    const dictOf = (src, code) => {
      const m = src.match(new RegExp('\\n\\s{4,8}' + code + ':\\s*\\{'));
      if (!m) return null;
      let i = src.indexOf('{', m.index), depth = 0, k = i;
      for (; k < src.length; k++) { if (src[k] === '{') depth++; else if (src[k] === '}' && --depth === 0) break; }
      const out = {}, re = /([A-Za-z_][A-Za-z0-9_]*)\s*:\s*'((?:[^'\\]|\\.)*)'/g;
      let x;
      while ((x = re.exec(src.slice(i, k)))) out[x[1]] = x[2];
      return out;
    };
    const keys = ['colors'].concat(ids.map((id) => 'colors' + cap(id)));
    ok(LOCALE_CODES.length >= 9, 'languages to check: ' + LOCALE_CODES.join(' '));
    for (const code of LOCALE_CODES) {
      const d = dictOf(core, code) || {};
      const miss = keys.filter((k) => !d[k]);
      ok(!miss.length, code + ': the row and all ' + ids.length + ' palette names are translated' + (miss.length ? ' (missing ' + miss.join(', ') + ')' : ''));
    }

    // the Profile row
    const idx = read('www/index.html');
    const row = block(idx, /function colorSwatches\([\s\S]*?\n  \}/);
    ok(row.length > 0, 'the profile builds a swatch row');
    ok(/'aria-pressed'/.test(row) && /data-colors/.test(row) && /C\.t\('colors' \+/.test(row) === false, 'each swatch is a toggle drawn in its own palette, named with a literal key');
    ok(/C\.setColors\(/.test(row), 'a swatch saves the choice through the core');
    ok(/colorSwatches\(/.test(block(idx, /function settingsCard\(\)[\s\S]*?\n  \}/)), 'the row sits in the settings card under the theme choice');
    const css = read('www/lib/chogan.css');
    ok(/\.ch-swatch \{[^}]*min-height: 44px/.test(css) && /\.ch-swatch \{[^}]*min-width: 44px/.test(css), 'a swatch is at least 44px each way');
    // #1154: both rows are one strip that scrolls sideways, and start at the chosen tile
    ok(/\.ch-swatches \{[^}]*display: flex[^}]*overflow-x: auto/.test(css), 'themes and backgrounds scroll sideways');
    ok(/keepStrip\(row, 'colors'\)/.test(idx) && /keepStrip\(row, 'pattern'\)/.test(idx), 'both strips keep the chosen tile in sight');
  }

  return { testColorThemeContrast, testColorThemeApplied };
};
