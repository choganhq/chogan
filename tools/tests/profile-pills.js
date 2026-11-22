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
  }
  return { testProfilePills };
};
