'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, ROOT, LOCALE_CODES } = T;

  // #724: drop number blocks into five columns; equal neighbours merge (idea by xmha97)
  function testNumberDrop() {
    head('Number Drop (#724)');
    const t0 = Date.now();
    const E = loadEngine('numberdrop', 'NumberDropEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/numberdrop/index.html'), 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const C5 = E.COLS, N = E.COLS * E.ROWS;
    ok(C5 === 5 && E.ROWS === 7 && E.GOAL === 2048, 'the board is 5 columns by 7 rows and the goal is 2048');
    // a board from rows written bottom first: rows[0] is the bottom row
    const board = (rows) => {
      const g = new Array(N).fill(0);
      rows.forEach((row, k) => row.forEach((v, c) => { g[(E.ROWS - 1 - k) * C5 + c] = v; }));
      return g;
    };
    const state = (g, cur) => ({ g, cur, next: 2, score: 0, drops: 0, seed: 7, won: false });
    const bottom = (g) => g.slice((E.ROWS - 1) * C5).join(' ');

    // landing
    const S1 = state(board([]), 2);
    const d1 = E.drop(S1, 2);
    ok(d1 && d1.at === 32 && d1.row === 6 && S1.g[32] === 2 && d1.gain === 0 && d1.steps.length === 0, 'on an empty board a block lands in the bottom cell of its column');
    const S1b = state(board([[0, 0, 8], [0, 0, 4]]), 2);
    const d1b = E.drop(S1b, 2);
    ok(d1b.at === 22 && S1b.g[22] === 2, 'a block lands on top of the blocks already in the column');
    // merges
    const S2 = state(board([[0, 0, 2]]), 2);
    const d2 = E.drop(S2, 2);
    ok(S2.g[32] === 4 && S2.g.filter(Boolean).length === 1 && d2.gain === 4 && S2.score === 4, 'a 2 dropped onto a 2 makes one 4 in the lower cell, scoring 4');
    const S3 = state(board([[0, 2, 0, 2]]), 2);
    const d3 = E.drop(S3, 2);
    ok(S3.g[32] === 8 && S3.g.filter(Boolean).length === 1 && d3.gain === 8 && d3.steps.length === 1, 'two equal neighbours merge at once into one block four times the value');
    const S4 = state(board([[0, 2, 2, 2], [0, 0, 0, 0]]), 2);
    // the 2 lands on the middle 2 of the bottom row, which already has equal neighbours too; drop into a column with left, right and below
    const S4b = state(board([[0, 4, 2, 4], [0, 2, 0, 2]]), 2);
    const d4 = E.drop(S4b, 2);
    ok(d4.steps[0].v === 16 && d4.steps[0].from.length === 3, 'three equal neighbours (left, right, below) make eight times the value');
    ok(S4.g.length === N, 'boards are built as expected');
    // cascade: 2 into [16,2,16]/[2,_,2] → 16 at the bottom between two 16s → 64
    const S5 = state(board([[0, 16, 2, 16, 0], [0, 2, 0, 2, 0]]), 2);
    const d5 = E.drop(S5, 2);
    ok(d5.steps.length === 2 && d5.steps[0].v === 16 && d5.steps[1].v === 64 && d5.gain === 80 && bottom(S5.g) === '0 0 64 0 0' && S5.g.filter(Boolean).length === 1,
      'a merge that meets new equal neighbours merges again: ×8 then ×4 makes 64 (gain ' + d5.gain + ', bottom ' + bottom(S5.g) + ')');
    // cascade through gravity: col0 = 4 under 8, col1 = 2; a 2 on col1 → 4 meets 4 → 8 meets the fallen 8 → 16
    const S6 = state(board([[4, 2], [8, 0]]), 2);
    const d6 = E.drop(S6, 1);
    ok(d6.steps.map((s) => s.v).join() === '4,8,16' && d6.gain === 28 && bottom(S6.g) === '0 16 0 0 0' && S6.g.filter(Boolean).length === 1,
      'blocks fall into the gaps a merge leaves and set off the next merge (steps ' + d6.steps.map((s) => s.v).join() + ', bottom ' + bottom(S6.g) + ')');
    ok(d6.steps.some((s) => s.falls.length > 0), 'the cascade records which blocks fell, for the animation');
    // gravity on its own
    const gv = board([]); gv[0] = 8; gv[5 * C5] = 4;
    const falls = E.gravity(gv);
    ok(gv[30] === 4 && gv[25] === 8 && gv[0] === 0 && falls.length === 2 && E.packed(gv), 'gravity packs every column to the bottom, keeping the order');
    // full column and the end
    const colFull = board([[2], [4], [8], [16], [32], [64], [128]]);
    const S7 = state(colFull.slice(), 2);
    const before = S7.g.join();
    ok(E.drop(S7, 0) === null && S7.g.join() === before && S7.drops === 0 && S7.cur === 2, 'a full column refuses the block and nothing changes');
    ok(!E.isOver(colFull) && E.drop(S7, 1) !== null, 'one full column is not the end: other columns still take blocks');
    const allFull = [];
    for (let r = 0; r < E.ROWS; r++) for (let c = 0; c < C5; c++) allFull.push(((r + c) % 2) ? 4 : 8);
    ok(E.isOver(allFull), 'when every column is full the game is over');
    const S8 = state(allFull.slice(), 2);
    S8.g[0] = 0; S8.g[1] = 0;
    const d8 = E.drop(S8, 0);
    ok(d8 && !d8.over, 'the last free cell is played and only a full top row ends the game');
    // reaching the goal
    const S9 = state(board([[0, 0, 1024]]), 1024);
    const d9 = E.drop(S9, 2);
    ok(d9.reached && S9.g[32] === 2048 && S9.score === 2048, 'making 2048 reports the goal once');
    const S9b = state(board([[2048, 0, 4]]), 4);
    ok(!E.drop(S9b, 2).reached, 'once 2048 is on the board, later merges do not report it again');
    // the next block
    const S10 = state(board([]), 2); S10.next = 8; S10.seed = 99;
    E.drop(S10, 0);
    ok(S10.cur === 8 && [2, 4, 8].indexOf(S10.next) >= 0, 'the shown next block is the one that comes, and a new one is drawn');
    // what can come: 2 to 8 at first, up to 64 later, small ones more often
    const counts = {};
    const P = { g: board([]), seed: 12345 };
    for (let i = 0; i < 6000; i++) { const v = E.pick(P); counts[v] = (counts[v] || 0) + 1; }
    ok(Object.keys(counts).sort((a, b) => a - b).join() === '2,4,8' && counts[2] > counts[4] && counts[4] > counts[8], 'an empty board draws 2, 4 and 8, smaller more often (' + JSON.stringify(counts) + ')');
    const big = { g: board([[1024]]), seed: 5 }, seen = new Set();
    for (let i = 0; i < 4000; i++) seen.add(E.pick(big));
    ok(Math.max(...seen) === 64 && seen.has(2), 'with a 1024 on the board blocks go up to 64 and never higher');
    // the same seed gives the same blocks, so the daily is shared
    const A = E.newGame(724), B = E.newGame(724);
    const cols = [0, 1, 2, 3, 4, 2, 2, 1, 0, 3, 4, 4, 2];
    cols.forEach((c) => { E.drop(A, c); E.drop(B, c); });
    const seq = (s) => { const out = []; const X = E.newGame(s); for (let i = 0; i < 12; i++) { out.push(X.cur); E.drop(X, i % 5); } return out.join(); };
    ok(A.g.join() === B.g.join() && A.score === B.score && A.next === B.next && seq(724) === seq(724) && seq(724) !== seq(725),
      'the same seed and the same moves give the same blocks; another seed gives others');
    // a greedy bot plays to the end; nothing is lost or made up
    let ended = 0, sane = 0, played = 0, best = 0;
    for (let s = 1; s <= 30; s++) {
      const G = E.newGame(s * 7919);
      let turns = 0, ok1 = true;
      while (!E.isOver(G.g) && turns < 5000) {
        let bc = -1, bv = -1;
        for (let c = 0; c < C5; c++) {
          const r = E.landRow(G.g, c);
          if (r < 0) continue;
          const g = G.g.slice(); g[r * C5 + c] = G.cur;
          const res = E.resolve(g, r * C5 + c);
          const v = res.gain * 4 + g.filter((x) => !x).length;
          if (v > bv) { bv = v; bc = c; }
        }
        const sc = G.score, sum = G.g.reduce((a, v) => a + v, 0), cur = G.cur;
        const t = E.drop(G, bc);
        // a merge of n+1 equal blocks makes v·2^n, so the board grows by that minus what it absorbed
        const extra = t ? t.steps.reduce((a, s) => a + s.v - s.old * (s.from.length + 1), 0) : 0;
        if (!t || G.score !== sc + t.gain || G.g.reduce((a, v) => a + v, 0) !== sum + cur + extra || !E.packed(G.g)) ok1 = false;
        turns++;
      }
      played++;
      if (E.isOver(G.g)) ended++;
      if (ok1) sane++;
      best = Math.max(best, E.maxTile(G.g));
    }
    ok(played === 30 && ended === played, 'every bot game ends with every column full (' + ended + '/' + played + ')');
    ok(sane === played, 'blocks are never lost or made up: the board sum grows by each dropped block and what merges add, the score by each merge, and columns stay packed');
    ok(best >= 256, 'a one-step greedy bot reaches at least 256 (best ' + best + ')');
    // saves
    const V = E.newGame(3);
    const gap = V.g.slice(); gap[0] = 2;
    ok(E.valid(V) && !E.valid(Object.assign({}, V, { g: V.g.slice(1) })) && !E.valid(Object.assign({}, V, { g: gap })) &&
      !E.valid(Object.assign({}, V, { g: allFull })) && !E.valid(Object.assign({}, V, { cur: 3 })) && !E.valid(Object.assign({}, V, { score: -1 })) && !E.valid(null),
      'a save is checked before it is restored (size, values, gaps, a finished board, the block, the score)');

    // the page
    ok(/C\.daily\('numberdrop', dailyDate\)\.rng/.test(html), 'the daily game is seeded by the day');
    const ids = ['nd-2048', 'nd-chain', 'nd-daily'];
    ok(ids.every((id) => html.indexOf("unlock('" + id + "')") > 0 && core.split("id: '" + id + "'").length === 2), 'the three awards exist once in the core and are unlocked by the page');
    const ach = core.split('\n').filter((l) => /^\s*\{ id: '[a-z0-9-]+',\s+icon:/.test(l));
    const dupes = [];
    ['fa', 'en', 'zh', 'de', 'es', 'pl'].forEach((lang) => {
      // rows are padded with several spaces after the comma; matching one space read every title as undefined
      const re = new RegExp('[{,]\\s+' + lang + ": '([^']*)'");
      const titles = ach.map((l) => (l.match(re) || [])[1]);
      ach.forEach((l, k) => {
        if (!/id: 'nd-/.test(l)) return;
        if (!titles[k]) dupes.push(lang + ':missing');
        else if (titles.filter((x) => x === titles[k]).length > 1) dupes.push(lang + ':' + titles[k]);
      });
    });
    ok(ach.length > 100 && ach.filter((l) => /id: 'nd-/.test(l)).length === 3 && dupes.length === 0, 'the award titles are not used by any other award (' + (dupes.join(', ') || 'none') + ')');
    ok(/\.nd-board \{[^}]*direction: ltr;/.test(html) && /\.nd-board \{[^}]*touch-action: none;/.test(html) && /ArrowLeft/.test(html) && /ArrowDown/.test(html) && /C\.keyIs\(e, 'n'\)/.test(html),
      'columns run the same way in every language; arrows, Space and Enter work');
    ok(/\.animate\(/.test(html) && /reduceMotion\(\)/.test(html) && /continued: cont/.test(html) && /againLabel: C\.t\('keepGoing'\)/.test(html) && /document\.fonts\.ready/.test(html) && /ui\.shake\(/.test(html),
      'blocks fall and pop (not in reduced motion), a full column shakes, the goal offers to keep going, and the board refits after fonts load');
    ok(/ch-fit/.test(html) && /--fit-ar/.test(html) && /ch-split/.test(html), 'the board uses the core layout');
    // #736: a width of its own on the slot's child beat the core's, and the cells ran under the score cards
    const boxRule = (html.match(/\.ch-fit > \.nd-box \{([^}]*)\}/) || [])[1];
    const boardRule = (html.match(/\.nd-board \{([^}]*)\}/) || [])[1];
    const curRule = (html.match(/\.nd-cur \{([^}]*)\}/) || [])[1];
    ok(boxRule !== undefined && !/(^|[\s;])(width|height)\s*:/.test(boxRule), 'the board slot takes its size from the core rule, never its own (#736)');
    ok(boardRule !== undefined && /aspect-ratio: 200 \/ 317/.test(boardRule) && !/max-height/.test(boardRule), 'the board keeps its shape, so its cells stay inside it (#736)');
    // #736: the fallback for WebViews without container queries read calc(w / h) as NaN
    const ratioSrc = (core.match(/ui\.fitRatio = (function \(v\) \{[\s\S]*?\n  \});/) || [])[1];
    ok(!!ratioSrc, 'the core has a reader for a board shape (#736)');
    const fitRatio = ratioSrc ? new Function('return ' + ratioSrc)() : () => NaN;
    ok(Math.abs(fitRatio('calc(200 / 317)') - 200 / 317) < 1e-9 && Math.abs(fitRatio(' calc(6.8 / 7.8)') - 6.8 / 7.8) < 1e-9, 'a shape written as calc(w / h) is read as w / h (#736)');
    ok(fitRatio('0.64') === 0.64 && fitRatio('') === 1, 'a plain number is kept and a missing shape is square (#736)');
    ok(/var ar = ui\.fitRatio\(/.test(core), 'the fallback reads the shape through it (#736)');
    ok(curRule !== undefined && /margin-top: calc\(var\(--u\) \* -1\.5\)/.test(curRule), 'the waiting block keeps a gap above the board (#736)');
    // strings: every language, the same keys, none named like a core key
    const sm = html.match(/strings: \{\n([\s\S]*?)\n {4}\}\n {2}\}\);/);
    const langs = {};
    if (sm) sm[1].split(/\n {6}(?=[a-z]{2}: \{)/).forEach((blk) => { const m = blk.match(/^\s*([a-z]{2}): \{/); if (m) langs[m[1]] = (blk.match(/\b([A-Za-z0-9]+): '/g) || []).map((k) => k.slice(0, -3)).sort().join(); });
    const codes = Object.keys(langs);
    ok(LOCALE_CODES.length >= 6 && LOCALE_CODES.every((l) => langs[l]) && codes.length === LOCALE_CODES.length && codes.every((l) => langs[l] === langs.fa),
      'the strings exist in every language (' + codes.join(' ') + ') with the same keys');
    const coreKeys = ['again', 'best', 'score', 'help', 'daily', 'dailyDone', 'newGame', 'resetWarn', 'keyboard', 'tutorial', 'done', 'won', 'lost', 'moves', 'time', 'play', 'next', 'undo', 'settings', 'close'];
    const own = (langs.fa || '').split(',');
    ok(own.length > 20 && own.every((k) => coreKeys.indexOf(k) < 0), 'no game string is named like a core string');
    ok(/C\.t\('tutTitle1'\)/.test(html) && /C\.t\('rules'/.test(html) && !/gear/.test(html.replace(/<style>[\s\S]*?<\/style>/, '')), 'help holds rules and keys only; the game has no options');
    // colours
    const lumC = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a, b) => { const x = lumC(a), y = lumC(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const blocks = [html.match(/:root \{([^}]*)\}/), html.match(/:root:not\(\[data-theme="light"\]\) \{([^}]*)\}/), html.match(/:root\[data-theme="dark"\] \{([^}]*)\}/)].map((m) => m ? m[1].replace(/\s+/g, ' ').trim() : '');
    const keys = ['2', '4', '8', '16', '32', '64', '128', '256', '512', '1024', '2048', 'big'];
    let pairs = 0;
    const weak = [];
    blocks.forEach((b, k) => keys.forEach((v) => {
      const bg = (b.match(new RegExp('--nd-' + v + ': (#[0-9A-Fa-f]{6})')) || [])[1], ink = (b.match(new RegExp('--nd-' + v + '-i: (#[0-9A-Fa-f]{6})')) || [])[1];
      if (!bg || !ink) { weak.push(k + ':' + v + ' missing'); return; }
      pairs++;
      if (ratio(bg, ink) < 4.5) weak.push(k + ':' + v + ' ' + ratio(bg, ink).toFixed(2));
    }));
    ok(pairs === 36 && weak.length === 0 && blocks[1] === blocks[2], 'every block value has its own colours with text at 4.5:1 or more in light and dark (' + pairs + ' pairs' + (weak.length ? '; ' + weak.join(', ') : '') + ')');
    [0, 1].forEach((k) => {
      const bgs = keys.map((v) => (blocks[k].match(new RegExp('--nd-' + v + ': (#[0-9A-Fa-f]{6})')) || [])[1]);
      ok(bgs.every(Boolean) && new Set(bgs).size === keys.length, 'no two block values share a colour (' + (k ? 'dark' : 'light') + ')');
    });
    const list = T.games();
    const gm = list.find((g) => g.id === 'numberdrop');
    ok(!!gm && gm.cat === 'puzzle' && gm.people === 1 && gm.daily === undefined && list[list.length - 1] === gm, 'Number Drop is listed last as a one-player puzzle with a daily game');
    ok(!!gm && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l]), 'its name and summary exist in every language');
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/numberdrop/icon.svg'), 'utf8');
    ok(!!gm && icon.indexOf('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>') >= 0, 'the icon sits on the game\'s soft tint');
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const lab = (x) => {
      const [Rr, Gr, Bl] = rgb(x).map(lin), f = (q) => q > 0.008856 ? Math.cbrt(q) : 7.787 * q + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
    };
    const dE = (a, b) => { const P2 = lab(a), Q = lab(b); return Math.hypot(P2[0] - Q[0], P2[1] - Q[1], P2[2] - Q[2]); };
    const near = list.filter((g) => g.id !== 'numberdrop').map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0];
    ok(near[1] >= 15 && 1.05 / (lumC(gm.color) + 0.05) >= 4.5 && html.indexOf("accent: '" + gm.color + "'") > 0,
      'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    // #741: the highlighted band was 0.75 units left of its blocks, and the drop zones ignored it
    const units = (re) => (html.match(re) || []).slice(1).map(Number);
    const [bandW, bandL, bandS] = units(/\.nd-col \{[^}]*?width: calc\(var\(--u\) \* ([\d.]+)\);\s*left: calc\(var\(--u\) \* \(([\d.]+) \+ var\(--c\) \* ([\d.]+)\)\)/);
    const [cellW, cellL, cellS] = units(/\.nd-cell, \.nd-tile \{[^}]*?width: calc\(var\(--u\) \* ([\d.]+)\);[^}]*?left: calc\(var\(--u\) \* \(([\d.]+) \+ var\(--c\) \* ([\d.]+)\)\)/);
    ok([bandL, bandS, bandW, cellW, cellL, cellS].every((v) => v > 0), 'the band and block sizes are read from the page');
    ok(bandS === cellS && Math.abs((cellL - bandL) - (bandL + bandW - (cellL + cellW))) < 1e-9,
      'the column band leaves the same space on both sides of its blocks (' + (cellL - bandL) + ' and ' + (bandL + bandW - cellL - cellW) + ' units)');
    const colSrc = (html.match(/function colAt\(x\) \{[\s\S]*?\n {2}\}/) || [''])[0];
    ok(colSrc.length > 0, 'the page has a colAt function');
    const colAt = new Function('board', 'COLS', colSrc + '; return colAt;')({ getBoundingClientRect: () => ({ left: 40, width: 300 }) }, C5);
    const picks = [];
    for (let c = 0; c < C5; c++) [0.02, 0.5, 0.98].forEach((f) => picks.push(colAt(40 + 3 * (bandL + c * bandS + bandW * f)) === c));
    ok(picks.length === 15 && picks.every(Boolean), 'a press anywhere inside a band picks that band\'s column');
    ok(colAt(0) === 0 && colAt(1000) === C5 - 1, 'a press beyond the edge stays on the first or last column');
    ok(Date.now() - t0 < 3000, 'the Number Drop tests finish in under 3 s (' + (Date.now() - t0) + ' ms)');
  }
  return { testNumberDrop };
};
