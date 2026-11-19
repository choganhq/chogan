'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;
  // The notes grid had three columns and auto rows. A row with no note collapsed,
  // so the same digit sat at a different height in each cell and a 5 could be
  // read as a 2 or an 8 at a glance (#965). Every digit keeps its own ninth.
  function testSudokuNoteGrid() {
    head('Sudoku: a note keeps the same place in every cell (#965)');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/sudoku/index.html'), 'utf8');
    const m = html.match(/\n  \.sd-notes \{([^}]*)\}/);
    ok(!!m, 'the .sd-notes rule is found in the Sudoku page');
    const body = m ? m[1] : '';
    const tpl = (body.match(/grid-template:\s*([^;]+);/) || [])[1] || '';
    const [rows, cols] = tpl.split('/').map((x) => (x || '').trim());
    const fixed = (t) => /^repeat\(3, minmax\(0, 1fr\)\)$/.test(t || '');
    ok(fixed(rows), 'the notes grid has three equal rows that never collapse (got "' + (rows || 'none') + '")');
    ok(fixed(cols), 'the notes grid has three equal columns that a wider note cannot widen (got "' + (cols || 'none') + '")');
    ok(!/grid-template-(rows|columns)/.test(body), 'no separate grid-template-rows/-columns overrides the 3x3 template');
  }
  return { testSudokuNoteGrid };
};
