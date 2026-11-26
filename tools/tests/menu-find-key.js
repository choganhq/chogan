'use strict';
// #1102: Ctrl+F (Cmd+F on a Mac) in the menu focuses the game search instead of the browser's
// page find. The key test is read from the page and run against the core's own keyIs, so a
// Persian keyboard layout (key 'ب', code KeyF) counts too, and Ctrl+Shift+F or AltGr do not.
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT } = T;
  function testMenuFindKey() {
    head('Menu: Ctrl+F focuses the game search (#1102)');
    const html = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const fn = html.match(/ {2}function isFindKey\(e\) \{(?:[^\n]*\}\n|\n[\s\S]*?\n {2}\}\n)/);
    const keyIs = core.match(/ {2}Chogan\.keyIs = function \(e, letter\) \{[\s\S]*?\n {2}\};\n/);
    ok(!!fn && !!keyIs, 'the page has isFindKey and the core has keyIs');
    if (fn && keyIs) {
      const box = { Chogan: {} };
      vm.createContext(box);
      vm.runInContext(keyIs[0] + 'var C = Chogan;' + fn[0] + 'this.isFindKey = isFindKey;', box);
      const k = (o) => box.isFindKey(Object.assign({ ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }, o));
      ok(k({ ctrlKey: true, key: 'f', code: 'KeyF' }), 'Ctrl+F');
      ok(k({ metaKey: true, key: 'f', code: 'KeyF' }), 'Cmd+F on a Mac');
      ok(k({ ctrlKey: true, key: 'ب', code: 'KeyF' }), 'Ctrl+F on the Persian layout');
      ok(!k({ key: 'f', code: 'KeyF' }), 'a plain F types into whatever has focus');
      ok(!k({ ctrlKey: true, shiftKey: true, key: 'F', code: 'KeyF' }), 'Ctrl+Shift+F is left alone');
      ok(!k({ ctrlKey: true, altKey: true, key: 'f', code: 'KeyF' }), 'AltGr / Ctrl+Alt+F is left alone');
      ok(!k({ ctrlKey: true, key: 'g', code: 'KeyG' }), 'Ctrl+G is not find');
      // #1216: the other two keys a desktop player searches with
      ok(k({ key: 'F3', code: 'F3' }), 'F3');
      ok(k({ key: '/', code: 'Slash', target: { tagName: 'BODY' } }), 'a slash on the menu');
      ok(!k({ key: '/', code: 'Slash', target: { tagName: 'INPUT' } }), 'a slash typed into a field stays text');
      ok(!k({ shiftKey: true, key: 'F3', code: 'F3' }), 'Shift+F3 is left alone');
      ok(!k({ ctrlKey: true, key: '/', code: 'Slash' }), 'Ctrl+/ is left alone');
    }
    // the shortcut must run before the handler returns on any modifier, and only reach a
    // visible search field, so on other tabs the browser keeps its find
    const h = html.match(/document\.addEventListener\('keydown', function \(e\) \{\n {4}if \(isFindKey\(e\) && !document\.querySelector\('\.ch-scrim'\)\) \{\n {6}var find = app\.querySelector\('\.ch-search__input'\);\n {6}if \(find && find\.getClientRects\(\)\.length\) \{ e\.preventDefault\(\); find\.focus\(\); find\.select\(\); \}\n {6}return;\n {4}\}\n {4}var n = tabKey\(e\);/);
    ok(!!h, 'the menu key handler checks Ctrl+F first and focuses only a shown search field');
  }
  // #1216: Ctrl+1..5 (Cmd on a Mac) open the five tabs
  function testMenuTabKeys() {
    head('Menu: Ctrl+1..5 switch tabs (#1216)');
    const html = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
    const fn = html.match(/ {2}function tabKey\(e\) \{[\s\S]*?\n {2}\}\n/);
    ok(!!fn, 'the page has tabKey');
    if (fn) {
      const box = {};
      vm.createContext(box);
      vm.runInContext(fn[0] + 'this.tabKey = tabKey;', box);
      const k = (o) => box.tabKey(Object.assign({ ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }, o));
      ok([1, 2, 3, 4, 5].every((n) => k({ ctrlKey: true, code: 'Digit' + n }) === n - 1), 'Ctrl+1 to Ctrl+5, by the key and not the typed digit');
      ok(k({ metaKey: true, code: 'Digit2' }) === 1, 'Cmd+2 on a Mac');
      ok(k({ ctrlKey: true, code: 'Digit6' }) === -1 && k({ code: 'Digit1' }) === -1, 'Ctrl+6 and a plain 1 are nothing');
      ok(k({ ctrlKey: true, altKey: true, code: 'Digit2' }) === -1 && k({ ctrlKey: true, shiftKey: true, code: 'Digit2' }) === -1, 'AltGr and Shift are left alone');
    }
    ok(/var n = tabKey\(e\);\n {4}if \(n >= 0 && gamesLoaded && !document\.querySelector\('\.ch-scrim'\)\) \{\n {6}e\.preventDefault\(\);/.test(html), 'the handler takes the key only on the menu itself');
  }
  return { testMenuFindKey, testMenuTabKeys };
};
