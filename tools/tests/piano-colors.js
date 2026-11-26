// Optional colourful piano keys (#1209); the plain piano stays the default.
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;
  function testPianoColors() {
    head('Piano: optional colourful keys (#1209)');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/piano/index.html'), 'utf8');
    const src = (html.match(/\/\* ==== ENGINE START ==== \*\/([\s\S]*?)\/\* ==== ENGINE END ==== \*\//) || ['', ''])[1];
    const E = new Function(src.replace(/if \(typeof module[^\n]*\n/, '') + '\nreturn PianoEngineFactory();')();
    ok(E.colorsPref && E.colorsPref(undefined) === 'plain' && E.colorsPref('junk') === 'plain' && E.colorsPref('rainbow') === 'rainbow', 'plain keys unless the colourful ones were chosen');
    const list = E.RAINBOW || [];
    ok(list.length === 7 && new Set(list).size === 7, 'seven different colours, one per note');
    const lum = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
      .map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
      .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
    const dim = list.filter(c => (lum(c) + 0.05) / (lum('#1F1A22') + 0.05) < 4.5);
    ok(list.length === 7 && dim.length === 0, 'the dark key letters read on every colour' + (dim.length ? ' — ' + dim.join(' ') : ''));
    ok(/value: 'rainbow', label: C\.t\('pnColRainbow'\)/.test(html), 'the choice is in the settings');
  }
  return { testPianoColors };
};
