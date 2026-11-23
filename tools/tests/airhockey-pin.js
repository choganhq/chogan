'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine } = T;
  // #1090: a mallet pressing the puck into a board pushed it out through the board, the board
  // put it back under the mallet, and every step counted a hit: the puck stayed stuck and a
  // player saw 5000 hits. Each mallet presses the puck into each board for 3 s.
  function testAirHockeyPin() {
    head('Air Hockey: a puck pressed into a board (#1090)');
    const E = loadEngine('airhockey', 'AirHockeyEngineFactory');
    const half = () => 0.5;
    const fresh = () => { const S = E.match(); S.wait = 0; S.mal[0] = { x: 40, y: E.H - 40, vx: 0, vy: 0 }; S.mal[1] = { x: 40, y: 40, vx: 0, vy: 0 }; return S; };
    const hold = (S) => [{ x: S.mal[0].x, y: S.mal[0].y }, { x: S.mal[1].x, y: S.mal[1].y }];
    const pin = (seat, px, py, tx, ty) => {
      const S = fresh(); S.puck = { x: px, y: py, vx: 0, vy: 0 };
      const nx = tx - px, ny = ty - py, l = Math.hypot(nx, ny), back = E.RP + E.RM + 30;
      S.mal[seat] = Object.assign(E.clampMallet(seat, px - nx / l * back, py - ny / l * back), { vx: 0, vy: 0 });
      let held = 0;
      for (let i = 0; i < 360; i++) {
        const inp = hold(S); inp[seat] = { x: tx, y: ty }; E.step(S, inp, half);
        if (Math.hypot(S.puck.x - S.mal[seat].x, S.puck.y - S.mal[seat].y) < E.RP + E.RM + 1) held++;
      }
      return { hits: S.hits, held, own: S.score[1 - seat] };
    };
    const pins = [
      ['bottom mallet, left board', pin(0, E.RP, 450, -40, 450)], ['bottom mallet, right board', pin(0, E.W - E.RP, 500, E.W + 40, 500)],
      ['bottom mallet, end board', pin(0, 70, E.H - E.RP, 70, E.H + 40)], ['top mallet, left board', pin(1, E.RP, 200, -40, 200)],
      ['top mallet, right board', pin(1, E.W - E.RP, 150, E.W + 40, 150)], ['top mallet, end board', pin(1, E.W - 70, E.RP, E.W - 70, -40)]
    ];
    // a press is a hit, and the puck may bounce back off the board into the mallet a few
    // times; held on, the old code counted one per step (359 in 3 s)
    ok(pins.length === 6 && pins.every(([, r]) => r.hits <= 5), 'pressing the puck into a board for 3 s counts a few hits, not one per step (' + pins.map(([n, r]) => n + ' ' + r.hits).join(', ') + ')');
    ok(pins.every(([, r]) => r.held < 60), 'the mallet cannot hold the puck against the board: in touch under 0.5 s of the 3 (' + pins.map(([n, r]) => n + ' ' + (r.held / 120).toFixed(2) + ' s').join(', ') + ')');
    ok(pins.every(([, r]) => r.own === 0), 'the puck never slips into the presser\'s own goal');
  }
  return { testAirHockeyPin };
};
