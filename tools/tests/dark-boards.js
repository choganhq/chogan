'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;
  // #820: Trio's cards and Link Up's board stayed bright in the dark theme. Each game now
  // has the dark values twice, as breakout does: once for the system theme, once for the
  // chosen one, and the card / board colour is dark enough to be a dark surface.
  function testDarkBoards() {
    head('Trio cards and Link Up board in the dark theme (#820)');
    const lum = (hex) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const files = [
      { id: 'trio', surface: '--tr-card', marks: ['--tr-c0', '--tr-c1', '--tr-c2'], light: '#FFFFFF' },
      { id: 'linkup', surface: '--lu-board', marks: ['--lu-o', '--lu-b'], light: '#F4EDE0' }
    ];
    for (const f of files) {
      const html = fs.readFileSync(path.join(ROOT, 'www/games', f.id, 'index.html'), 'utf8');
      const auto = html.match(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{([^}]*)\}/);
      const fixed = html.match(/:root\[data-theme="dark"\] \{([^}]*)\}/);
      ok(!!auto && !!fixed, f.id + ': dark values for the system theme and for the chosen one');
      if (!(auto && fixed)) continue;
      ok(auto[1].trim() === fixed[1].trim(), f.id + ': both dark blocks hold the same values');
      const val = (k) => ((fixed[1].match(new RegExp(k + ':\\s*(#[0-9A-Fa-f]{6})')) || [])[1]);
      const surface = val(f.surface);
      ok(!!surface && lum(surface) < 0.05, f.id + ': the dark ' + f.surface + ' is a dark surface (' + surface + ', luminance ' + (surface ? lum(surface).toFixed(3) : '-') + ')');
      for (const k of f.marks) {
        const v = val(k);
        ok(!!v && cr(v, surface) >= 4.5, f.id + ': ' + k + ' reads on the dark surface at 4.5:1 or better (' + v + ', ' + (v ? cr(v, surface).toFixed(1) : '-') + ')');
      }
      ok(new RegExp(f.surface + ': ' + f.light, 'i').test(html), f.id + ': the light theme keeps its ' + f.light);
    }
  }
  return { testDarkBoards };
};
