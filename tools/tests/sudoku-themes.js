'use strict';
// #874: a player found Sudoku hard on the eyes. The notes were faint (#7C7063 on the
// peer shading is 4.0:1) and the selected cell was filled with the solid accent
// (#6A8CBF), which hid its notes and put white digits at 3.4:1. The owner chose six
// board themes behind the gear (2026-11-12). Each theme is a set of CSS custom
// properties under [data-sd-theme], once for the light app theme and twice for the dark
// one (system and chosen, as in dark-boards.js). This file reads those colours and checks
// every pair that meets on the board.
//
// Thresholds: text 4.5:1 (WCAG AA) against every background it can sit on; box lines,
// cage lines and the selection ring 3:1 (WCAG non-text). The four cell backgrounds that
// sit side by side (plain, peer, same digit, selected) differ pairwise by at least
// ΔE 6 (CIE76), a little over twice the ~2.3 that is just noticeable, so each shading
// is seen at a glance; given cells differ from the peer and selected shading by ΔE 3,
// because the ink also tells them apart.
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT, LOCALE_CODES } = T;
  const VARS = ['frame', 'box', 'cell', 'given-bg', 'given', 'user', 'note', 'hint', 'peer', 'same', 'sel', 'ring', 'bad-bg', 'bad', 'cage', 'sum'];
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lum = (h) => { const c = rgb(h).map(lin); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const lab = (h) => {
    const [r, g, b] = rgb(h).map(lin);
    const X = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047, Y = r * 0.2126 + g * 0.7152 + b * 0.0722, Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  };
  const dE = (a, b) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
  const decls = (body) => {
    const o = {};
    for (const m of body.matchAll(/--sd-([a-z-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)) o[m[1]] = m[2].toUpperCase();
    return o;
  };

  function testSudokuThemes() {
    head('Sudoku: six board themes, readable notes, calm selection (#874)');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/sudoku/index.html'), 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8');
    const style = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
    ok(style.length > 0, 'the Sudoku page has its style block');

    // ---- the theme blocks
    const light = {}, auto = {}, forced = {};
    for (const m of style.matchAll(/^  \[data-sd-theme="([a-z]+)"\] \{([^}]*)\}/gm)) light[m[1]] = decls(m[2]);
    const media = style.indexOf('@media (prefers-color-scheme: dark) {\n    :root:not([data-theme="light"]) [data-sd-theme=');
    const mediaEnd = media < 0 ? -1 : style.indexOf('\n  }\n', media);
    const inMedia = media < 0 ? '' : style.slice(media, mediaEnd);
    for (const m of inMedia.matchAll(/:root:not\(\[data-theme="light"\]\) \[data-sd-theme="([a-z]+)"\] \{([^}]*)\}/g)) auto[m[1]] = decls(m[2]);
    for (const m of style.matchAll(/^  :root\[data-theme="dark"\] \[data-sd-theme="([a-z]+)"\] \{([^}]*)\}/gm)) forced[m[1]] = decls(m[2]);
    const ids = Object.keys(light);
    ok(ids.length === 6, 'exactly six board themes in the light app theme (' + ids.join(', ') + ')');
    ok(ids[0] === 'default', 'the first theme is the default');
    ok(ids.length > 0 && ids.every((id) => auto[id]) && Object.keys(auto).length === ids.length,
      'every theme has dark values for the system dark theme, inside the prefers-color-scheme block (' + Object.keys(auto).length + ')');
    ok(ids.length > 0 && ids.every((id) => forced[id]) && Object.keys(forced).length === ids.length,
      'every theme has dark values for the chosen dark theme (' + Object.keys(forced).length + ')');
    const same = ids.filter((id) => auto[id] && forced[id] && JSON.stringify(auto[id]) === JSON.stringify(forced[id]));
    ok(ids.length > 0 && same.length === ids.length, 'the system and the chosen dark values are the same for every theme (' + same.length + '/' + ids.length + ')');

    // the default's light box line stays the frame colour, as the owner wanted (#526);
    // it comes from :root, so it is read from the core
    const cLine = ((core.match(/--c-line:\s*(#[0-9A-Fa-f]{6})/) || [])[1] || '').toUpperCase();
    ok(/:root \{ --sd-box: var\(--c-line\); \}/.test(style) && !!cLine, 'the default light box line is the core frame colour (' + cLine + ')');
    if (light.default && !light.default.box) light.default.box = cLine;

    // ---- every colour, every pair
    const sets = [];
    for (const id of ids) { sets.push([id + ' light', light[id], id === 'default']); if (forced[id]) sets.push([id + ' dark', forced[id], false]); }
    ok(sets.length === 12, 'twelve colour sets to check (six themes, light and dark): ' + sets.length);
    for (const [name, v, oldLightBox] of sets) {
      const missing = VARS.filter((k) => !v[k]);
      ok(!missing.length, name + ': every board colour is set' + (missing.length ? ' (missing ' + missing.join(', ') + ')' : ''));
      if (missing.length) continue;
      const low = [];
      const need = (fg, bgs, min) => bgs.forEach((bg) => { const r = cr(v[fg], v[bg]); if (r < min) low.push(fg + ' on ' + bg + ' ' + r.toFixed(2)); });
      need('given', ['given-bg', 'peer', 'same', 'sel'], 4.5);
      need('user', ['cell', 'peer', 'same', 'sel'], 4.5);
      need('hint', ['cell', 'peer', 'same', 'sel'], 4.5);
      need('note', ['cell', 'peer', 'sel'], 4.5);
      need('sum', ['cell', 'given-bg', 'peer', 'sel'], 4.5);
      need('bad', ['bad-bg'], 4.5);
      ok(!low.length, name + ': digits, notes and sums read at 4.5:1 on every cell shading (given ' + cr(v.given, v['given-bg']).toFixed(1) +
        ', yours ' + cr(v.user, v.cell).toFixed(1) + ', notes ' + cr(v.note, v.cell).toFixed(1) + ', notes when selected ' + cr(v.note, v.sel).toFixed(1) + ')' + (low.length ? ': ' + low.join('; ') : ''));
      const lines = [];
      const line = (fg, bgs) => bgs.forEach((bg) => { const r = cr(v[fg], v[bg]); if (r < 3) lines.push(fg + ' on ' + bg + ' ' + r.toFixed(2)); });
      line('cage', ['cell', 'given-bg', 'peer', 'same', 'sel']);
      line('ring', ['sel']);
      if (!oldLightBox) line('box', ['cell', 'given-bg']);
      ok(!lines.length, name + ': box lines, cage lines and the selection ring stand out at 3:1 (box ' + cr(v.box, v.cell).toFixed(1) +
        (oldLightBox ? ', kept as it was by #526' : '') + ', cage ' + cr(v.cage, v.cell).toFixed(1) + ', ring ' + cr(v.ring, v.sel).toFixed(1) + ')' + (lines.length ? ': ' + lines.join('; ') : ''));
      const near = [];
      const tints = ['cell', 'peer', 'same', 'sel'];
      for (let i = 0; i < tints.length; i++) for (let j = i + 1; j < tints.length; j++) { const d = dE(v[tints[i]], v[tints[j]]); if (d < 6) near.push(tints[i] + '/' + tints[j] + ' ' + d.toFixed(1)); }
      ['peer', 'sel'].forEach((k) => { const d = dE(v['given-bg'], v[k]); if (d < 3) near.push('given-bg/' + k + ' ' + d.toFixed(1)); });
      if (dE(v['bad-bg'], v.cell) < 6) near.push('bad-bg/cell ' + dE(v['bad-bg'], v.cell).toFixed(1));
      ok(!near.length, name + ': the plain, peer, same-digit and selected shadings differ from each other (ΔE ≥ 6; peer/same ' + dE(v.peer, v.same).toFixed(1) +
        ', same/selected ' + dE(v.same, v.sel).toFixed(1) + ')' + (near.length ? ': ' + near.join('; ') : ''));
    }
    // real variety, not six copies: the six cell colours are all different
    const cells = new Set(ids.map((id) => light[id].cell + forced[id].cell));
    ok(cells.size === 6, 'the six themes have six different cell colours (' + cells.size + ')');

    // ---- the rules use the theme, the notes have no background
    const rule = (sel) => { const m = style.match(new RegExp('\\n  ' + sel.replace(/[.[\]()]/g, '\\$&') + ' \\{([^}]*)\\}')); return m ? m[1] : null; };
    ok(/var\(--sd-sel\)/.test(rule('.sd-cell--sel') || '') && !/--game\b|#fff/.test(rule('.sd-cell--sel') || ''), 'the selected cell is the theme tint with a ring, not the solid accent with white text');
    ok(!/\.sd-cell--sel[^{]*\{[^}]*color:\s*#fff/.test(style), 'no selected cell switches its digits to white');
    const notes = rule('.sd-notes'), noteSpan = rule('.sd-notes span');
    ok(notes !== null && noteSpan !== null && /color: var\(--sd-note\)/.test(noteSpan), 'notes are drawn in the theme note ink');
    ok(notes !== null && ![...style.matchAll(/([^{}]*sd-notes[^{}]*)\{([^}]*)\}/g)].some((m) => /background/.test(m[2])), 'no rule gives the notes a background');
    for (const [s, k] of [['.sd-cell--given', 'given-bg'], ['.sd-cell--peer', 'peer'], ['.sd-cell--same', 'same'], ['.sd-cell--user', 'user'], ['.sd-cell--bad', 'bad-bg']]) {
      ok(new RegExp('var\\(--sd-' + k + '\\)').test(rule(s) || ''), s + ' uses --sd-' + k);
    }

    // ---- names in every language
    const keys = ['thLabel', 'thDefault', 'thPaper', 'thContrast', 'thSage', 'thOcean', 'thNight'];
    ok(LOCALE_CODES.length >= 7, 'the app languages are known (' + LOCALE_CODES.join(', ') + ')');
    for (const lc of LOCALE_CODES) {
      const a = html.indexOf('\n      ' + lc + ': {\n'), b = a < 0 ? -1 : html.indexOf('\n      }', a);
      const block = a < 0 ? '' : html.slice(a, b);
      const miss = keys.filter((k) => !new RegExp('\\b' + k + ": '[^']+'").test(block));
      ok(block.length > 0 && !miss.length, lc + ': the board colours and the six theme names are translated' + (miss.length ? ' (missing ' + miss.join(', ') + ')' : ''));
    }

    // ---- the choice is saved and read back
    const themesSrc = (html.match(/^  var THEMES = \[[\s\S]*?^  \];$/m) || [''])[0];
    const themeOf = (html.match(/^  function themeOf\(p\) \{[\s\S]*?^  \}$/m) || [''])[0];
    ok(!!themesSrc && !!themeOf, 'the theme list and themeOf found');
    if (themesSrc && themeOf) {
      const sb = { JSON };
      vm.runInNewContext(themesSrc + themeOf + ';this.THEMES = THEMES; this.themeOf = themeOf;', sb);
      ok(sb.THEMES.map((t) => t.id).join() === ids.join(), 'the gear offers the same six themes, in the same order, as the CSS (' + sb.THEMES.map((t) => t.id).join(', ') + ')');
      ok(sb.THEMES.every((t) => keys.indexOf(t.key) > 0), 'each theme is named by one of the translated keys');
      const back = ids.filter((id) => sb.themeOf(JSON.parse(JSON.stringify({ showErrors: true, boardTheme: id }))) === id);
      ok(back.length === 6, 'each saved theme is read back after a save and load (' + back.length + '/6)');
      ok(sb.themeOf({}) === 'default' && sb.themeOf(null) === 'default' && sb.themeOf({ boardTheme: 'neon' }) === 'default' && sb.themeOf({ boardTheme: 'constructor' }) === 'default',
        'no saved theme, or an unknown one, gives the default');
    }
    ok(/wrap\.setAttribute\('data-sd-theme', themeOf\(prefs\)\);/.test(html), 'the saved theme is applied when the page loads');
    ok(/prefs\.boardTheme = t\.id; ctx\.store\.set\('prefs', prefs\);\s*wrap\.setAttribute\('data-sd-theme', t\.id\);/.test(html), 'picking a swatch saves the choice and switches the board by its attribute alone');
    ok(/el\('button', \{ class: 'sd-swatch', type: 'button', 'data-sd-theme': t\.id, 'aria-label': C\.t\(t\.key\)/.test(html) && /aria-pressed/.test(html),
      'each swatch is a button with its theme name as its label and a pressed state');
    ok(/settingRow\('autoNotes', 'autoNotes'\),\n        clearRow\(\),\n        themeRow\(\)/.test(html), 'the board colours sit in the gear sheet');
  }
  return { testSudokuThemes };
};
