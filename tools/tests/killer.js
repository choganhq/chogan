'use strict';
// #851: Killer sudoku as a mode inside Sudoku (owner, 2026-11-12), not a game of its own,
// so it shares the board, notes, hints and saves. Every puzzle must have exactly one
// answer, proven by a solver that knows the cages, and a Classic game saved before
// Killer existed must still load.
module.exports = function (T) {
  const { ok, head, loadEngine, rng, fs, path, vm, ROOT, LOCALE_CODES } = T;

  function testKiller() {
    head('Sudoku: Killer mode, cages with one answer (#851)');
    const t0 = Date.now();
    const E = loadEngine('sudoku', 'SudokuEngineFactory');
    const page = fs.readFileSync(path.join(ROOT, 'www/games/sudoku/index.html'), 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const has = typeof E.makeKiller === 'function' && typeof E.killerCount === 'function' && typeof E.killerConflicts === 'function';
    ok(has, 'the Sudoku engine has a Killer generator, a cage-aware solver and cage conflicts');
    // without the engine only its checks are skipped; the page, save and award checks still run
    if (has) {
      // the sets of digits by size and sum: 3 in two cells is only {1,2}; 45 in nine is all
      ok(E.COMBOS[2][3].length === 1 && E.COMBOS[2][3][0] === ((1 << 1) | (1 << 2)) && E.COMBOS[9][45].length === 1 && E.COMBOS[2][10].length === 4,
        'the digit sets by size and sum are right (3 in two = 1+2, 10 in two = four ways)');
      const g0 = new Array(81).fill(0);
      ok(E.cageMask(g0, { cells: [0, 1], sum: 3 }) === ((1 << 1) | (1 << 2)) && E.cageMask(g0, { cells: [0, 1], sum: 17 }) === ((1 << 8) | (1 << 9)),
        'a two-cell cage of 3 allows only 1 and 2, of 17 only 8 and 9');

      const sizeOk = { easy: [2, 3], medium: [2, 4], hard: [2, 5], expert: [2, 5] };
      let made = 0, unique = 0, solved = 0, cover = 0, shape = 0, sums = 0, givens = 0, worst = 0, runs = 0;
      const shown = {};
      for (const d of ['easy', 'medium', 'hard', 'expert']) {
        shown[d] = [];
        for (let k = 0; k < 4; k++) {
          runs++;
          const s = Date.now(), p = E.makeKiller(rng(8510 + k * 37 + d.length), d);
          worst = Math.max(worst, Date.now() - s);
          if (!p || !p.cages || !p.solution) continue;
          made++;
          // the cages cover every cell exactly once
          const seen = new Array(81).fill(0);
          p.cages.forEach((cg) => cg.cells.forEach((c) => seen[c]++));
          if (seen.every((n) => n === 1)) cover++;
          // 2 to 5 connected cells (within the level's sizes, a lone cell may join up to 5), different digits, the right sum
          const conn = (cells) => { const set = new Set(cells), st = [cells[0]], got = new Set([cells[0]]); while (st.length) { const c = st.pop(); for (const n of [c - 9, c + 9, c % 9 ? c - 1 : -1, c % 9 < 8 ? c + 1 : -1]) if (set.has(n) && !got.has(n)) { got.add(n); st.push(n); } } return got.size === cells.length; };
          if (p.cages.every((cg) => cg.cells.length >= sizeOk[d][0] && cg.cells.length <= Math.max(sizeOk[d][1], 5) && conn(cg.cells) &&
            new Set(cg.cells.map((c) => p.solution[c])).size === cg.cells.length)) shape++;
          if (p.cages.every((cg) => cg.sum === cg.cells.reduce((a, c) => a + p.solution[c], 0))) sums++;
          if (p.puzzle.every((v, i) => !v || v === p.solution[i])) givens++;
          shown[d].push(p.puzzle.filter(Boolean).length);
          // exactly one answer, with a search big enough to finish
          const r = E.killerCount(p.puzzle, p.cages, 2, 3000000);
          if (r.count === 1 && !r.gaveUp && r.solutions[0].every((v, i) => v === p.solution[i])) unique++;
          // a player that only knows the shown digits and the cages reaches the answer
          const sol = E.killerSolve(p.puzzle, p.cages);
          if (sol && sol.every((v, i) => v === p.solution[i]) && !Object.keys(E.conflicts(sol)).length && !Object.keys(E.killerConflicts(sol, p.cages)).length) solved++;
        }
      }
      ok(runs === 16 && made === runs, 'every level makes a Killer puzzle on every seed (' + made + '/' + runs + ')');
      ok(cover === runs, 'the cages cover each cell exactly once (' + cover + '/' + runs + ')');
      ok(shape === runs, 'every cage is 2 to 5 connected cells with different digits (' + shape + '/' + runs + ')');
      ok(sums === runs, 'every cage shows the sum of its answer digits (' + sums + '/' + runs + ')');
      ok(givens === runs, 'the shown digits agree with the answer (' + givens + '/' + runs + ')');
      ok(unique === runs, 'every puzzle has exactly one answer, proven by a finished search (' + unique + '/' + runs + ')');
      ok(solved === runs, 'the cage-aware solver finishes every puzzle with no row, column, box or cage conflict (' + solved + '/' + runs + ')');
      const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
      ok(avg(shown.easy) > avg(shown.expert) && Math.max(...shown.expert) <= 30, 'easy shows more digits than expert, and no Killer puzzle shows more than 30 (' + ['easy', 'expert'].map((d) => d + ' ' + shown[d].join('/')).join(', ') + ')');
      ok(worst < 1500, 'making a puzzle never holds the page long (worst ' + worst + ' ms)');
      const a = E.makeKiller(rng(77), 'hard'), b = E.makeKiller(rng(77), 'hard');
      ok(a && b && JSON.stringify(a) === JSON.stringify(b), 'one seed always makes the same Killer puzzle');
      // cages that do not pin the answer down are caught: nine row-cages of 45 are plain empty sudoku
      const rows = Array.from({ length: 9 }, (_, r) => ({ cells: Array.from({ length: 9 }, (_, c) => r * 9 + c), sum: 45 }));
      const loose = E.killerCount(new Array(81).fill(0), rows, 2, 20000);
      ok(loose.count === 2 || loose.gaveUp, 'a puzzle with more than one answer is not taken for unique');

      // conflicts inside a cage: a repeated digit, and a sum passed
      const cg = [{ cells: [0, 1, 2], sum: 6 }];
      const g = new Array(81).fill(0); g[0] = 2; g[2] = 2;
      const bad = E.killerConflicts(g, cg);
      ok(bad[0] && bad[2] && !bad[1], 'a digit twice in a cage is flagged');
      const g2 = new Array(81).fill(0); g2[0] = 4; g2[1] = 3;
      ok(E.killerConflicts(g2, cg)[0] && E.killerConflicts(g2, cg)[1], 'digits that pass the cage\'s sum are flagged');
      const g3 = new Array(81).fill(0); g3[0] = 1; g3[1] = 2;
      ok(!Object.keys(E.killerConflicts(g3, cg)).length, 'a cage on its way to its sum is not flagged');
    }

    // the outline pieces: the page's own cageLines over a cage shaped like an L
    const grab = (name) => { const i = page.indexOf('  function ' + name + '('); return i < 0 ? '' : page.slice(i, page.indexOf('\n  }\n', i) + 4); };
    const cl = grab('cageLines');
    ok(cl.length > 0 && /var CAGE_IN = 3;/.test(page), 'cageLines found in the Sudoku page');
    if (cl) {
      const sb = { CAGE_IN: 3, Math };
      vm.runInNewContext(cl + ';this.cageLines = cageLines;', sb);
      const L = sb.cageLines([{ cells: [0, 9, 10], sum: 6 }]);
      const find = (i, t, s) => L[i].find((l) => l[0] === t && l[1] === s);
      ok(L[0].length === 3 && L[9].length === 2 && L[10].length === 3 && L[1].length === 0, 'each cell draws only its outside edges (3, 2 and 3 pieces)');
      ok(find(10, 'h', 'top')[2] === -5 && find(0, 'v', 'end')[3] === -5, 'at the inner corner of the L both pieces reach past the gap and meet');
      ok(find(0, 'v', 'start')[3] === -1 && find(9, 'v', 'start')[2] === -1, 'down a straight side the pieces meet halfway across the gap');
      ok(find(0, 'h', 'top')[2] === 3 && find(0, 'h', 'top')[3] === 3, 'an outside corner ends inside the cell');
      const B = sb.cageLines([{ cells: [2, 3], sum: 9 }]);
      ok(B[2].find((l) => l[1] === 'top')[3] === -2.5, 'across a box line the gap is wider, and the pieces still meet in it');
    }

    // saves: Classic keeps the core's session slot as it always had; Killer has its own
    const ps = grab('pickSaves'), ik = grab('isKiller');
    ok(ps.length > 0 && ik.length > 0, 'pickSaves found in the Sudoku page');
    if (ps && ik) {
      const sb = {};
      vm.runInNewContext(ik + ps + ';this.pickSaves = pickSaves;', sb);
      const old = { inProgress: true, at: 1, s: { difficulty: 'hard', daily: null, puzzle: [], solution: [], grid: [5], notes: [], hinted: {}, undo: [], elapsed: 1000, mistakes: 0, hints: 0, done: false }, prefs: { showErrors: true, difficulty: 'hard' } };
      const kil = { s: { mode: 'killer', cages: [{ cells: [0, 1], sum: 3 }], grid: [1], done: false, daily: null } };
      let r = sb.pickSaves(old, null, null);
      ok(r.classic === old.s && r.killer === null, 'a Classic game saved before Killer existed (no mode field) loads as before');
      r = sb.pickSaves(old, kil, null);
      ok(r.classic === old.s && r.killer === kil.s, 'with both saved, each mode gets its own game back');
      r = sb.pickSaves({ s: Object.assign({}, old.s, { daily: '2026-11-12' }) }, kil, '2026-11-12');
      ok(r.classic && r.classic.daily === '2026-11-12' && r.killer === null, 'a daily is Classic and leaves the Killer save alone');
      r = sb.pickSaves(null, { s: Object.assign({}, kil.s, { done: true }) }, null);
      ok(!r.classic && !r.killer, 'a finished game is not brought back');
    }
    ok(/ctx\.store\.set\('killer', \{ s: kS, at: Date\.now\(\) \}\);/.test(page) && /if \(!cS \|\| cS\.done\) return \{ inProgress: false \};\n    return \{ s: cS, prefs: prefs \};/.test(page),
      'Killer saves under its own key and the session slot only ever holds Classic');
    ok(/if \(kill\) ctx\.store\.remove\('killer'\); else ctx\.clearSave\(\);/.test(page) && !/ctx\.store\.remove\('session'\)/.test(page),
      'finishing a game removes only its own save, never a Classic game in progress');
    ok(/var killer = mode === 'killer' && !daily;/.test(page), 'the daily is always Classic');

    // the switch lives behind the gear, the rule in help, and every word in every language
    const sets = page.slice(page.indexOf('  function showSettings() {'), page.indexOf('  function kbRow('));
    const help = page.slice(page.indexOf('  function showHelp() {'), page.indexOf('  function showSettings() {'));
    ok(/modeRow\(\),\n        settingRow\('showErrors', 'showErrors'\)/.test(sets) && /if \(dailyDate\) return null;/.test(grab('modeRow')), 'the Classic / Killer switch is the first row behind the gear, and not in a daily');
    ok(/C\.t\('kRule'\)/.test(help) && !/modeRow/.test(help), 'the help explains the cages and holds no option');
    const keys = ['kMode', 'kClassic', 'kKiller', 'kTitle', 'kRule'];
    ok(LOCALE_CODES.length >= 7 && LOCALE_CODES.every((l) => {
      const blk = (new RegExp('\\n      ' + l + ': \\{([\\s\\S]*?)\\n      \\}').exec(page) || [])[1] || '';
      return keys.every((k) => new RegExp('\\b' + k + ": '[^']+'").test(blk));
    }), 'the Killer words are in all ' + LOCALE_CODES.length + ' languages');
    // one new award, unique id and titles, mapped to Sudoku, unlocked by a Killer win
    const line = (core.match(/\{ id: 'sd-killer'[^\n]*/g) || []);
    ok(line.length === 1 && ['fa', 'en', 'zh', 'de', 'es', 'pl', 'fr'].every((l) => new RegExp('\\b' + l + ": '[^']+'").test(line[0]) && new RegExp('\\bd' + l + ": '[^']+'").test(line[0])),
      'the sd-killer award exists once, titled and described in every language');
    if (line.length === 1) {
      const titles = ['fa', 'en', 'zh', 'de', 'es', 'pl', 'fr'].map((l) => (new RegExp('\\b' + l + ": '([^']+)'").exec(line[0]) || [])[1]);
      const dup = titles.filter((t) => t && (core.split("'" + t + "'").length - 1) > 1);
      ok(!dup.length, 'no other award or string shares its titles' + (dup.length ? ': ' + dup.join(', ') : ''));
    }
    ok(/sd: 'sudoku'/.test(core) && /if \(kill\) C\.achievements\.unlock\('sd-killer'\);/.test(page), 'the award maps to Sudoku and a Killer win unlocks it');
    ok(/C\.stats\.best\('sudoku', \(kill \? 'killer-time-' : 'time-'\) \+ S\.difficulty/.test(page), 'Killer keeps its own best times');
    const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
    ok((games.find((x) => x.id === 'sudoku') || {}).updated >= '2026-11-12', 'Sudoku carries the day Killer arrived as its updated date');

    const ms = Date.now() - t0;
    // about 1.5 s on the laptop; CI runs about three times slower (#678)
    ok(ms < 12000, 'the group stays under its 12 s limit (' + ms + ' ms)');
  }

  return { testKiller };
};
