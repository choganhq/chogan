'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;
  const CODES = ['fa', 'en', 'zh', 'de', 'es', 'pl', 'fr', 'ar', 'hi', 'ru'];

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
  return { testGoTutorialStart, testFirstMoveTutorials };
};
