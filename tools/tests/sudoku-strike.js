'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, vm, ROOT } = T;
  // With Auto notes on, the player's own notes are hidden, so a Notes-mode tap changed
  // something nobody could see and there was no way to rule a candidate out of a cell.
  // The tap now strikes the digit out of that cell's live candidates (#1258).
  function testSudokuStrikeAutoNotes() {
    head('Sudoku: a Notes-mode tap strikes a live auto note out of its cell (#1258)');
    const E = loadEngine('sudoku', 'SudokuEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/sudoku/index.html'), 'utf8');
    const fn = (name) => {
      const m = html.match(new RegExp('\\n  function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}\\n'));
      return m ? m[0] : '';
    };
    // liveMask is new with #1258; it is optional here so the old page fails on behaviour
    const names = ['enter', 'notesOf', 'pushUndo', 'undo', 'hasNotes', 'clearNotes', 'restore', 'dropPeerNotes'];
    const missing = names.filter((n) => !fn(n));
    ok(missing.length === 0, 'the page functions are found (' + (missing.join(', ') || 'all') + ')');
    if (missing.length) return;

    const solution = [];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) solution.push(((r * 3 + ((r / 3) | 0) + c) % 9) + 1);
    // the whole first row is empty, the rest is given: every cell of row 0 has all nine
    // row digits minus its column and box, so cell 0 can only be solution[0]
    const puzzle = solution.slice();
    for (let c = 0; c < 9; c++) puzzle[c] = 0;
    // open up cell 0 a bit more: clear its column below too, so it has several candidates
    for (let r = 1; r < 3; r++) puzzle[r * 9] = 0;
    const notes = [], undoStack = [];
    for (let i = 0; i < 81; i++) notes.push([]);
    notes[0] = [7];
    const S = { done: false, puzzle, solution, grid: puzzle.slice(), notes, hinted: {}, mistakes: 0, undo: undoStack };
    const box = {
      E, S, selected: 0, noteMode: true, prefs: { autoNotes: true }, Math, JSON, Array, console,
      cells: [], C: { feedback() {}, audio: { sfx() {} }, ui: { shake() {}, toast() {} }, t: (k) => k },
      paint() {}, save() {}, checkWin() {}, ripple() {}, render() {}
    };
    vm.createContext(box);
    vm.runInContext(names.map(fn).join('\n') + fn('liveMask'), box);
    // a save from before #1258: restore() must give it struck lists
    vm.runInContext('restore(S); selected = 0;', box);
    const st = box.S;
    ok(Array.isArray(st.struck) && st.struck.length === 81, 'an old save gets 81 struck lists on load');
    if (!Array.isArray(st.struck)) { st.struck = []; for (let i = 0; i < 81; i++) st.struck.push([]); }

    const live = () => vm.runInContext('notesOf(0)', box).join('');
    const before = live();
    ok(before.length >= 2, 'cell 0 shows several live candidates (' + before + ')');
    const d = +before[0];
    vm.runInContext('enter(' + d + ')', box);
    ok(live() === before.replace(String(d), ''), 'a Notes-mode tap strikes ' + d + ' out (' + before + ' → ' + live() + ')');
    ok(st.notes[0].join() === '7', 'the player\'s own hidden notes are left alone');
    ok(st.grid[0] === 0, 'the cell stays empty');

    vm.runInContext('enter(' + d + ')', box);
    ok(live() === before, 'a second tap brings it back (' + live() + ')');

    // a digit the cell cannot hold is refused, so no hidden strike waits for later
    const notCand = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((v) => before.indexOf(String(v)) < 0);
    const undoLen = st.undo.length;
    vm.runInContext('enter(' + notCand + ')', box);
    ok(st.struck[0].length === 0 && st.undo.length === undoLen, notCand + ', not a candidate, is not struck and adds no undo step');

    // the other candidates keep following the board
    vm.runInContext('enter(' + d + ')', box);
    const other = +before[1];
    const peer = 9 * 1; // cell 9 is empty and in cell 0's column
    ok(st.grid[peer] === 0, 'cell 9 is an empty peer');
    vm.runInContext('noteMode = false; selected = ' + peer + '; enter(' + other + '); selected = 0; noteMode = true;', box);
    ok(live().indexOf(String(other)) < 0 && live().indexOf(String(d)) < 0,
      'a digit placed in a peer still drops out, and the struck one stays struck (' + live() + ')');

    vm.runInContext('undo()', box);
    ok(box.S.grid[peer] === 0 && live().indexOf(String(d)) < 0, 'undo takes back the placed digit and keeps the strike');
    vm.runInContext('undo()', box);
    ok(live() === before, 'a second undo takes back the strike too');

    vm.runInContext('enter(' + d + ')', box);
    ok(vm.runInContext('hasNotes()', box) === true, 'a strike counts as notes for "Clear all notes"');
    vm.runInContext('clearNotes()', box);
    ok(box.S.struck.every((a) => a.length === 0) && live() === before, '"Clear all notes" clears the strikes');

    vm.runInContext('enter(' + d + '); noteMode = false; enter(0); noteMode = true;', box);
    ok(live() === before, 'Erase clears the cell\'s strikes');

    // with Auto notes off, a Notes-mode tap still writes the player's own notes
    vm.runInContext('prefs.autoNotes = false; enter(3)', box);
    ok(box.S.notes[0].indexOf(3) >= 0 && box.S.struck[0].length === 0, 'with Auto notes off the tap writes an own note as before');
  }
  return { testSudokuStrikeAutoNotes };
};
