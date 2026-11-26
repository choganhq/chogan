'use strict';
// #1211: progress lives only in this browser's localStorage, so moving to a new phone lost
// everything. Profile → Move your progress writes a file of every chogan.* key and reads one
// back. The file is untrusted input: these groups feed the real core round trips and hostile
// files, and check that a failure halfway leaves the old progress exactly as it was.
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT, LOCALE_CODES } = T;
  const CORE = path.join(ROOT, 'www/lib/chogan.js');

  // a localStorage with a size limit like a browser's: keys plus values, in characters
  const used = (ls) => Object.keys(ls).reduce((n, k) => n + k.length + ls[k].length, 0);
  // opts.tab: another boot() whose storage this one shares, like a second tab of the app
  function boot(pre, opts) {
    const o = opts || {};
    if (o.tab) return start(o.tab.ls, o.tab.store, o);
    const ls = Object.assign({}, pre);
    const store = {
      cap: Infinity,
      getItem: (k) => (Object.prototype.hasOwnProperty.call(ls, k) ? ls[k] : null),
      setItem: (k, v) => {
        const next = Object.assign({}, ls, { [k]: String(v) });
        if (used(next) > store.cap) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
        ls[k] = String(v);
      },
      removeItem: (k) => { delete ls[k]; }, key: (i) => Object.keys(ls)[i] || null,
      get length() { return Object.keys(ls).length; }
    };
    if (o.broken) store.setItem = () => { throw new Error('SecurityError'); };
    return start(ls, store, o);
  }
  function start(ls, store, o) {
    const ev = {};
    let reloads = 0;
    const el = () => new Proxy(function () {}, {
      get: (t, p) => (p === 'length' ? 0 : el()), apply: () => el(), set: () => true
    });
    const win = {
      localStorage: store, document: el(), navigator: { language: 'en', languages: ['en'] },
      location: { search: '', hash: '', href: 'http://x/', pathname: '/', reload: () => { reloads++; } },
      addEventListener(t, f) { (ev[t] = ev[t] || []).push(f); }, removeEventListener() {},
      matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
      setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: () => 0,
      history: { replaceState() {}, pushState() {} }, getComputedStyle: () => ({ getPropertyValue: () => '' }),
      Date, Math, JSON, APP_VERSION: o.version || '1.2.3'
    };
    win.window = win; win.self = win; win.globalThis = win;
    vm.createContext(win);
    vm.runInContext(fs.readFileSync(CORE, 'utf8'), win, { filename: 'chogan.js' });
    const fire = (t, e) => (ev[t] || []).forEach((f) => f(e || {}));
    return { C: win.Chogan, ls, store, fire, reloads: () => reloads };
  }
  const snap = (ls) => JSON.stringify(Object.keys(ls).sort().map((k) => [k, ls[k]]));

  function testExportImportRoundTrip() {
    head('Export and import: a round trip to a new device (#1211)');
    const old = boot({});
    const C = old.C;
    ok(!!(C.backup && typeof C.backup.build === 'function' && typeof C.backup.parse === 'function' && typeof C.backup.restore === 'function'),
      'the core has Chogan.backup with build, parse and restore');
    if (!C.backup) return;
    // a played device: coins, an award, settings, a pin, a game's saved session, a daily key
    C.coins.add(340);
    C.state.settings.lang = 'de'; C.state.settings.theme = 'dark'; C.state.settings.pinned = ['chess'];
    C.store.set('settings', C.state.settings);
    C.store.set('achievements', { 'sd-first': 1700000000000 });
    C.storage('sudoku').set('session', { inProgress: true, grid: [1, 2, 3], t: 77 });
    C.storage('sudoku').set('session.daily.2026-11-20', { inProgress: true, t: 5 });
    C.storage('minesweeper').set('prefs', { size: 'hard', note: '<img src=x onerror=alert(1)>' });
    old.ls['chogan.app.installNo'] = 'true';
    old.ls['other.app.key'] = 'not ours';
    const text = C.backup.build(Date.UTC(2026, 10, 20, 12, 0, 0));
    const file = JSON.parse(text);
    ok(file.app === 'chogan' && file.kind === 'progress' && file.format === 1 && file.schema === C.schema.version,
      'the file names the app, its kind, format 1 and the schema (' + file.schema + ')');
    ok(file.exported === '2026-11-20T12:00:00.000Z' && file.version === '1.2.3', 'it carries the export time and the app version');
    const ours = Object.keys(old.ls).filter((k) => k.indexOf('chogan.') === 0 && k !== 'chogan.app.schema' && k !== 'chogan.app.installNo');
    ok(ours.length >= 6 && ours.every((k) => file.keys[k] === old.ls[k]), 'every chogan.* key is in the file as the exact stored string (' + ours.length + ' keys)');
    ok(!('other.app.key' in file.keys) && !('chogan.app.installNo' in file.keys) && !('chogan.app.schema' in file.keys),
      'other origins\' keys, the browser-only install-bar flag and the stamp (sent as "schema") are left out');
    ok(text.indexOf('{"app":"chogan"') === 0, 'the file starts the way FileBridge.java checks');
    ok(C.backup.fileName(new Date(2026, 10, 20)) === 'chogan-progress-2026-11-20.json', 'the file name carries the day');

    // a new phone that already played a little: everything of it is replaced
    const neu = boot({ 'chogan.app.coins': '5', 'chogan.tetris.best': '99', 'chogan.app.installNo': 'false', 'zzz.keep': '1' });
    const r = neu.C.backup.parse(text);
    ok(r.ok && r.data.count === Object.keys(file.keys).length, 'the new phone accepts the file (' + JSON.stringify(r.ok ? r.data.count : r) + ')');
    const s = neu.C.backup.summary(r.data);
    ok(s.coins === 340 && s.awards === 1 && s.exported === file.exported, 'the confirm dialog reads 340 coins, 1 award and the date');
    const res = neu.C.backup.restore(r.data);
    ok(res.ok, 'restore reports success (' + JSON.stringify(res) + ')');
    ok(ours.every((k) => neu.ls[k] === old.ls[k]), 'every key reads back exactly as on the old phone');
    ok(!('chogan.tetris.best' in neu.ls), 'progress only the new phone had is gone: import replaces, it does not mix two players');
    ok(neu.ls['chogan.app.installNo'] === 'false' && neu.ls['zzz.keep'] === '1', 'the new browser\'s own install-bar flag and other origins\' keys are untouched');
    ok(neu.ls['chogan.app.schema'] === String(neu.C.schema.version), 'the schema stamp is written');
    neu.C.reloadState();
    ok(neu.C.coins.get() === 340 && neu.C.state.settings.lang === 'de' && neu.C.pins.has('chess'), 'after reload: 340 coins, German, chess pinned');
    ok(neu.C.storage('sudoku').get('session').t === 77 && neu.C.storage('minesweeper').get('prefs').note === '<img src=x onerror=alert(1)>',
      'a saved game and a game\'s settings come back, markup kept as plain text');
    // and a fresh boot of the core on that storage reads the same
    const again = boot(neu.ls);
    ok(again.C.schema.result.status === 'current' && again.C.coins.get() === 340 && again.C.achievements.has('sd-first'),
      'the next launch finds the data current, with its coins and award');
  }

  function testExportImportOldFile() {
    head('Export and import: an older file goes through the save migrations (#1211, #1000)');
    const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures/old-saves.json'), 'utf8'));
    const tags = Object.keys(fx);
    ok(tags.length >= 3, 'the old-saves fixture has saves from several releases');
    for (const tag of tags) {
      // a file as an export of shape 0 would look: the release wrote no stamp at all
      const text = JSON.stringify({ app: 'chogan', kind: 'progress', format: 1, schema: 0, version: '0.4.2', exported: '2026-01-05T10:00:00.000Z', keys: fx[tag].keys });
      const d = boot({});
      if (!d.C.backup) { ok(false, 'Chogan.backup exists'); return; }
      const r = d.C.backup.parse(text);
      ok(r.ok && r.data.schema === 0, tag + ': a shape-0 file is accepted');
      const res = d.C.backup.restore(r.data);
      ok(res.ok && d.ls['chogan.app.schema'] === String(d.C.schema.version), tag + ': it is migrated and stamped current');
      d.C.reloadState();
      ok(d.C.coins.get() === 125 && d.C.stats.getBest('minesweeper', 'easy') === 42, tag + ': coins and best results read back');
    }
    // a migration step that throws: nothing is written at all
    const d = boot({ 'chogan.app.coins': '9' });
    const before = snap(d.ls);
    const text = JSON.stringify({ app: 'chogan', kind: 'progress', format: 1, schema: 0, keys: { 'chogan.app.coins': '500' } });
    const r = d.C.backup.parse(text);
    const steps = d.C.schema.steps, saved = steps[0];
    steps[0] = function () { throw new Error('boom'); };
    const res = d.C.backup.restore(r.data);
    steps[0] = saved;
    if (saved === undefined) steps.length = 0;
    ok(!res.ok && res.error === 'migrate' && snap(d.ls) === before, 'a failing migration refuses the file and changes nothing (' + JSON.stringify(res) + ')');
  }

  function testExportImportHostile() {
    head('Export and import: hostile and broken files are refused (#1211)');
    const d = boot({ 'chogan.app.coins': '7' });
    if (!d.C.backup) { ok(false, 'Chogan.backup exists'); return; }
    const B = d.C.backup;
    const good = { app: 'chogan', kind: 'progress', format: 1, schema: d.C.schema.version, keys: { 'chogan.app.coins': '1' } };
    const mk = (patch) => JSON.stringify(Object.assign({}, good, patch));
    const cases = [
      ['not JSON', 'hello', 'bad'],
      ['JSON null', 'null', 'bad'],
      ['an array', '[1,2]', 'bad'],
      ['another app', mk({ app: 'other' }), 'bad'],
      ['no kind', mk({ kind: undefined }), 'bad'],
      ['format as a string', mk({ format: '1' }), 'bad'],
      ['format 0', mk({ format: 0 }), 'bad'],
      ['a fractional schema', mk({ schema: 0.5 }), 'bad'],
      ['a negative schema', mk({ schema: -1 }), 'bad'],
      ['a newer format', mk({ format: 2 }), 'newer'],
      ['a newer schema', mk({ schema: d.C.schema.version + 1 }), 'newer'],
      ['keys as an array', mk({ keys: ['a'] }), 'bad'],
      ['keys missing', mk({ keys: null }), 'bad'],
      ['no keys at all', mk({ keys: {} }), 'empty'],
      ['only the stamp and the local flag', mk({ keys: { 'chogan.app.schema': '1', 'chogan.app.installNo': 'true' } }), 'empty'],
      ['a key outside chogan.', mk({ keys: { 'chogan.app.coins': '1', 'evil.key': 'x' } }), 'bad'],
      ['a bare chogan. key', mk({ keys: { 'chogan.coins': '1' } }), 'bad'],
      ['a key with a space', mk({ keys: { 'chogan.app.co ins': '1' } }), 'bad'],
      ['a __proto__ key', '{"app":"chogan","kind":"progress","format":1,"schema":1,"keys":{"__proto__":"x","chogan.app.coins":"1"}}', 'bad'],
      ['a number value', mk({ keys: { 'chogan.app.coins': 500 } }), 'bad'],
      ['an object value', mk({ keys: { 'chogan.app.coins': { a: 1 } } }), 'bad'],
      ['too big', ' '.repeat(B.maxBytes + 1), 'size'],
      ['not a string', 42, 'size']
    ];
    ok(cases.length >= 20, 'there are ' + cases.length + ' hostile cases');
    for (const [name, text, want] of cases) {
      const r = B.parse(text);
      ok(!r.ok && r.error === want, name + ': refused as ' + want + ' (' + JSON.stringify(r) + ')');
    }
    // too many keys
    const many = {};
    for (let i = 0; i < 20001; i++) many['chogan.g.k' + i] = '1';
    ok(B.parse(mk({ keys: many })).ok === false, 'a file with more than 20000 keys is refused');
    ok(d.ls['chogan.app.coins'] === '7', 'none of them touched the stored progress');
    // a __proto__ inside a value is only a string
    const r = B.parse(mk({ keys: { 'chogan.app.coins': '1', 'chogan.app.settings': '{"__proto__":{"polluted":1}}' } }));
    ok(r.ok && Object.getPrototypeOf(r.data.keys) === null && ({}).polluted === undefined, 'the parsed keys have no prototype and nothing is polluted');
    // the summary trusts nothing in the file
    const odd = B.parse(mk({ exported: 'x'.repeat(500), version: '<b>', keys: { 'chogan.app.coins': '"lots"', 'chogan.app.achievements': '[1,2]' } }));
    const s = B.summary(odd.data);
    ok(s.coins === 0 && s.awards === 0 && s.exported === '' && odd.data.version === '', 'odd coins, awards, date and version read as zero or empty');
  }

  function testExportImportRollback() {
    head('Export and import: a failure halfway puts the old progress back (#1211)');
    const src = boot({});
    if (!src.C.backup) { ok(false, 'Chogan.backup exists'); return; }
    src.C.coins.add(900);
    for (let i = 0; i < 12; i++) src.C.storage('g' + i).set('best', i * 10);
    src.C.storage('g0').set('big', 'x'.repeat(3000));
    const text = src.C.backup.build();
    const need = used(JSON.parse(text).keys);
    // the new phone is nearly full: the file's data does not fit, the old data did
    const pre = { 'chogan.app.coins': '3', 'chogan.tetris.best': '1800', 'chogan.sudoku.session': '{"t":4}', 'other.site': 'y'.repeat(500) };
    for (const room of [0, 40, 1000, Math.floor(need / 2)]) {
      const d = boot(pre);
      const before = snap(d.ls);
      d.store.cap = used(d.ls) + room;
      const res = d.C.backup.restore(d.C.backup.parse(text).data);
      ok(!res.ok && res.error === 'storage', room + ' free characters of ' + need + ' needed: restore reports the failure (' + JSON.stringify(res) + ')');
      ok(snap(d.ls) === before, room + ' free: every old key is back exactly and no new one is left');
    }
    // the journal of the old keys (review of #1226, L1) needs room beside the new data
    const tight = boot(pre);
    const tightBefore = snap(tight.ls);
    tight.store.cap = used(tight.ls) + need;
    const tr = tight.C.backup.restore(tight.C.backup.parse(text).data);
    ok(!tr.ok && tr.error === 'storage' && snap(tight.ls) === tightBefore,
      'room for the data but not for the journal: refused, and nothing changed');
    const fits = boot(pre);
    const oldOurs = {};
    for (const k of Object.keys(fits.ls)) if (k.indexOf('chogan.') === 0) oldOurs[k] = fits.ls[k];
    const journal = 'chogan.app.restoreUndo'.length + JSON.stringify({ at: Date.now(), keys: oldOurs }).length;
    fits.store.cap = used(fits.ls) + need + journal + 16;
    ok(fits.C.backup.restore(fits.C.backup.parse(text).data).ok, 'with room for the data and the journal the same file imports (the old data is removed first)');
    ok(!('chogan.app.restoreUndo' in fits.ls), 'a finished import leaves no journal behind');
    // a write that "succeeds" but reads back different is a failure too
    const d = boot({ 'chogan.app.coins': '3' });
    const before = snap(d.ls);
    const set = d.store.setItem;
    d.store.setItem = (k, v) => set(k, k === 'chogan.app.coins' ? String(v).slice(0, 1) : v);
    const res = d.C.backup.restore(d.C.backup.parse(text).data);
    d.store.setItem = set;
    ok(!res.ok && snap(d.ls) === before, 'a value that does not read back aborts and restores');
  }

  function testExportImportUi() {
    head('Export and import: profile buttons, strings, Android bridge (#1211)');
    const html = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
    ok(/id: 'pf-backup'/.test(html) && /function backupCard\(\)/.test(html), 'the profile has a backup section built by backupCard()');
    const a = html.indexOf('function backupCard()'), b = html.indexOf('function unlockShop()', a);
    const ui = a > 0 && b > a ? html.slice(a, b) : '';
    ok(ui.length > 500, 'backupCard found');
    ok(!/innerHTML|html:|insertAdjacentHTML|eval\(|new Function/.test(ui), 'the file\'s content is never rendered as HTML or run');
    ok(/C\.backup\.parse\(/.test(ui) && /C\.backup\.restore\(/.test(ui) && /C\.ui\.confirm\(/.test(ui), 'import parses, asks first, then restores');
    ok(/f\.size > C\.backup\.maxBytes/.test(ui), 'the file size is checked before it is read');
    ok(/window\.ChoganFiles/.test(ui) && /download: name/.test(ui), 'export uses the Android bridge in the app and a download on the web');
    const keys = ['backupTitle', 'backupHint', 'exportLabel', 'exportBtn', 'importLabel', 'importBtn', 'exportTitle', 'exportShare', 'exportSave', 'exportSaved', 'exportDownloaded', 'importAsk', 'importBody', 'importOk', 'importDone', 'importBad', 'importNewer', 'importFail', 'exportFail'];
    const used = [...ui.matchAll(/C\.t\('([A-Za-z]+)'/g)].map((m) => m[1]).concat([...ui.matchAll(/say\('([A-Za-z]+)'\)/g)].map((m) => m[1]));
    ok(used.length > 10 && used.every((k) => keys.indexOf(k) >= 0 || k === 'done'), 'every string the card uses is one of its own keys (' + [...new Set(used)].join(', ') + ')');
    ok(LOCALE_CODES.length >= 11, 'there are ' + LOCALE_CODES.length + ' languages');
    for (const L of LOCALE_CODES) {
      const s = html.indexOf('\n    ' + L + ': {'), e = html.indexOf('\n    },', s);
      const block = s > 0 && e > s ? html.slice(s, e) : '';
      const miss = keys.filter((k) => !new RegExp('\\b' + k + ": '[^']+").test(block));
      ok(block && !miss.length, L + ': every backup string is translated' + (miss.length ? '; missing ' + miss.join(', ') : ''));
      ok(/\{date\}/.test(block) && /\{coins\}/.test(block) && /\{awards\}/.test(block), L + ': the import question keeps {date}, {coins} and {awards}');
    }
    const javaDir = path.join(ROOT, 'android/app/src/main/java/io/github/choganhq/chogan');
    const fb = path.join(javaDir, 'FileBridge.java');
    ok(fs.existsSync(fb), 'FileBridge.java exists');
    const j = fs.existsSync(fb) ? fs.readFileSync(fb, 'utf8') : '';
    ok(/@JavascriptInterface\s+public boolean saveFile\(String name, String text\)/.test(j) && /@JavascriptInterface\s+public boolean shareFile\(String name, String text\)/.test(j),
      'the bridge has saveFile and shareFile');
    ok(/MediaStore\.Downloads\.EXTERNAL_CONTENT_URI/.test(j) && /Build\.VERSION_CODES\.Q/.test(j), 'saving goes through MediaStore Downloads, Android 10 and up only (no storage permission)');
    ok(/getPackageName\(\) \+ "\.share"/.test(j) && /new File\(activity\.getCacheDir\(\), "share"\)/.test(j), 'sharing uses the existing FileProvider and its cache/share folder');
    ok(/chogan-progress-\\\\d\{4\}/.test(j), 'only a progress file name is accepted');
    const main = fs.readFileSync(path.join(javaDir, 'MainActivity.java'), 'utf8');
    ok(/addJavascriptInterface\(new FileBridge\(this\), "ChoganFiles"\)/.test(main), 'MainActivity registers it as ChoganFiles');
    const manifest = fs.readFileSync(path.join(ROOT, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
    const perms = [...manifest.matchAll(/uses-permission[^>]*android:name="([^"]+)"/g)].map((m) => m[1]);
    ok(perms.join() === 'android.permission.VIBRATE', 'the app still asks only for VIBRATE (' + perms.join(', ') + ')');
    const paths = fs.readFileSync(path.join(ROOT, 'android/app/src/main/res/xml/share_paths.xml'), 'utf8');
    ok((paths.match(/<[a-z-]+-path /g) || []).length === 1 && /cache-path name="share" path="share\/"/.test(paths), 'the FileProvider still exposes only cache/share/');
  }

  // a played old phone and its file, and a new phone with its own progress
  function fileAndPhone() {
    const src = boot({});
    src.C.coins.add(777);
    src.C.storage('sudoku').set('session', { inProgress: true, puzzle: 'OLD-PHONE' });
    for (let i = 0; i < 3; i++) src.C.stats.record({ gameId: 'minesweeper', won: true, timeMs: 1000, points: 10 });
    for (let i = 0; i < 6; i++) src.C.storage('g' + i).set('best', i);
    const text = src.C.backup.build();
    const pre = { 'chogan.app.coins': '5', 'chogan.tetris.best': '1800', 'chogan.sudoku.session': '{"puzzle":"NEW-PHONE"}' };
    return { text, pre };
  }

  function testExportImportOtherPages() {
    head('Export and import: pages opened before an import do not write over it (review of #1226, M1)');
    const { text, pre } = fileAndPhone();
    const menu = boot(pre);
    const game = boot(null, { tab: menu });
    const cached = boot(null, { tab: menu });
    if (!menu.C.backup) { ok(false, 'Chogan.backup exists'); return; }
    // the game page autosaves its in-memory game whenever it is hidden or left
    game.C.onPause(() => game.C.storage('sudoku').set('session', { puzzle: 'STALE-TAB' }));
    const res = menu.C.backup.restore(menu.C.backup.parse(text).data);
    ok(res.ok, 'the import succeeds (' + JSON.stringify(res) + ')');
    const after = snap(menu.ls);
    ok(!!menu.ls['chogan.app.restored'], 'the import stamps chogan.app.restored last');
    // before the storage event reaches the game page, it finishes a round and is hidden
    let threw = null;
    try {
      game.C.stats.record({ gameId: 'sudoku', won: true, timeMs: 1000, points: 5 });
      game.C.coins.add(50);
      game.C.store.set('settings', { sfx: false });
      game.fire('pagehide');
    } catch (e) { threw = e; }
    ok(!threw, 'the old page keeps running without errors' + (threw ? ': ' + threw.message : ''));
    ok(snap(menu.ls) === after, 'stats, league, coins, settings and the pause autosave of the old page wrote nothing');
    ok(JSON.parse(menu.ls['chogan.app.coins']) === 777 && /OLD-PHONE/.test(menu.ls['chogan.sudoku.session']),
      'the imported coins (777) and the imported Sudoku game are still there');
    game.fire('storage', { key: 'chogan.app.restored', newValue: menu.ls['chogan.app.restored'] });
    ok(game.reloads() === 1, 'the storage event for the stamp reloads the old page');
    game.fire('storage', { key: 'chogan.app.coins', newValue: '1' });
    ok(game.reloads() === 1, 'other storage events do not reload');
    // a page kept in the back/forward cache, never told by a storage event
    cached.fire('pageshow', { persisted: true });
    ok(cached.reloads() === 1 && snap(menu.ls) === after, 'a page restored from the bfcache after the import reloads and writes nothing');
    // the importing page itself holds the old profile until its own reload
    menu.C.coins.add(9);
    menu.fire('pagehide');
    ok(snap(menu.ls) === after, 'the importing page writes nothing more before its reload');
    // a page opened after the import is a normal page
    const fresh = boot(null, { tab: menu });
    fresh.C.coins.add(1);
    ok(JSON.parse(menu.ls['chogan.app.coins']) === 778 && fresh.C.state.coins === 778, 'a page loaded after the import reads it and saves normally (777 + 1)');
    fresh.fire('pageshow', { persisted: true });
    ok(fresh.reloads() === 0, 'and is not reloaded for an import it already saw');
    // a refused import tells nobody
    const p2 = boot(pre), g2 = boot(null, { tab: p2 });
    p2.store.cap = used(p2.ls) + 10;
    const bad = p2.C.backup.restore(p2.C.backup.parse(text).data);
    p2.store.cap = Infinity;
    g2.C.coins.add(1);
    ok(!bad.ok && !('chogan.app.restored' in p2.ls) && p2.ls['chogan.app.coins'] === '6', 'a failed import stamps nothing and other pages keep saving (5 + 1)');
  }

  function testExportImportJournal() {
    head('Export and import: an import killed half way is undone at the next start (review of #1226, L1)');
    const { text, pre } = fileAndPhone();
    const d = boot(pre);
    if (!d.C.backup) { ok(false, 'Chogan.backup exists'); return; }
    const before = snap(d.ls);
    // the phone kills the app after the third key of the file is written
    let writes = 0, atKill = null;
    const set = d.store.setItem;
    d.store.setItem = (k, v) => {
      set(k, v);
      if (k.indexOf('chogan.g') === 0 && ++writes === 3) { atKill = Object.assign({}, d.ls); throw new Error('killed'); }
    };
    d.C.backup.restore(d.C.backup.parse(text).data);
    ok(!!atKill, 'the kill happened half way through the import');
    if (!atKill) return;
    ok(Object.keys(atKill).some((k) => /^chogan\.g\d\./.test(k)) && atKill['chogan.tetris.best'] === undefined,
      'at the kill the storage holds part of the file and none of the old keys');
    ok('chogan.app.restoreUndo' in atKill, 'and a journal of the old keys');
    const next = boot(atKill);
    ok(next.C.backup && next.C.backup.recovery === 'undone', 'the next start reports the import undone (' + (next.C.backup && next.C.backup.recovery) + ')');
    ok(snap(next.ls) === before, 'every old key is back exactly, nothing of the file and no journal is left');
    ok(next.C.state.coins === 5, 'the state read at start is the old one (5 coins), not a mix');
    // a damaged journal is dropped without touching the progress
    const dmg = Object.assign({}, pre, { 'chogan.app.restoreUndo': '{nope' });
    const dd = boot(dmg);
    ok(!('chogan.app.restoreUndo' in dd.ls) && dd.ls['chogan.tetris.best'] === '1800' && dd.C.backup.recovery === 'dropped',
      'a journal that is not JSON is removed and the progress is left as it is');
    const clean = boot(pre);
    ok(clean.C.backup.recovery === 'none', 'a normal start has nothing to undo');
  }

  function testExportImportCraftedState() {
    head('Export and import: crafted values cannot break the app (review of #1226, L2)');
    const evil = {
      'chogan.app.settings': JSON.stringify({ mascot: 'toString', cardSpeed: 'constructor', palette: '__proto__', lang: 'toString', pinned: 'chess', theme: 'hasOwnProperty' }),
      'chogan.app.league': JSON.stringify({ season: 5, tier: 'x', points: 'lots', history: 3 }),
      'chogan.app.stats': '"plays"',
      'chogan.app.coins': '"many"', 'chogan.app.unlocks': '{}', 'chogan.app.achievements': '[1]',
      'chogan.app.profile': JSON.stringify({ name: { a: 1 }, uid: 7 })
    };
    let d = null, threw = null;
    try { d = boot(evil); } catch (e) { threw = e; }
    ok(!threw && d && d.C, 'the core starts on crafted state' + (threw ? ': ' + threw.message : ''));
    if (!d || !d.C) return;
    const C = d.C, s = C.state.settings;
    const run = (name, fn) => { let e = null, out; try { out = fn(); } catch (x) { e = x; } ok(!e, name + (e ? ': ' + e.message : '')); return out; };
    const m = run('the menu mascot draws for a saved "toString"', () => C.mascot(s.mascot, 40));
    ok(typeof m === 'string' && m.indexOf('<svg') === 0, 'and falls back to the default one');
    ok(s.cardSpeed === 'normal' && s.palette === undefined && s.theme === 'auto' && s.lang !== 'toString' && Array.isArray(s.pinned),
      'settings naming Object.prototype members fall back to the defaults');
    const t = run('the league tier reads for a tier of "x"', () => C.league.tier());
    ok(t && typeof t.color === 'string', 'and is a real tier');
    run('the league table builds', () => C.league.table ? C.league.table() : C.league.state());
    run('a round is recorded on a stats value that was a string', () => C.stats.record({ gameId: 'sudoku', won: true, timeMs: 5, points: 3 }));
    run('coins add up from a coins value that was a string', () => C.coins.add(2));
    ok(C.state.coins === 2 && C.state.stats.plays === 1 && Array.isArray(C.state.unlocks) && !Array.isArray(C.state.achievements),
      'the wrong shapes became defaults (coins 2, plays 1)');
    ok(typeof C.state.profile.name === 'string' && typeof C.state.profile.uid === 'string', 'profile fields are strings');
    // reloadState (bfcache, and the import itself) applies the same cleaning
    d.ls['chogan.app.league'] = JSON.stringify({ tier: 99 });
    C.reloadState();
    ok(C.state.league.tier === 1, 'reloadState cleans a tier of 99 too');
  }

  function testExportImportExportFail() {
    head('Export and import: export without storage, and its own error (review of #1226, L3, L4)');
    const d = boot({}, { broken: true });
    ok(d.C.backup && d.C.backup.build() === null, 'without usable localStorage build() returns null, not an empty file');
    const html = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
    const a = html.indexOf('function backupCard()'), b = html.indexOf('function unlockShop()', a);
    const ui = a > 0 && b > a ? html.slice(a, b) : '';
    const exp = ui.slice(ui.indexOf('function doExport'), ui.indexOf('function doImport'));
    ok(exp.length > 100 && /if \(!text\) \{ say\('exportFail'\); return; \}/.test(exp), 'the card shows exportFail when there is no file');
    ok(!/importFail|importBad/.test(exp) && (exp.match(/say\('exportFail'\)/g) || []).length === 3, 'every export failure says exportFail, never an import message');
    // "1 awards": no language puts a plural noun after a number it cannot decline
    const en = html.slice(html.indexOf('\n    en: {'), html.indexOf('\n    },', html.indexOf('\n    en: {')));
    const body = (en.match(/importBody: '([^']+)'/) || [])[1] || '';
    ok(body && !/\{coins\} coins|\{awards\} awards/.test(body), 'English importBody puts the numbers after labels (' + body.slice(0, 50) + ')');
  }

  return { testExportImportRoundTrip, testExportImportOldFile, testExportImportHostile, testExportImportRollback, testExportImportUi,
    testExportImportOtherPages, testExportImportJournal, testExportImportCraftedState, testExportImportExportFail };
};
