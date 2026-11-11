'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT, LOCALE_CODES } = T;

  /* ------------------------------------------------ Awards by game and sort (#821) */
  // The Awards screen was one flat grid: a player could not tell which game an award
  // came from, or whether it was for the whole app. The core now names each award's
  // game, and the screen sorts and groups like the menu does.
  function testAwardsSort() {
    head('Awards: game of each award and sort (#821)');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const home = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
    const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
    ok(games.length > 0, 'games.json lists games');

    // 1. The core's award list and its game lookup, run on their own
    const a = core.indexOf('  var ACH = ['), b = core.indexOf('  var achApi = {');
    const src = a >= 0 && b > a ? core.slice(a, b) : '';
    ok(/function achGame\(id\)/.test(src) && /game: achGame,/.test(core), 'the core has an award-to-game lookup (Chogan.achievements.game)');
    const sb = {};
    vm.createContext(sb);
    let ACH = [], game = () => undefined;
    try {
      vm.runInContext(src + '\nthis.ACH = ACH; this.game = typeof achGame === "function" ? achGame : null;', sb);
      ACH = sb.ACH || []; game = sb.game || game;
    } catch (e) { ok(false, 'the award list runs on its own (' + e.message + ')'); }
    ok(ACH.length > 100, 'the award list is read (' + ACH.length + ' awards)');

    // Who really unlocks each award: the game page that names its id
    const pages = games.map((g) => ({ id: g.id, html: fs.readFileSync(path.join(ROOT, 'www', g.path), 'utf8') }));
    const usedBy = {};
    for (const d of ACH) {
      const re = new RegExp('[\'"]' + d.id.replace(/[-]/g, '\\-') + '[\'"]');
      usedBy[d.id] = pages.filter((p) => re.test(p.html)).map((p) => p.id);
    }
    const shared = ACH.filter((d) => usedBy[d.id].length > 1).map((d) => d.id + ':' + usedBy[d.id].join('/'));
    ok(!shared.length, 'no award id is used by two games' + (shared.length ? ' (' + shared.join(', ') + ')' : ''));
    const gameAwards = ACH.filter((d) => usedBy[d.id].length === 1);
    const appAwards = ACH.filter((d) => usedBy[d.id].length === 0);
    ok(gameAwards.length > 0 && appAwards.length > 0, 'there are both game awards and app-wide awards (' + gameAwards.length + ' and ' + appAwards.length + ')');
    const wrong = gameAwards.filter((d) => game(d.id) !== usedBy[d.id][0]).map((d) => d.id + '→' + game(d.id) + ' (in ' + usedBy[d.id][0] + ')');
    ok(!wrong.length, 'every game award maps to the game whose page unlocks it' + (wrong.length ? ' (' + wrong.slice(0, 8).join(', ') + ')' : ''));
    const notApp = appAwards.filter((d) => game(d.id) !== null).map((d) => d.id + '→' + game(d.id));
    ok(!notApp.length, 'awards no game page unlocks are for the whole app (null)' + (notApp.length ? ' (' + notApp.join(', ') + ')' : ''));
    ok(game('dt-180') === 'darts' && game('dt-win') === 'dots', 'Darts\' 180 keeps Dots\' prefix and still maps to Darts');
    const awardless = games.filter((g) => !gameAwards.some((d) => usedBy[d.id][0] === g.id)).map((g) => g.id);
    ok(!awardless.length, 'every game in the catalogue has awards on the screen' + (awardless.length ? ' (' + awardless.join(', ') + ')' : ''));

    // 2. The screen's own ordering, run on invented awards
    const ordSrc = (home.match(/  var AWARD_SORTS = \[[\s\S]*?\n  function orderAwards\(list, by, o\) \{[\s\S]*?\n  \}\n/) || [''])[0];
    ok(ordSrc.length > 0, 'the Awards screen has an orderAwards function');
    if (ordSrc) {
      const sb2 = {};
      vm.runInNewContext(ordSrc + ';this.AWARD_SORTS = AWARD_SORTS; this.orderAwards = orderAwards;', sb2);
      ok(sb2.AWARD_SORTS.join() === 'game,earned,locked,recent,name', 'the sorts are By game, Earned first, Not earned first, Recently earned and Name');
      // the core's order: game y's award first, then app awards, game x, an unknown game
      const L = [['y1', 'y', 'Yak'], ['g1', null, 'Gold'], ['x1', 'x', 'apple'], ['g2', null, 'Ember'], ['y2', 'y', 'Bee'], ['x2', 'x', 'Cat'], ['z1', 'zz', 'Dune']]
        .map((r) => ({ id: r[0], game: r[1], title: r[2] }));
      const T0 = 1.7e12;
      const at = { x2: T0 + 3000, g2: T0 + 1000, y1: T0 + 2000, x1: 1 }; // x1: an old value with no usable time
      const run = (by) => sb2.orderAwards(L, by, {
        games: [{ id: 'x' }, { id: 'y' }], gameOf: (id) => L.find((d) => d.id === id).game, at: (id) => at[id],
        title: (d) => d.title, lang: 'en'
      }).map((d) => d.id).join();
      ok(run('game') === 'g1,g2,x1,x2,y1,y2,z1', 'By game: app-wide first, then each game in catalogue order, an unknown game last (' + run('game') + ')');
      ok(run('earned') === 'g2,x1,x2,y1,g1,y2,z1', 'Earned first keeps the game order inside earned and not earned (' + run('earned') + ')');
      ok(run('locked') === 'g1,y2,z1,g2,x1,x2,y1', 'Not earned first puts what is left to earn on top (' + run('locked') + ')');
      ok(run('recent') === 'x2,y1,g2,x1,g1,y2,z1', 'Recently earned: newest first, an award with no usable time after the dated ones (' + run('recent') + ')');
      ok(run('name') === 'x1,y2,x2,z1,g2,g1,y1', 'Name sorts by the shown title, ignoring case (' + run('name') + ')');
      ok(run('nonsense') === run('game'), 'an unknown sort falls back to By game');
    }
    ok(/AWARD_SORTS\.indexOf\(C\.state\.settings\.awardSort\) >= 0 \? C\.state\.settings\.awardSort : 'game'/.test(home) &&
      /C\.state\.settings\.awardSort = sort;\s*C\.store\.set\('settings', C\.state\.settings\);/.test(home), 'the chosen award sort is saved and read back, unknown values falling back to By game');
    ok(/C\.state\.settings\.awardView === 'list'/.test(home) && /C\.state\.settings\.awardView = asList \? 'list' : 'grid';\s*C\.store\.set\('settings', C\.state\.settings\);/.test(home), 'the grid or list choice is saved and read back');
    ok(/orderAwards\(C\.achievements\.all, sort, \{ games: GAMES, gameOf: C\.achievements\.game, at: earnedAt,/.test(home) &&
      /function earnedAt\(id\) \{ return C\.state\.achievements\[id\]; \}/.test(home), 'the screen orders the core\'s awards by their games in the catalogue and by the saved unlock time of each id');

    // 3. Strings in every language, under names the core does not use
    ok(LOCALE_CODES.length >= 7, 'the language list is read (' + LOCALE_CODES.length + ')');
    const keys = ['awSortGame', 'awSortEarned', 'awSortLocked', 'awSortRecent', 'awWholeApp'];
    const missing = [];
    for (const k of keys) { const n = (home.match(new RegExp('[ ,{]' + k + ": '", 'g')) || []).length; if (n !== LOCALE_CODES.length) missing.push(k + ' ' + n); }
    ok(!missing.length, 'award sort strings exist in every language' + (missing.length ? ' (' + missing.join(', ') + ')' : ''));
    const clash = keys.filter((k) => new RegExp('[ ,{]' + k + ': \'').test(core));
    ok(!clash.length, 'the new strings do not reuse a core key' + (clash.length ? ' (' + clash.join(', ') + ')' : ''));
  }

  return { testAwardsSort };
};
