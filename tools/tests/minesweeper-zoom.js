'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT, loadEngine, LOCALE_CODES } = T;

  // The board fitted a phone at about 26-38px a cell and the page's user-scalable=no left no
  // way to make it bigger: a player with low vision could not read or hit it (#850).
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const fnOf = (src, name) => (src.match(new RegExp('^  function ' + name + '\\(\\w*\\) \\{[\\s\\S]*?^  \\}$', 'm')) || [''])[0];

  function fakeNode() {
    const n = {
      listeners: {}, children: [], style: { setProperty() {} }, classList: { add() {}, remove() {} },
      addEventListener(type, f, opt) { this.listeners[type] = { f, opt }; },
      fire(type, e) { return this.listeners[type].f(e || {}); },
      appendChild(c) { this.children.push(c); return c; }
    };
    let cls = '';
    Object.defineProperty(n, 'className', { get: () => cls, set(v) { cls = v; } });
    return n;
  }

  function testMinesweeperZoom() {
    head('Minesweeper: the board zooms with a pinch, buttons or keys, and a tap still opens (#850)');
    const E = loadEngine('minesweeper', 'MinesEngineFactory');

    // the engine: zoom grows the fitted cells, and the frame scrolls once they no longer fit
    const base = E.fit(370, 560, 9, 9);
    const z2 = E.fit(370, 560, 9, 9, 2);
    ok(base.cs >= 26 && base.cs <= 64, 'a 9×9 board fits a phone at ' + base.cs + 'px cells');
    ok(z2.cs === Math.round(base.cs * 2), 'zoom 2 doubles the cells (' + base.cs + ' → ' + z2.cs + ')');
    ok(z2.maxH > 0 && z2.maxH <= 560, 'a zoomed board taller than the room scrolls in its frame (maxH ' + z2.maxH + ')');
    ok(E.fit(370, 560, 9, 9, 1).cs === base.cs && E.fit(370, 560, 9, 9, 0.4).cs === base.cs, 'zoom 1 or less is the fitted size: never smaller than fits');
    ok(E.fit(370, 560, 9, 9, 50).cs === E.fit(370, 560, 9, 9, 3).cs, 'zoom stops at 3×');
    ok(E.fit(1340, 700, 9, 9, 3).cs <= 160, 'a big screen\'s 64px cells grow no bigger than 160px');
    ok(E.fit(1340, 700, 9, 9).cs === 64 && E.fit(370, 560, 16, 30).cs === 26, 'without a zoom the fit is unchanged');
    ok(typeof E.zoomStep === 'function' && E.zoomStep(1, 1) === 1.5 && E.zoomStep(1.5, 1) === 2 && E.zoomStep(3, 1) === 3,
      'the + button steps 1 → 1.5 → 2 … and stops at 3');
    ok(typeof E.zoomStep === 'function' && E.zoomStep(2.2, -1) === 2 && E.zoomStep(1.5, -1) === 1 && E.zoomStep(1, -1) === 1,
      'the − button steps down to the nearest level and stops at the fitted size');

    // the core's pinch: two fingers report the scale since they landed, one finger does nothing
    const core = read('www/lib/chogan.js');
    const pinchSrc = (core.match(/^  ui\.pinch = function \(node, h\) \{[\s\S]*?^  \};$/m) || [''])[0];
    ok(pinchSrc.length > 0, 'the core has Chogan.ui.pinch');
    if (pinchSrc) {
      const node = fakeNode(), seen = [];
      const box = { ui: {}, Math };
      vm.createContext(box);
      vm.runInContext(pinchSrc, box);
      box.ui.pinch(node, {
        start: (m) => seen.push(['start', m.x, m.y]),
        move: (k, m) => seen.push(['move', Math.round(k * 100) / 100, m.x, m.y]),
        end: () => seen.push(['end'])
      });
      const t = (x, y) => ({ clientX: x, clientY: y });
      let prevented = 0;
      const ev = (touches) => ({ touches, cancelable: true, preventDefault() { prevented++; } });
      node.fire('touchstart', ev([t(100, 100)]));
      node.fire('touchmove', ev([t(140, 100)]));
      ok(seen.length === 0 && prevented === 0, 'one finger is left to the board: no zoom, its scroll not stopped');
      node.fire('touchstart', ev([t(100, 100), t(200, 100)]));
      node.fire('touchmove', ev([t(50, 100), t(250, 100)]));
      node.fire('touchend', ev([t(250, 100)]));
      ok(JSON.stringify(seen) === JSON.stringify([['start', 150, 100], ['move', 2, 150, 100], ['end']]),
        'fingers spread from 100px to 200px apart zoom 2× around their midpoint (' + JSON.stringify(seen) + ')');
      ok(prevented === 1, 'the two-finger move does not also scroll the board');
      ok(node.listeners.touchmove.opt && node.listeners.touchmove.opt.passive === false, 'touchmove is not passive, so it can stop that scroll');
      seen.length = 0;
      node.fire('wheel', { ctrlKey: true, deltaY: -100, clientX: 10, clientY: 20, preventDefault() {} });
      node.fire('wheel', { ctrlKey: false, deltaY: -100, clientX: 10, clientY: 20, preventDefault() {} });
      ok(seen.length === 3 && seen[1][1] > 1 && seen[1][2] === 10, 'Ctrl+wheel (a trackpad pinch) zooms in; a plain wheel scrolls');
    }

    // the page: wired to the pinch, the buttons and the keys, and the zoom is never saved
    const src = read('www/games/minesweeper/index.html');
    ok(/C\.ui\.pinch\(scroll,/.test(src), 'the board\'s frame listens for a pinch');
    ok(/E\.fit\(roomW\(\), roomH\(\), sp\.rows, sp\.cols, zoom\)/.test(src), 'the cells are sized with the zoom');
    ok(/'aria-label': C\.t\('zoomIn'\)/.test(src) && /'aria-label': C\.t\('zoomOut'\)/.test(src), 'zoom in and zoom out buttons, named for screen readers');
    ok(!/store\.set\([^)]*zoom/.test(src) && !/zoom:\s*zoom/.test(src), 'the zoom is not saved');
    for (const key of ['zoomIn', 'zoomOut', 'pinchZoom']) {
      const n = (src.match(new RegExp('\\b' + key + ": '[^']+'", 'g')) || []).length;
      ok(n === LOCALE_CODES.length, '"' + key + '" is in all ' + LOCALE_CODES.length + ' languages (' + n + ')');
    }

    // a finger that starts a pinch on a cell neither flags it nor opens it
    const build = fnOf(src, 'buildBoard');
    ok(build.length > 0, 'buildBoard is found in the page');
    if (!build) return;
    const made = [], timers = new Map();
    let id = 0;
    const box = {
      S: { spec: { rows: 1, cols: 2 }, revealed: [0, 0] }, Math, cells: [], cursor: 0, flagMode: false, LONG_MS: 420, paint() {},
      board: { innerHTML: '', style: { setProperty() {} }, appendChild() {} },
      sizeCells() {}, roundCorners() {}, markEdges() {},
      toggled: [], tapped: [], pinches: 0,
      el: () => { const n = fakeNode(); made.push(n); return n; },
      setTimeout: (f) => { timers.set(++id, f); return id; },
      clearTimeout: (t) => timers.delete(t),
      shownCls: [], shownBody: []
    };
    box.toggleFlag = (i) => box.toggled.push(i);
    box.tap = (i) => box.tapped.push(i);
    vm.createContext(box);
    vm.runInContext(build + '\nbuildBoard();', box);
    ok(made.length === 2, 'the board builds its two cells');
    const runTimers = () => { const fs2 = Array.from(timers.values()); timers.clear(); fs2.forEach((f) => f()); };

    made[0].fire('pointerdown', { pointerType: 'touch' });
    made[1].fire('pointerdown', { pointerType: 'touch' });
    box.pinches++;                       // the second finger begins a pinch
    runTimers();                         // the fingers stay down past the long press
    made[0].fire('click');
    made[1].fire('click');
    ok(box.toggled.length === 0 && box.tapped.length === 0,
      'presses that began a pinch flag nothing and open nothing (flagged ' + box.toggled.join(',') + ', opened ' + box.tapped.join(',') + ')');

    made[1].fire('pointerdown', { pointerType: 'touch' });
    made[1].fire('pointerup');
    runTimers();
    made[1].fire('click');
    ok(box.tapped.length === 1 && box.tapped[0] === 1 && box.toggled.length === 0, 'the next tap after a pinch opens its cell at once');
    made[0].fire('pointerdown', { pointerType: 'touch' });
    runTimers();
    ok(box.toggled.length === 1 && box.toggled[0] === 0, 'and a long press after it still flags');
    made[1].fire('click');
    ok(box.tapped.length === 2, 'a click with no press before it (a screen reader) still opens');
  }

  return { testMinesweeperZoom };
};
