'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;
  // #1076: these games stayed bright (or unreadable) in the dark theme. Each now has dark values
  // twice, once for the system theme and once for the chosen one, and the surface that was a
  // light patch is a dark surface.
  function testDarkGames() {
    head('Dark theme for the board and card games (#1076)');
    const lum = (hex) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const files = [
      { id: 'xiangqi', surface: '--xq-board', dark: 0.06 },
      { id: 'shogi', surface: '--sg-wood', dark: 0.06 },
      { id: 'fourrow', surface: '--fr-back', dark: 0.03 },
      { id: 'sliding', surface: '--sp-tile', dark: 0.08, ink: '--sp-ink' },
      { id: 'pairs', surface: '--pr-face', dark: 0.5 }
    ];
    for (const f of files) {
      const html = fs.readFileSync(path.join(ROOT, 'www/games', f.id, 'index.html'), 'utf8');
      const auto = html.match(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{([^}]*)\}/);
      const fixed = html.match(/:root\[data-theme="dark"\] \{([^}]*)\}/);
      ok(!!auto && !!fixed, f.id + ': dark values for the system theme and for the chosen one');
      if (!(auto && fixed)) continue;
      const norm = (s) => s.replace(/\s+/g, ' ').trim();
      ok(norm(auto[1]) === norm(fixed[1]), f.id + ': both dark blocks hold the same values');
      const val = (k) => ((fixed[1].match(new RegExp(k + ':\\s*(#[0-9A-Fa-f]{6})')) || [])[1]);
      const surface = val(f.surface);
      ok(!!surface && lum(surface) < f.dark, f.id + ': dark ' + f.surface + ' is dimmed (' + surface + ', luminance ' + (surface ? lum(surface).toFixed(3) : '-') + ' < ' + f.dark + ')');
      if (f.ink) {
        const ink = val(f.ink);
        ok(!!ink && !!surface && cr(ink, surface) >= 7, f.id + ': ' + f.ink + ' reads on the dark tile at 7:1 or better (' + ink + ')');
      }
    }
    // Piano and Carrom draw on a canvas: the dark colours are literals in the drawing code.
    const piano = fs.readFileSync(path.join(ROOT, 'www/games/piano/index.html'), 'utf8');
    const iv = (piano.match(/ivory = dk \? '(#[0-9A-Fa-f]{6})'/) || [])[1];
    ok(!!iv && lum(iv) < 0.45, 'piano: the dark white keys are dimmed (' + iv + ')');
    const carrom = fs.readFileSync(path.join(ROOT, 'www/games/carrom/index.html'), 'utf8');
    const sf = (carrom.match(/fillStyle = dk \? '(#[0-9A-Fa-f]{6})' : '#EBD5A8'/) || [])[1];
    ok(!!sf && lum(sf) < 0.06, 'carrom: the dark playing surface is a dark wood (' + sf + ')');
    const jg = fs.readFileSync(path.join(ROOT, 'www/games/jigsaw/index.html'), 'utf8');
    ok(/dkGrid \? 'rgba\(255, 255, 255, \.38\)'/.test(jg), 'jigsaw: the cut lines turn light in the dark theme');
  }
  return { testDarkGames };
};
