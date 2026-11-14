'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, vm, ROOT } = T;
  // Selecting a digit lit up that digit on the board but not in the notes, so a
  // player could not see where they had pencilled it in (#893).
  function testSudokuNoteHighlight() {
    head('Sudoku: notes of the selected digit stand out (#893)');
    const E = loadEngine('sudoku', 'SudokuEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/sudoku/index.html'), 'utf8');
    const fn = (name) => {
      const m = html.match(new RegExp('\\n  function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}\\n'));
      return m ? m[0] : '';
    };
    const names = ['paint', 'padState', 'hlMarks', 'isPeer', 'notesOf'];
    const src = names.map(fn);
    ok(src.every((x) => x.length > 0), 'paint and its helpers are found in the Sudoku page (' + names.filter((n, i) => !src[i]).join(', ') + ')');
    const solution = [];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) solution.push(((r * 3 + ((r / 3) | 0) + c) % 9) + 1);
    const grid = solution.slice();
    // cell 0 holds the digit the player selects; cells 40 and 80 are empty with notes
    const v = grid[0];
    const other = (v % 9) + 1;
    grid[40] = 0; grid[80] = 0;
    const notes = []; for (let i = 0; i < 81; i++) notes.push([]);
    notes[40] = [v, other]; notes[80] = [other];
    function el(tag, attrs) {
      const n = { tag, cls: (attrs && attrs.class) || '', text: (attrs && attrs.text) || '', kids: [], appendChild(k) { n.kids.push(k); return k; } };
      return n;
    }
    const cells = []; for (let i = 0; i < 81; i++) cells.push({ className: '', innerHTML: '', appendChild(k) { this.kids = (this.kids || []).concat(k); return k; }, kids: [] });
    const box = {
      E, el, cells, selected: 0, Math, Object, document: { createTextNode: (t) => ({ text: t }) },
      S: { grid, solution, notes, hinted: {}, puzzle: solution.map(() => 0), mistakes: 0 },
      prefs: { highlight: 'peers', showErrors: false },
      C: { num: String }, pads: [], ctx: { setStat() {} }, hintBtn: {}, cageHtml: [],
      isKiller: () => false
    };
    vm.createContext(box);
    try { vm.runInContext(src.join('') + '\npaint();', box); } catch (e) { ok(false, 'paint() ran: ' + e.message); return; }
    const spans = (c) => (cells[c].kids.find((k) => k.cls === 'sd-notes') || { kids: [] }).kids;
    const s40 = spans(40), s80 = spans(80);
    ok(s40.length === 9 && s80.length === 9, 'both empty cells draw a 3×3 note grid');
    ok(s40[v - 1].cls === 'sd-note--same' && s40[v - 1].text === String(v), 'the note of the selected digit is marked (' + JSON.stringify(s40[v - 1]) + ')');
    ok(s40[other - 1].cls === '' && s80[other - 1].cls === '', 'other notes stay plain');
    ok(s40.filter((k) => k.cls).length === 1 && s80.every((k) => !k.cls), 'nothing else is marked');
    const rule = (html.match(/\.sd-notes \.sd-note--same \{([^}]*)\}/) || [])[1] || '';
    ok(/color: var\(--sd-user\)/.test(rule) && /font-weight: 900/.test(rule) && !/background/.test(rule),
      'a marked note is bold in the "yours" ink, with no background (#874 keeps notes ink only)');
  }
  return { testSudokuNoteHighlight };
};
