'use strict';
// #1101: a desktop player asked for on-screen arrows in Maze. It is the core's arrow pad (shown
// only where a mouse is the main pointer), and each arrow must roll the ball exactly like the
// same arrow key, or a mouse player and a keyboard player would see two different rules.
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT, LOCALE_CODES, loadEngine } = T;

  function testMazePad() {
    head('Maze arrow pad rolls the ball like the arrow keys (#1101)');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/maze/index.html'), 'utf8');
    ok(/var pad = C\.ui\.arrowPad\(\{ up: C\.t\('mvUp'\), down: C\.t\('mvDown'\), left: C\.t\('mvLeft'\), right: C\.t\('mvRight'\) \},\s*function \(dir\) \{ if \(S && M\) go\(E\.slide\(M, pos\(\), PAD_DIR\[dir\]\)\); \}\);/.test(html),
      'the game builds the core pad, and an arrow rolls through go(E.slide()) like a key');
    ok(/el\('div', \{ class: 'ch-side mz-side' \}, \[top, stars, status, pad\]\)/.test(html), 'the pad sits in the side, beside or under the maze');
    const padM = html.match(/var PAD_DIR = (\{ up: E\.\w, down: E\.\w, left: E\.\w, right: E\.\w \});/);
    const keyM = html.match(/var d = (\{ ArrowUp: E\.\w, ArrowDown: E\.\w, ArrowLeft: E\.\w, ArrowRight: E\.\w \})\[e\.key\];/);
    ok(!!padM && !!keyM, 'the pad map and the key map are both there');
    if (padM && keyM) {
      const Eng = loadEngine('maze', 'MazeEngineFactory');
      const PAD = vm.runInNewContext('(' + padM[1] + ')', { E: Eng });
      const KEY = vm.runInNewContext('(' + keyM[1] + ')', { E: Eng });
      const names = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
      for (const dir of Object.keys(names)) ok(PAD[dir] !== undefined && PAD[dir] === KEY[names[dir]], dir + ' on the pad is ' + names[dir] + ' (' + PAD[dir] + ' vs ' + KEY[names[dir]] + ')');
      // from the start cell (top left) only right or down can open; the pad must roll the
      // ball the same way and never off the board through the outer wall
      const M = Eng.generate(8, () => 0.37);
      const moved = Object.keys(PAD).filter((d) => Eng.slide(M, 0, PAD[d]).length > 0);
      ok(moved.length > 0 && moved.every((d) => d === 'right' || d === 'down'), 'from the start only right or down roll the ball (' + moved.join() + ')');
      ok(Eng.slide(M, 0, PAD.up).length === 0 && Eng.slide(M, 0, PAD.left).length === 0, 'up and left stop at the outer wall');
    }
    ok(LOCALE_CODES.length > 0, 'the language list is not empty');
    for (const code of LOCALE_CODES) {
      const blk = html.match(new RegExp(`\\n {6}${code}: \\{\\n([\\s\\S]*?)\\n {6}\\}`));
      const labels = ['mvUp', 'mvDown', 'mvLeft', 'mvRight'].map((k) => blk && (blk[1].match(new RegExp(`${k}: '([^']+)'`)) || [])[1]);
      ok(labels.every(Boolean) && new Set(labels).size === 4, `${code}: four different arrow labels`);
    }
  }

  return { testMazePad };
};
