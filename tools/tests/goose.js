'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, rng, fs, path, ROOT, LOCALE_CODES } = T;

  // #907: the Game of the Goose on a 63-square spiral, two to four on one phone, each seat a person or a bot
  function testGoose() {
    head('Goose Race (#907)');
    const t0 = Date.now();
    const file = path.join(ROOT, 'www/games/goose/index.html');
    // no early return: a missing page must fail the group, not hide every check after it
    if (!fs.existsSync(file)) throw new Error('www/games/goose/index.html does not exist');
    const E = loadEngine('goose', 'GooseEngineFactory');
    const html = fs.readFileSync(file, 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');

    // the board: 64 cells (start plus 1..63) on an 8×8 spiral that winds inwards
    const cells = [];
    for (let n = 0; n <= 63; n++) cells.push(E.cell(n));
    const keys = new Set(cells.map((q) => q.join()));
    ok(E.END === 63 && keys.size === 64 && cells.every((q) => q[0] >= 0 && q[0] < 8 && q[1] >= 0 && q[1] < 8), 'the 64 squares fill an 8×8 grid, each once');
    ok(cells.every((q, n) => n === 0 || Math.abs(q[0] - cells[n - 1][0]) + Math.abs(q[1] - cells[n - 1][1]) === 1), 'each square sits beside the one before it, so the path never jumps');
    ok(cells[0].join() === '0,7' && cells[63][0] >= 3 && cells[63][0] <= 4 && cells[63][1] >= 3 && cells[63][1] <= 4, 'the start is the bottom left corner and 63 is in the middle');
    const GEESE = [5, 9, 14, 18, 23, 27, 32, 36, 41, 45, 50, 54, 59];
    ok(GEESE.every((n) => E.kind(n) === 'goose') && E.GEESE.join() === GEESE.join(), 'the thirteen geese are on 5, 9, 14, … 59');
    ok(E.kind(6) === 'bridge' && E.kind(19) === 'inn' && E.kind(31) === 'well' && E.kind(42) === 'maze' && E.kind(52) === 'prison' &&
      E.kind(58) === 'death' && E.kind(63) === 'goal' && E.kind(0) === 'start' && E.kind(26) === '' && E.kind(53) === '',
      'bridge 6, inn 19, well 31, maze 42, prison 52, death 58, goal 63; the 9 shortcuts land on plain squares');

    // a game in a chosen position, with the first throw already made
    const at = (pos, turn) => {
      const S = E.newGame(pos.length);
      S.pos = pos.slice(); S.moved = pos.map(() => true); S.turn = turn || 0;
      return S;
    };
    const types = (r) => r.events.map((e) => e.type).join();

    const S0 = E.newGame(3);
    ok(S0.pos.join() === '0,0,0' && S0.turn === 0 && S0.winner < 0 && E.valid(S0), 'three players start off the path, seat one first');
    let r = E.play(at([2, 0]), 1, 2);
    ok(r.state.pos[0] === 8 && types(r) === 'goose' && r.steps.map((s) => s.n).join() === '3,4,5,6,7,8' && r.state.turn === 1,
      'a goose moves you on again by the same throw, square by square: 2 + 3 → 5 → 8');
    r = E.play(at([0, 0]), 4, 5);
    ok(r.state.winner === 0 && r.state.pos[0] === 63 && types(r) === 'goose,goose,goose,goose,goose,goose,win',
      'after the first throw a 9 from the start rides six geese all the way to 63');
    // the first throw of 9
    const first = (a, b) => E.play(E.newGame(2), a, b);
    ok([[6, 3, 26], [3, 6, 26], [5, 4, 53], [4, 5, 53]].every(([a, b, to]) => { const q = first(a, b); return q.state.pos[0] === to && types(q) === 'nine' && q.state.moved[0]; }),
      'a first throw of 6 + 3 goes to 26 and 5 + 4 to 53, instead of riding the geese home');
    ok(first(1, 2).state.pos[0] === 3 && first(2, 2).state.pos[0] === 4 && types(first(1, 4)) === 'goose',
      'any other first throw moves normally (1 + 4 lands on the goose on 5)');
    // the special squares
    r = E.play(at([2, 0]), 1, 3);
    ok(r.state.pos[0] === 12 && types(r) === 'bridge' && r.steps[r.steps.length - 1].jump, 'the bridge on 6 carries you to 12');
    r = E.play(at([38, 0]), 2, 2);
    ok(r.state.pos[0] === 39 && types(r) === 'maze', 'the maze on 42 sends you back to 39');
    r = E.play(at([56, 0]), 1, 1);
    ok(r.state.pos[0] === 1 && types(r) === 'death', 'death on 58 sends you back to 1');
    // the inn: one turn lost
    r = E.play(at([15, 20]), 2, 2);
    let S = r.state;
    ok(S.pos[0] === 19 && types(r) === 'inn' && S.wait[0] === 1 && S.turn === 1, 'the inn on 19 costs one turn');
    S = E.play(S, 1, 2).state;
    ok(S.turn === 0 && E.waiting(S) && E.play(S, 1, 1) === null, 'a player at the inn cannot throw on the next turn');
    r = E.pass(S);
    ok(r.state.turn === 1 && r.state.wait[0] === 0 && types(r) === 'skip', 'the turn passes them by once');
    S = E.play(r.state, 1, 2).state;
    ok(!E.waiting(S) && E.play(S, 1, 1).state.pos[0] === 21, 'and on the turn after that they throw again');
    // the well: until someone takes your place
    r = E.play(at([28, 29, 3]), 1, 2);
    S = r.state;
    ok(S.pos[0] === 31 && types(r) === 'well' && S.wait[0] === 2 && S.trap[0] === 31, 'falling into the well on 31 holds you');
    r = E.play(S, 1, 1);
    S = r.state;
    ok(S.pos[1] === 31 && S.wait[0] === 0 && S.trap[0] === 0 && S.wait[1] === 2 && types(r) === 'well,free' && r.events[1].seat === 0,
      'another player falling in frees the one already there and is held instead');
    S = E.play(S, 1, 2).state;
    ok(S.turn === 0 && !E.waiting(S), 'the freed player is not held any more');
    S = E.play(S, 1, 1).state;
    ok(S.pos[0] === 33 && S.turn === 1 && E.waiting(S) && E.play(S, 2, 2) === null, 'the freed player throws on their turn while the new one waits');
    // the well: or two turns, so a game always ends
    S = E.play(at([28, 10]), 1, 2).state;
    S = E.play(S, 1, 2).state;
    S = E.pass(S).state;
    S = E.play(S, 1, 2).state;
    ok(E.waiting(S) && S.turn === 0, 'still in the well after one missed turn');
    S = E.pass(S).state;
    S = E.play(S, 1, 2).state;
    ok(S.turn === 0 && !E.waiting(S) && E.play(S, 2, 2).state.pos[0] === 35, 'after two missed turns nobody came, and the player climbs out');
    // the prison: the same as the well
    r = E.play(at([49, 51]), 1, 2);
    S = r.state;
    ok(S.pos[0] === 52 && types(r) === 'prison' && S.wait[0] === 2, 'the prison on 52 holds you like the well');
    ok(E.play(S, 1, 0) === null && E.play(S, 7, 1) === null && E.play(S, 1.5, 2) === null, 'a die outside 1–6 is refused');
    r = E.play(S, 1, 1);
    ok(r.state.pos[1] === 53 && r.state.wait[0] === 2, 'landing beside the prison frees nobody');
    S = E.play(at([49, 50], 1), 1, 1).state;
    ok(S.pos[1] === 52 && S.wait[1] === 2 && S.trap[1] === 52, 'a bot or a person, the prison holds the same way');
    // exact finish and bouncing back
    r = E.play(at([60, 0]), 1, 2);
    ok(r.state.winner === 0 && r.state.pos[0] === 63 && types(r) === 'win', 'an exact throw onto 63 wins');
    r = E.play(at([60, 0]), 3, 3);
    ok(r.state.winner < 0 && r.state.pos[0] === 60 && r.steps.map((s) => s.n).join() === '61,62,63,62,61,60' && types(r) === 'bounce',
      'a throw past 63 bounces back by the rest');
    r = E.play(at([61, 0]), 3, 3);
    ok(r.state.pos[0] === 53 && types(r) === 'bounce,goose', 'a bounce onto the goose on 59 keeps going backwards by the throw');
    r = E.play(at([62, 0]), 1, 5);
    ok(r.state.pos[0] === 1 && types(r) === 'bounce,death', 'a bounce onto death still sends you to 1');
    ok(E.play(at([60, 0]), 1, 2).state.winner === 0 && E.play(E.play(at([60, 0]), 1, 2).state, 1, 1) === null, 'nothing moves once the race is won');

    // ten thousand random games all end, and every state on the way is a valid save
    let ended = 0, sane = 0, longest = 0, total = 0;
    const R = rng(907);
    for (let g = 0; g < 10000; g++) {
      let G = E.newGame(2 + (g % 3)), n = 0, good = true;
      while (G.winner < 0 && n < 3000) {
        const step = E.waiting(G) ? E.pass(G) : E.play(G, ...E.roll(R));
        if (!step || !E.valid(step.state)) { good = false; break; }
        G = step.state; n++;
      }
      if (G.winner >= 0) ended++;
      if (good) sane++;
      longest = Math.max(longest, n); total += n;
    }
    ok(ended === 10000 && sane === 10000, '10,000 random games of 2–4 players all end, every state valid (' + ended + ' ended, longest ' + longest + ' turns, mean ' + (total / 10000).toFixed(1) + ')');
    const dice = Array.from({ length: 600 }, () => E.roll(R));
    ok(dice.every((d) => d.length === 2 && d.every((v) => v >= 1 && v <= 6 && Math.floor(v) === v)) && new Set(dice.map((d) => d.join())).size === 36,
      'two dice are thrown, each 1–6, and every pair comes up');

    // saves
    const V = at([10, 20, 31], 1); V.wait[2] = 2; V.trap[2] = 31;
    ok(E.valid(V) && !E.valid(Object.assign(E.copy(V), { turn: 3 })) && !E.valid(Object.assign(E.copy(V), { pos: [10, 20] })) &&
      !E.valid(Object.assign(E.copy(V), { pos: [10, 64, 31] })) && !E.valid(Object.assign(E.copy(V), { wait: [0, 0, 3] })) &&
      !E.valid(Object.assign(E.copy(V), { winner: 1 })) && !E.valid(null) && !E.valid(E.newGame(5)),
      'a save is checked before it is restored (turn, players, squares, waiting, winner)');

    // the page
    const gm = T.games().find((g) => g.id === 'goose');
    ok(!!gm && gm.daily === false && !/C\.daily\(/.test(html), 'a game of pure luck has no daily challenge');
    ok(/C\.cards\.speedRow\(\)/.test(html) && /C\.cards\.pace\(/.test(html), 'the bots and the pawns follow the Slow / Normal / Fast speed');
    ok(/C\.ui\.reduceMotion\(\)/.test(html) && /requestAnimationFrame/.test(html), 'the pawn hops square by square, and reduced motion is respected');
    ok(/k === ' ' \|\| k === 'Enter'/.test(html), 'Space or Enter throws the dice');
    const help = (html.match(/function showHelp\(\) \{([\s\S]*?)\n {2}\}/) || [])[1] || '';
    ok(/C\.icon\('gear', 20\)/.test(html) && help.length > 0 && !/segmented|speedRow/.test(help) && /C\.t\('rules'\)/.test(help),
      'the options (players, people or bots, speed) sit behind a gear; help holds the rules and keys only');
    ok(/cv\.width !== Math\.round\(W \* dpr\) \|\| cv\.height !== Math\.round\(H \* dpr\)/.test(html) && /document\.fonts\.ready/.test(html) && /ResizeObserver/.test(html),
      'the canvas backing follows both sides of its box, and redraws on resize and after fonts load (#359)');
    ok(/ch-fit/.test(html) && /--fit-ar/.test(html) && /ch-split/.test(html), 'the board uses the core layout');
    const boxRule = (html.match(/\.ch-fit > \.gs-box \{([^}]*)\}/) || [])[1];
    ok(boxRule !== undefined && !/(^|[\s;])(width|height)\s*:/.test(boxRule), 'the board slot takes its size from the core rule, never its own (#736)');
    ok(/\.gs-status \{[^}]*min-height: /.test(html), 'the event line keeps its height, so the board never moves when a long message appears');
    // the award: finishing a race, nothing for luck
    ok(html.indexOf("unlock('gs-finish')") > 0 && core.split("id: 'gs-finish'").length === 2 && /\bgs: 'goose'/.test(core), 'one award for finishing a race, once in the core, mapped to the game');
    const ach = core.split('\n').filter((l) => /^\s*\{ id: '[a-z0-9-]+',\s+icon:/.test(l));
    const dupes = [];
    LOCALE_CODES.forEach((lang) => {
      const re = new RegExp('[{,]\\s+' + lang + ": '([^']*)'");
      const titles = ach.map((l) => (l.match(re) || [])[1]);
      ach.forEach((l, k) => {
        if (!/id: 'gs-/.test(l)) return;
        if (!titles[k]) dupes.push(lang + ':missing');
        else if (titles.filter((x) => x === titles[k]).length > 1) dupes.push(lang + ':' + titles[k]);
      });
    });
    ok(ach.filter((l) => /id: 'gs-/.test(l)).length === 1 && dupes.length === 0, 'the award title exists in every language and no other award uses it (' + (dupes.join(', ') || 'none') + ')');
    // strings: every language, the same keys, none named like a core key
    const sm = html.match(/strings: \{\n([\s\S]*?)\n {4}\}\n {2}\}\);/);
    const langs = {};
    if (sm) sm[1].split(/\n {6}(?=[a-z]{2}: \{)/).forEach((blk) => { const m = blk.match(/^\s*([a-z]{2}): \{/); if (m) langs[m[1]] = (blk.match(/\b([A-Za-z0-9]+): '/g) || []).map((k) => k.slice(0, -3)).sort().join(); });
    const codes = Object.keys(langs);
    ok(LOCALE_CODES.length >= 9 && LOCALE_CODES.every((l) => langs[l]) && codes.length === LOCALE_CODES.length && codes.every((l) => langs[l] === langs.fa),
      'the strings exist in every language (' + codes.join(' ') + ') with the same keys');
    const coreKeys = ['again', 'best', 'score', 'help', 'daily', 'dailyDone', 'newGame', 'resetWarn', 'keyboard', 'tutorial', 'done', 'won', 'lost', 'moves', 'time', 'play', 'next', 'undo', 'settings', 'close'];
    const own = (langs.fa || '').split(',');
    ok(own.length > 30 && own.every((k) => coreKeys.indexOf(k) < 0), 'no game string is named like a core string');
    // the help names every rule: the nine, the geese, each square, the bounce
    const rulesFa = (html.match(/\bfa: \{[\s\S]*?rules: '([^']*)'/) || [])[1] || '';
    const rulesEn = (html.match(/\ben: \{[\s\S]*?rules: '([^']*)'/) || [])[1] || '';
    ok(['63', '26', '53', '6', '12', '19', '31', '42', '39', '52', '58'].every((n) => rulesEn.indexOf(n) >= 0) && /goose/i.test(rulesEn) && /bounce/i.test(rulesEn) && /two turns/.test(rulesEn) &&
      ['۶۳', '۲۶', '۵۳', '۱۹', '۳۱', '۴۲', '۵۲', '۵۸'].every((n) => rulesFa.indexOf(n) >= 0), 'the rules in help name every special square, the first throw of 9, the bounce and the two-turn limit');
    // the list and the colours
    const list = T.games();
    ok(!!gm && gm.cat === 'board' && gm.people === 4 && list.indexOf(gm) > list.findIndex((g) => g.id === 'lander'), 'Goose Race is listed after Lander as a board game for up to four on one phone');
    ok(!!gm && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l] && html.indexOf(l + ": '" + gm.name[l] + "'") > 0), 'its name and summary exist in every language, and the page uses the same names');
    const others = list.filter((g) => g.id !== 'goose');
    ok(!!gm && LOCALE_CODES.every((l) => others.every((g) => g.name[l].toLowerCase() !== gm.name[l].toLowerCase())), 'no other game has the same name in any language');
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/goose/icon.svg'), 'utf8');
    ok(!!gm && icon.indexOf('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>') >= 0, 'the icon sits on the game\'s soft tint');
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const lumC = (x) => rgb(x).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
    const lab = (x) => {
      const [Rr, Gr, Bl] = rgb(x).map(lin), f = (q) => q > 0.008856 ? Math.cbrt(q) : 7.787 * q + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
    };
    const dE = (a, b) => { const P2 = lab(a), Q2 = lab(b); return Math.hypot(P2[0] - Q2[0], P2[1] - Q2[1], P2[2] - Q2[2]); };
    const near = gm ? others.map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0] : ['none', 0];
    ok(!!gm && near[1] >= 15 && 1.05 / (lumC(gm.color) + 0.05) >= 4.5 && html.indexOf("accent: '" + gm.color + "'") > 0,
      'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    ok(Date.now() - t0 < 3000, 'the Goose Race tests finish in under 3 s (' + (Date.now() - t0) + ' ms)');
  }
  return { testGoose };
};
