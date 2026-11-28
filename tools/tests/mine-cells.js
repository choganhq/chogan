'use strict';
// #1204: an opened empty cell looked like a closed one (the two neutral surfaces differ by
// about 1.1:1). This reads the colours Minesweeper really uses and measures them in every
// colour theme, light and dark.
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lum = (c) => c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const cr = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

  function testMineCells() {
    head('Minesweeper: opened cells stand apart from closed ones (#1204)');
    const game = read('www/games/minesweeper/index.html');
    const css = read('www/lib/chogan.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const accent = (game.match(/accent: '(#[0-9A-Fa-f]{6})'/) || [])[1];
    const mix = game.match(/--ms-closed: color-mix\(in srgb, var\(--game\) var\(--ms-share\), var\(--c-([a-z0-9-]+)\)\)/);
    const shares = [...game.matchAll(/--ms-share: (\d+)%/g)].map((m) => Number(m[1]) / 100);
    const flagShare = (game.match(/\.ms-cell--flag \{ color: var\(--ms-flag, color-mix\(in srgb, var\(--c-bad\) (\d+)%, var\(--c-text\)\)/) || [])[1];
    const openTok = (game.match(/\.ms-cell--open \{ background: var\(--ms-open, var\(--c-([a-z0-9-]+)\)/) || [])[1];
    // without a mix, measure the plain tone the cell is painted with, so the old pair of
    // surfaces is judged by the same ratio
    const plain = (game.match(/\.ms-cell \{[\s\S]*?background: var\(--c-([a-z0-9-]+)\)/) || [])[1];
    ok(accent && openTok && (mix || plain), 'the accent, the closed colour and the opened colour were read from the game');
    const themes = [];
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*--c-bg:[^{}]*--c-surface-3:[^{}]*)\}/g)) {
      const t = {};
      for (const d of m[2].matchAll(/--c-([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)) t[d[1]] = d[2];
      themes.push({ sel: m[1].trim().split('\n').pop().trim(), t });
    }
    ok(themes.length >= 18, 'every palette block was found, light and dark (' + themes.length + ')');
    if (!(accent && openTok && (mix || plain))) return ok(false, 'cannot measure without the colours');
    const mixed = (a, b, p) => a.map((v, i) => Math.round(v * p + b[i] * (1 - p)));
    // the light share comes first in the game, then the dark theme's
    const closedOf = (t) => (mix ? mixed(rgb(accent), rgb(t[mix[1]]), shares[lum(rgb(t.bg)) < 0.2 ? 1 : 0]) : rgb(t[plain]));
    const weak = themes.filter(({ t }) => cr(closedOf(t), rgb(t[openTok])) < 1.4);
    ok(!weak.length, 'closed against opened is at least 1.4:1 in all ' + themes.length + ' blocks' + (weak.length ? '; not in ' + weak.map((w) => w.sel).join(' | ') : ''));
    // old WebViews drop the mix: every palette then gets the written-out tones (#1297)
    const old = (game.match(/@supports not \(background: color-mix[^{]*\{([\s\S]*?)@supports \(background/) || ['', ''])[1];
    const tones = [...old.matchAll(/--ms-fallback: (#[0-9A-Fa-f]{6}); --ms-fallflag: (#[0-9A-Fa-f]{6});/g)].map((m) => m.slice(1));
    const oldWeak = themes.filter(({ t }) => {
      const [tile, flag] = tones[lum(rgb(t.bg)) < 0.2 ? 1 : 0] || ['#000000', '#000000'];
      return !(cr(rgb(tile), rgb(t[openTok])) >= 1.4 && cr(rgb(flag), rgb(tile)) >= 3);
    });
    ok(themes.length > 1 && tones.length === 3 && String(tones[1]) === String(tones[2]) && !oldWeak.length,
      'without color-mix every palette has closed cells at 1.4:1 and flags at 3:1 (' + oldWeak.map((w) => w.sel).join('; ') + ')');
    ok(['--ms-closed: var(--ms-fallback, var(--c-surface-3))', 'var(--ms-flag, var(--ms-fallflag, var(--c-bad)))',
      '.ms-tut-flag { stroke: var(--ms-fallflag, var(--c-bad)); }'].every((r) => game.includes(r)),
      'and the board, its flag and the tutorial flag read them');
    // a palette block without its own red inherits the default one for its theme
    const reds = [...css.matchAll(/--c-bad:\s*(#[0-9A-Fa-f]{6})/g)].map((m) => m[1]);
    const faint = themes.filter(({ t }) => {
      const bad = rgb(t.bad || reds[lum(rgb(t.bg)) < 0.2 ? 1 : 0]);
      const flag = flagShare ? mixed(bad, rgb(t.text), Number(flagShare) / 100) : bad;
      return cr(flag, closedOf(t)) < 3;
    });
    ok(!faint.length, 'the flag is at least 3:1 on a closed cell' + (faint.length ? '; not in ' + faint.map((w) => w.sel).join(' | ') : ''));
    // one stray closing brace swallowed the board's grid rule and left a one-column board
    const style = (game.match(/<style>([\s\S]*?)<\/style>/) || ['', ''])[1].replace(/\/\*[\s\S]*?\*\/|'[^']*'/g, '');
    let depth = 0, low = 0;
    for (const c of style) { if (c === '{') depth++; if (c === '}') depth--; low = Math.min(low, depth); }
    ok(style.length > 0 && depth === 0 && low === 0, 'the braces of the game style are balanced');
    const tut = game.slice(game.indexOf('var TUT = ['), game.indexOf("C.t('tutTitle3')"));
    ok(tut.includes('var(--ms-closed)') && !tut.includes('surface-3'), 'the tutorial pictures use the colours of the board');
  }
  return { testMineCells };
};
