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
  // #1060 round 2: Dicelands' tutorial taught the attack and the new dice, but never what happens
  // after the roll (dice move in, or one is left), that a turn ends with End turn, or how to win.
  // Players who lost a first fight thought their region had vanished.
  function testDicelandsTutorialAfterRoll() {
    head('Dicelands tutorial explains the roll result, End turn and the goal (#1060)');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/dicelands/index.html'), 'utf8');
    ok((html.match(/tutTitle4: '[^']+', tutText4: '[^']+'/g) || []).length === CODES.length, 'the new card exists in every language');
    const tut = (html.match(/var TUT = \[([\s\S]*?)\];/) || [])[1] || '';
    const order = (tut.match(/tutTitle(\d)/g) || []).map((x) => x.slice(-1)).join('');
    ok(order === '1243', 'cards run attack, after the roll, new dice (got ' + order + ')');
    const en = (html.match(/\n {6}en: \{[\s\S]*?tutText4: '([^']+)'/) || [])[1] || '';
    ok(/End turn/.test(en) && /last side/i.test(en), 'the English card names End turn and the goal');
  }
  return { testGoTutorialStart, testDicelandsTutorialAfterRoll };
};
