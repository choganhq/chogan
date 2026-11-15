'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, ROOT, LOCALE_CODES } = T;

  // #926: hexagonal block-fitting puzzle, a 61-cell comb where full lines clear in three directions
  function testHoneycomb() {
    head('Honeycomb (#926)');
    const t0 = Date.now();
    const file = path.join(ROOT, 'www/games/honeycomb/index.html');
    ok(fs.existsSync(file), 'the game page exists');
    const E = loadEngine('honeycomb', 'HoneycombEngineFactory');
    const html = fs.readFileSync(file, 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const N = E.N, SH = E.SHAPES, CELLS = E.CELLS, LINES = E.LINES;

    // the comb: a hexagon of 61 cells; 27 straight lines, nine in each of the three directions
    ok(N === 61 && CELLS.length === 61 && CELLS.every(([q, r]) => Math.abs(q) <= 4 && Math.abs(r) <= 4 && Math.abs(q + r) <= 4), 'the comb has 61 cells within four steps of the middle');
    ok(new Set(CELLS.map((c) => c.join(':'))).size === 61 && CELLS.every(([q, r], i) => E.cellAt(q, r) === i) && E.cellAt(5, 0) === -1 && E.cellAt(4, 4) === -1 && E.cellAt(-5, 5) === -1,
      'every cell has one index and a place outside the hexagon has none');
    const lens = LINES.map((l) => l.length).sort((a, b) => a - b).join();
    ok(LINES.length === 27 && lens === '5,5,5,6,6,6,7,7,7,8,8,8,9,9,9,8,8,8,7,7,7,6,6,6,5,5,5'.split(',').map(Number).sort((a, b) => a - b).join(), 'there are 27 lines of five to nine cells, three of each length at both ends and three of nine');
    ok(E.LINES_OF.length === 61 && E.LINES_OF.every((l) => l.length === 3) && E.LINES_OF.every((l, i) => l.every((id) => LINES[id].indexOf(i) >= 0)), 'every cell lies on exactly three lines, one in each direction');
    const dir = (l) => { const a = CELLS[l[0]], b = CELLS[l[1]]; let dq = b[0] - a[0], dr = b[1] - a[1]; if (dr < 0 || (dr === 0 && dq < 0)) { dq = -dq; dr = -dr; } return dq + ',' + dr; };
    ok(['1,0', '0,1', '-1,1'].every((d) => LINES.filter((l) => dir(l) === d).length === 9) && LINES.every((l) => l.every((c, k) => k === 0 || dir([l[k - 1], c]) === dir(l))),
      'nine lines run along each of the three directions, each one straight');

    // the pieces: all fixed polyhexes of one to four cells, three lines of five and the flower
    const key = (s) => s.c.map((p) => p.join(':')).join(' ');
    const bySize = (n) => SH.filter((s) => s.n === n).length;
    ok(SH.length === 63 && bySize(1) === 1 && bySize(2) === 3 && bySize(3) === 11 && bySize(4) === 44 && bySize(5) === 3 && bySize(7) === 1 && new Set(SH.map(key)).size === 63,
      'there are 63 different pieces: 1, 3, 11 and 44 of one to four cells, three straight fives and a seven-cell flower');
    const joined = SH.every((s) => {
      const seen = new Set([s.c[0].join(':')]), todo = [s.c[0]];
      while (todo.length) { const [q, r] = todo.pop(); [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]].forEach(([a, b]) => { const k = (q + a) + ':' + (r + b); if (!seen.has(k) && s.c.some((p) => p.join(':') === k)) { seen.add(k); todo.push([q + a, r + b]); } }); }
      return seen.size === s.c.length && s.c[0][0] === 0 && s.c[0][1] === 0 && s.c.every((p) => p[1] > 0 || (p[1] === 0 && p[0] >= 0));
    });
    ok(joined && SH.every((s) => s.w > 0 && s.k >= 1 && s.k <= 8 && s.c.some((p) => p[0] === s.hd[0] && p[1] === s.hd[1])), 'every piece is one connected shape starting at its first cell, with a weight, a colour and a handle cell that belongs to it');
    const empty = () => new Array(N).fill(0);
    ok(SH.every((s, i) => E.fits(empty(), i)), 'every piece fits somewhere on an empty comb');
    // a piece placed by its handle covers the cell the finger is on
    ok(SH.every((s, i) => CELLS.every(([q, r]) => { const a = E.anchorFor(i, q, r); const cov = E.coverage(i, a[0], a[1]); return cov.indexOf(E.cellAt(q, r)) >= 0; })), 'the anchor that puts a piece\'s handle on a cell covers that cell');

    const state = (g, tray) => ({ g, tray: tray.slice(), score: 0, placed: 0, lines: 0, streak: 0, seed: 5 });
    const ONE = SH.findIndex((s) => s.n === 1);
    const H5 = SH.findIndex((s) => s.n === 5 && s.c[1][1] === 0), V5 = SH.findIndex((s) => s.n === 5 && s.c[1][0] === 0), D5 = SH.findIndex((s) => s.n === 5 && s.c[1][0] === -1 && s.c[1][1] === 1);
    const FLOWER = SH.findIndex((s) => s.n === 7), TWO = SH.findIndex((s) => s.n === 2);
    ok([ONE, H5, V5, D5, FLOWER, TWO].every((i) => i >= 0), 'the test finds the pieces it uses');

    // placing, and refusing
    const S1 = state(empty(), [FLOWER, ONE, TWO]);
    const m = E.cellAt(0, 0), t1 = E.place(S1, 0, 0, 0);
    ok(t1 && S1.g.filter(Boolean).length === 7 && S1.g[m] && t1.gain === 7 && S1.score === 7 && S1.tray[0] === -1 && S1.placed === 1 && t1.cells.length === 7, 'the flower fills seven cells and scores seven');
    const before = S1.g.join(), sc = S1.score;
    ok(E.place(S1, 1, 0, 0) === null && E.place(S1, 0, 1, 1) === null && E.place(S1, 2, 4, 4) === null && E.place(S1, 1, 9, 9) === null && E.place(S1, 2, -5, 0) === null && S1.g.join() === before && S1.score === sc,
      'a piece over a filled cell, off the comb, or from an empty slot is refused and nothing changes');

    // every line clears, along each of the three directions and at every length
    let cleared = 0, wrong = 0;
    LINES.forEach((ln, id) => {
      [0, Math.floor(ln.length / 2), ln.length - 1].forEach((gap) => {
        const g = empty(); ln.forEach((c, k) => { if (k !== gap) g[c] = 3; });
        const [q, r] = CELLS[ln[gap]];
        const S = state(g, [ONE, ONE, ONE]);
        const p = E.preview(g, ONE, q, r);
        const t = E.place(S, 0, q, r);
        const left = S.g.filter(Boolean).length;
        // the other two lines through the gap cell hold only that one cell, so they stay
        if (p && t && p.lines.join() === String(id) && t.lines.join() === String(id) && t.cleared.length === ln.length && left === 0 && S.lines === 1 && t.gain === 1 + 10) cleared++; else wrong++;
      });
    });
    ok(cleared === 81 && wrong === 0, 'filling the last cell of each of the 27 lines (at the end and in the middle) clears exactly that line (' + cleared + '/81)');
    // cells that are not in the line stay
    const gk = empty(); LINES[0].forEach((c, k) => { if (k) gk[c] = 2; }); gk[E.cellAt(0, 0)] = 5; gk[E.cellAt(2, 2)] = 4;
    const SK = state(gk, [ONE, ONE, ONE]), [kq, kr] = CELLS[LINES[0][0]];
    E.place(SK, 0, kq, kr);
    ok(SK.g[E.cellAt(0, 0)] === 5 && SK.g[E.cellAt(2, 2)] === 4 && SK.g.filter(Boolean).length === 2 && SK.g.every((v, i) => LINES[0].indexOf(i) < 0 || v === 0), 'a clear takes the whole line and nothing else');
    // preview does not change the board
    const g2 = empty(); LINES[4].forEach((c, k) => { if (k) g2[c] = 3; });
    const before2 = g2.join(); E.preview(g2, ONE, ...CELLS[LINES[4][0]]);
    ok(g2.join() === before2, 'the preview names lines without changing the board');
    // a long piece completes a line by itself, and a piece can fill two lines
    const g3 = empty(); const row = LINES.find((l) => l.length === 9 && dir(l) === '1,0');
    row.slice(5).forEach((c) => { g3[c] = 3; });
    const S3 = state(g3, [H5, ONE, ONE]), t3 = E.place(S3, 0, ...CELLS[row[0]]);
    ok(t3 && t3.lines.length === 1 && S3.g.every((v) => v === 0) && t3.cleared.length === 9 && t3.gain === 5 + 10, 'a straight five fills the rest of a row of nine and clears it');
    // the diagonal five fits along the long diagonal of the comb and nowhere it would leave it
    ok(E.canPlace(empty(), D5, -4, 4) === false && E.canPlace(empty(), D5, -1, 0) === false && E.canPlace(empty(), D5, 0, 0) === true && E.canPlace(empty(), D5, 4, -4) === true && E.canPlace(empty(), D5, 0, -4) === true,
      'a piece that would leave the comb does not fit, one inside does');
    // the three lines through the middle, all missing the middle cell: 25 cells, three lines at once
    const mids = E.LINES_OF[m];
    const g4 = empty(); mids.forEach((id) => LINES[id].forEach((c) => { if (c !== m) g4[c] = 2; }));
    const S4 = state(g4, [ONE, ONE, ONE]), t4 = E.place(S4, 0, 0, 0);
    ok(t4.lines.length === 3 && t4.cleared.length === 25 && S4.g.every((v) => v === 0) && t4.gain === 1 + 60 && S4.lines === 3, 'a single that finishes the three lines through the middle clears 25 cells and scores 1 + 60');
    ok(E.bonus(0, 4) === 0 && E.bonus(1, 0) === 10 && E.bonus(2, 0) === 30 && E.bonus(3, 0) === 60 && E.bonus(4, 0) === 100 && E.bonus(2, 3) === 30 + 60,
      'n lines at once score 10, 30, 60, 100, and every clearing piece just before adds 10 a line');
    // the streak runs while pieces keep clearing and stops at one that does not
    const g5 = empty(); const l0 = LINES[0], l1 = LINES.find((l) => dir(l) === '1,0' && l !== l0 && l.length === LINES[0].length + 1);
    l0.forEach((c, k) => { if (k) g5[c] = 1; }); l1.forEach((c, k) => { if (k) g5[c] = 1; });
    const S5 = state(g5, [ONE, ONE, TWO]);
    E.place(S5, 0, ...CELLS[l0[0]]);
    const t5 = E.place(S5, 1, ...CELLS[l1[0]]);
    ok(S5.streak === 2 && t5.bonus === 20, 'a second clearing piece in a row pays the streak bonus (' + t5.bonus + ')');
    E.place(S5, 2, 0, 0);
    ok(S5.streak === 0, 'a piece that clears nothing ends the streak');
    // the tray refills only when all three are placed
    const S6 = state(empty(), [ONE, ONE, ONE]); S6.seed = 77;
    ok(!E.place(S6, 0, 0, 0).refilled && !E.place(S6, 1, 1, 0).refilled, 'the tray does not refill while a piece is left');
    const t6 = E.place(S6, 2, 2, 0);
    ok(t6.refilled && S6.tray.every((i) => i >= 0 && i < SH.length), 'after the third piece a new set of three comes');

    // the end: none of the pieces left fits
    const g7 = empty(); CELLS.forEach(([q, r], i) => { if ((q + 2 * r + 9) % 3 !== 0) g7[i] = 5; });
    ok(!E.full(g7), 'the sparse board has no full line');
    const S7 = state(g7, [FLOWER, H5, -1]);
    ok(E.isOver(S7) && !E.fits(g7, FLOWER) && E.fits(g7, ONE), 'on a sparse board big pieces do not fit, so the game is over, although a single would');
    ok(!E.isOver(state(g7, [FLOWER, ONE, -1])), 'while one piece left fits, the game goes on');
    ok(E.full(g4) === false && E.full(new Array(N).fill(1)), 'a board with a full line is told apart from one without');

    // a legal start always exists: any seed deals pieces that fit on the new board
    let starts = 0;
    for (let s = 1; s <= 400; s++) { const G = E.newGame(s * 7919); if (G.tray.length === 3 && G.tray.every((i) => i >= 0 && i < SH.length) && E.anyFits(G.g, G.tray) && !E.isOver(G) && E.valid(G)) starts++; }
    ok(starts === 400, 'every one of 400 new games starts with three real pieces, at least one that fits (' + starts + '/400)');
    // fairness: a new set always holds a piece that fits when any piece fits at all
    let tight = 0, fair = 0;
    for (let s = 1; s <= 300; s++) {
      const g = g7.slice(); let x = s * 2654435761 >>> 0;
      for (let k = 0; k < 5; k++) { x = (x * 1103515245 + 12345) >>> 0; g[x % N] = 0; }
      const D = state(g, [-1, -1, -1]); D.seed = s;
      E.deal(D);
      if (SH.filter((sh, i) => E.fits(g, i)).length < 10) tight++;
      if (D.tray.length === 3 && D.tray.every((i) => i >= 0 && i < SH.length) && E.anyFits(g, D.tray)) fair++;
    }
    ok(fair === 300 && tight > 50, 'on 300 nearly full combs every new set holds a piece that fits (' + fair + '/300; ' + tight + ' boards fit fewer than ten pieces)');
    let singles = 0;
    for (let s = 1; s <= 60; s++) { const g = new Array(N).fill(5); g[(s * 7) % N] = 0; const D = state(g, [-1, -1, -1]); D.seed = s * 31; E.deal(D); if (D.tray.indexOf(ONE) >= 0) singles++; }
    ok(singles === 60, 'on a comb with one hole, every new set holds a single (' + singles + '/60)');

    // the same seed and moves give the same pieces, so the daily is shared
    const seq = (seed) => { const X = E.newGame(seed), out = []; for (let i = 0; i < 9; i++) { out.push(X.tray.join('.')); X.tray = [-1, -1, -1]; E.deal(X); } return out.join(); };
    ok(seq(926) === seq(926) && seq(926) !== seq(927), 'the same seed deals the same sets; another seed deals others');

    // a greedy bot plays whole games by the real rules
    const botMove = (S) => {
      let best = null;
      for (let k = 0; k < 3; k++) {
        const si = S.tray[k]; if (si < 0) continue;
        for (let i = 0; i < N; i++) {
          const a = E.anchorFor(si, CELLS[i][0], CELLS[i][1]);
          const p = E.preview(S.g, si, a[0], a[1]); if (!p) continue;
          let adj = 0;
          p.cells.forEach((c) => { [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]].forEach(([x, y]) => { const n = E.cellAt(CELLS[c][0] + x, CELLS[c][1] + y); if (n < 0 || (S.g[n] && p.cells.indexOf(n) < 0)) adj++; }); });
          const v = p.lines.length * 50 + adj;
          if (!best || v > best.v) best = { v, k, q: a[0], r: a[1] };
        }
      }
      return best;
    };
    let ended = 0, sane = 0, sets = 0, badSets = 0, moves = 0; const scores = [], axes = { '1,0': 0, '0,1': 0, '-1,1': 0 };
    for (let s = 1; s <= 12; s++) {
      const G = E.newGame(s * 4801);
      let n = 0, okG = true;
      while (!E.isOver(G) && n < 1500) {
        const b = botMove(G);
        const cnt = G.g.filter(Boolean).length, sc = G.score, si = G.tray[b.k], st = G.streak;
        const t = E.place(G, b.k, b.q, b.r);
        if (!t || G.score !== sc + t.gain || t.gain !== SH[si].n + E.bonus(t.lines.length, st) || G.g.filter(Boolean).length !== cnt + SH[si].n - t.cleared.length || E.full(G.g)) okG = false;
        else t.lines.forEach((id) => { axes[dir(LINES[id])]++; });
        if (t && t.refilled) { sets++; if (!(G.tray.every((i) => i >= 0 && i < SH.length) && (E.anyFits(G.g, G.tray) || !SH.some((x, i) => E.fits(G.g, i))))) badSets++; }
        n++;
      }
      moves += n; scores.push(G.score);
      if (E.isOver(G)) ended++;
      if (okG) sane++;
    }
    scores.sort((a, b) => a - b);
    ok(ended === 12 && moves > 12 * 20, 'every bot game ends with no piece left that fits (' + ended + '/12, ' + moves + ' pieces)');
    ok(sane === 12, 'cells are never lost or made up: each piece adds its cells, clears take whole lines, and the score grows by cells plus line bonus');
    ok(Object.keys(axes).every((d) => axes[d] > 0), 'the bot cleared lines in all three directions (' + JSON.stringify(axes) + ')');
    ok(sets > 50 && badSets === 0, 'every set dealt in play is three real pieces and holds one that fits (' + sets + ' sets)');
    ok(scores[6] >= 600, 'a greedy bot scores at least the daily goal of 600 at the median (median ' + scores[6] + ')');

    // saves
    const V = E.newGame(3), fullLine = V.g.slice(); LINES[10].forEach((c) => { fullLine[c] = 1; });
    ok(E.valid(V) && !E.valid(Object.assign({}, V, { g: V.g.slice(1) })) && !E.valid(Object.assign({}, V, { g: fullLine })) &&
      !E.valid(Object.assign({}, V, { tray: [0, 1] })) && !E.valid(Object.assign({}, V, { tray: [63, 0, 0] })) && !E.valid(Object.assign({}, V, { score: -1 })) &&
      !E.valid(Object.assign({}, V, { g: g7, tray: [FLOWER, H5, -1] })) && !E.valid(null),
      'a save is checked before it is restored (size, values, a full line, the tray, the score, a finished game)');

    // the page
    ok(/C\.daily\('honeycomb', dailyDate\)\.rng/.test(html), 'the daily game is seeded by the day');
    const ids = ['hc-500', 'hc-triple', 'hc-streak', 'hc-daily'];
    ok(ids.every((id) => html.indexOf("unlock('" + id + "')") > 0 && core.split("id: '" + id + "'").length === 2), 'the four awards exist once in the core and are unlocked by the page');
    ok(/\bhc: 'honeycomb'/.test(core), 'the award prefix maps to the game');
    const ach = core.split('\n').filter((l) => /^\s*\{ id: '[a-z0-9-]+',\s+icon:/.test(l));
    const dupes = [];
    LOCALE_CODES.forEach((lang) => {
      const re = new RegExp('[{,]\\s+' + lang + ": '([^']*)'");
      const titles = ach.map((l) => (l.match(re) || [])[1]);
      ach.forEach((l, k) => {
        if (!/id: 'hc-/.test(l)) return;
        if (!titles[k]) dupes.push(lang + ':missing');
        else if (titles.filter((x) => x === titles[k]).length > 1) dupes.push(lang + ':' + titles[k]);
      });
    });
    ok(ach.length > 100 && ach.filter((l) => /id: 'hc-/.test(l)).length === 4 && dupes.length === 0, 'the award titles exist in every language and no other award uses them (' + (dupes.join(', ') || 'none') + ')');
    ok(/ArrowLeft/.test(html) && /ArrowUp/.test(html) && /e\.key === 'Tab'/.test(html) && /\^\[1-3\]\$/.test(html) && /C\.keyIs\(e, 'n'\)/.test(html) && !/isRtl|dir === 'rtl'/.test(html.replace(/<html[^>]*>/, '')),
      'arrows, 1–3, Tab, Space and Enter work, letters go through keyIs, and the canvas arrows are not flipped in Persian');
    ok(/ui\.burst\(/.test(html) && /reduceMotion\(\)/.test(html) && /document\.fonts\.ready/.test(html) && /setPointerCapture/.test(html) && /ResizeObserver/.test(html),
      'lines burst (not in reduced motion), the drag keeps its pointer, and the comb refits after fonts load and on resize');
    ok(/cv\.width !== Math\.round\(W \* dpr\) \|\| cv\.height !== Math\.round\(H \* dpr\)/.test(html), 'the canvas is resized when either side changes, so a turn of the phone is caught');
    ok(/\.hc-canvas \{[^}]*width: 100%;[^}]*height: 100%;/.test(html), 'the canvas is sized to its box in CSS on both sides, so a high pixel ratio does not double it (#919)');
    ok(/ch-fit/.test(html) && /--fit-ar/.test(html) && /ch-split/.test(html), 'the board uses the core layout');
    const boxRule = (html.match(/\.ch-fit > \.hc-box \{([^}]*)\}/) || [])[1];
    ok(boxRule !== undefined && !/(^|[\s;])(width|height)\s*:/.test(boxRule), 'the board slot takes its size from the core rule, never its own (#736)');
    // strings: every language, the same keys, none named like a core key
    const sm = html.match(/strings: \{\n([\s\S]*?)\n {4}\}\n {2}\}\);/);
    const langs = {};
    if (sm) sm[1].split(/\n {6}(?=[a-z]{2}: \{)/).forEach((blk) => { const mm = blk.match(/^\s*([a-z]{2}): \{/); if (mm) langs[mm[1]] = (blk.match(/\b([A-Za-z0-9]+): '/g) || []).map((k) => k.slice(0, -3)).sort().join(); });
    const codes = Object.keys(langs);
    ok(LOCALE_CODES.length >= 7 && LOCALE_CODES.every((l) => langs[l]) && codes.length === LOCALE_CODES.length && codes.every((l) => langs[l] === langs.fa),
      'the strings exist in every language (' + codes.join(' ') + ') with the same keys');
    const coreKeys = ['again', 'best', 'score', 'help', 'daily', 'dailyDone', 'newGame', 'resetWarn', 'keyboard', 'tutorial', 'done', 'won', 'lost', 'moves', 'time', 'play', 'next', 'undo', 'settings', 'close'];
    const own = (langs.fa || '').split(',');
    ok(own.length > 20 && own.every((k) => coreKeys.indexOf(k) < 0), 'no game string is named like a core string');
    ok(/C\.t\('tutTitle1'\)/.test(html) && /C\.t\('rules'\)/.test(html) && !/gear/.test(html.replace(/<style>[\s\S]*?<\/style>/, '')), 'help holds rules and keys only; the game has no options');
    // colours
    const lumC = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a, b) => { const x = lumC(a), y = lumC(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const rootCss = (html.match(/:root \{([^}]*)\}/) || [])[1] || '';
    const piece = [1, 2, 3, 4, 5, 6, 7, 8].map((k) => (rootCss.match(new RegExp('--hc-' + k + ': (#[0-9A-Fa-f]{6})')) || [])[1]);
    const chogCss = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8');
    const surf = [...chogCss.matchAll(/--c-surface:\s+(#[0-9A-Fa-f]{6})/g)].map((mm) => mm[1]);
    const weak = [];
    piece.forEach((p, k) => surf.forEach((s) => { if (!p || ratio(p, s) < 2) weak.push((k + 1) + ' on ' + s); }));
    ok(piece.every(Boolean) && new Set(piece).size === 8 && surf.length >= 2 && weak.length === 0, 'eight distinct piece colours, each at 2:1 or more on the empty cell of both themes' + (weak.length ? ' (' + weak.join(', ') + ')' : ''));
    const list = T.games();
    const gm = list.find((g) => g.id === 'honeycomb');
    ok(!!gm && gm.cat === 'puzzle' && gm.people === 1 && gm.daily === undefined && list.filter((g) => g.id === 'honeycomb').length === 1, 'Honeycomb is listed once as a one-player puzzle with a daily game');
    ok(!!gm && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l] && html.indexOf(l + ": '" + gm.name[l] + "'") > 0), 'its name and summary exist in every language, and the page uses the same names');
    const others = list.filter((g) => g.id !== 'honeycomb');
    ok(!!gm && LOCALE_CODES.every((l) => others.every((g) => g.name[l].toLowerCase() !== gm.name[l].toLowerCase())), 'no other game has the same name in any language');
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/honeycomb/icon.svg'), 'utf8');
    ok(!!gm && icon.indexOf('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>') >= 0, 'the icon sits on the game\'s soft tint');
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const lab = (x) => {
      const [Rr, Gr, Bl] = rgb(x).map(lin), f = (q) => q > 0.008856 ? Math.cbrt(q) : 7.787 * q + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
    };
    const dE = (a, b) => { const P2 = lab(a), Q = lab(b); return Math.hypot(P2[0] - Q[0], P2[1] - Q[1], P2[2] - Q[2]); };
    const near = others.map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0];
    ok(near[1] >= 15 && 1.05 / (lumC(gm.color) + 0.05) >= 4.5 && html.indexOf("accent: '" + gm.color + "'") > 0,
      'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    ok(Date.now() - t0 < 4000, 'the Honeycomb tests finish in under 4 s (' + (Date.now() - t0) + ' ms)');
  }
  return { testHoneycomb };
};
