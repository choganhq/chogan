'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT } = T;

  // #488 gave the Android app four fixed long-press shortcuts; #1150: they follow the pins.
  function testAndroidShortcuts() {
    head('Android: launcher shortcuts follow the pinned games (#488, #1150)');
    const read = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
    const main = 'android/app/src/main/';
    const java = (f) => read(main + 'java/io/github/choganhq/chogan/' + f);
    const html = read('www/index.html');
    const man = read(main + 'AndroidManifest.xml'), act = java('MainActivity.java'), bridge = java('ShortcutsBridge.java');
    const games = JSON.parse(read('www/games.json')).games;
    const block = (html.match(/var SHORTCUT_DEFAULTS = [\s\S]*?\n  function shortcutGames\([\s\S]*?\n  \}/) || [])[0];
    ok(!!block, 'the menu chooses the shortcut games');
    if (!block) return;
    const pick = vm.runInNewContext(block + '; shortcutGames', {});
    const ids = (pins) => pick(pins, games).map((g) => g.id).join();
    ok(games.length > 4, 'there are games to choose from (' + games.length + ')');
    ok(ids([]) === 'tower-defence,sudoku,minesweeper,dots', 'with nothing pinned: the four of before');
    ok(ids(['chess']) === 'chess', 'one pinned game: that one only');
    ok(ids(['go', 'chess', 'hex', 'peg', 'dots']) === 'go,chess,hex,peg', 'the first four pins, in pin order');
    ok(ids(['no-such-game']) === 'tower-defence,sudoku,minesweeper,dots', 'a pin of a removed game does not leave the icon empty');
    const pwa = JSON.parse(read('www/manifest.webmanifest')).shortcuts.slice(0, 4).map((x) => /games\/([a-z0-9-]+)\//.exec(x.url)[1]);
    ok(pwa.join() === ids([]), 'the defaults are the web app\'s first four');
    ok(/syncShortcuts\(\); \/\/ pins and the language/.test(html), 'every menu render keeps them current');
    ok(!/android\.app\.shortcuts/.test(man) && !fs.existsSync(path.join(ROOT, main + 'res/xml/shortcuts.xml')), 'no static list is left beside the dynamic one');
    ok(/new ShortcutsBridge\(this\), "ChoganShortcuts"/.test(act), 'MainActivity registers the bridge');
    ok(/setDynamicShortcuts\(/.test(bridge) && /SDK_INT < 25/.test(bridge) && /size\(\) < 4/.test(bridge), 'the bridge sets at most four, from API 25');
    ok(/id\.matches\("\[a-z0-9-\]\{1,32\}"\)/.test(bridge) && /MainActivity\.class/.test(bridge), 'only a plain game id, opened in this app');
    ok((man.match(/<uses-permission /g) || []).length === 1, 'still only one permission');
    ok(/openShortcut\(getIntent\(\)\);/.test(act) && /protected void onNewIntent\(Intent intent\) \{[\s\S]*?openShortcut\(intent\);/.test(act), 'a shortcut opens its game whether the app was closed or already open');
    ok(/if \(id == null \|\| !id\.matches\("\[a-z0-9-\]\{1,32\}"\)\) return;/.test(act) && /getBridge\(\)\.getLocalUrl\(\) \+ "\/games\/" \+ id \+ "\/index\.html\?from=shortcut"/.test(act), 'only a plain game id is accepted, and only a page of the app itself is loaded');
  }
  return { testAndroidShortcuts };
};
