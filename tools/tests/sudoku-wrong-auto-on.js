'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, ROOT } = T;
  // #1119: a digit that breaks no rule but is not the solution's was never marked.
  // #1120: Tower Defence's Auto-on fill lost to the core's dark .ch-btn--soft rules.
  function testSudokuWrongAndAutoOn() {
    head('Sudoku marks a wrong digit that clashes with nothing (#1119); Auto on keeps its fill (#1120)');
    const E = loadEngine('sudoku', 'SudokuEngineFactory');
    ok(typeof E.wrongCells === 'function', 'the engine has wrongCells');
    const wrong = E.wrongCells || (() => ({ missing: 1 }));
    const solution = [];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) solution.push(((r * 3 + ((r / 3) | 0) + c) % 9) + 1);
    const puzzle = solution.slice(); puzzle[0] = 0; puzzle[1] = 0; puzzle[2] = 0;
    // cells 0-2 are empty in the puzzle; the player swaps the digits of cells 0 and 1
    const grid = puzzle.slice();
    grid[0] = solution[1]; grid[1] = solution[0]; grid[2] = solution[2];
    const bad = wrong(grid, puzzle, solution);
    ok(bad[0] === 1 && bad[1] === 1, 'both swapped digits are wrong');
    ok(!bad[2], 'the right digit is not marked');
    ok(Object.keys(wrong(puzzle, puzzle, solution)).length === 0, 'givens are never wrong');
    ok(Object.keys(wrong(solution, new Array(81).fill(0), solution)).length === 0, 'the solved grid has none');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/sudoku/index.html'), 'utf8');
    ok(/prefs\.showErrors\) Object\.assign\(bad, E\.wrongCells\(/.test(html), 'paint() marks wrong cells when Show errors is on');
    const td = fs.readFileSync(path.join(ROOT, 'www/games/tower-defence/index.html'), 'utf8');
    ok(/:root \.ch-btn--soft\.td-auto--on \{ background: var\(--game\); color: var\(--c-accent-ink\); \}/.test(td),
      'Auto on has a rule that beats the core\'s .ch-btn--soft in both themes');
  }
  return { testSudokuWrongAndAutoOn };
};
