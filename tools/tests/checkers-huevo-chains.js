'use strict';
// #391 follow-up (HuevosKicker, 2026-11-12): in Huevo Style every landing is a legal end of
// the move, and the old tap-by-tap played the first hop at once, so no chain could ever be
// continued by tapping. The rules' write-up asks for a dot on every landing of every chain,
// a tap playing the move that stops there. These checks drive the engine's tap logic
// (E.pickOf, E.tapPick) with real move lists.
module.exports = function (T) {
  const { ok, head, fs, path, ROOT, loadEngine } = T;

  function testCheckersHuevoTaps() {
    head('Checkers: Huevo chains can be continued by tapping (#391)');
    const E = loadEngine('checkers', 'CheckersEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/checkers/index.html'), 'utf8');
    ok(typeof E.pickOf === 'function' && typeof E.tapPick === 'function', 'the engine has the tap logic (pickOf, tapPick)');
    if (typeof E.pickOf !== 'function' || typeof E.tapPick !== 'function') return;
    const map = { '.': 0, x: 1, o: 2, X: 3, O: 4, q: 5, Q: 6, e: 7, E: 8 };
    const B = (rows) => rows.join('').split('').map((ch) => map[ch]);
    const sq = (r, c) => r * 8 + c;
    const key = (m) => m && (m.from + '>' + m.path.join('>'));
    const mine = (b, from, rules) => E.moves(b, 1, rules, rules === 'huevo', null).filter((m) => m.from === from);
    const sorted = (a) => a.slice().sort((x, y) => x - y).join();

    // A man with a two-hop chain: 49 takes 42 to 35, then 28 to 21
    const b = B(['........', '........', '........', '....o...', '........', '..o.....', '.x......', '........']);
    const ms = mine(b, 49, 'huevo');
    ok(ms.length >= 3, 'the man has moves to pick from (' + ms.map(key).join(' ') + ')');
    const start = { from: 49, steps: [] };
    const t0 = E.pickOf(ms, start, true).targets;
    ok(t0.indexOf(35) >= 0 && t0.indexOf(21) >= 0 && t0.indexOf(40) >= 0, 'every landing of the chain is a dot from the start, beside the quiet step (' + sorted(t0) + ')');
    const far = E.tapPick(ms, start, 21, true);
    ok(!!far && key(far.move) === '49>35>21' && far.move.caps.length === 2, 'a tap on the far landing plays the whole chain, two pieces taken (' + key(far && far.move) + ')');
    const near = E.tapPick(ms, start, 35, true);
    ok(!!near && key(near.move) === '49>35' && near.move.caps.length === 1, 'a tap on the first landing stops the chain there (' + key(near && near.move) + ')');
    ok(E.tapPick(ms, start, sq(0, 0), true) === null, 'a tap off the dots is not a move');

    // A king's three-hop chain: the middle landing is a stop of its own
    const kb = B(['........', '....o...', '........', '....o...', '........', '..o.....', '........', 'X.......']);
    const kms = mine(kb, 56, 'huevo');
    const kt = E.pickOf(kms, { from: 56, steps: [] }, true).targets;
    const mid = E.tapPick(kms, { from: 56, steps: [] }, 21, true);
    ok(kt.indexOf(35) >= 0 && kt.indexOf(21) >= 0 && kt.indexOf(3) >= 0 && !!mid && key(mid.move) === '56>35>21', 'a king\'s chain shows all three landings and stops on the middle one when tapped (' + sorted(kt) + ' | ' + key(mid && mid.move) + ')');

    // Two different captures end on the same square: the route is picked hop by hop
    const lb = B(['........', '........', '........', '..o.o...', '........', '..o.o...', '...x....', '........']);
    const lms = mine(lb, 51, 'huevo');
    const goal = E.tapPick(lms, { from: 51, steps: [] }, 19, true);
    ok(!!goal && !goal.move && goal.sel && goal.sel.goal === 19, 'a square two routes reach keeps the pick and waits for the route');
    const gt = goal && goal.sel ? E.pickOf(lms, goal.sel, true).targets : [];
    ok(sorted(gt) === sorted([33, 37]), 'then only the first hops of those two routes are dots (' + sorted(gt) + ')');
    const right = goal && goal.sel ? E.tapPick(lms, goal.sel, 37, true) : null;
    ok(!!right && key(right.move) === '51>37>19' && sorted(right.move.caps) === sorted([44, 28]), 'a tap on one plays that route and takes its two pieces (' + key(right && right.move) + ')');
    const oneHop = E.tapPick(lms, { from: 51, steps: [] }, 37, true);
    ok(!!oneHop && key(oneHop.move) === '51>37', 'without a goal, a tap on a first landing still stops there');

    // Classic is unchanged: a forced chain is tapped landing by landing, one dot at a time
    const cms = mine(b, 49, 'classic');
    const ct = E.pickOf(cms, start, false).targets;
    const c1 = E.tapPick(cms, start, 35, false);
    const c2 = c1 && c1.sel ? E.tapPick(cms, c1.sel, 21, false) : null;
    ok(sorted(ct) === '35' && !!c1 && !c1.move && !!c2 && key(c2.move) === '49>35>21', 'classic still shows only the next landing and plays the chain after its last tap (' + sorted(ct) + ')');

    // The page goes through it
    ok(/return E\.pickOf\(mine, sel, S\.rules === 'huevo'\);/.test(html) && /var t = E\.tapPick\(mine, sel, i, S\.rules === 'huevo'\);/.test(html), 'the page picks dots and plays taps through the engine');
  }

  return { testCheckersHuevoTaps };
};
