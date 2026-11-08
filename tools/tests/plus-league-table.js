'use strict';
// chogan-plus#20 (#729): the Plus league page showed only a button to Play's own leaderboard
// screen; the owner asked for the table in the app. Chogan.cloud.top() turns the native
// loadScores answer into rows, and the page draws them. A fake plugin runs every path here.
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT, LOCALE_CODES } = T;
  async function testPlusLeagueTable() {
    head('Chogan Plus: the weekly league table in the app (#729)');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const page = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
    const a = core.indexOf('  var CLOUD_NAME = ');
    const b = core.indexOf('  var gamesPlugin = ', a);
    ok(a > 0 && b > a, 'the core has makeCloud');
    if (!(a > 0 && b > a)) { ok(false, 'the league table checks could not run'); return; }
    const sb = { NS: 'chogan', Promise, JSON };
    vm.createContext(sb);
    vm.runInContext(core.slice(a, b) + '\nthis.makeCloud = makeCloud;', sb);
    const asked = [];
    const mk = (auth, extra) => sb.makeCloud(Object.assign({
      status: () => Promise.resolve({ authenticated: auth, name: 'T' }),
      load: () => Promise.resolve({ data: null }), save: () => Promise.resolve({}),
      submitScore: () => Promise.resolve(), showLeaderboard: () => Promise.resolve()
    }, extra), { fresh: false, keys: () => [], get: () => null, set: () => {}, reload: () => {} });
    const answer = (r) => ({ loadScores: (o) => { asked.push(o); return typeof r === 'function' ? r() : Promise.resolve(r); } });

    const c = mk(true, answer({ rows: [
      { rank: 2, name: 'Bita', score: 300 }, { rank: 1, name: '  Arman  ', score: 410.7 },
      { rank: 3, name: 'Me', score: 120, me: true }, { rank: 0, name: 'bad', score: 5 }, null
    ], me: { rank: 3, name: 'Me', score: 120 } }));
    ok(typeof c.top === 'function', 'the cloud offers top() for the league table');
    if (typeof c.top !== 'function') return;
    await c.ready;
    const rows = await c.top();
    ok(Array.isArray(rows) && rows.length === 3, 'top() returns the valid rows and drops broken ones (' + JSON.stringify(rows) + ')');
    if (Array.isArray(rows) && rows.length === 3) {
      ok(rows.map((r) => r.rank).join() === '1,2,3', 'rows come in rank order');
      ok(rows[0].name === 'Arman' && rows[0].score === 410, 'names are trimmed and scores are whole numbers');
      ok(rows.filter((r) => r.me).length === 1 && rows[2].me, 'the player is marked once, not added twice when already in the top');
    }
    ok(asked.length === 1 && asked[0].max === 10, 'it asks the native side for the top ten');

    const below = await (async () => { const x = mk(true, answer({ rows: [{ rank: 1, name: 'A', score: 9 }], me: { rank: 57, name: 'Me', score: 3 } })); await x.ready; return x.top(); })();
    ok(Array.isArray(below) && below.length === 2 && below[1].rank === 57 && below[1].me, 'a player outside the top gets their own row below it');
    const empty = await (async () => { const x = mk(true, answer({ rows: [], me: null })); await x.ready; return x.top(); })();
    ok(Array.isArray(empty) && empty.length === 0, 'an empty week is an empty list, not a failure');
    const failed = await (async () => { const x = mk(true, answer(() => Promise.reject(new Error('offline')))); await x.ready; return x.top(); })();
    ok(failed === null, 'Play failing (offline) gives null, never an error');
    const old = await (async () => { const x = mk(true, {}); await x.ready; return x.top(); })();
    ok(old === null, 'an older Plus without loadScores gives null');
    const out = await (async () => { const x = mk(false, answer({ rows: [{ rank: 1, name: 'A', score: 1 }] })); await x.ready; return x.top(); })();
    ok(out === null && asked.length === 4, 'a signed-out player asks nothing');

    // The page: rows drawn like the local table, Play's own screen kept behind "See all"
    const lv = page.slice(page.indexOf('  function viewLeague() {'), page.indexOf('  /* ------------------------------------------------------ دستاوردها */'));
    const plus = lv.slice(lv.indexOf('if (C.cloud) {'), lv.indexOf('C.league.table()'));
    ok(/C\.cloud\.top\(\)\.then\(function \(rows\) \{\s*if \(!rows\) return;/.test(plus), 'the league page asks for the rows and keeps the plain button when there are none to show');
    ok(/class: 'ch-rank' \+ \(r\.me \? ' ch-rank--me' : ''\)/.test(plus) && /C\.num\(r\.rank\)/.test(plus) && /C\.num\(r\.score\)/.test(plus), 'each row shows rank, name and points, the player highlighted');
    ok(/label\.textContent = C\.t\('playSeeAll'\)/.test(plus) && /C\.cloud\.board\(\)/.test(plus), 'the button becomes "See all" and still opens Play\'s screen');
    ok(/r\.rank > rows\[i - 1\]\.rank \+ 1/.test(plus) && /ch-rank--gap/.test(plus), 'a gap row separates the top from the player\'s own row');
    ok(/class: 'ch-rank__name' \}, \[el\('bdi'/.test(plus), 'a player name in another script keeps its own order but lines up with the page');
    const missing = ['playSeeAll', 'playBoardEmpty'].filter((k) => (core.match(new RegExp('[ ,{]' + k + ": '", 'g')) || []).length !== LOCALE_CODES.length);
    ok(!missing.length, 'the new league texts exist in every language' + (missing.length ? ' (missing: ' + missing.join(', ') + ')' : ''));
  }
  return { testPlusLeagueTable };
};
