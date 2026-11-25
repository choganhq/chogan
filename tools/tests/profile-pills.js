'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;

  // #1070: the Profile is a long page; a sticky row of pills jumps to each section.
  // Every pill must point at a section that exists and carry a label in all ten languages.
  function testProfilePills() {
    head('Profile: section pills jump to real sections (#1070)');
    const html = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const m = html.match(/var JUMPS = (\[\[[\s\S]*?\]\]);/);
    ok(!!m, 'the pill list exists');
    if (!m) return;
    const jumps = JSON.parse(m[1].replace(/'/g, '"'));
    ok(jumps.length >= 5, 'at least five pills (' + jumps.length + ')');
    jumps.forEach(function (j) {
      ok(html.indexOf("id: '" + j[0] + "'") >= 0, 'section ' + j[0] + ' has its id');
      const n = (core + html).split(new RegExp('[ {,]' + j[1] + ': \'')).length - 1;
      ok(n >= 10, 'label key ' + j[1] + ' exists in every language (' + n + ')');
    });
    ok(/\.ch-jump \{[^}]*position: sticky/.test(fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8')), 'the row is sticky');
    // #1153: the row has to scroll to the lit pill, without scrolling the page
    const show = html.match(/function showPill\(row, pill\) \{[\s\S]*?\n  \}/);
    ok(!!show && /showPill\(jump, jumpBtns\[cur\]\)/.test(html), 'the row follows the section in view');
    ok(/else return;\s*var cur = 0;/.test(html) && /requestAnimationFrame\(litJump\)/.test(html), 'nothing is measured before the page is attached');
    const from = html.indexOf('function patternSwatches'), to = html.indexOf("label: C.t('keepAwake')");
    const settings = html.slice(from, to);
    ok(from > 0 && to > from && (settings.match(/render\(true\)/g) || []).length >= 5 && !/\brender\(\)/.test(settings), 'choosing a setting keeps the place on the page');
    if (!show) return;
    ok(!/\.scrollIntoView\(/.test(show[0]), 'following does not scroll the page');
    [[300, 100], [-200, 100]].forEach(function (c) {
      let got = null;
      const win = { matchMedia: () => ({ matches: false }) };
      new Function('window', 'return ' + show[0])(win)(
        { getBoundingClientRect: () => ({ left: 0, width: 400 }), scrollBy: (o) => { got = o.left; } },
        { getBoundingClientRect: () => ({ left: c[0], width: c[1] }) });
      ok(got === c[0] + c[1] / 2 - 200, 'a pill at ' + c[0] + ' is centred (delta ' + got + ')');
    });
  }
  return { testProfilePills };
};
