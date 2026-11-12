'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;
  // #862: with the «two phones» filter on, the menu kept its category headings, so two games
  // shared a row and the third sat alone under the next heading. A players filter is now one
  // flat list, like any sort but the default.
  function testMenuFlatWithPlayersFilter() {
    head('Menu: a players filter is one flat list (#862)');
    const html = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
    ok(/if \(sort !== 'default' \|\| \(people !== 'all' && cat === 'all'\)\) \{\s*\n\s*var sorted = sortGames\(GAMES\.filter\(function \(g\) \{ return \(cat === 'all' \|\| g\.cat === cat\) && peopleFit\(g, people\); \}\), sort\);/.test(html),
      'the flat list is drawn for a sort or a players filter, and applies both the category and the filter');
  }
  return { testMenuFlatWithPlayersFilter };
};
