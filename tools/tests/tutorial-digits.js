'use strict';
// Split out of tools/test.js when that file reached the 1 MB guard (#654).
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;

  // #569: Minesweeper's and Sudoku's tutorial pictures typed ۱ ۲ and ۱۰ into their SVG, so
  // every language saw Persian digits there; digits drawn in a picture go through C.num
  function testTutorialDigits() {
    head('Tutorial pictures draw digits in the app language (#569)');
    const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
    ok(games.length > 0, 'the game list is not empty');
    const texts = [], bad = [];
    for (const g of games) {
      const src = fs.readFileSync(path.join(ROOT, 'www', g.path), 'utf8');
      for (const m of src.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)) {
        texts.push(g.id);
        if (/[۰-۹]/.test(m[1])) bad.push(g.id + ' «' + m[1] + '»');
      }
    }
    ok(texts.length > 0, 'SVG text in the games was found (' + texts.length + ')');
    ok(!bad.length, 'no SVG text in a game is a Persian digit literal' + (bad.length ? ' (' + bad.join(', ') + ')' : ''));
    const ms = fs.readFileSync(path.join(ROOT, 'www/games/minesweeper/index.html'), 'utf8');
    const sd = fs.readFileSync(path.join(ROOT, 'www/games/sudoku/index.html'), 'utf8');
    ok(/>' \+ C\.num\(1\) \+ '<\/text>/.test(ms) && />' \+ C\.num\(2\) \+ '<\/text>/.test(ms) && />' \+ C\.num\(10\) \+ '<\/text>/.test(sd), 'the Minesweeper and Sudoku tutorials draw their numbers with C.num');
  }

  return { testTutorialDigits };
};
