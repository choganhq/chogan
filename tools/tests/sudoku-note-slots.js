'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;
  // The notes grid used auto rows and 1fr columns, which size to their content: an
  // empty row shrank and the larger highlighted digit grew its row, so the same digit
  // sat at different heights in neighbouring cells and a 5 could be read as a 2 (#965).
  // Playwright measured 1.6 px of drift at 390 px before the fix and 0 after.
  function testSudokuNoteSlots() {
    head('Sudoku: every note digit keeps its own slot (#965)');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/sudoku/index.html'), 'utf8');
    const rules = [...html.matchAll(/\n\s*\.sd-notes \{([^}]*)\}/g)].map((m) => m[1]);
    ok(rules.length === 1, 'one base .sd-notes rule is found (' + rules.length + ')');
    const rule = rules[0] || '';
    const tpl = (rule.match(/grid-template:\s*([^;]+);/) || [])[1] || '';
    const fixed = 'repeat(3, minmax(0, 1fr))';
    ok(tpl.replace(/\s+/g, ' ').trim() === fixed + ' / ' + fixed,
      'the notes grid has three fixed rows and three fixed columns, not content-sized tracks (' + (tpl || 'none') + ')');
    ok(!/grid-template-(columns|rows)\s*:/.test(rule), 'no separate column or row template overrides it');
    const later = [...html.matchAll(/\.sd-notes\s*\{([^}]*)\}/g)].map((m) => m[1]).filter((r) => /grid-template/.test(r));
    ok(later.length === 1, 'no other .sd-notes rule changes the tracks (' + later.length + ' rules set them)');
  }
  return { testSudokuNoteSlots };
};
