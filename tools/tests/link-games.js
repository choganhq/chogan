'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT, LOCALE_CODES } = T;
  // Only Reversi plays across two phones, and the menu gave no hint of it (#706). A game
  // declares it with "link": true in games.json; the menu turns that into a "Two phones"
  // chip and a tile badge, in Chogan Plus only. The declaration must follow the code, or a
  // game would be listed that cannot link, or a linked game would stay hidden.
  function testTwoPhoneGames() {
    head('Chogan Plus: games that play across two phones are marked (#706)');
    const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8'));
    const games = Array.isArray(list) ? list : list.games;
    ok(Array.isArray(games) && games.length > 0, 'games.json lists games');
    if (!(Array.isArray(games) && games.length)) return;
    const uses = games.filter((g) => {
      const f = path.join(ROOT, 'www/games', g.id, 'index.html');
      return fs.existsSync(f) && /\b(C|Chogan)\.link\.open\(/.test(fs.readFileSync(f, 'utf8'));
    }).map((g) => g.id).sort();
    const declared = games.filter((g) => g.link === true).map((g) => g.id).sort();
    ok(uses.length > 0, 'at least one game opens the two-phone link (' + uses.join(', ') + ')');
    ok(JSON.stringify(uses) === JSON.stringify(declared),
      'every game that opens the link declares "link": true, and no other does (code: ' + uses.join(', ') + '; games.json: ' + declared.join(', ') + ')');
    ok(games.every((g) => g.link === undefined || g.link === true), '"link" is either true or left out');

    const page = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
    ok((page.match(/\bpeopleLink: '[^']+'/g) || []).length === LOCALE_CODES.length, 'the "Two phones" label exists in every language');
    const a = page.indexOf('  var LINK = ');
    const b = a > 0 ? page.indexOf('\n  }\n', a) : -1;
    ok(a > 0 && b > a, 'the menu has the link filter');
    if (!(a > 0 && b > a)) { ok(false, 'the filter checks could not run'); return; }
    const run = (avail) => {
      const sb = { C: avail === null ? {} : { link: { available: () => avail } } };
      vm.createContext(sb);
      vm.runInContext(page.slice(a, b + 4) + '\nthis.PEOPLE = PEOPLE; this.peopleFit = peopleFit;', sb);
      return sb;
    };
    const plus = run(true), web = run(false), old = run(null);
    ok(plus.PEOPLE.includes('link') && plus.PEOPLE[plus.PEOPLE.length - 1] === 'link', 'Chogan Plus with the link offers the "Two phones" chip last');
    ok(!web.PEOPLE.includes('link') && !old.PEOPLE.includes('link'), 'without the link (web, PWA, F-Droid) there is no such chip');
    const rv = games.find((g) => g.id === 'reversi');
    const solo = games.find((g) => !g.link && (g.people || 1) === 1);
    const duo = games.find((g) => !g.link && (g.people || 1) >= 2);
    ok(plus.peopleFit(rv, 'link') && !plus.peopleFit(solo, 'link') && !plus.peopleFit(duo, 'link'), 'the chip lists only the games that declare the link');
    ok(plus.peopleFit(rv, '2') && plus.peopleFit(solo, '1') && !plus.peopleFit(solo, '2') && plus.peopleFit(duo, 'all'), 'the other chips work as before');

    const card = page.slice(page.indexOf('    function gameCard(g, i) {'), page.indexOf('    function gameCard(g, i) {') + 800);
    ok(/if \(LINK && g\.link\) badges\.appendChild\([^\n]*C\.t\('peopleLink'\)/.test(card), 'a linked game carries a "Two phones" badge on its tile, in Chogan Plus only');
  }
  return { testTwoPhoneGames };
};
