'use strict';
// #1248: a medium bot beat children at their first game and they gave up. Every game with an
// opponent level now starts on Easy for a first-time player only: a player the game has seen
// before (any saved key, or plays in the stats) keeps the old default, a saved level stays,
// and the daily challenge keeps its fixed level. These groups run the core's newcomer test in
// a vm, then run each game's own prefs lines with a fake ctx, as the page would.
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT } = T;
  const CORE = path.join(ROOT, 'www/lib/chogan.js');
  const src = (id) => fs.readFileSync(path.join(ROOT, 'www/games', id, 'index.html'), 'utf8');

  // Opponent level named easy/medium/hard; numeric levels (1 easy, 2 middle, 3 hard) apart.
  // motorush keeps its level as prefs.diff.
  const WORD = ['airhockey', 'apiary', 'backgammon', 'battleship', 'bowling', 'carrom', 'chain', 'checkers',
    'circuit', 'corners', 'corridor', 'crazyeights', 'darts', 'dicelands', 'dominoes', 'dots', 'durak',
    'eightball', 'football', 'fourfold', 'fourrow', 'ginrummy', 'go', 'gomoku', 'gorillas', 'hex',
    'hillrider', 'hillside', 'hokm', 'hues', 'koikoi', 'linkup', 'ludo', 'mancala', 'morris', 'motorush',
    'muncher', 'nainjaune', 'pasur', 'peak', 'pingpong', 'pushout', 'reversi', 'senet', 'shelem',
    'snooker', 'speed', 'tanks', 'wrigglers'];
  const NUMERIC = ['liarsdice', 'shogi', 'xiangqi'];
  // games that name easy/medium/hard but are not an opponent level, or already start on Easy
  const LEFT = {
    chess: 'its bot already starts on Easy (PREFS0)',
    mastermind: 'puzzle size, no opponent',
    sudoku: 'puzzle difficulty, no opponent',
    watersort: 'puzzle size, no opponent',
    petals: 'word difficulty, no opponent',
    wordfall: 'typing speed, no opponent'
  };

  function boot(pre) {
    const ls = Object.assign({}, pre);
    const store = {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(ls, k) ? ls[k] : null),
      setItem: (k, v) => { ls[k] = String(v); }, removeItem: (k) => { delete ls[k]; },
      key: (i) => Object.keys(ls)[i] || null, get length() { return Object.keys(ls).length; }
    };
    const el = () => new Proxy(function () {}, { get: (t, p) => (p === 'length' ? 0 : el()), apply: () => el(), set: () => true });
    const win = {
      localStorage: store, document: el(), navigator: { language: 'en', languages: ['en'] },
      location: { search: '', hash: '', href: 'http://x/', pathname: '/', reload() {} },
      addEventListener() {}, removeEventListener() {},
      matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
      setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: () => 0,
      history: { replaceState() {}, pushState() {} }, getComputedStyle: () => ({ getPropertyValue: () => '' }),
      Date, Math, JSON, APP_VERSION: '1.2.3'
    };
    win.window = win; win.self = win; win.globalThis = win;
    vm.createContext(win);
    vm.runInContext(fs.readFileSync(CORE, 'utf8'), win, { filename: 'chogan.js' });
    return win.Chogan;
  }

  function testNewcomerCore() {
    head('Easy first: the core tells a first-time player from a returning one (#1248)');
    const C0 = boot({});
    ok(typeof C0.newcomer === 'function', 'the core has Chogan.newcomer');
    if (typeof C0.newcomer !== 'function') return;
    ok(C0.newcomer('reversi') === true, 'nothing stored: a newcomer');
    ok(boot({ 'chogan.reversi.prefs': '{"level":"medium"}' }).newcomer('reversi') === false, 'a saved prefs key: not a newcomer');
    ok(boot({ 'chogan.reversi.tutSeen': 'true' }).newcomer('reversi') === false, 'any other key of the game (tutSeen): not a newcomer');
    ok(boot({ 'chogan.reversi.session.daily.2026-11-20': '{}' }).newcomer('reversi') === false, 'only a daily save: not a newcomer');
    ok(boot({ 'chogan.reversix.prefs': '{}', 'chogan.chess.prefs': '{}' }).newcomer('reversi') === true,
      'keys of other games (even one whose id starts the same) do not count');
    const st = { plays: 3, timeMs: 1, byGame: { reversi: { plays: 3, wins: 1, timeMs: 1, best: {} } }, daily: {}, streak: { count: 0, best: 0, last: '' } };
    ok(boot({ 'chogan.app.stats': JSON.stringify(st) }).newcomer('reversi') === false, 'plays in the stats with no game key: not a newcomer');
    ok(boot({ 'chogan.app.stats': JSON.stringify(st) }).newcomer('hex') === true, 'plays of another game do not count');
    // read before Chogan.game or the game writes anything, or every player looks returning
    const core = fs.readFileSync(CORE, 'utf8');
    const g = core.indexOf('Chogan.game = function');
    const n = core.indexOf('Chogan.newcomer(cfg.id)', g), t = core.indexOf('Chogan.recent.touch(cfg.id)', g);
    ok(g > 0 && n > g && t > g && n < t, 'Chogan.game reads newcomer before its first write (recent.touch)');
    ok(/firstLevel:\s*function/.test(core) && /newcomer:\s*newcomer/.test(core), 'ctx carries newcomer and firstLevel');
  }

  // Run a game's prefs lines: from `var prefs =` to the first blank line, with LEVELS and E
  // stubbed and every other name a harmless proxy, then read the level they settle on.
  function prefsBlock(id) {
    const L = src(id).split('\n');
    const i = L.findIndex((l) => /^\s*var prefs = (ctx\.store\.get\('prefs'|\{ bots)/.test(l));
    if (i < 0) return null;
    const out = [];
    for (let j = i; j < L.length && j < i + 14 && L[j].trim() !== ''; j++) out.push(L[j]);
    return out.join('\n');
  }
  function settle(code, newcomer, saved) {
    const any = () => new Proxy(function () {}, { get: (t, p) => (p === Symbol.toPrimitive ? () => 0 : any()), apply: () => any() });
    const LV = ['easy', 'medium', 'hard'];
    const ctx = {
      newcomer,
      firstLevel(old, easy) { return newcomer ? (arguments.length > 1 ? easy : 'easy') : old; },
      store: { get: (k, d) => (k === 'prefs' && saved !== undefined ? JSON.parse(JSON.stringify(saved)) : (d === undefined ? null : d)), set() {} }
    };
    const known = {
      ctx, LEVELS: LV, LEVEL_KEYS: LV, DIFFS: LV, GOALS: [200], C: any(), el: any(),
      // the engine: the level helpers for real, anything else a harmless proxy
      E: new Proxy({ LEVELS: LV, levelOf: (v) => (LV.indexOf(v) >= 0 ? v : 'medium'), CAR_IDS: ['buggy'], MAX_BOTS: 5 },
        { get: (t, p) => (p in t ? t[p] : any()) })
    };
    const env = new Proxy(known, {
      has: (t, p) => typeof p === 'string' && !(p in globalThis) && p !== 'prefs' && p !== 'undefined',
      get: (t, p) => (p in t ? t[p] : (p === Symbol.unscopables ? undefined : any()))
    });
    const box = vm.createContext({ env, Number, Array, Object, JSON, Math, String });
    return vm.runInContext('with (env) { ' + code + '\n; (function () { return typeof prefs.diff === "string" ? prefs.diff : prefs.level; })() }', box);
  }

  function testGamesStartEasy() {
    head('Easy first: every game with an opponent level starts on Easy only for a newcomer (#1248)');
    const all = WORD.concat(NUMERIC);
    ok(all.length >= 50, 'the list of opponent-level games is not empty (' + all.length + ')');
    for (const id of all) {
      const num = NUMERIC.indexOf(id) >= 0;
      const [EASY, MID, HARD] = num ? [1, 2, 3] : ['easy', 'medium', 'hard'];
      const key = id === 'motorush' ? 'diff' : 'level';
      const code = prefsBlock(id);
      ok(!!code, id + ': its prefs lines were found');
      if (!code) continue;
      let r;
      try {
        r = [settle(code, true, undefined), settle(code, false, undefined), settle(code, false, { [key]: HARD }),
          settle(code, false, { [key]: EASY })];
      } catch (e) { ok(false, id + ': its prefs lines ran (' + e.message + ')'); continue; }
      ok(r[0] === EASY, id + ': a first-time player starts on ' + EASY + ' (got ' + r[0] + ')');
      ok(r[1] === MID, id + ': a returning player with no saved level keeps ' + MID + ' (got ' + r[1] + ')');
      ok(r[2] === HARD && r[3] === EASY, id + ': a saved level stays (got ' + r[2] + ', ' + r[3] + ')');
    }
  }

  function testEasyFirstCoverage() {
    head('Easy first: no opponent-level game is missed, and no daily level moved (#1248)');
    const ids = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games.map((g) => g.id);
    ok(ids.length > 0, 'games.json lists games');
    const named = ids.filter((id) => /'easy'/.test(src(id)));
    ok(named.length > 0, 'some games name an easy level');
    const listed = new Set(WORD.concat(NUMERIC, Object.keys(LEFT)));
    for (const id of WORD.concat(NUMERIC, Object.keys(LEFT))) ok(ids.indexOf(id) >= 0, id + ' is in games.json');
    for (const id of named) ok(listed.has(id), id + ' names an easy level and is either switched to Easy-first or left with a reason');
    ok(/var PREFS0 = \{[^}]*level: 'easy'/.test(src('chess')), 'chess: its bot already defaults to easy');
    for (const id of WORD.concat(NUMERIC)) {
      const s = src(id);
      ok(s.indexOf('ctx.firstLevel(') >= 0, id + ' uses ctx.firstLevel');
      const bad = s.split('\n').filter((l) => /daily/i.test(l) && l.indexOf('firstLevel') >= 0);
      ok(bad.length === 0, id + ': no daily line takes the first-time level' + (bad.length ? ' (' + bad[0].trim().slice(0, 80) + ')' : ''));
    }
  }

  return { testNewcomerCore, testGamesStartEasy, testEasyFirstCoverage };
};
