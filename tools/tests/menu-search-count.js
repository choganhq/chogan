'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, ROOT, LOCALE_CODES } = T;
  // #973: the menu never said how many games there are. The search placeholder now carries
  // the count, read from the loaded list so it can't go stale when a game is added.
  function testMenuSearchCount() {
    head('Menu: the search placeholder names the number of games (#973)');
    const html = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
    ok(/placeholder: C\.t\('searchN', \{ n: C\.num\(GAMES\.length\) \}\)/.test(html),
      'the placeholder is searchN with the length of the loaded game list');
    const found = [...html.matchAll(/searchN: '([^']*)'/g)].map((m) => m[1]);
    ok(found.length > 0, 'searchN strings were found');
    ok(found.length === LOCALE_CODES.length, 'every language has searchN (' + found.length + ' of ' + LOCALE_CODES.length + ')');
    ok(found.every((v) => v.includes('{n}')), 'every searchN carries {n}');
  }
  return { testMenuSearchCount };
};
