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
    const mix = game.match(/--ms-closed: color-mix\(in srgb, var\(--game\) (\d+)%, var\(--c-([a-z0-9-]+)\)\)/);
    const openTok = (game.match(/\.ms-cell--open \{ background: var\(--c-([a-z0-9-]+)\)/) || [])[1];
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
    const p = mix ? Number(mix[1]) / 100 : 0;
    const weak = themes.filter(({ t }) => {
      const closed = rgb(accent).map((v, i) => Math.round(v * p + rgb(t[mix ? mix[2] : plain])[i] * (1 - p)));
      return cr(closed, rgb(t[openTok])) < 1.4;
    });
    ok(!weak.length, 'closed against opened is at least 1.4:1 in all ' + themes.length + ' blocks' + (weak.length ? '; not in ' + weak.map((w) => w.sel).join(' | ') : ''));
  }
  return { testMineCells };
};
