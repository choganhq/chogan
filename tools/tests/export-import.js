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
  function boot(pre, opts) {
    const ls = Object.assign({}, pre);
    const o = opts || {};
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
      Date, Math, JSON, APP_VERSION: o.version || '1.2.3'
    };
    win.window = win; win.self = win; win.globalThis = win;
    vm.createContext(win);
    vm.runInContext(fs.readFileSync(CORE, 'utf8'), win, { filename: 'chogan.js' });
    return { C: win.Chogan, ls, store };
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
    const fits = boot(pre);
    fits.store.cap = used(fits.ls) + need;
    ok(fits.C.backup.restore(fits.C.backup.parse(text).data).ok, 'with just enough room the same file imports (the old data is removed first)');
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
    const keys = ['backupTitle', 'backupHint', 'exportLabel', 'exportBtn', 'importLabel', 'importBtn', 'exportTitle', 'exportShare', 'exportSave', 'exportSaved', 'exportDownloaded', 'importAsk', 'importBody', 'importOk', 'importDone', 'importBad', 'importNewer', 'importFail'];
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

  return { testExportImportRoundTrip, testExportImportOldFile, testExportImportHostile, testExportImportRollback, testExportImportUi };
};
