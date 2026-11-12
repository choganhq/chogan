'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;
  // #857: the status line wrapped from one to two lines when it named both shots, and the
  // seas below it jumped a row down and back. It now always holds room for two lines.
  function testBattleshipStatus() {
    head('Battleship status line keeps room for two lines (#857)');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/battleship/index.html'), 'utf8');
    const rule = (html.match(/\.bs-status \{([^}]*)\}/) || [])[1] || '';
    ok(rule.length > 0, 'the .bs-status rule is found');
    const lh = parseFloat((rule.match(/line-height:\s*([\d.]+)\s*;/) || [])[1]);
    const mh = parseFloat((rule.match(/min-height:\s*([\d.]+)em/) || [])[1]);
    ok(lh > 0 && mh > 0, 'line-height (unitless) and min-height (em) are both set (' + lh + ', ' + mh + ')');
    ok(mh >= 2 * lh - 0.001, 'min-height holds two lines (' + mh + 'em for lines of ' + lh + ')');
  }
  return { testBattleshipStatus };
};
