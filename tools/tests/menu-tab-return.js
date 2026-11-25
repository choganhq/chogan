'use strict';
// #1168: a game opened from the Daily tab came back to the games tab. The menu now keeps the
// tab a game was opened from in sessionStorage and the next load starts there, once. The
// page's own functions are extracted and run against a fake sessionStorage.
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT } = T;
  function testMenuTabReturn() {
    head('Menu: a game returns to the tab it was opened from (#1168)');
    const html = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
    const keep = html.match(/ {2}var TAB_KEY = [^\n]*\n {2}function takeSavedTab\(\) \{[\s\S]*?\n {2}\}\n/);
    const go = html.match(/ {2}function goGame\(g, daily\) \{[\s\S]*?\n {2}\}\n/);
    const tabs = html.match(/ {2}var TABS = \[[\s\S]*?\n {2}\];\n(?: {2}[^\n]*\n){2}/);
    ok(!!keep && !!go && !!tabs, 'the menu has takeSavedTab, goGame and the tab list with its restore');
    if (!keep || !go || !tabs) return;
    const store = {};
    const sessionStorage = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    };
    const urls = [];
    function load(startTab) {
      const box = {
        sessionStorage, tab: 'home', urls,
        C: { markNav() {}, feedback() {} },
        location: {},
        setTimeout: (fn) => fn(),
        viewHome() {}, viewDaily() {}, viewLeague() {}, viewAchievements() {}, viewProfile() {}
      };
      vm.createContext(box);
      vm.runInContext('var tab = "home";' + keep[0] + go[0] + tabs[0] +
        'this.go = function (t, g, d) { tab = t; goGame(g, d); this.url = location.href; };' +
        'this.tabNow = function () { return tab; };', box);
      return box;
    }
    const first = load();
    ok(first.tabNow() === 'home', 'a fresh window starts on the games tab');
    first.go('daily', { path: 'games/sudoku/index.html' }, '2026-11-25');
    ok(first.url === 'games/sudoku/index.html?daily=2026-11-25', 'the daily game still opens with its date');
    const back = load();
    ok(back.tabNow() === 'daily', 'coming back from a game opened on Daily shows Daily');
    const again = load();
    ok(again.tabNow() === 'home', 'the saved tab is used once: a later reload starts on the games tab');
    again.go('ach', { path: 'games/chess/index.html' });
    ok(load().tabNow() === 'ach', 'the same holds for the achievements tab');
    store['chogan.menuTab'] = 'nope';
    ok(load().tabNow() === 'home', 'an unknown saved value falls back to the games tab');
  }
  return { testMenuTabReturn };
};
