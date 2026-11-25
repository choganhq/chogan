'use strict';
// #1158: pressing back while a game's tips were open left the game. Runs the core's own
// ui.modal and ui.tutorial on a stub DOM and presses back both ways: the Android app's
// Chogan.dismissTop() and the browser's CloseWatcher.
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT } = T;
  function testBackDismiss() {
    head('Back closes the tips and dialogs instead of leaving the game (#1158)');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const java = fs.readFileSync(path.join(ROOT, 'android/app/src/main/java/io/github/choganhq/chogan/MainActivity.java'), 'utf8');
    ok(/evaluateJavascript\("!!\(window\.Chogan && Chogan\.dismissTop && Chogan\.dismissTop\(\)\)"[\s\S]*?if \("true"\.equals\(closed\)\) return;\s*if \(webView\.canGoBack\(\)\) webView\.goBack\(\);/.test(java),
      'the Android back press asks the page first, and goes back only if nothing closed');

    const part = (from) => {
      const at = core.indexOf(from);
      const end = at < 0 ? -1 : core.indexOf('\n  };\n', at);
      return at < 0 || end < 0 ? '' : core.slice(at, end + 6);
    };
    const parts = ['  ui.modal = function', '  ui.confirm = function', '  ui.tutorial = function'].map(part);
    ok(parts.every(Boolean), 'chogan.js has ui.modal, ui.confirm and ui.tutorial to run');
    const dm = core.match(/ {2}var backStack = \[\];\n {2}Chogan\.dismissTop = function \(\) \{[\s\S]*?\n {2}\};\n/);
    ok(!!dm, 'chogan.js has Chogan.dismissTop');
    if (!dm || !parts.every(Boolean)) return;

    const watchers = [];
    function CloseWatcher() { this.alive = true; watchers.push(this); this.destroy = () => { this.alive = false; }; }
    const node = () => ({
      style: {}, classList: { add() {} }, parentNode: null, children: [],
      appendChild(c) { this.children.push(c); }, addEventListener() {}, focus() {},
      querySelector() { return null; }, querySelectorAll() { return [node(), node()]; }
    });
    const ctx = {
      Chogan: { t: (k) => k, feedback() {}, icon: node, isRtl: () => false },
      ui: {}, el: node, setTimeout: () => 0, global: { CloseWatcher },
      document: { body: node(), addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [] }
    };
    vm.createContext(ctx);
    vm.runInContext(dm[0] + parts.join(''), ctx);
    const { ui, Chogan } = ctx;
    const pages = [{ title: 'a', text: 'a' }, { title: 'b', text: 'b' }];

    ok(Chogan.dismissTop() === false, 'with nothing open, back is not taken');
    let done = 0;
    ui.tutorial(pages, () => { done++; });
    ok(watchers.length === 1 && watchers[0].alive, 'the tips ask the browser for the back gesture');
    ok(Chogan.dismissTop() === true && done === 1, 'back skips the tips and marks them seen');
    ok(!watchers[0].alive && Chogan.dismissTop() === false, 'the next back is the game\'s again');
    ui.tutorial(pages, () => { done++; });
    watchers[1].onclose();
    ok(done === 2 && Chogan.dismissTop() === false, 'the browser\'s CloseWatcher skips them too');

    const log = [];
    ui.modal({ closeButton: true, onClose: (v) => log.push('help ' + v) });
    ui.confirm({ title: 't', onCancel: () => log.push('cancel') });
    ok(Chogan.dismissTop() === true && log.join() === 'cancel', 'back closes the top dialog only (a confirm is cancelled)');
    ok(Chogan.dismissTop() === true && log.join() === 'cancel,help escape', 'then the one under it');
    const locked = ui.modal({ dismissable: false });
    const n = watchers.length;
    ok(Chogan.dismissTop() === false, 'a dialog that cannot be dismissed leaves back as it was');
    locked.close();
    ui.modal({ dismissable: false });
    ok(watchers.length === n, 'and asks for no CloseWatcher');
  }
  return { testBackDismiss };
};
