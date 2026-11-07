'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT } = T;
  // Chogan Plus keeps progress in Play Games Saved Games (#702, choganhq/chogan-plus#3).
  // The risky part is order: a fresh install must read the cloud copy before it ever saves,
  // or its first hide would overwrite a player's progress with an empty one. A fake plugin
  // and a fake localStorage run every path here without a phone.
  async function testCloudSave() {
    head('Chogan Plus: progress in Saved Games (#702)');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const a = core.indexOf('  var CLOUD_NAME = ');
    const b = core.indexOf('  var gamesPlugin = ', a);
    ok(a > 0 && b > a, 'the core has makeCloud');
    if (!(a > 0 && b > a)) { ok(false, 'the cloud checks could not run'); return; }
    const sb = { NS: 'chogan', Promise, JSON };
    vm.createContext(sb);
    vm.runInContext(core.slice(a, b) + '\nthis.makeCloud = makeCloud;', sb);

    function setup(o) {
      const ls = Object.assign({}, o.local || {});
      const calls = { load: 0, save: [], reload: 0 };
      const P = {
        status: () => Promise.resolve({ authenticated: o.signedIn !== false, name: 'Tester' }),
        load: () => { calls.load++; return Promise.resolve({ data: o.cloud === undefined ? null : o.cloud }); },
        save: (x) => { calls.save.push(x); return o.saveFails ? Promise.reject(new Error('offline')) : Promise.resolve({ modified: 1 }); }
      };
      const io = {
        fresh: !Object.keys(ls).some((k) => k.indexOf('chogan.') === 0),
        keys: () => Object.keys(ls), get: (k) => (k in ls ? ls[k] : null), set: (k, v) => { ls[k] = v; },
        reload: () => { calls.reload++; }
      };
      return { ls, calls, cloud: sb.makeCloud(P, io) };
    }
    const snap = (keys) => JSON.stringify({ v: 1, keys });

    // A fresh install with a cloud copy gets it back and reloads, and saves nothing
    let s = setup({ cloud: snap({ 'chogan.app.settings': '{"lang":"en"}', 'chogan.sudoku.best': '12', 'other.key': 'x' }) });
    let early = await s.cloud.push();
    ok(early === false && !s.calls.save.length, 'nothing is saved before the first cloud read has finished');
    let how = await s.cloud.ready;
    ok(how === 'restored' && s.calls.reload === 1, 'a fresh install with a cloud copy restores it and reloads');
    ok(s.ls['chogan.sudoku.best'] === '12' && s.ls['chogan.app.settings'] === '{"lang":"en"}', 'every chogan.* key comes back as it was saved');
    ok(!('other.key' in s.ls), 'a key outside chogan.* in the snapshot is not written');
    ok((await s.cloud.push()) === false && !s.calls.save.length, 'the page that is about to reload never saves its old state over the restore');

    // An install that already has progress keeps it and never reads the cloud
    s = setup({ local: { 'chogan.app.coins': '40' }, cloud: snap({ 'chogan.app.coins': '9' }) });
    how = await s.cloud.ready;
    ok(how === 'kept' && s.calls.load === 0 && s.calls.reload === 0 && s.ls['chogan.app.coins'] === '40', 'existing local progress is kept and the cloud is not read');
    ok((await s.cloud.push()) === true && s.calls.save.length === 1, 'a hide after that saves a snapshot');
    const saved = JSON.parse(s.calls.save[0].data);
    ok(s.calls.save[0].name === 'progress' && saved.v === 1 && saved.keys['chogan.app.coins'] === '40', 'the snapshot holds the local keys under save name "progress"');
    ok((await s.cloud.push()) === false && s.calls.save.length === 1, 'an unchanged state is not saved again');
    s.ls['chogan.app.coins'] = '41';
    ok((await s.cloud.push()) === true && s.calls.save.length === 2, 'a changed state is saved on the next hide');

    // A fresh install with nothing in the cloud starts empty and then saves normally
    s = setup({});
    how = await s.cloud.ready;
    ok(how === 'empty' && s.calls.reload === 0, 'a fresh install with no cloud copy does not reload');
    s.ls['chogan.app.coins'] = '5';
    ok((await s.cloud.push()) === true, 'and saves its first progress');

    // A damaged cloud copy is ignored, not half-applied
    s = setup({ cloud: '{not json' });
    ok((await s.cloud.ready) === 'empty' && s.calls.reload === 0 && !Object.keys(s.ls).length, 'a damaged cloud copy changes nothing');

    // Not signed in: no read, no save
    s = setup({ signedIn: false, local: { 'chogan.app.coins': '3' } });
    await s.cloud.ready;
    ok((await s.cloud.push()) === false && !s.calls.save.length && s.calls.load === 0, 'a player who is not signed in is never read or saved');

    // A failed save is retried on the next hide even if nothing changed
    s = setup({ local: { 'chogan.app.coins': '3' }, saveFails: true });
    await s.cloud.ready;
    ok((await s.cloud.push()) === false && s.calls.save.length === 1, 'a failed save reports false');
    await s.cloud.push();
    ok(s.calls.save.length === 2, 'a failed save is tried again on the next hide, though nothing changed');

    // Wiring: only Chogan Plus with the plugin, and FRESH is read before any write
    ok(/var gamesPlugin = PLUS && global\.Capacitor && global\.Capacitor\.Plugins && global\.Capacitor\.Plugins\.ChoganGames;/.test(core),
      'the cloud is created only in Chogan Plus with the ChoganGames plugin (never on the web, the PWA or F-Droid)');
    const fresh = core.indexOf('  var FRESH = ');
    const firstWrite = core.indexOf('rawSet(', core.indexOf('  function rawDel(key) {'));
    ok(fresh > 0 && fresh < core.indexOf('  function rawGet(key) {') && fresh < firstWrite, 'FRESH is read before the core can write any key');
  }
  return { testCloudSave };
};
