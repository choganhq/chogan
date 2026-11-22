'use strict';
// #391 follow-up (HuevosKicker, 2026-11-12; owner yes 2026-11-20): an Empress may fly back
// over the squares of pieces she took earlier in the same move. Taken pieces stay on the
// board until the move ends, so the old engine stopped her at such a square and a chain
// crossing its own path lost every piece beyond it. Only the Empress: men, kings and the
// Queen, and Classic and Spanish, keep the usual rule.
module.exports = function (T) {
  const { ok, head, loadEngine } = T;

  function testCheckersHuevoEmpressCross() {
    head('Checkers: a Huevo Empress flies over squares she took this move (#391)');
    const E = loadEngine('checkers', 'CheckersEngineFactory');
    const map = { '.': 0, x: 1, o: 2, X: 3, O: 4, q: 5, Q: 6, e: 7, E: 8 };
    const B = (rows) => rows.join('').split('').map((ch) => map[ch]);
    const key = (m) => m.from + '>' + m.path.join('>');
    // The Empress on 53 takes 35 (landing 26), 33 (40), 49 (58), 51 (44), then flies up-left
    // over 35, which she took on her first hop, past the empty 26 to take 17 and land on 8.
    const rows = ['........', '........', '.o......', '........', '.o.o....', '........', '.o.o.e..', '........'];
    const ms = E.moves(B(rows), 1, 'huevo', true, null).filter((m) => m.from === 53);
    ok(ms.length > 0, 'the Empress has moves (' + ms.length + ')');
    const keys = ms.map(key);
    ok(keys.includes('53>26>40>58>44'), 'the four-hop chain is there (' + keys.join(' ') + ')');
    const full = ms.find((m) => key(m) === '53>26>40>58>44>8');
    ok(!!full && full.caps.length === 5 && full.caps.includes(17), 'she flies back over the taken piece on 35 and takes the fifth piece on 17');
    ok(ms.every((m) => new Set(m.caps).size === m.caps.length), 'no piece is taken twice');
    ok(ms.every((m) => m.path.every((s, k) => !m.caps.slice(0, k).includes(s))), 'she never lands on a square she took');
    // the same board with a Queen or a king: no flying over, so no fifth piece
    for (const [ch, who] of [['q', 'Queen'], ['X', 'king']]) {
      const r2 = rows.slice(); r2[6] = r2[6].replace('e', ch);
      const m2 = E.moves(B(r2), 1, 'huevo', true, null).filter((m) => m.from === 53);
      ok(m2.length > 0 && m2.every((m) => m.caps.length < 5), 'a ' + who + ' on her square takes fewer than five (' + Math.max(0, ...m2.map((m) => m.caps.length)) + ')');
    }
  }
  return { testCheckersHuevoEmpressCross };
};
