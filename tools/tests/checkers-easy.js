// Easy Checkers has to be beatable by someone who is just starting (#1214).
module.exports = function (T) {
  const { ok, head, loadEngine, rng } = T;
  function testCheckersEasy() {
    head('Checkers: a beginner can beat Easy (#1214)');
    const E = loadEngine('checkers', 'CheckersEngineFactory');
    for (const rules of ['classic', 'spanish', 'huevo']) {
      const rnd = rng(1214);
      // the beginner counts pieces after their own move and never looks at the reply
      const beginner = (G) => {
        let best = null, bs = -Infinity;
        for (const m of E.moves(G.board, G.turn, G.rules)) {
          const c = Object.assign({}, G, { board: G.board.slice(), history: [], qt: G.qt && G.qt.slice() });
          E.applyMove(c, m);
          const all = E.count(c.board).all, s = (all[G.turn] - all[3 - G.turn]) * 100 + rnd() * 40;
          if (s > bs) { bs = s; best = m; }
        }
        return best;
      };
      let won = 0, lost = 0, played = 0;
      for (let g = 0; g < 20; g++) {
        const G = E.newState('ai', rules);
        for (let i = 0; i < 300 && G.winner < 0; i++) {
          const m = G.turn === 1 ? beginner(G) : E.aiMove(G.board, 2, 'easy', rnd, rules, false, G);
          if (!E.applyMove(G, m)) break;
        }
        if (G.winner >= 0) played++;
        if (G.winner === 1) won++;
        if (G.winner === 2) lost++;
      }
      ok(played === 20, rules + ': all 20 games finish');
      ok(won >= 5 && lost >= 3, rules + ': the beginner wins some and loses some (' + won + ' won, ' + lost + ' lost)');
    }
  }
  return { testCheckersEasy };
};
