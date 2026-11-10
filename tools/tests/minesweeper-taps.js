'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT } = T;

  // Each tap rebuilt every cell, and focus moving to the tapped cell repainted too, so a flag
  // next to the last tapped cell was replaced mid-tap. Chrome sends no click when the
  // element a press began on has gone: flags could not be taken off quickly (#750).
  const html = () => fs.readFileSync(path.join(ROOT, 'www/games/minesweeper/index.html'), 'utf8');
  const fnOf = (src, name) => (src.match(new RegExp('^  function ' + name + '\\(\\w*\\) \\{[\\s\\S]*?^  \\}$', 'm')) || [''])[0];

  function fakeNode() {
    const n = {
      children: [], writes: 0, classes: new Set(), style: { setProperty() {} }, listeners: {},
      appendChild(c) { this.children.push(c); this.writes++; return c; },
      addEventListener(type, f) { this.listeners[type] = f; },
      fire(type, e) { this.listeners[type](e || {}); },
      classList: { add(c) { n.classes.add(c); }, remove(c) { n.classes.delete(c); } }
    };
    let cls = '', tab = 0, text = '';
    Object.defineProperty(n, 'className', { get: () => cls, set(v) { cls = v; n.writes++; n.classes = new Set(); } });
    Object.defineProperty(n, 'tabIndex', { get: () => tab, set(v) { tab = v; n.writes++; } });
    const clear = (v) => { text = v; n.children = []; n.writes++; };
    Object.defineProperty(n, 'innerHTML', { get: () => '', set: clear });
    Object.defineProperty(n, 'textContent', { get: () => text, set: clear });
    return n;
  }

  function testMinesweeperTaps() {
    head('Minesweeper: fast taps are not lost, and big openings stay light (#750)');
    const src = html();
    const paint = fnOf(src, 'paint'), animate = fnOf(src, 'animate'), build = fnOf(src, 'buildBoard');
    ok(paint.length > 0 && animate.length > 0 && build.length > 0, 'paint, animate and buildBoard are found in the page');
    if (!paint || !animate || !build) return;

    // paint(): run the page's own function against a 2 x 2 board
    const cells = [fakeNode(), fakeNode(), fakeNode(), fakeNode()];
    const S = { spec: { rows: 2, cols: 2, mines: 1 }, revealed: [0, 1, 0, 0], flagged: [1, 0, 0, 0], num: [9, 2, 0, 0], mine: [1, 0, 0, 0], flags: 1, done: false };
    let icons = 0;
    const box = {
      S, cells, cursor: 0, Math, shownCls: [], shownBody: [],
      document: { documentElement: { dataset: {} } },
      ctx: { setStat() {} },
      C: { num: (v) => String(v), icon: (name) => { icons++; return { icon: name }; } }
    };
    vm.createContext(box);
    vm.runInContext(paint, box);
    box.paintNow = null;
    vm.runInContext('paintNow = paint;', box);
    box.paintNow();
    ok(cells[0].children.length === 1 && cells[0].children[0].icon === 'flag' && /ms-cell--flag/.test(cells[0].className), 'a flagged cell shows its flag');
    ok(cells[1].textContent === '2' && /ms-cell--open/.test(cells[1].className) && /ms-n2/.test(cells[1].className), 'an open cell shows its number');
    const flag = cells[0].children[0];
    const before = cells.map((c) => c.writes), iconsBefore = icons;
    box.cursor = 2;
    box.paintNow();
    ok(cells[0].children[0] === flag, 'the flag under a finger is still the same element after a repaint');
    ok(cells.map((c) => c.tabIndex).join() === '-1,-1,0,-1', 'only the cursor cell is a Tab stop (' + cells.map((c) => c.tabIndex).join() + ')');
    ok(cells[0].writes - before[0] === 1 && cells[2].writes - before[2] === 1 && cells[1].writes === before[1] && cells[3].writes === before[3] && icons === iconsBefore,
      'moving the cursor only changes the two cells it left and reached (' + cells.map((c, i) => c.writes - before[i]).join(', ') + ' writes)');

    S.flagged[3] = 1; S.flags = 2;
    const before2 = cells.map((c) => c.writes);
    box.paintNow();
    ok(cells[3].children.length === 1 && cells[3].children[0].icon === 'flag', 'a new flag is drawn');
    ok(cells[0].writes === before2[0] && cells[1].writes === before2[1] && cells[2].writes === before2[2], 'a new flag writes nothing to the other cells');

    S.flagged[3] = 0; S.flags = 1;
    box.paintNow();
    ok(cells[3].children.length === 0 && cells[3].className === 'ms-cell', 'taking a flag off empties the cell');

    S.done = true; S.mine = [1, 0, 0, 0];
    S.flagged[2] = 1; S.revealed[0] = 1;
    box.paintNow();
    ok(cells[0].children.length === 1 && cells[0].children[0].icon === 'mine' && /ms-cell--mine/.test(cells[0].className), 'a mine replaces the flag that sat on it');
    ok(/ms-cell--wrong/.test(cells[2].className), 'a wrong flag is marked when the game ends');

    // animate(): a big opening pops only the cells around the finger
    const run = (n, reduced) => {
      const pop = Array.from({ length: n }, fakeNode), order = pop.map((_, i) => i);
      const timers = [];
      const sb = { cells: pop, order, paint() {}, Math, C: { ui: { reduceMotion: () => reduced } }, setTimeout: (f) => timers.push(f), MAX_POP: 48 };
      vm.createContext(sb);
      vm.runInContext(animate + '\nanimate(order);', sb);
      return { pop, timers, popped: pop.filter((c) => c.classes.has('ms-pop')).length };
    };
    let a = run(400, false);
    ok(a.popped === 48, 'an opening of 400 cells pops 48 of them, not all (' + a.popped + ')');
    ok(a.popped > 0 && a.timers.length === 1, 'the pops are cleared by one timer, not one per cell (' + a.timers.length + ')');
    a.timers.forEach((f) => f());
    ok(!a.pop.some((c) => c.classes.has('ms-pop')), 'and that timer clears them all');
    a = run(10, false);
    ok(a.popped === 10 && parseInt(a.pop[9].style.animationDelay, 10) === 81, 'a small opening still ripples out cell by cell');
    ok(run(10, true).popped === 0 && run(1, false).popped === 0, 'nothing pops under reduced motion, or for one cell');
    ok(/var MAX_POP = 48;/.test(src), 'the page sets the same limit this test uses');

    // Two fingers: the first press must still be cancelled when its finger lifts
    const made = [], timers = new Map();
    let id = 0, toggled = [];
    const build2 = {
      S: { spec: { rows: 1, cols: 2 } }, Math, cells: [], cursor: 0, flagMode: false, LONG_MS: 420, paint() {}, tap() {},
      board: { innerHTML: '', style: { setProperty() {} }, appendChild() {} },
      sizeCells() {}, roundCorners() {}, markEdges() {},
      toggleFlag: (i) => toggled.push(i),
      el: () => { const n = fakeNode(); made.push(n); return n; },
      setTimeout: (f) => { timers.set(++id, f); return id; },
      clearTimeout: (t) => timers.delete(t),
      pressTimer: null, longFired: false, shownCls: [], shownBody: []
    };
    vm.createContext(build2);
    vm.runInContext(build + '\nbuildBoard();', build2);
    ok(made.length === 2, 'the board builds its two cells');
    made[0].fire('pointerdown', { pointerType: 'touch' });
    made[1].fire('pointerdown', { pointerType: 'touch' });
    made[0].fire('pointerup');
    made[1].fire('pointerup');
    const left = timers.size;
    Array.from(timers.values()).forEach((f) => f());
    ok(left === 0 && toggled.length === 0, 'two overlapping quick presses leave no timer to flag a cell by itself (' + left + ' left, flagged ' + toggled.join(',') + ')');
    toggled = [];
    made[0].fire('pointerdown', { pointerType: 'touch' });
    Array.from(timers.values()).forEach((f) => f());
    ok(toggled.length === 1 && toggled[0] === 0, 'a long press still flags its cell');

    ok(/\.ms-cell svg \{[^}]*pointer-events: none/.test(src), 'a press lands on the button, never on the icon inside it');
  }

  return { testMinesweeperTaps };
};
