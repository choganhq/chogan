'use strict';
// #944: Go on 13×13 and 19×19 beside the 9×9 board. The engine takes the size as a
// parameter; the page keeps it in prefs and saves, behind a gear, and the daily stays 9×9.
module.exports = function (T) {
  const { ok, head, vm, fs, path, rng, ROOT, LOCALE_CODES } = T;
  const FILE = path.join(ROOT, 'www/games/go/index.html');

  // loadEngine() calls the factory without arguments; the sizes need the factory itself
  function factory(html) {
    const m = html.match(/\/\* ==== ENGINE START ==== \*\/([\s\S]*?)\/\* ==== ENGINE END ==== \*\//);
    if (!m) throw new Error('go: engine markers not found');
    const sb = { self: {}, module: { exports: {} }, console };
    vm.createContext(sb);
    vm.runInContext(m[1], sb, { filename: 'go-engine.js' });
    return sb.GoEngineFactory;
  }

  // the strings object of C.game({ ... strings: { fa: {...}, ... } })
  function strings(html) {
    const i = html.indexOf('strings: {');
    if (i < 0) throw new Error('go: strings not found');
    let j = i + 'strings: '.length, depth = 0;
    for (; j < html.length; j++) {
      if (html[j] === '{') depth++;
      else if (html[j] === '}' && --depth === 0) break;
    }
    return vm.runInNewContext('(' + html.slice(i + 'strings: '.length, j + 1) + ')');
  }

  function testGoSizes() {
    head('Go on 9×9, 13×13 and 19×19 (#944)');
    const t0 = Date.now();
    const html = fs.readFileSync(FILE, 'utf8');
    const F = factory(html);

    // sizes, komi and star points
    const E9 = F(), E13 = F(13), E19 = F(19);
    ok(E9.N === 9 && E9.KOMI === 6.5, 'without a size the engine is 9×9 with komi 6.5, as before');
    ok(F(7).N === 9 && F('19').N === 9, 'an unknown size falls back to 9×9');
    ok(E13.N === 13 && E13.CELLS === 169 && E13.KOMI === 7.5, '13×13 has 169 points and komi 7.5');
    ok(E19.N === 19 && E19.CELLS === 361 && E19.KOMI === 7.5, '19×19 has 361 points and komi 7.5');
    ok(Array.isArray(E9.SIZES) && E9.SIZES.join() === '9,13,19', 'the sizes offered are 9, 13 and 19');
    const stars = (E) => E.STARS.map((q) => q.join(':')).sort().join(' ');
    ok(stars(E9) === '2:2 2:6 4:4 6:2 6:6', '9×9 keeps its five star points');
    ok(stars(E13) === '3:3 3:9 6:6 9:3 9:9', '13×13 has the 4-4 points and tengen');
    ok(stars(E19) === '15:15 15:3 15:9 3:15 3:3 3:9 9:15 9:3 9:9', '19×19 has nine star points on the 4th lines and the centre');
    ok(E19.NB[0].length === 2 && E19.NB[E19.CELLS - 1].length === 2 && E19.NB[20 * 9].length === 4,
      '19×19 neighbours: corners have two, the centre four');
    ok(E13.score(E13.newState().board).white === 7.5, 'an empty 13×13 board scores 0 to 7.5');

    // the rules are the same on every board
    for (const E of [E13, E19]) {
      const N = E.N, at = (r, c) => r * N + c;
      const pos = (stones, turn) => { const s = E.newState(); for (const [r, c, p] of stones) s.board[at(r, c)] = p; s.turn = turn || 1; return s; };
      const L = N - 1, m = (N - 1) / 2;
      let s = pos([[m - 1, m, 1], [m + 1, m, 1], [m, m - 1, 1], [m, m, 2]]);
      ok(E.play(s, at(m, m + 1)) && s.board[at(m, m)] === 0 && s.caps[1] === 1, N + '×' + N + ': closing the last liberty captures');
      s = pos([[L, L - 1, 2], [L - 1, L, 2]]);
      ok(!E.play(s, at(L, L)) && s.board[at(L, L)] === 0 && s.turn === 1, N + '×' + N + ': suicide in the far corner is refused');
      s = pos([[m - 1, m - 1, 1], [m + 1, m - 1, 1], [m, m - 2, 1], [m - 1, m, 2], [m + 1, m, 2], [m, m + 1, 2], [m, m - 1, 2]]);
      ok(E.play(s, at(m, m)) && s.ko === at(m, m - 1) && !E.play(s, at(m, m - 1)), N + '×' + N + ': ko cannot be retaken at once');
      ok(E.play(s, at(0, 0)) && E.play(s, at(L, 0)) && E.play(s, at(m, m - 1)), N + '×' + N + ': the ko can be retaken after a move elsewhere');
    }

    // the bot on the big boards: legal moves, fast, and it still takes a stone in atari
    const r = rng(944);
    const ms = {};
    for (const E of [E13, E19]) {
      const N = E.N;
      for (const lv of ['easy', 'medium', 'hard']) {
        let worst = 0, legal = true;
        for (const fill of [0, 0.25]) {
          const s = E.newState();
          let k = 0;
          while (s.moves < Math.floor(E.CELLS * fill) && k++ < 50000) { const i = Math.floor(r() * E.CELLS); if (!E.isEye(s.board, i, s.turn)) E.play(s, i); }
          const t = Date.now(), mv = E.think(s, lv, r);
          worst = Math.max(worst, Date.now() - t);
          if (!(mv === E.PASS || E.legal(s, mv))) legal = false;
          if (fill === 0 && mv === E.PASS) legal = false;
        }
        ms[N + lv] = worst;
        ok(legal, N + '×' + N + ' ' + lv + ': the bot plays legal moves and does not pass on an empty board');
      }
    }
    // measured on the laptop 2026-11-17: 13×13 easy/medium/hard about 25/95/240 ms a move,
    // 19×19 about 16/66/170 ms; the bands allow a CI runner about three times slower
    const BAND = { easy: 200, medium: 450, hard: 900 };
    for (const N of [13, 19]) for (const lv of ['easy', 'medium', 'hard']) {
      ok(ms[N + lv] < BAND[lv], N + '×' + N + ' ' + lv + ' move in under ' + BAND[lv] + ' ms (' + ms[N + lv] + ' ms)');
    }
    for (const E of [E13, E19]) {
      const N = E.N, m = (N - 1) / 2, at = (rr, c) => rr * N + c;
      const s = E.newState();
      for (const [rr, c, p] of [[m - 1, m, 1], [m + 1, m, 1], [m, m - 1, 1], [m, m, 2], [2, 2, 2], [N - 3, N - 3, 2]]) s.board[at(rr, c)] = p;
      const missed = [];
      for (const lv of ['medium', 'hard']) for (const seed of [1, 3, 4]) if (E.think(s, lv, rng(seed)) !== at(m, m + 1)) missed.push(lv + '/' + seed);
      ok(missed.length === 0, N + '×' + N + ': medium and hard take a free stone in atari' + (missed.length ? ' (missed: ' + missed.join(', ') + ')' : ''));
    }
    const end = E19.newState();
    for (let i = 0; i < E19.CELLS; i++) end.board[i] = (i % 19) < 9 ? 1 : (i % 19) > 9 ? 2 : 0;
    // each side keeps eyes, so its wall lives; a white stone deep in black's area does not
    for (let rr = 1; rr < 19; rr += 4) for (const c of [2, 6, 12, 16]) end.board[rr * 19 + c] = 0;
    for (const [rr, c] of [[2, 4], [4, 4], [3, 3], [3, 5]]) end.board[rr * 19 + c] = 0;
    end.board[3 * 19 + 4] = 2;
    const tf = Date.now(), fs19 = E19.finalScore(end, rng(5), 300), tfs = Date.now() - tf;
    ok(fs19 && fs19.dead.join() === String(3 * 19 + 4) && fs19.black === 171 && fs19.white === 178.5 && fs19.winner === 2,
      '19×19 final count: the stray white stone is dead, and the split with a neutral column is 171 to 171 + 7.5' +
      (fs19 ? ' (' + fs19.black + ' to ' + fs19.white + ', ' + fs19.dead.length + ' dead)' : ''));
    ok(tfs < 3000, '19×19 final count runs in under 3 s (' + tfs + ' ms)');

    // #992 (from PR #991): playout() stopped at s.moves < CELLS * 3, but s.moves is the
    // whole game's count, so after a long game every playout returned on the spot and the
    // bot and the final count saw the unfinished board. Each playout counts from zero.
    const long9 = E9.newState();
    long9.moves = E9.CELLS * 3 + 10;
    E9.playout(long9, rng(7));
    ok(long9.board.some((v) => v !== 0), '9×9: a game already past ' + (E9.CELLS * 3) + ' moves still gets a full playout');
    const late = E19.clone(end);
    late.moves = E19.CELLS * 3 + 10;
    const fsLate = E19.finalScore(late, rng(5), 300);
    ok(fsLate && fsLate.dead.join() === String(3 * 19 + 4), '19×19: the final count of a long game still removes the dead stone (' + (fsLate ? fsLate.dead.length : '?') + ' dead)');

    // the page: a gear for the size, the size in prefs and saves, old saves are 9×9, daily is 9×9
    ok(/ctx\.button\(\{ icon: 'gear', label: C\.t\('settings'\), onClick: showSettings \}\)/.test(html) && /if \(!dailyDate\) ctx\.button\(\{ icon: 'gear'/.test(html),
      'the board size sits behind a gear, which the daily game does not show');
    ok(!/function showHelp\(\)[\s\S]*?boardSize[\s\S]*?function /.test(html.slice(html.indexOf('function showHelp()'), html.indexOf('function showHelp()') + 1500)),
      'the size is not offered inside the help window');
    ok(/size: S\.size, daily: S\.daily/.test(html), 'the save carries the board size');
    ok(/function saveSize\(s\) \{ return s\.size === undefined \? 9 : s\.size; \}/.test(html), 'a save without a size is a 9×9 game');
    ok(/var size = o\.daily \? 9 :/.test(html) && /\(!s\.daily \|\| n === 9\)/.test(html), 'the daily game is always 9×9, and a daily save of another size is refused');
    ok(/g\.board\.length === n \* n/.test(html) && !/g\.board\.length === E\.CELLS/.test(html), 'a save is checked against its own size, not the current engine');
    ok(/prefs = ctx\.store\.get\('prefs', \{[^}]*size: 9 \}\)/.test(html) && /if \(!validSize\(prefs\.size\)\) prefs\.size = 9;/.test(html), 'prefs default to 9×9 and an old prefs object without a size gets 9');
    ok(!/var STARS = \[\[2, 2\]/.test(html.slice(html.indexOf('ENGINE END'))) && /E\.STARS\.forEach/.test(html), 'the board draws the star points of its own size');

    // strings: board label and komi follow the size in every language
    const S = strings(html);
    ok(LOCALE_CODES.length === 11 && LOCALE_CODES.every((l) => S[l]), 'the page has strings for all eleven languages');
    for (const l of LOCALE_CODES) {
      const t = S[l] || {};
      ok(/\{n\}/.test(t.boardLabel || '') && !/9×9|۹×۹/.test(t.boardLabel || ''), l + ': the board label takes the size, not a fixed 9×9');
      ok(/\{k\}/.test(t.rules || '') && !/6[.,]5|۶٫۵/.test(t.rules || ''), l + ': the rules take the komi of the board');
      ok(t.boardSize && t.sizeHint, l + ': has the board size strings');
    }
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const keys = Array.from(new Set(Array.from(html.matchAll(/C\.t\('([A-Za-z0-9_]+)'/g), (x) => x[1])));
    ok(keys.length > 20, 'the page uses literal string keys (' + keys.length + ')');
    const missing = [];
    for (const k of keys) {
      if (new RegExp('[{,\\s]' + k + ': ').test(core)) continue;
      for (const l of LOCALE_CODES) if (!(S[l] && k in S[l])) missing.push(l + ':' + k);
    }
    ok(missing.length === 0, 'every C.t key exists in the core or in all nine languages' + (missing.length ? ': ' + missing.join(', ') : ''));

    const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
    const go = list.find((g) => g.id === 'go');
    ok(go && go.updated >= '2026-11-17', 'games.json moves Go\'s updated date for the new sizes (' + (go && go.updated) + ')');
    ok(Date.now() - t0 < 6000, 'the Go size tests finish in under 6 s (' + (Date.now() - t0) + ' ms)');
  }

  return { testGoSizes };
};
