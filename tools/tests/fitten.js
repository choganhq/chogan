'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, ROOT, LOCALE_CODES } = T;

  // #852: fit sets of three pieces onto a 10×10 board and clear full rows and columns (rylerm's idea)
  function testFitTen() {
    head('Fit Ten (#852)');
    const t0 = Date.now();
    const file = path.join(ROOT, 'www/games/fitten/index.html');
    ok(fs.existsSync(file), 'the game page exists');
    const E = loadEngine('fitten', 'FitTenEngineFactory');
    const html = fs.readFileSync(file, 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const N = E.N, SH = E.SHAPES;
    ok(N === 10, 'the board is 10 by 10');

    // the classic nineteen pieces: each different, each in one piece, at most 3×3 or a line of 5
    const key = (s) => s.c.map((p) => p.join(':')).sort().join(' ');
    const sizes = SH.map((s) => s.c.length).sort((a, b) => a - b).join();
    ok(SH.length === 19 && new Set(SH.map(key)).size === 19, 'there are nineteen different pieces');
    ok(sizes === '1,2,2,3,3,3,3,3,3,4,4,4,5,5,5,5,5,5,9', 'they are a single, lines of 2 to 5 both ways, squares of 2 and 3, and small and big corners in four turns (' + sizes + ')');
    const joined = SH.every((s) => {
      const seen = new Set([s.c[0].join(':')]), todo = [s.c[0]];
      while (todo.length) { const [r, c] = todo.pop(); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, b]) => { const k = (r + a) + ':' + (c + b); if (!seen.has(k) && s.c.some((p) => p.join(':') === k)) { seen.add(k); todo.push([r + a, c + b]); } }); }
      return seen.size === s.c.length && Math.min(...s.c.map((p) => p[0])) === 0 && Math.min(...s.c.map((p) => p[1])) === 0;
    });
    ok(joined && SH.every((s) => s.h <= 5 && s.wd <= 5 && s.w > 0 && s.k >= 1 && s.k <= 9), 'every piece is one connected shape starting at its top-left corner, with a weight and a colour');

    const empty = () => new Array(N * N).fill(0);
    const state = (g, tray) => ({ g, tray: tray.slice(), score: 0, placed: 0, lines: 0, streak: 0, seed: 5 });
    const idx = (want) => SH.findIndex((s) => key(s) === want);
    const ONE = idx('0:0'), H5 = idx('0:0 0:1 0:2 0:3 0:4'), V5 = idx('0:0 1:0 2:0 3:0 4:0'), SQ3 = idx('0:0 0:1 0:2 1:0 1:1 1:2 2:0 2:1 2:2'), H2 = idx('0:0 0:1');
    ok([ONE, H5, V5, SQ3, H2].every((i) => i >= 0), 'the test finds the pieces it uses');

    // placing
    const S1 = state(empty(), [SQ3, ONE, H2]);
    const t1 = E.place(S1, 0, 4, 4);
    ok(t1 && S1.g.filter(Boolean).length === 9 && S1.g[44] && S1.g[66] && t1.gain === 9 && S1.score === 9 && S1.tray[0] === -1 && S1.placed === 1, 'a 3×3 piece fills nine cells and scores nine');
    const before = S1.g.join(), sc = S1.score;
    ok(E.place(S1, 1, 5, 5) === null && E.place(S1, 0, 0, 0) === null && E.place(S1, 2, 0, 9) === null && E.place(S1, 1, -1, 0) === null && S1.g.join() === before && S1.score === sc,
      'a piece over a filled cell, off the board, or from an empty slot is refused and nothing changes');
    // clearing a row
    const g2 = empty(); for (let c = 0; c < 9; c++) g2[90 + c] = 3;
    const S2 = state(g2, [ONE, H2, H2]);
    const p2 = E.preview(S2.g, ONE, 9, 9);
    ok(p2 && p2.rows.join() === '9' && p2.cols.length === 0 && S2.g[99] === 0, 'the preview names the row a piece would fill, without changing the board');
    const t2 = E.place(S2, 0, 9, 9);
    ok(t2.rows.join() === '9' && S2.g.every((v) => v === 0) && t2.cleared.length === 10 && t2.gain === 1 + 10 && S2.lines === 1 && S2.streak === 1, 'a full row is cleared and scores the cell plus 10');
    // a row and a column at once, with the shared cell counted once
    const g3 = empty(); for (let j = 0; j < N; j++) { if (j !== 5) g3[50 + j] = 2; if (j !== 5) g3[j * N + 5] = 4; }
    const S3 = state(g3, [ONE, H2, H2]);
    const t3 = E.place(S3, 0, 5, 5);
    ok(t3.rows.join() === '5' && t3.cols.join() === '5' && t3.cleared.length === 19 && S3.g.every((v) => v === 0) && t3.gain === 1 + 30,
      'a row and a column cleared together take nineteen cells and score 30 for two lines');
    ok(E.bonus(0, 4) === 0 && E.bonus(1, 0) === 10 && E.bonus(2, 0) === 30 && E.bonus(3, 0) === 60 && E.bonus(4, 0) === 100 && E.bonus(2, 3) === 30 + 60,
      'n lines at once score 10, 30, 60, 100, and every clearing piece just before adds 10 a line');
    // the streak runs while pieces keep clearing and stops at a piece that does not
    const g4 = empty(); for (let c = 0; c < 9; c++) { g4[c] = 1; g4[N + c] = 1; }
    const S4 = state(g4, [ONE, ONE, H2]);
    E.place(S4, 0, 0, 9);
    const t4 = E.place(S4, 1, 1, 9);
    ok(S4.streak === 2 && t4.bonus === 20, 'a second clearing piece in a row pays the streak bonus (' + t4.bonus + ')');
    E.place(S4, 2, 5, 5);
    ok(S4.streak === 0, 'a piece that clears nothing ends the streak');
    // the tray refills only when all three are placed
    const S5 = state(empty(), [ONE, ONE, ONE]); S5.seed = 77;
    ok(!E.place(S5, 0, 0, 0).refilled && !E.place(S5, 1, 0, 1).refilled, 'the tray does not refill while a piece is left');
    const t5 = E.place(S5, 2, 0, 2);
    ok(t5.refilled && S5.tray.every((i) => i >= 0 && i < SH.length), 'after the third piece a new set of three comes');

    // the end: none of the pieces left fits
    const g6 = empty(); for (let i = 0; i < N * N; i++) if ((Math.floor(i / N) + i % N) % 2) g6[i] = 5;
    const S6 = state(g6, [H2, V5, -1]);
    ok(E.isOver(S6) && !E.fits(g6, H2) && E.fits(g6, ONE), 'on a chequered board a line does not fit, so the game is over, although a single would');
    ok(!E.isOver(state(g6, [H2, ONE, -1])), 'while one piece left fits, the game goes on');
    ok(E.full(g2) === false && E.full(new Array(N * N).fill(1)), 'a board with a full line is told apart from one without');

    // fairness: a new set always holds a piece that fits when any piece fits at all
    let tight = 0, fair = 0;
    for (let s = 1; s <= 300; s++) {
      const g = g6.slice(); let x = s * 2654435761 >>> 0;
      for (let k = 0; k < 6; k++) { x = (x * 1103515245 + 12345) >>> 0; g[x % (N * N)] = 0; }
      const D = state(g, [-1, -1, -1]); D.seed = s;
      E.deal(D);
      if (SH.filter((sh, i) => E.fits(g, i)).length < 10) tight++;
      if (D.tray.length === 3 && D.tray.every((i) => i >= 0 && i < SH.length) && E.anyFits(g, D.tray)) fair++;
    }
    ok(fair === 300 && tight > 50, 'on 300 nearly full boards every new set holds a piece that fits (' + fair + '/300; ' + tight + ' boards fit fewer than half the pieces)');
    // where only a single fits, the set must hold a single, even when the draws keep missing it
    let singles = 0;
    for (let s = 1; s <= 60; s++) { const D = state(g6.slice(), [-1, -1, -1]); D.seed = s * 31; E.deal(D); if (D.tray.indexOf(ONE) >= 0) singles++; }
    ok(singles === 60, 'on a board where only a single fits, every new set holds a single (' + singles + '/60)');

    // the same seed and moves give the same pieces, so the daily is shared
    const seq = (seed) => { const X = E.newGame(seed), out = []; for (let i = 0; i < 9; i++) { out.push(X.tray.join('.')); X.tray = [-1, -1, -1]; E.deal(X); } return out.join(); };
    ok(seq(852) === seq(852) && seq(852) !== seq(853), 'the same seed deals the same sets; another seed deals others');

    // a greedy bot plays whole games by the real rules; every set it is dealt is valid and fair
    const botMove = (S) => {
      let best = null;
      for (let k = 0; k < 3; k++) {
        const si = S.tray[k]; if (si < 0) continue;
        const s = SH[si];
        for (let r = 0; r + s.h <= N; r++) for (let c = 0; c + s.wd <= N; c++) {
          const p = E.preview(S.g, si, r, c); if (!p) continue;
          let adj = 0;
          s.c.forEach(([a, b]) => [[a - 1, b], [a + 1, b], [a, b - 1], [a, b + 1]].forEach(([x, y]) => { const R = r + x, Cc = c + y; if (R < 0 || R >= N || Cc < 0 || Cc >= N || p.g[R * N + Cc]) adj++; }));
          const v = (p.rows.length + p.cols.length) * 50 + adj;
          if (!best || v > best.v) best = { v, k, r, c };
        }
      }
      return best;
    };
    let ended = 0, sane = 0, sets = 0, badSets = 0, moves = 0, scores = [];
    for (let s = 1; s <= 16; s++) {
      const G = E.newGame(s * 7919);
      let n = 0, okG = true;
      while (!E.isOver(G) && n < 2000) {
        const b = botMove(G);
        const cnt = G.g.filter(Boolean).length, sc = G.score, si = G.tray[b.k];
        const t = E.place(G, b.k, b.r, b.c);
        if (!t || G.score !== sc + t.gain || t.gain !== SH[si].c.length + E.bonus(t.rows.length + t.cols.length, t.streak ? t.streak - 1 : 0) ||
          G.g.filter(Boolean).length !== cnt + SH[si].c.length - t.cleared.length || E.full(G.g)) okG = false;
        if (t && t.refilled) { sets++; if (!(G.tray.every((i) => i >= 0 && i < SH.length) && (E.anyFits(G.g, G.tray) || !SH.some((x, i) => E.fits(G.g, i))))) badSets++; }
        n++;
      }
      moves += n; scores.push(G.score);
      if (E.isOver(G)) ended++;
      if (okG) sane++;
    }
    scores.sort((a, b) => a - b);
    ok(ended === 16 && moves > 16 * 20, 'every bot game ends with no piece left that fits (' + ended + '/16, ' + moves + ' pieces)');
    ok(sane === 16, 'cells are never lost or made up: each piece adds its cells, clears take whole lines, and the score grows by cells plus line bonus');
    ok(sets > 100 && badSets === 0, 'every set dealt in play is three real pieces and holds one that fits (' + sets + ' sets)');
    ok(scores[8] >= 400, 'a greedy bot scores at least the daily goal of 400 at the median (median ' + scores[8] + ')');

    // saves
    const V = E.newGame(3);
    const fullRow = V.g.slice(); for (let c = 0; c < N; c++) fullRow[c] = 1;
    ok(E.valid(V) && !E.valid(Object.assign({}, V, { g: V.g.slice(1) })) && !E.valid(Object.assign({}, V, { g: fullRow })) &&
      !E.valid(Object.assign({}, V, { tray: [0, 1] })) && !E.valid(Object.assign({}, V, { tray: [19, 0, 0] })) && !E.valid(Object.assign({}, V, { score: -1 })) &&
      !E.valid(Object.assign({}, V, { g: g6, tray: [H2, V5, -1] })) && !E.valid(null),
      'a save is checked before it is restored (size, values, a full line, the tray, the score, a finished game)');

    // the page
    ok(/C\.daily\('fitten', dailyDate\)\.rng/.test(html), 'the daily game is seeded by the day');
    const ids = ['ft-1000', 'ft-triple', 'ft-streak', 'ft-daily'];
    ok(ids.every((id) => html.indexOf("unlock('" + id + "')") > 0 && core.split("id: '" + id + "'").length === 2), 'the four awards exist once in the core and are unlocked by the page');
    ok(/\bft: 'fitten'/.test(core), 'the award prefix maps to the game');
    const ach = core.split('\n').filter((l) => /^\s*\{ id: '[a-z0-9-]+',\s+icon:/.test(l));
    const dupes = [];
    LOCALE_CODES.forEach((lang) => {
      const re = new RegExp('[{,]\\s+' + lang + ": '([^']*)'");
      const titles = ach.map((l) => (l.match(re) || [])[1]);
      ach.forEach((l, k) => {
        if (!/id: 'ft-/.test(l)) return;
        if (!titles[k]) dupes.push(lang + ':missing');
        else if (titles.filter((x) => x === titles[k]).length > 1) dupes.push(lang + ':' + titles[k]);
      });
    });
    ok(ach.length > 100 && ach.filter((l) => /id: 'ft-/.test(l)).length === 4 && dupes.length === 0, 'the award titles exist in every language and no other award uses them (' + (dupes.join(', ') || 'none') + ')');
    ok(/\.ft-board \{[^}]*direction: ltr;/.test(html) && /\.ft-board \{[^}]*touch-action: none;/.test(html) && /ArrowLeft/.test(html) && /ArrowUp/.test(html) &&
      /e\.key === 'Tab'/.test(html) && /\^\[1-3\]\$/.test(html) && /C\.keyIs\(e, 'n'\)/.test(html),
      'the grid runs the same way in every language; arrows, 1–3, Tab, Space and Enter work, and letters go through keyIs');
    ok(/ui\.fly\(/.test(html) && /ui\.burst\(/.test(html) && /reduceMotion\(\)/.test(html) && /document\.fonts\.ready/.test(html) && /setPointerCapture/.test(html),
      'pieces fly and lines burst (not in reduced motion), the drag keeps its pointer, and the board refits after fonts load');
    ok(/r\.width !== lastW \|\| r\.height !== lastH/.test(html), 'the board refits when either side changes, so a turn of the phone is caught');
    ok(/ch-fit/.test(html) && /--fit-ar/.test(html) && /ch-split/.test(html), 'the board uses the core layout');
    const boxRule = (html.match(/\.ch-fit > \.ft-box \{([^}]*)\}/) || [])[1];
    ok(boxRule !== undefined && !/(^|[\s;])(width|height)\s*:/.test(boxRule), 'the board slot takes its size from the core rule, never its own (#736)');
    // the CSS and the script agree on where cells are, or a drop lands one cell off
    const css = (html.match(/\.ft-cell, \.ft-fx \{([^}]*)\}/) || [])[1] || '';
    const cw = +(css.match(/width: calc\(var\(--u\) \* ([\d.]+)\)/) || [])[1], [cl, cp] = (css.match(/left: calc\(var\(--u\) \* \(([\d.]+) \+ var\(--c\) \* ([\d.]+)\)\)/) || []).slice(1).map(Number);
    const js = (re) => +((html.match(re) || [])[1]);
    ok(cw === js(/CELL = ([\d.]+)/) && cl === js(/OFF = ([\d.]+)/) && cp === js(/PITCH = ([\d.]+)/) && cl + 9 * cp + cw <= 100, 'the cell size, offset and pitch are the same in the CSS and the script, and the grid fits its 100 units');
    // strings: every language, the same keys, none named like a core key
    const sm = html.match(/strings: \{\n([\s\S]*?)\n {4}\}\n {2}\}\);/);
    const langs = {};
    if (sm) sm[1].split(/\n {6}(?=[a-z]{2}: \{)/).forEach((blk) => { const m = blk.match(/^\s*([a-z]{2}): \{/); if (m) langs[m[1]] = (blk.match(/\b([A-Za-z0-9]+): '/g) || []).map((k) => k.slice(0, -3)).sort().join(); });
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
    const piece = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => (rootCss.match(new RegExp('--ft-' + k + ': (#[0-9A-Fa-f]{6})')) || [])[1]);
    const chogCss = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8');
    const surf = [...chogCss.matchAll(/--c-surface:\s+(#[0-9A-Fa-f]{6})/g)].map((m) => m[1]);
    const weak = [];
    piece.forEach((p, k) => surf.forEach((s) => { if (!p || ratio(p, s) < 2) weak.push((k + 1) + ' on ' + s); }));
    ok(piece.every(Boolean) && new Set(piece).size === 9 && surf.length >= 2 && weak.length === 0, 'nine distinct piece colours, each at 2:1 or more on the empty cell of both themes' + (weak.length ? ' (' + weak.join(', ') + ')' : ''));
    const list = T.games();
    const gm = list.find((g) => g.id === 'fitten');
    ok(!!gm && gm.cat === 'puzzle' && gm.people === 1 && gm.daily === undefined && list.indexOf(gm) > list.findIndex((g) => g.id === 'numberdrop'), 'Fit Ten is listed after Number Drop as a one-player puzzle with a daily game');
    ok(!!gm && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l] && html.indexOf(l + ": '" + gm.name[l] + "'") > 0), 'its name and summary exist in every language, and the page uses the same names');
    const others = list.filter((g) => g.id !== 'fitten');
    ok(!!gm && LOCALE_CODES.every((l) => others.every((g) => g.name[l].toLowerCase() !== gm.name[l].toLowerCase())), 'no other game has the same name in any language');
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/fitten/icon.svg'), 'utf8');
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
    ok(Date.now() - t0 < 4000, 'the Fit Ten tests finish in under 4 s (' + (Date.now() - t0) + ' ms)');
  }
  return { testFitTen };
};
