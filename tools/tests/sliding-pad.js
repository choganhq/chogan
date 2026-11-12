'use strict';
// #854: a player asked for Doubles' on-screen arrows (#745) in Sliding Puzzle too. The pad is
// the core's Chogan.ui.arrowPad, and each arrow must move the tile the same arrow key moves,
// or a mouse player and a keyboard player would see two different rules.
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT, LOCALE_CODES, loadEngine } = T;

  function testArrowPadCore() {
    head('Core arrow pad builds four labelled arrows and reports their direction (#854)');
    const src = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const m = src.match(/ {2}var PAD_ARROW = [^\n]*\n {2}ui\.arrowPad = function[\s\S]*?\n {2}\};\n/);
    ok(!!m, 'Chogan.ui.arrowPad is in the core');
    if (!m) return;
    // a stand-in for the core's el(): enough to read classes, labels and clicks back
    function el(tag, props) {
      const n = { tag, props: props || {}, kids: [], on: {}, innerHTML: '' };
      n.appendChild = (k) => n.kids.push(k);
      n.addEventListener = (t, f) => { n.on[t] = f; };
      return n;
    }
    const box = { el, ui: {} };
    vm.createContext(box);
    vm.runInContext(m[0], box);
    ok(typeof box.ui.arrowPad === 'function', 'ui.arrowPad is a function');
    const got = [];
    const pad = box.ui.arrowPad({ up: 'U', down: 'D', left: 'L', right: 'R' }, (d) => got.push(d));
    ok(pad.props.class === 'ch-pad', 'the pad carries the core class');
    ok(pad.kids.length === 4, 'four buttons (' + pad.kids.length + ')');
    const want = { up: 'U', down: 'D', left: 'L', right: 'R' };
    for (const dir of Object.keys(want)) {
      const b = pad.kids.find((k) => k.props.class === 'ch-pad__btn ch-pad__btn--' + dir);
      ok(!!b, dir + ': has its button');
      if (!b) continue;
      ok(b.props['aria-label'] === want[dir], dir + ': labelled ' + want[dir]);
      ok(b.props.type === 'button' && /<svg/.test(b.innerHTML), dir + ': a plain button with the arrow drawing');
      got.length = 0;
      b.on.click();
      ok(got.length === 1 && got[0] === dir, dir + ': a click reports ' + dir + ' (' + got.join() + ')');
    }
  }

  function testSlidingPad() {
    head('Sliding Puzzle arrow pad moves tiles like the arrow keys (#854)');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/sliding/index.html'), 'utf8');
    const call = html.match(/var pad = C\.ui\.arrowPad\(\{ up: C\.t\('mvUp'\), down: C\.t\('mvDown'\), left: C\.t\('mvLeft'\), right: C\.t\('mvRight'\) \},\s*function \(dir\) \{ cur = -1; stepDir\(PAD_DIR\[dir\]\); \}\);/);
    ok(!!call, 'the game builds the core pad, and an arrow goes through stepDir like a key');
    ok(/el\('div', \{ class: 'ch-side' \}, \[top, status, pad\]\)/.test(html), 'the pad sits in the side, beside or under the tray');
    const padM = html.match(/var PAD_DIR = (\{[^}]*\});/);
    const keyM = html.match(/var d = (\{ ArrowUp: \d, ArrowRight: \d, ArrowDown: \d, ArrowLeft: \d \})\[k\];/);
    ok(!!padM && !!keyM, 'the pad map and the key map are both there');
    if (!padM || !keyM) return;
    const PAD = vm.runInNewContext('(' + padM[1] + ')');
    const KEY = vm.runInNewContext('(' + keyM[1] + ')');
    const names = { up: 'ArrowUp', right: 'ArrowRight', down: 'ArrowDown', left: 'ArrowLeft' };
    for (const dir of Object.keys(names)) ok(PAD[dir] === KEY[names[dir]], dir + ' on the pad is ' + names[dir] + ' (' + PAD[dir] + ' vs ' + KEY[names[dir]] + ')');
    // gap in the middle of a 3×3 tray: Up slides the tile under it up, Left the tile right of it
    const E = loadEngine('sliding', 'SlidingEngineFactory');
    const expect = { up: 7, down: 2, left: 5, right: 4 };
    for (const dir of Object.keys(expect)) {
      const S = { n: 3, tiles: [1, 2, 3, 4, 0, 5, 6, 7, 8], start: [1, 2, 3, 4, 0, 5, 6, 7, 8], moves: 0, done: false };
      const r = E.step(S, PAD[dir]);
      ok(r.moved.length === 1 && r.moved[0].tile === expect[dir] && S.tiles[4] === expect[dir],
        dir + ': tile ' + expect[dir] + ' slides into the gap (' + JSON.stringify(r.moved) + ')');
    }
    ok(LOCALE_CODES.length > 0, 'the language list is not empty');
    for (const code of LOCALE_CODES) {
      const blk = html.match(new RegExp(`\\n {6}${code}: \\{\\n([\\s\\S]*?)\\n {6}\\}`));
      const labels = ['mvUp', 'mvDown', 'mvLeft', 'mvRight'].map((k) => blk && (blk[1].match(new RegExp(`${k}: '([^']+)'`)) || [])[1]);
      ok(labels.every(Boolean) && new Set(labels).size === 4, `${code}: four different arrow labels`);
    }
  }

  return { testArrowPadCore, testSlidingPad };
};
