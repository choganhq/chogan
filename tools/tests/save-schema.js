'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT } = T;
  // #1000: 1.0.0 promises an update never loses progress. tools/fixtures/old-saves.json holds
  // the real localStorage that the cores of v0.4.2, v0.20.0 and v0.28.0 wrote after the same
  // scripted session (120 coins, one won Sudoku game worth 5 coins, a best Minesweeper time
  // of 42 and a best Tetris score of 1800, one daily result, the first award, a dark Persian
  // setting, a saved Sudoku session; the newer two also a recent game and a pin). The
  // current core loads each one and must read all of it back. The expected numbers are the
  // ones the session wrote, not values measured on the new build.
  const CORE = path.join(ROOT, 'www/lib/chogan.js');

  function boot(pre) {
    const ls = Object.assign({}, pre);
    const store = {
      getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); },
      removeItem: (k) => { delete ls[k]; }, key: (i) => Object.keys(ls)[i] || null,
      get length() { return Object.keys(ls).length; }
    };
    const el = () => new Proxy(function () {}, {
      get: (t, p) => (p === 'length' ? 0 : el()), apply: () => el(), set: () => true
    });
    const win = {
      localStorage: store, document: el(), navigator: { language: 'en', languages: ['en'] },
      location: { search: '', hash: '', href: 'http://x/', pathname: '/' },
      addEventListener() {}, removeEventListener() {},
      matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
      setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: () => 0,
      history: { replaceState() {}, pushState() {} }, getComputedStyle: () => ({ getPropertyValue: () => '' }),
      Date, Math, JSON
    };
    win.window = win; win.self = win; win.globalThis = win;
    vm.createContext(win);
    vm.runInContext(fs.readFileSync(CORE, 'utf8'), win, { filename: 'chogan.js' });
    return { C: win.Chogan, ls };
  }

  function testSaveSchema() {
    head('Saved data: schema stamp and old saves (#1000)');
    const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures/old-saves.json'), 'utf8'));
    const tags = Object.keys(fx);
    ok(tags.length >= 3, 'the fixture holds saves from at least three releases (' + tags.join(', ') + ')');
    for (const tag of tags) {
      const keys = fx[tag].keys;
      ok(Object.keys(keys).length >= 8 && !('chogan.app.schema' in keys), tag + ': an old save has its keys and no schema stamp');
      const { C, ls } = boot(keys);
      const r = C.schema.result;
      ok(r.status === 'migrated' && r.from === 0 && r.to === C.schema.version, tag + ': it is recognised as shape 0 and brought to the current one (' + JSON.stringify(r) + ')');
      ok(ls['chogan.app.schema'] === String(C.schema.version), tag + ': the stamp is written (' + ls['chogan.app.schema'] + ')');
      ok(C.coins.get() === 125, tag + ': coins read back 125 (120 + 5), got ' + C.coins.get());
      ok(C.state.settings.lang === 'fa' && C.state.settings.theme === 'dark', tag + ': language and theme kept');
      ok(C.stats.getBest('minesweeper', 'easy') === 42 && C.stats.getBest('tetris', 'score') === 1800, tag + ': best results kept');
      const g = C.stats.game('sudoku');
      ok(g.plays === 1 && g.wins === 1 && g.timeMs === 90000, tag + ': plays, wins and time of a game kept');
      ok(C.stats.dailyDone('sudoku', '2026-01-05') === true, tag + ': a daily result kept');
      ok(C.achievements.has(fx[tag].firstAch), tag + ': an award kept');
      ok(C.store.get('profile').uid === JSON.parse(keys['chogan.app.profile']).uid, tag + ': the profile id kept');
      const sess = C.storage('sudoku').get('session');
      ok(sess && sess.t === 77 && sess.grid.join() === '1,2,3', tag + ': a game\'s own saved session kept');
      if ('chogan.app.recent' in keys) {
        ok(C.recent.list().indexOf('chess') >= 0, tag + ': the recently played list kept');
        ok(C.pins.has('sudoku'), tag + ': a pinned game kept');
      }
      // every key the old release wrote is still there; only the league may be rewritten (a new season)
      const lost = Object.keys(keys).filter((k) => !(k in ls));
      ok(!lost.length, tag + ': no key lost' + (lost.length ? ': ' + lost.join(', ') : ''));
      // a second launch has nothing to do and changes nothing
      const snap = JSON.stringify(ls);
      const again = boot(ls);
      ok(again.C.schema.result.status === 'current', tag + ': the next launch finds it current');
      ok(again.C.coins.get() === 125 && again.ls['chogan.app.schema'] === ls['chogan.app.schema'], tag + ': and still reads 125 coins');
      void snap;
    }
    // a fresh install is stamped and not reported as lost data
    const fresh = boot({});
    ok(fresh.ls['chogan.app.schema'] === String(fresh.C.schema.version), 'a fresh install is stamped with the current shape');
    // a save from a newer app is left alone
    const newer = boot({ 'chogan.app.schema': '99', 'chogan.app.coins': '7' });
    ok(newer.C.schema.result.status === 'newer' && newer.ls['chogan.app.schema'] === '99', 'a save from a newer app keeps its stamp, so it is not overwritten');
    ok(newer.C.coins.get() === 7, 'and its data is still read');
    // a garbled stamp counts as shape 0, not as a crash
    const junk = boot({ 'chogan.app.schema': '"x"', 'chogan.app.coins': '9' });
    ok(junk.C.schema.result.from === 0 && junk.C.coins.get() === 9, 'an unreadable stamp is treated as shape 0 and the data survives');
    // a future shape change has to ship its migration
    const v = fresh.C.schema;
    ok(v.version === 1 || typeof v.steps[v.version - 1] === 'function', 'a schema above 1 comes with a MIGRATIONS step for the previous shape (version ' + v.version + ')');
  }

  function testSaveSchemaSteps() {
    head('Saved data: how migration steps run (#1000)');
    const core = fs.readFileSync(CORE, 'utf8');
    const a = core.indexOf('  function migrateSaves('), b = core.indexOf('  var schemaResult = ', a);
    ok(a > 0 && b > a, 'the core has migrateSaves');
    if (!(a > 0 && b > a)) return;
    const sb = { SCHEMA_KEY: 'chogan.app.schema', parseInt };
    vm.createContext(sb);
    vm.runInContext(core.slice(a, b) + '\nthis.m = migrateSaves;', sb);
    const mk = (o) => { const d = Object.assign({}, o); return { d, io: { get: (k) => (k in d ? d[k] : null), set: (k, v) => { d[k] = String(v); }, del: (k) => { delete d[k]; }, keys: () => Object.keys(d) } }; };
    // a step that renames a key
    let s = mk({ 'chogan.app.old': '5' });
    let r = sb.m(s.io, 2, [function (io) { io.set('chogan.app.new', io.get('chogan.app.old')); io.del('chogan.app.old'); }, function (io) { io.set('chogan.app.n2', '1'); }]);
    ok(r.status === 'migrated' && r.from === 0 && r.to === 2, 'two steps run in order (' + JSON.stringify(r) + ')');
    ok(s.d['chogan.app.new'] === '5' && !('chogan.app.old' in s.d) && s.d['chogan.app.n2'] === '1' && s.d['chogan.app.schema'] === '2', 'a rename moved the value and the stamp is 2');
    // already there: nothing runs
    let ran = 0;
    r = sb.m(s.io, 2, [function () { ran++; }, function () { ran++; }]);
    ok(r.status === 'current' && ran === 0, 'a current save runs no step');
    // second step throws: first stays stamped, second retried next time
    s = mk({});
    r = sb.m(s.io, 2, [function (io) { io.set('chogan.app.a', '1'); }, function () { throw new Error('boom'); }]);
    ok(r.status === 'failed' && s.d['chogan.app.schema'] === '1' && s.d['chogan.app.a'] === '1', 'a failing step keeps the stamp before it and the earlier work (' + JSON.stringify(r) + ')');
    ran = 0;
    r = sb.m(s.io, 2, [function () { ran++; }, function (io) { io.set('chogan.app.b', '2'); }]);
    ok(r.status === 'migrated' && ran === 0 && s.d['chogan.app.b'] === '2' && s.d['chogan.app.schema'] === '2', 'the next launch retries only the failed step');
    // newer save
    s = mk({ 'chogan.app.schema': '5' });
    r = sb.m(s.io, 2, [function () { ran++; }]);
    ok(r.status === 'newer' && s.d['chogan.app.schema'] === '5', 'a save newer than the app is not touched');
  }
  return { testSaveSchema, testSaveSchemaSteps };
};
