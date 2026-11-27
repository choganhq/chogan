'use strict';
/* #1232: a zoomed or tall board hid rows above and below with no sign, and in Persian the
   side arrows pointed inwards: ‹ and › are mirrored characters, so an RTL page draws each
   as the other. */
module.exports = function ({ ok, head, fs, path, ROOT }) {
  function testMinesweeperEdges() {
    head('Minesweeper: all four edges say there is more, arrows point outwards (#1232)');
    const src = fs.readFileSync(path.join(ROOT, 'www/games/minesweeper/index.html'), 'utf8');
    ok(/\.ms-frame::before, \.ms-frame::after[^{]*\{[^}]*direction: ltr/.test(src) || /\.ms-frame::before, \.ms-frame::after \{[^}]*direction: ltr/.test(src),
      'the side arrows are drawn left to right in every language');
    ok(/class: 'ms-edge ms-edge-up'/.test(src) && /class: 'ms-edge ms-edge-down'/.test(src), 'the frame has a top and a bottom edge');
    ok(/E\.scrollEdges\(scroll\.scrollTop, scroll\.scrollHeight, scroll\.clientHeight, false\)/.test(src), 'they follow the vertical scroll');
    ok(/classList\.toggle\('ms-more-up',/.test(src) && /classList\.toggle\('ms-more-down',/.test(src), 'and are switched on and off');
    ok(/\.ms-more-up \.ms-edge-up, \.ms-more-down \.ms-edge-down \{ opacity: 1/.test(src), 'a hidden row shows its edge');
  }
  return { testMinesweeperEdges };
};
