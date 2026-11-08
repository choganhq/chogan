'use strict';
// Moved out of tools/test.js in #687: that file reached the 1 MB guard of testNoStrayFiles.
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT, LOCALE_CODES } = T;

  /* ------------------------------------------------ Menu: pinned games and sort (#193, #687) */
  // The home page gained a pinned section and a recently played row (#193). Since #687 the
  // recent and new-games rows are gone, replaced by a small saved sort, and a game is pinned
  // by holding it (long press, right click or the menu key) instead of a button on every tile.
  function testMenuPins() {
    head('Menu pins and sort');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const home = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
    const css = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8');
    ok(/Chogan\.recent = \{/.test(core) && /Chogan\.pins = \{/.test(core), 'the core has Chogan.recent and Chogan.pins');
    const gameAt = core.indexOf('Chogan.game = function (cfg)');
    ok(gameAt > 0 && /Chogan\.recent\.touch\(cfg\.id\)/.test(core.slice(gameAt, gameAt + 400)), 'opening a game page records it as recent');
    ok(/pinned: \[\]/.test(core), 'pinned is a default setting');
    // Last played sorts the whole catalogue, so the recent list must hold every game, not six
    const recentMax = +((core.match(/var RECENT_MAX = (\d+);/) || [])[1] || 0);
    const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
    ok(games.length > 0 && recentMax >= games.length * 2, 'the recent list keeps room for every game (' + recentMax + ' for ' + games.length + ')');
    // #720: every game carries the date of its last visible change, never before it was added nor in the future
    const today = new Date(Date.now() + 14 * 3600e3).toISOString().slice(0, 10);
    const badUpd = games.filter((g) => !/^\d{4}-\d{2}-\d{2}$/.test(g.updated || '') || g.updated < g.added || g.updated > today).map((g) => g.id + ' ' + g.updated);
    ok(!badUpd.length, 'every game in games.json has an `updated` date between its `added` date and today' + (badUpd.length ? ' (' + badUpd.join(', ') + ')' : ''));
    ok(/ch-section--pinned/.test(home), 'the home page keeps its pinned section');

    // #687: the removed rows, badge and pin button stay removed
    ok(!/function isNew\(/.test(home) && !/freshGames/.test(home) && !/[ ,{]freshRow: '/.test(home), 'the new-games row is gone');
    ok(!/C\.t\('recent'\)/.test(home) && !/ch-recent/.test(home) && !/\.ch-recent/.test(css), 'the recently played row is gone');
    ok(!/C\.t\('newBadge'\)/.test(home), 'tiles carry no "new" badge');
    ok(!/ch-game__pin/.test(home) && !/\.ch-game__pin/.test(css), 'tiles carry no pin button');

    const keys = ['pinned', 'pin', 'unpin', 'pinHint', 'sortLabel', 'sortDefault', 'sortName', 'sortRecent', 'sortPlayed', 'sortNew', 'sortUpdated'];
    const missing = [];
    for (const k of keys) { const n = (home.match(new RegExp('[ ,{]' + k + ": '", 'g')) || []).length; if (n !== LOCALE_CODES.length) missing.push(k + ' ' + n); }
    ok(!missing.length, 'pin and sort strings exist in every language' + (missing.length ? ' (' + missing.join(', ') + ')' : ''));

    // The menu's own sortGames, run on invented games
    const sortSrc = (home.match(/  var SORTS = \[[\s\S]*?\n  function sortGames\(list, by\) \{[\s\S]*?\n  \}\n/) || [''])[0];
    ok(sortSrc.length > 0, 'the menu has a sortGames function');
    if (sortSrc) {
      const G = [['c', 'Charlie', '2026-01-03'], ['a', 'alpha', '2026-03-01'], ['b', 'Bravo', '2026-02-01'], ['d', 'delta', '2026-03-01'], ['e', 'Echo', '2026-01-01']].map((x) => ({ id: x[0], name: x[1], added: x[2] }));
      const sb = { C: { recent: { list: () => ['e', 'b'] }, state: { stats: { byGame: { d: { plays: 9 }, a: { plays: 3 }, b: { plays: 3 }, e: { plays: 0 } } } } }, lang: () => 'en', gname: (g) => g.name };
      vm.runInNewContext(sortSrc + ';this.run = function (by) { return sortGames(GAMES_IN, by).map(function (g) { return g.id; }).join(); };', Object.assign(sb, { GAMES_IN: G }));
      ok(sb.run('default') === 'c,a,b,d,e', 'Default keeps the catalogue order (' + sb.run('default') + ')');
      ok(sb.run('name') === 'a,b,c,d,e', 'Name sorts by the shown name, ignoring case (' + sb.run('name') + ')');
      ok(sb.run('recent') === 'e,b,c,a,d', 'Last played puts recent games first, the rest in catalogue order (' + sb.run('recent') + ')');
      // Most played: more plays first; a tie (and never played) falls back to Last played, then the catalogue
      ok(sb.run('played') === 'd,b,a,e,c', 'Most played goes by finished rounds, ties by last played (' + sb.run('played') + ')');
      ok(sb.run('new') === 'd,a,b,c,e', 'Newest goes by date added, a later entry winning a tie (' + sb.run('new') + ')');
      // #720: by the last visible change; a game without `updated` counts from `added` (so it is new that day and leads a tie, #738); other ties keep the catalogue order
      Object.assign(G[0], { updated: '2026-04-01' }); Object.assign(G[2], { updated: '2026-03-01' }); Object.assign(G[4], { updated: '2026-02-15' });
      ok(sb.run('updated') === 'c,a,d,b,e', 'Recently updated goes by the latest change (' + sb.run('updated') + ')');
      G[1].updated = '2026-05-01';
      ok(sb.run('updated') === 'a,c,d,b,e', 'a newly updated game moves to the top (' + sb.run('updated') + ')');
      // #738: a game added on the tied date leads, though it sits later in the catalogue
      // (Number Drop came 4th on its release day, behind three games updated that day).
      const N = [['u', 'U', '2026-01-01', '2026-06-01'], ['v', 'V', '2026-01-01', '2026-05-01'], ['n', 'N', '2026-06-01', '2026-06-01']].map((x) => ({ id: x[0], name: x[1], added: x[2], updated: x[3] }));
      sb.GAMES_IN = N;
      ok(sb.run('updated') === 'n,u,v', 'a game added that day leads a Recently updated tie (' + sb.run('updated') + ')');
      sb.GAMES_IN = G;
      ok(sb.run('nonsense') === 'c,a,b,d,e', 'an unknown sort falls back to the catalogue order');
    }
    ok(/C\.state\.settings\.gameSort = sort;\s*C\.store\.set\('settings', C\.state\.settings\);/.test(home) &&
      /SORTS\.indexOf\(C\.state\.settings\.gameSort\) >= 0 \? C\.state\.settings\.gameSort : 'default'/.test(home), 'the chosen sort is saved and read back, unknown values falling back to Default');

    // holdToPin, run with a fake tile and a fake clock
    const holdSrc = (home.match(/    function holdToPin\(node, g\) \{[\s\S]*?\n    \}\n/) || [''])[0];
    ok(holdSrc.length > 0, 'the menu has a hold-to-pin handler');
    if (holdSrc) {
      let now = 1000, timers = [], opened = 0;
      const sb = { Date: { now: () => now }, pinMenu: () => { opened++; },
        setTimeout: (f, ms) => { timers.push({ f, at: now + ms }); return timers.length; }, clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].f = null; } };
      vm.runInNewContext(holdSrc + ';this.holdToPin = holdToPin;', sb);
      const mk = () => { const h = {}; const node = { addEventListener: (t, f) => { (h[t] = h[t] || []).push(f); } }; sb.holdToPin(node, { id: 'x' }); return h; };
      const fire = (h, t, e) => { const ev = Object.assign({ preventDefault() { ev.prevented = true; }, stopImmediatePropagation() { ev.stopped = true; } }, e); (h[t] || []).forEach((f) => f(ev)); return ev; };
      const tick = (ms) => { now += ms; timers.forEach((t) => { if (t.f && t.at <= now) { const f = t.f; t.f = null; f(); } }); };
      let h = mk();
      fire(h, 'pointerdown', { pointerType: 'touch', clientX: 10, clientY: 10 }); tick(400);
      ok(opened === 0, 'a short touch does not open the pin menu');
      tick(150);
      ok(opened === 1, 'holding a tile for half a second opens the pin menu');
      fire(h, 'contextmenu', {});
      ok(opened === 1, 'the contextmenu Android fires during the same hold does not open a second menu');
      const click = fire(h, 'click', {});
      ok(click.stopped && click.prevented, 'lifting the finger after a hold does not also open the game');
      ok(!fire(h, 'click', {}).stopped, 'the next ordinary tap opens the game again');
      h = mk(); opened = 0; now += 2000;
      fire(h, 'pointerdown', { pointerType: 'touch', clientX: 10, clientY: 10 }); fire(h, 'pointermove', { clientX: 10, clientY: 40 }); tick(800);
      ok(opened === 0, 'a finger that scrolls the menu does not pin');
      fire(h, 'pointerdown', { pointerType: 'mouse', clientX: 0, clientY: 0 }); tick(800);
      ok(opened === 0, 'a held mouse button does not pin (the mouse has its right click)');
      const cm = fire(h, 'contextmenu', {});
      ok(opened === 1 && cm.prevented, 'a right click or the menu key opens the pin menu instead of the browser menu');
    }
    ok(/function pinMenu\(g\) \{[\s\S]{0,400}C\.pins\.toggle\(g\.id\); render\(true\);/.test(home) && /holdToPin\(card, g\);/.test(home), 'every tile can be held, and the menu pins or unpins it');
    // told once: nothing on a tile shows that it can be held
    ok(/if \(C\.store\.get\('welcomeSeen', false\) && !C\.state\.settings\.pinHint\) \{\s*C\.state\.settings\.pinHint = true;\s*C\.store\.set\('settings', C\.state\.settings\);/.test(home) &&
      /C\.ui\.toast\(\{ icon: 'pin', title: C\.t\('pinHint'\)/.test(home), 'the hold hint is shown once, after the welcome, and remembered');
    ok(/\.ch-game \{ -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; \}/.test(css), 'holding a tile does not select its name or open the phone\'s image menu');
  }

  return { testMenuPins };
};
