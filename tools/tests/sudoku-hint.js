'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, vm, ROOT } = T;
  // A hint placed a correct digit but left that digit in the notes of its row,
  // column and box, which a typed correct digit clears; and the bare "10" under
  // the bulb read as hints left (#892).
  function testSudokuHintNotes() {
    head('Sudoku: a hint clears its digit from peer notes, and shows its price as coins (#892)');
    const E = loadEngine('sudoku', 'SudokuEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/sudoku/index.html'), 'utf8');
    const fn = (name) => {
      const m = html.match(new RegExp('\\n  function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}\\n'));
      return m ? m[0] : '';
    };
    const hintSrc = fn('hint');
    ok(hintSrc.length > 0, 'hint() is found in the Sudoku page');
    const solution = [];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) solution.push(((r * 3 + ((r / 3) | 0) + c) % 9) + 1);
    // every cell is filled except cell 0, so the hint must land there
    const grid = solution.slice(); grid[0] = 0;
    const notes = []; for (let i = 0; i < 81; i++) notes.push([]);
    const v = solution[0];
    const peers = E.PEERS[0];
    ok(peers && peers.length === 20, 'cell 0 has 20 peers');
    // put the hinted digit (and another) in notes of a row, a column and a box peer, and of a non-peer
    [1, 9, 10].forEach((p) => { notes[p] = [v, (v % 9) + 1]; });
    notes[80] = [v];
    const S = { done: false, grid, solution, notes, hinted: {}, hints: 0, puzzle: new Array(81).fill(0), undo: [] };
    const box = {
      E, S, selected: -1, Math, console,
      C: { coins: { can: () => true, spend() {} }, feedback() {}, ui: { toast() {} }, t: (k) => k },
      HINT_COST: 10, pushUndo() {}, paint() {}, save() {}, checkWin() {}
    };
    vm.createContext(box);
    vm.runInContext(fn('dropPeerNotes') + hintSrc + '\nhint();', box);
    ok(S.grid[0] === v && S.hinted[0] === 1, 'the hint filled cell 0 with its solution');
    ok([1, 9, 10].every((p) => S.notes[p].indexOf(v) < 0),
      'the hinted digit left the notes of its row, column and box peers (' + [1, 9, 10].map((p) => S.notes[p].join('')).join(' / ') + ')');
    ok([1, 9, 10].every((p) => S.notes[p].length === 1), 'the other notes of those cells stay');
    ok(S.notes[80].join() === String(v), 'a cell outside its row, column and box keeps the digit in its notes');
    ok(/tool\('bulb', 'hint'[\s\S]{0,200}?C\.icon\('coin'/.test(html), 'the hint button shows a coin beside its price');
  }
  return { testSudokuHintNotes };
};
