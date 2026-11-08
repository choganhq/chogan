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

    // A later sign-in from the profile (#705): the player declined at launch, then taps "Sign in"
    s = setup({ signedIn: false });
    ok(typeof s.cloud.signIn === 'function', 'the cloud offers signIn() for a player who declined at launch');
    if (typeof s.cloud.signIn === 'function') {
      await s.cloud.ready;
      let late = { authenticated: true, name: 'Hossein', id: 'p1' };
      const P2 = { status: () => Promise.resolve({ authenticated: false }), signIn: () => Promise.resolve(late),
        load: () => Promise.resolve({ data: snap({ 'chogan.app.coins': '77' }) }), save: () => Promise.resolve({}) };
      const ls2 = {}; let reloads = 0;
      const c2 = sb.makeCloud(P2, { fresh: true, keys: () => Object.keys(ls2), get: (k) => ls2[k], set: (k, v) => { ls2[k] = v; }, reload: () => { reloads++; } });
      await c2.ready;
      const who = await c2.signIn();
      ok(who.authenticated && who.name === 'Hossein' && c2.player().name === 'Hossein', 'signIn() resolves to the signed-in player and player() reports the name');
      ok(ls2['chogan.app.coins'] === '77' && reloads === 1, 'a fresh install that signs in later still gets its cloud copy back');
      const P3 = Object.assign({}, P2, { load: () => Promise.resolve({ data: null }) });
      const ls3 = { 'chogan.app.coins': '5' }; const saves3 = [];
      P3.save = (x) => { saves3.push(x); return Promise.resolve({}); };
      const c3 = sb.makeCloud(P3, { fresh: false, keys: () => Object.keys(ls3), get: (k) => ls3[k], set: (k, v) => { ls3[k] = v; }, reload: () => {} });
      await c3.ready;
      ok((await c3.push()) === false, 'before signing in, nothing is saved');
      await c3.signIn();
      ok((await c3.push()) === true && saves3.length === 1, 'after a later sign-in, the next hide saves');
      late = { authenticated: false };
      const c4 = sb.makeCloud(Object.assign({}, P2, { signIn: () => Promise.resolve(late) }), { fresh: true, keys: () => [], get: () => null, set: () => {}, reload: () => {} });
      await c4.ready;
      ok((await c4.signIn()).authenticated === false, 'a declined sign-in resolves to a signed-out player, not an error');
    }

    // The Plus profile shows the Play Games name and state (#705)
    const page = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
    const prof = page.slice(page.indexOf('  function viewProfile() {'), page.indexOf('  function viewProfile() {') + 6000);
    ok(/C\.cloud\.ready\.then/.test(prof) && /C\.cloud\.player\(\)/.test(prof), 'the profile reads the Play Games player once the cloud is ready');
    ok(/C\.t\('playIn'/.test(prof) && /C\.t\('playOut'\)/.test(prof) && /C\.cloud\.signIn\(\)/.test(prof), 'the profile shows signed in / not signed in and offers sign-in');
    // #731 reversed the #705 rule "a typed name wins": signed in, the Play name is the name (tools/tests/plus-profile.js)
    ok(/if \(p\.name\) nameLine\.textContent = p\.name;/.test(prof), 'the profile shows the Play Games name when signed in');

    // The Plus league is Play's weekly leaderboard, not generated rivals (#707)
    {
      const sent = []; let shown = 0;
      const mk = (auth, extra) => sb.makeCloud(Object.assign({ status: () => Promise.resolve({ authenticated: auth, name: 'T' }),
        load: () => Promise.resolve({ data: null }), save: () => Promise.resolve({}),
        submitScore: (x) => { sent.push(x); return Promise.resolve(); },
        showLeaderboard: () => { shown++; return Promise.resolve(); } }, extra || {}),
        { fresh: false, keys: () => [], get: () => null, set: () => {}, reload: () => {} });
      const c = mk(true);
      ok(typeof c.score === 'function' && typeof c.board === 'function', 'the cloud offers score() and board() for the league');
      if (typeof c.score === 'function' && typeof c.board === 'function') {
        await c.ready;
        ok((await c.score(120.4)) === true && sent.length === 1 && sent[0].score === 120 && !('leaderboard' in sent[0]), 'a signed-in player\'s weekly points are sent as a whole number, the id left to the native side');
        ok((await c.score(0)) === false && sent.length === 1, 'zero points send nothing');
        ok((await c.board()) === true && shown === 1, 'board() opens Play\'s leaderboard');
        const out = mk(false); await out.ready;
        ok((await out.score(50)) === false && (await out.board()) === false && sent.length === 1 && shown === 1, 'a signed-out player sends nothing and opens nothing');
        const bad = mk(true, { submitScore: () => Promise.reject(new Error('offline')) }); await bad.ready;
        ok((await bad.score(5)) === false, 'a failed submit is false, not an error');
      }
      ok(/if \(points && Chogan\.cloud\) Chogan\.cloud\.score\(state\.league\.points\)/.test(core), 'every league gain sends the week\'s total in Plus');
      const lv = page.slice(page.indexOf('  function viewLeague() {'), page.indexOf('  /* ------------------------------------------------------ دستاوردها */'));
      const plusAt = lv.indexOf('if (C.cloud) {'), tableAt = lv.indexOf('C.league.table()');
      ok(plusAt > 0 && tableAt > plusAt && /C\.cloud\.board\(\)/.test(lv) && /return page;\s*\}\s*\n\s*var rows = C\.league\.table\(\)/.test(lv),
        'in Plus the league view returns before the generated table and offers Play\'s board instead');
      const fa = core.slice(core.indexOf('playIn:'), core.indexOf('playIn:') + 600);
      ok((core.match(/\bplayBoard: '[^']+', playBoardIn: '[^']+', playBoardOut: '[^']+'/g) || []).length === T.LOCALE_CODES.length && fa.indexOf('playBoard:') > 0,
        'the league texts exist in every language');
    }

    // Wiring: only Chogan Plus with the plugin, and FRESH is read before any write
    ok(/var gamesPlugin = PLUS && global\.Capacitor && global\.Capacitor\.Plugins && global\.Capacitor\.Plugins\.ChoganGames;/.test(core),
      'the cloud is created only in Chogan Plus with the ChoganGames plugin (never on the web, the PWA or F-Droid)');
    const fresh = core.indexOf('  var FRESH = ');
    const firstWrite = core.indexOf('rawSet(', core.indexOf('  function rawDel(key) {'));
    ok(fresh > 0 && fresh < core.indexOf('  function rawGet(key) {') && fresh < firstWrite, 'FRESH is read before the core can write any key');
  }
  return { testCloudSave };
};
