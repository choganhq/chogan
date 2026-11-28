'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;
  const CODES = ['fa', 'en', 'zh', 'de', 'es', 'pl', 'fr', 'ar', 'hi', 'ru', 'pt'];

  // #1060: Go's tutorial began with liberties and captures and never said how a stone is
  // placed, which is what a first-time player was stuck on. It now opens with that step.
  function testGoTutorialStart() {
    head('Go tutorial starts with placing a stone (#1060)');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/go/index.html'), 'utf8');
    ok((html.match(/tutTitle0: '[^']+', tutText0: '[^']+'/g) || []).length === CODES.length, 'the first card exists in every language');
    ok(/var TUT = \[\s*\{ title: C\.t\('tutTitle0'\), text: C\.t\('tutText0'\)/.test(html), 'it is the first card shown');
  }
  // #1060 round 2: these four tutorials explained goals and rules but not what the very
  // first tap or move looks like; each now opens with a card for it.
  function testFirstMoveTutorials() {
    head('Dicelands, Push Out, Corridor, Territories tutorials start with the first move (#1060)');
    for (const g of ['dicelands', 'pushout', 'corridor', 'territories']) {
      const html = fs.readFileSync(path.join(ROOT, 'www/games', g, 'index.html'), 'utf8');
      ok((html.match(/tutTitle0: '[^']+', tutText0: '[^']+'/g) || []).length === CODES.length, g + ': the first card exists in every language');
      ok(/var TUT = \[\s*\{ title: C\.t\('tutTitle0'\), text: C\.t\('tutText0'\)/.test(html), g + ': it is the first card shown');
    }
  }
  // #1060 round 3: Apiary, Shogi and Hillside explained pieces and goals, but not the
  // tap-a-piece-then-a-marked-cell flow a first-time player needs before anything else.
  function testFirstMoveTutorialsRound3() {
    head('Apiary, Shogi, Hillside tutorials start with the first move (#1060)');
    for (const g of ['apiary', 'shogi', 'hillside']) {
      const html = fs.readFileSync(path.join(ROOT, 'www/games', g, 'index.html'), 'utf8');
      ok((html.match(/tutTitle0: '[^']+', tutText0: '[^']+'/g) || []).length === CODES.length, g + ': the first card exists in every language');
      ok(/var TUT = \[\s*\{ title: C\.t\('tutTitle0'\), text: C\.t\('tutText0'\)/.test(html), g + ': it is the first card shown');
    }
  }
  // #1060 round 4: Backgammon, Senet and Fourfold opened on rules, not on the first action.
  function testFirstMoveTutorialsRound4() {
    head('Backgammon, Senet, Fourfold tutorials start with the first move (#1060)');
    for (const g of ['backgammon', 'senet', 'fourfold']) {
      const html = fs.readFileSync(path.join(ROOT, 'www/games', g, 'index.html'), 'utf8');
      ok((html.match(/tutTitle0: '[^']+', tutText0: '[^']+'/g) || []).length === CODES.length, g + ': the first card exists in every language');
      ok(/var TUT = \[\s*\{ title: C\.t\('tutTitle0'\), text: C\.t\('tutText0'\)/.test(html), g + ': it is the first card shown');
    }
  }
  // #1060 round 5: Hokm, Shelem and Nonogram opened on teams, bidding and what the numbers
  // mean; none of them said what to tap first.
  function testFirstMoveTutorialsRound5() {
    head('Hokm, Shelem, Nonogram tutorials start with the first move (#1060)');
    for (const g of ['hokm', 'shelem', 'nonogram']) {
      const html = fs.readFileSync(path.join(ROOT, 'www/games', g, 'index.html'), 'utf8');
      ok((html.match(/tutTitle0: '(?:[^'\\]|\\.)+', tutText0: '(?:[^'\\]|\\.)+'/g) || []).length === CODES.length, g + ': the first card exists in every language');
      ok(/var TUT = \[\s*\{ title: C\.t\('tutTitle0'\), text: C\.t\('tutText0'\)/.test(html), g + ': it is the first card shown');
    }
  }
  // #1060 round 6: Dominoes, Pasur and Crazy Eights gave the matching rule first and never
  // said what to tap. Crazy Eights swaps its eights card for the Iranian one by index, so an
  // added first card must move that index too, or the new card is the one overwritten.
  function testFirstMoveTutorialsRound6() {
    head('Dominoes, Pasur, Crazy Eights tutorials start with the first move (#1060)');
    for (const g of ['dominoes', 'pasur', 'crazyeights']) {
      const html = fs.readFileSync(path.join(ROOT, 'www/games', g, 'index.html'), 'utf8');
      ok((html.match(/tutTitle0: '(?:[^'\\]|\\.)+', tutText0: '(?:[^'\\]|\\.)+'/g) || []).length === CODES.length, g + ': the first card exists in every language');
      ok(/var TUT = \[\s*\{ title: C\.t\('tutTitle0'\), text: C\.t\('tutText0'\)/.test(html), g + ': it is the first card shown');
    }
    const ce = fs.readFileSync(path.join(ROOT, 'www/games/crazyeights/index.html'), 'utf8');
    const at = ce.match(/if \(iranNow\(\)\) t\[(\d+)\] =/);
    const cards = (ce.match(/var TUT = \[([\s\S]*?)\n  \];/) || ['', ''])[1].match(/C\.t\('tutTitle\d'\)/g) || [];
    ok(!!at && cards[Number(at[1])] === "C.t('tutTitle2')", 'crazyeights: the Iranian card replaces the eights card, not another');
  }
  // #1060 round 7: Xiangqi opened on the river and palaces, Gin Rummy on melds and Durak on
  // the beating rule; none said what to tap.
  function testFirstMoveTutorialsRound7() {
    head('Xiangqi, Gin Rummy, Durak tutorials start with the first move (#1060)');
    for (const g of ['xiangqi', 'ginrummy', 'durak']) {
      const html = fs.readFileSync(path.join(ROOT, 'www/games', g, 'index.html'), 'utf8');
      ok((html.match(/tutTitle0: '(?:[^'\\]|\\.)+', tutText0: '(?:[^'\\]|\\.)+'/g) || []).length === CODES.length, g + ': the first card exists in every language');
      // Durak builds its cards in a function, so look at which card comes first either way
      ok((html.match(/title: C\.t\('tutTitle\d'\)/) || [''])[0].includes('tutTitle0'), g + ': it is the first card shown');
    }
  }
  // #1060 round 8: FreeCell, Klondike and Spider opened on the goal and only said what a
  // tap does on the last card; a first-time player was left looking at a full table.
  function testFirstMoveTutorialsRound8() {
    head('FreeCell, Klondike, Spider tutorials start with the first move (#1060)');
    for (const g of ['freecell', 'klondike', 'spider']) {
      const html = fs.readFileSync(path.join(ROOT, 'www/games', g, 'index.html'), 'utf8');
      ok((html.match(/tutTitle0: '(?:[^'\\]|\\.)+', tutText0: '(?:[^'\\]|\\.)+'/g) || []).length === CODES.length, g + ': the first card exists in every language');
      ok(/var TUT = \[\s*\{ title: C\.t\('tutTitle0'\), text: C\.t\('tutText0'\)/.test(html), g + ': it is the first card shown');
    }
  }
  // #1060 round 9: Sums, Mastermind and Gridlock opened on the goal; none said what the
  // first tap or drag is.
  function testFirstMoveTutorialsRound9() {
    head('Sums, Mastermind, Gridlock tutorials start with the first move (#1060)');
    for (const g of ['sums', 'mastermind', 'gridlock']) {
      const html = fs.readFileSync(path.join(ROOT, 'www/games', g, 'index.html'), 'utf8');
      ok((html.match(/tutTitle0: '(?:[^'\\]|\\.)+', tutText0: '(?:[^'\\]|\\.)+'/g) || []).length === CODES.length, g + ': the first card exists in every language');
      ok(/var TUT = \[\s*\{ title: C\.t\('tutTitle0'\), text: C\.t\('tutText0'\)/.test(html), g + ': it is the first card shown');
    }
  }
  // #1060 round 10: Tower Defence and Minesweeper opened on the goal and Sudoku on the rule;
  // none said what to tap first.
  function testFirstMoveTutorialsRound10() {
    head('Tower Defence, Sudoku, Minesweeper tutorials start with the first move (#1060)');
    for (const g of ['tower-defence', 'sudoku', 'minesweeper']) {
      const html = fs.readFileSync(path.join(ROOT, 'www/games', g, 'index.html'), 'utf8');
      ok((html.match(/tutTitle0: '(?:[^'\\]|\\.)+', tutText0: '(?:[^'\\]|\\.)+'/g) || []).length === CODES.length, g + ': the first card exists in every language');
      ok(/var TUT = \[\s*\{ title: C\.t\('tutTitle0'\), text: C\.t\('tutText0'\)/.test(html), g + ': it is the first card shown');
    }
  }
  return { testFirstMoveTutorialsRound10, testFirstMoveTutorialsRound9, testFirstMoveTutorialsRound8, testFirstMoveTutorialsRound7, testFirstMoveTutorialsRound6, testFirstMoveTutorialsRound5, testGoTutorialStart, testFirstMoveTutorials, testFirstMoveTutorialsRound3, testFirstMoveTutorialsRound4 };
};
