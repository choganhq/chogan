#!/usr/bin/env node
/* تست‌های خودکار موتور بازی‌ها.
   موتورها از دل همان فایل‌های HTML که منتشر می‌شوند بیرون کشیده می‌شوند،
   بین دو نشانه‌ی ENGINE START و ENGINE END، تا هیچ‌وقت نسخه‌ی دومی از کد
   برای تست وجود نداشته باشد.
   اجرا: node tools/test.js  */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const os = require('os');
const { spawnSync, spawn } = require('child_process');
const { Worker, isMainThread, workerData } = require('worker_threads');

const ROOT = path.join(__dirname, '..');
// زبان‌های اپ، به همان ترتیب جدول LOCALES در هسته
const LOCALE_CODES = ['fa', 'en', 'zh', 'de', 'es', 'pl'];
let failures = 0;
let checks = 0;
// A floor for the whole run: if a group lost most of its checks, the total would still
// fall below it. Every group now runs by itself (see the runner at the end), so this line
// is no longer raised in each pull request, where it made every new-game PR conflict
// with the last (#493); it is raised at release time. Lowering it means checks were
// removed on purpose and must be said in the PR.
const MIN_CHECKS = 5828;

function ok(cond, msg) {
  checks++;
  if (!cond) { failures++; console.log('  ✗ ' + msg); }
}
function head(t) { console.log('\n' + t); }

function loadEngine(gameId, factoryName) {
  const file = path.join(ROOT, 'www', 'games', gameId, 'index.html');
  const html = fs.readFileSync(file, 'utf8');
  const m = html.match(/\/\* ==== ENGINE START ==== \*\/([\s\S]*?)\/\* ==== ENGINE END ==== \*\//);
  if (!m) throw new Error('نشانه‌ی موتور در ' + gameId + ' پیدا نشد');
  const sandbox = { self: {}, module: { exports: {} }, console };
  vm.createContext(sandbox);
  vm.runInContext(m[1], sandbox, { filename: gameId + '-engine.js' });
  const factory = sandbox[factoryName] || sandbox.module.exports;
  if (typeof factory !== 'function') throw new Error('کارخانه‌ی ' + factoryName + ' پیدا نشد');
  return factory();
}

// همان مولد تصادف قطعی هسته
function rng(seed) {
  let a = seed >>> 0;
  const f = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.int = (n) => Math.floor(f() * n);
  return f;
}

/* ----------------------------------------------------------- سودوکو */
function testSudoku() {
  head('سودوکو');
  const E = loadEngine('sudoku', 'SudokuEngineFactory');
  const diffs = ['easy', 'medium', 'hard', 'expert'];
  let maxMs = 0;
  for (const d of diffs) {
    for (let i = 0; i < 4; i++) {
      const t0 = Date.now();
      const p = E.makePuzzle(rng(4000 + i * 131), d);
      maxMs = Math.max(maxMs, Date.now() - t0);
      ok(!!p, d + ': جدول ساخته شد');
      ok(E.solveCount(p.puzzle, 2) === 1, d + ': جواب یکتاست');
      const sol = E.solve(p.puzzle);
      ok(!!sol, d + ': حل شد');
      ok(sol && sol.every((v, k) => v === p.solution[k]), d + ': جواب با جدول می‌خواند');
      ok(p.puzzle.every((v, k) => !v || v === p.solution[k]), d + ': سرنخ‌ها با جواب می‌خوانند');
      const clues = p.puzzle.filter(Boolean).length;
      ok(clues >= 20 && clues <= 50, d + ': تعداد سرنخ منطقی است (' + clues + ')');
    }
  }
  ok(maxMs < 400, 'تولید هیچ‌وقت صفحه را قفل نمی‌کند (بیشینه ' + maxMs + 'ms)');
  const a = E.makePuzzle(rng(77), 'hard'), b = E.makePuzzle(rng(77), 'hard');
  ok(a.puzzle.join() === b.puzzle.join(), 'یک بذر همیشه یک جدول می‌دهد');
  const bad = E.conflicts([1, 1].concat(new Array(79).fill(0)));
  ok(bad[0] && bad[1], 'تشخیص تعارض کار می‌کند');

  // جدولی که یک ردیف کاملاً خالی دارد واقعاً ساخته می‌شود (روزانه‌ی ۲۰۲۶-۱۰-۰۹)،
  // و با ردیف خودکار همان ردیف تا چند پیکسل جمع می‌شد (#118)
  const sdHtml = fs.readFileSync(path.join(ROOT, 'www/games/sudoku/index.html'), 'utf8');
  const board = (sdHtml.match(/\.sd-board \{([^}]*)\}/) || [])[1] || '';
  ok(board.length > 0, 'قاعده‌ی .sd-board در صفحه‌ی سودوکو پیدا شد');
  // since #411 three groups of three equal tracks with a 1px spacer between boxes
  const eq = '\\s*repeat\\(3,\\s*minmax\\(0,\\s*1fr\\)\\)\\s+1px\\s+repeat\\(3,\\s*minmax\\(0,\\s*1fr\\)\\)\\s+1px\\s+repeat\\(3,\\s*minmax\\(0,\\s*1fr\\)\\);';
  ok(new RegExp('grid-template-rows:' + eq).test(board), 'ردیف‌های تخته‌ی سودوکو هم‌اندازه‌اند، نه به اندازه‌ی محتوا');
  ok(new RegExp('grid-template-columns:' + eq).test(board), 'ستون‌های تخته‌ی سودوکو هم‌اندازه‌اند، نه به اندازه‌ی محتوا');
  // #411: soft tiles; the box gaps are the frame's colour and every cell the same size
  const cellRule = (sdHtml.match(/\n  \.sd-cell \{([^}]*)\}/) || [])[1] || '';
  ok(/border-radius: max\(3px, 1\.2cqi\);/.test(cellRule) && !/\.sd-cell[^{]*\{[^}]*border[^}]*c-text-faint/.test(sdHtml) && !/data-b[tl]/.test(sdHtml),
    'Sudoku cells are rounded tiles, and no darker line or thicker border marks the boxes (#411)');
  ok(/style: \{ 'grid-row': String\(r \+ 1 \+ \(\(r \/ 3\) \| 0\)\), 'grid-column': String\(c \+ 1 \+ \(\(c \/ 3\) \| 0\)\) \}/.test(sdHtml),
    'each cell skips the spacer tracks, so the boxes are set apart by the frame (#411)');
  let emptyRow = 0;
  for (let i = 0; i < 40 && !emptyRow; i++) {
    const q = E.makePuzzle(rng(9000 + i), 'expert').puzzle;
    for (let r = 0; r < 9; r++) if (q.slice(r * 9, r * 9 + 9).every((v) => !v)) emptyRow++;
  }
  ok(emptyRow > 0, 'مولد جدولی با ردیف کاملاً خالی هم می‌سازد، پس این حالت واقعی است');

  // "Same digit only" highlight (#377): the page's own functions run over a real grid. With it on no
  // cell gets the row, column and box shading and the cells with the selected digit still do;
  // the default keeps today's look. The choice is saved in prefs and repaints at once.
  const fnSrc = (name) => {
    const at = sdHtml.indexOf('function ' + name + '(');
    if (at < 0) return '';
    for (let i = sdHtml.indexOf('{', at), d = 0; i < sdHtml.length; i++) {
      if (sdHtml[i] === '{') d++;
      else if (sdHtml[i] === '}' && --d === 0) return sdHtml.slice(at, i + 1);
    }
    return '';
  };
  const hlSrc = fnSrc('hlMarks'), peerSrc = fnSrc('isPeer');
  ok(hlSrc.length > 0 && peerSrc.length > 0, 'the Sudoku page has hlMarks and isPeer (#377)');
  if (hlSrc && peerSrc) {
    const hlMarks = new Function(peerSrc + '\n' + hlSrc + '\nreturn hlMarks;')();
    const sol = E.makePuzzle(rng(377), 'easy').solution, sel = 40, sv = sol[sel];
    const count = (mode) => { let p = 0, s2 = 0; for (let c = 0; c < 81; c++) { const m = hlMarks(c, sel, sv, sol[c], mode); if (m.peer) p++; if (m.same) s2++; } return [p, s2]; };
    const [pDef, sDef] = count(undefined), [pPeer] = count('peers'), [pDig, sDig] = count('digit');
    ok(pDef === 20 && pPeer === 20 && sDef === 8, 'by default the selected cell\'s 20 row, column and box cells are shaded and the 8 other cells with its digit too (' + pDef + ', ' + sDef + ')');
    ok(pDig === 0 && sDig === 8, 'with "Same digit only" no cell gets the peer shading and the 8 matching digits still stand out (' + pDig + ', ' + sDig + ')');
  }
  ok(/var hl = hlMarks\(c, selected, selVal, v, prefs\.highlight\);/.test(sdHtml) && /prefs\.highlight = v; ctx\.store\.set\('prefs', prefs\); paint\(\);/.test(sdHtml),
    'the page paints with the saved choice, and switching saves it and repaints without a restart');
  ok(LOCALE_CODES.every((l) => new RegExp('\\n      ' + l + ": \\{[\\s\\S]*?highlight: '[^']+', hlPeers: '[^']+', hlDigit: '[^']+'").test(sdHtml)), 'the option is labelled in every language');

  // شمارنده‌ی زیر دکمه‌های عدد (#124): هر عدد روی جدول شمرده می‌شود، درست یا غلط،
  // و قفل فقط با نُه جاگذاری درست. تابع واقعی صفحه اجرا می‌شود.
  const psAt = sdHtml.indexOf('function padState(');
  let psSrc = '';
  if (psAt > 0) {
    let dd = 0;
    for (let i = sdHtml.indexOf('{', psAt); i < sdHtml.length; i++) {
      if (sdHtml[i] === '{') dd++;
      else if (sdHtml[i] === '}' && --dd === 0) { psSrc = sdHtml.slice(psAt, i + 1); break; }
    }
  }
  ok(psSrc.length > 0, 'تابع padState در صفحه‌ی سودوکو هست');
  const padState = psSrc ? vm.runInNewContext('(' + psSrc + ')') : () => ({ left: [], locked: [] });
  const sol = E.makePuzzle(rng(31337), 'medium');
  const grid = sol.puzzle.slice();
  const givenOnes = grid.filter((v) => v === 1).length;
  ok(padState(grid, sol.solution).left[1] === 9 - givenOnes, 'شروع: مانده‌ی ۱ = نُه منهای سرنخ‌ها');
  const wrongAt = grid.findIndex((v, i) => !v && sol.solution[i] !== 1);
  grid[wrongAt] = 1;
  ok(padState(grid, sol.solution).left[1] === 8 - givenOnes, '۱ در خانه‌ی غلط هم از مانده کم می‌کند');
  for (let i = 0; i < 81; i++) if (!grid[i] && sol.solution[i] === 1) grid[i] = 1;
  const full = padState(grid, sol.solution);
  ok(full.left[1] === -1, 'نُه ۱ درست به‌علاوه‌ی یک غلط: مانده منفی است و نشان داده نمی‌شود (' + full.left[1] + ')');
  ok(full.locked[1] === true, 'با نُه ۱ درست دکمه‌ی ۱ قفل می‌شود');
  grid[wrongAt] = 0;
  const fake = grid.slice(); const anyRight1 = fake.findIndex((v, i) => v === 1 && !sol.puzzle[i]);
  fake[anyRight1] = 0; fake[wrongAt] = 1;
  ok(padState(fake, sol.solution).left[1] === 0 && !padState(fake, sol.solution).locked[1], 'نُه ۱ که یکی‌اش غلط است: مانده صفر ولی دکمه قفل نیست');
  console.log('  ' + checks + ' بررسی، بیشینه‌ی زمان تولید ' + maxMs + 'ms');
}

/* ---------------------------------------------------------- مین‌روب */
function testMines() {
  head('مین‌روب');
  const E = loadEngine('minesweeper', 'MinesEngineFactory');
  const sizes = [
    { n: 'کوچک', r: 9, c: 9, m: 10 },
    { n: 'متوسط', r: 16, c: 16, m: 40 },
    { n: 'بزرگ', r: 16, c: 30, m: 99 }
  ];
  for (const s of sizes) {
    const nb = E.makeNeighbors(s.r, s.c);
    let noGuess = 0, maxMs = 0;
    for (let i = 0; i < 5; i++) {
      const safe = rng(i + 3).int(s.r * s.c);
      const t0 = Date.now();
      const g = E.generate({ rows: s.r, cols: s.c, mines: s.m, rnd: rng(i * 977 + 5), safe, nb, noGuess: true, budgetMs: 1500 });
      maxMs = Math.max(maxMs, Date.now() - t0);
      if (g.noGuess) noGuess++;
      let count = 0;
      for (let k = 0; k < g.mine.length; k++) count += g.mine[k];
      ok(count === s.m, s.n + ': تعداد مین درست است');
      ok(!g.mine[safe], s.n + ': اولین کلیک روی مین نیست');
      ok(nb[safe].every((x) => !g.mine[x]), s.n + ': دور اولین کلیک هم امن است');
      let numsOk = true;
      for (let q = 0; q < g.num.length && numsOk; q++) {
        if (g.mine[q]) continue;
        let c2 = 0;
        nb[q].forEach((x) => { if (g.mine[x]) c2++; });
        if (g.num[q] !== c2) numsOk = false;
      }
      ok(numsOk, s.n + ': شمارنده‌ها درست‌اند');
      if (g.noGuess) ok(E.solvable(g.mine, g.num, nb, s.r, s.c, safe), s.n + ': واقعاً بدون حدس حل می‌شود');
    }
    ok(noGuess >= 4, s.n + ': بیشتر تخته‌ها بدون حدس تولید شدند (' + noGuess + '/5)');
    ok(maxMs < 900, s.n + ': تولید سریع است (' + maxMs + 'ms)');
  }

  // ستون‌های پنهان (#101): گوشی نوار اسکرول نمی‌کشد، پس لبه‌ی پنهان باید نشانه بگیرد
  ok(typeof E.scrollEdges === 'function', 'موتور تابع scrollEdges دارد');
  const se = typeof E.scrollEdges === 'function' ? E.scrollEdges : () => ({});
  const sj = (x) => JSON.stringify(x);
  // تخته‌ی ۱۶ستونه‌ی ۴۴۶ پیکسلی در قاب ۳۸۱ پیکسلی، همان اندازه‌های گزارش
  ok(sj(se(0, 446, 381, false)) === sj({ left: false, right: true }), 'چپ‌به‌راست، اول: فقط راست پنهان است');
  ok(sj(se(30, 446, 381, false)) === sj({ left: true, right: true }), 'چپ‌به‌راست، وسط: هر دو لبه پنهان‌اند');
  ok(sj(se(65, 446, 381, false)) === sj({ left: true, right: false }), 'چپ‌به‌راست، آخر: فقط چپ پنهان است');
  ok(sj(se(0, 446, 381, true)) === sj({ left: true, right: false }), 'راست‌به‌چپ، اول: فقط چپ پنهان است');
  ok(sj(se(-65, 446, 381, true)) === sj({ left: false, right: true }), 'راست‌به‌چپ، آخر: فقط راست پنهان است');
  ok(sj(se(0, 250, 250, false)) === sj({ left: false, right: false }), 'تخته‌ای که جا می‌شود هیچ لبه‌ی پنهانی ندارد');
  ok(sj(se(0, 251, 250, false)) === sj({ left: false, right: false }), 'یک پیکسل گردکردن لبه‌ی پنهان حساب نمی‌شود');
  const msHtml = fs.readFileSync(path.join(ROOT, 'www/games/minesweeper/index.html'), 'utf8');
  ok(/E\.scrollEdges\(scroll\.scrollLeft, scroll\.scrollWidth, scroll\.clientWidth, rtl\)/.test(msHtml), 'صفحه لبه‌ها را از scrollEdges می‌گیرد');

  // Left and right ran on into the next row at the board's edge (#328)
  ok(typeof E.step === 'function', 'the engine has a cursor step');
  if (typeof E.step === 'function') {
    const st = (c, k, rtl) => E.step(c, k, 9, 9, !!rtl);
    ok(st(8, 'ArrowRight') === 8 && st(9, 'ArrowLeft') === 9, 'left to right: the cursor stops at both ends of a row');
    ok(st(8, 'ArrowLeft', true) === 8 && st(9, 'ArrowRight', true) === 9, 'right to left: the same, with the arrows swapped');
    ok(st(4, 'ArrowRight') === 5 && st(4, 'ArrowLeft') === 3 && st(4, 'ArrowRight', true) === 3, 'inside a row it moves one cell');
    ok(st(4, 'ArrowUp') === 4 && st(76, 'ArrowDown') === 76 && st(4, 'ArrowDown') === 13 && st(13, 'ArrowUp') === 4, 'up and down stop at the top and bottom rows');
    ok(st(4, 'Enter') === -1, 'any other key is not a move');
  }
  ok(/E\.step\(cursor, k, sp\.rows, sp\.cols, document\.documentElement\.dir === 'rtl'\)/.test(msHtml), 'the page moves its cursor with the engine step');
  // Tab focused one cell while the arrows moved another, and Enter opened the focused one (#331)
  ok(/b\.tabIndex = i === cursor \? 0 : -1;/.test(msHtml), 'the board is one Tab stop, on the cursor cell');
  ok(/b\.addEventListener\('focus', function \(\) \{\s*if \(cursor !== idx\) \{ cursor = idx; paint\(\); \}/.test(msHtml), 'focusing a cell puts the cursor on it');
  ok(/cursor = to; paint\(\); cells\[cursor\]\.focus\(\)/.test(msHtml), 'an arrow moves focus along with the cursor');
  // F flagged the cell, but the help called it "Flag mode", so the key looked missing (#332)
  ok(/row\(C\.t\('flagCell'\), 'F'\)/.test(msHtml) && !/row\(C\.t\('flagMode'\), 'F'\)/.test(msHtml), 'the help names F as the key that flags a cell');
  ok((msHtml.match(/\bflagCell: '[^']+'/g) || []).length === LOCALE_CODES.length, 'that label exists in every language');
  // Persian called the minefield «تخته» (a board game's board) and the restart dialog «تخته‌ی تازه» (#340)
  const msFa = (msHtml.match(/strings: \{\s*fa: \{([\s\S]*?)\n      \}/) || [])[1] || '';
  ok(msFa.length > 200, 'the Persian strings of Minesweeper were found');
  ok(!/تخته/.test(msFa), 'Persian Minesweeper says «زمین», never «تخته»');
  ok(/newBoard: 'بازی تازه'/.test(msFa), 'the restart dialog is titled «بازی تازه», as in chess');
  ok(/guessy: 'این زمین ممکن است حدس بخواهد'/.test(msFa) && /tutText3: 'زمین‌ها طوری/.test(msFa), 'the guess warning and the no-guess help say «زمین»');
  // Medium ran off a 650px-high window with nothing to scroll, so its last rows could not be reached (#350)
  ok(typeof E.fit === 'function', 'the engine sizes cells for the room there is');
  if (typeof E.fit === 'function') {
    const rooms = [[1340, 437], [364, 620], [818, 160], [1254, 520], [600, 900]], boards = [[9, 9], [16, 16], [16, 30], [24, 24]];
    let fine = 0, all = 0;
    for (const [w, h] of rooms) for (const [rows, cols] of boards) {
      const f = E.fit(w, h, rows, cols), tall = rows * (f.cs + 2);
      all++;
      if (f.cs >= 26 && f.cs <= 64 && (tall <= h ? f.maxH === 0 : f.maxH > 0 && f.maxH <= Math.max(h, 112))) fine++;
    }
    ok(all === 20 && fine === all, 'on every room tried the board either fits its height or scrolls inside a frame no taller than the room (' + fine + ' of ' + all + ')');
    const lap = E.fit(1340, 437, 16, 16);
    ok(lap.cs === 26 && lap.maxH === 437, 'medium on a 1366×650 window: cells shrink to 26px and the last few pixels scroll');
    ok(E.fit(1340, 700, 9, 9).cs === 64 && E.fit(1340, 700, 9, 9).maxH === 0, 'a small board on a big screen grows to 64px cells and does not scroll (#359)');
    ok(E.fit(1236, 620, 16, 16).cs === 36, 'medium on a 1280×800 laptop gets 36px cells, not the old 42px-capped 394px board (#359)');
  }
  ok(/var f = E\.fit\(roomW\(\), roomH\(\), sp\.rows, sp\.cols\);/.test(msHtml) && !/640\)/.test(msHtml) && /scroll\.style\.maxHeight = f\.maxH \? f\.maxH \+ 'px' : '';/.test(msHtml), 'the page sizes the board by the room left under the picker and above the tools, at the game area\'s full width (#359)');
  // Holding Space or Enter opened the cell at once instead of flagging it like a long press (#346)
  ok(/var LONG_MS = 420/.test(msHtml) && (msHtml.match(/\}, LONG_MS\);/g) || []).length === 2, 'a long press on the screen and a held key share one delay');
  ok(/hold\.timer = setTimeout\(function \(\) \{ hold\.fired = true; if \(S && !S\.done\) toggleFlag\(hold\.at\); \}, LONG_MS\);\s*keyHold = hold;\s*return;/.test(msHtml) &&
    /addEventListener\('keyup', function \(e\) \{[\s\S]{0,260}if \(h\.fired \|\| !S \|\| S\.done[^\n]*return;\s*if \(flagMode && !S\.revealed\[h\.at\]\) toggleFlag\(h\.at\);\s*else tap\(h\.at\);/.test(msHtml),
    'Space and Enter flag when held and open only when let go early');
  ok((msHtml.match(/\bholdFlag: '[^']+'/g) || []).length === LOCALE_CODES.length && /row\(C\.t\('holdFlag'\), 'Space \/ Enter'\)/.test(msHtml), 'the help names it, in every language');
}

/* ------------------------------------------------------- نقطه‌بازی */
function testDots() {
  head('نقطه‌بازی');
  const E = loadEngine('dots', 'DotsEngineFactory');
  function match(R, C, a, b, r) {
    const bd = E.makeBoard(R, C);
    const edges = new Array(bd.E).fill(0);
    const owner = new Array(bd.boxes).fill(0);
    let turn = 1, guard = 0, maxMs = 0;
    while (E.legalMoves(bd, edges).length) {
      if (guard++ > 3000) throw new Error('حلقه‌ی بی‌پایان');
      const t0 = Date.now();
      const m = E.aiMove(bd, edges, owner, turn === 1 ? a : b, r);
      maxMs = Math.max(maxMs, Date.now() - t0);
      if (m < 0 || edges[m]) throw new Error('حرکت غیرمجاز');
      if (E.play(bd, edges, owner, m, turn) === 0) turn = turn === 1 ? 2 : 1;
    }
    return {
      s1: owner.filter((x) => x === 1).length,
      s2: owner.filter((x) => x === 2).length,
      total: bd.boxes, maxMs
    };
  }
  let maxMs = 0;
  for (const sz of [[3, 3], [5, 5], [8, 8]]) {
    let wins = 0;
    const n = 8;
    for (let i = 0; i < n; i++) {
      const m = i % 2 === 0
        ? match(sz[0], sz[1], 'hard', 'medium', rng(i * 811 + 3))
        : match(sz[0], sz[1], 'medium', 'hard', rng(i * 811 + 3));
      maxMs = Math.max(maxMs, m.maxMs);
      ok(m.s1 + m.s2 === m.total, sz.join('x') + ': همه‌ی مربع‌ها تقسیم شدند');
      const hard = i % 2 === 0 ? m.s1 : m.s2;
      const med = i % 2 === 0 ? m.s2 : m.s1;
      if (hard > med) wins++;
    }
    ok(wins >= 6, sz.join('x') + ': سخت از متوسط قوی‌تر است (' + wins + '/' + n + ')');
  }
  ok(maxMs < 900, 'زمان فکر هوش مصنوعی قابل قبول است (' + maxMs + 'ms)');

  // برگرداندن حرکت در دونفره (#69). قبلاً دونفره فقط پیام می‌داد و وضعیت
  // دست نمی‌خورد؛ حالا یک خط برمی‌گردد و با حریف کامپیوتری مثل قبل.
  ok(typeof E.applyEdge === 'function', 'موتور تابع applyEdge دارد');
  ok(typeof E.takeBack === 'function', 'موتور تابع takeBack دارد');
  const apply = typeof E.applyEdge === 'function' ? E.applyEdge : () => 0;
  const back = typeof E.takeBack === 'function' ? E.takeBack : () => 0;
  const bd3 = E.makeBoard(3, 3);
  const fresh = (mode) => ({
    mode, edges: new Array(bd3.E).fill(0), owner: new Array(bd3.boxes).fill(0),
    edgeOwner: {}, turn: 1, scores: [0, 0, 0], history: [], turnBoxes: 0
  });
  const snap = (S) => JSON.stringify([S.edges, S.owner, S.edgeOwner, S.turn, S.scores, S.history, S.turnBoxes]);
  // ضلع‌های مربع اول روی تخته‌ی ۳×۳: بالا ۰، پایین ۳، چپ ۱۲، راست ۱۳
  ok(bd3.boxEdges[0].join() === '0,3,12,13', 'ضلع‌های مربع اول همان‌اند که آزمون فرض کرده');

  const two = fresh('2p');
  const empty = snap(two);
  apply(bd3, two, 0); apply(bd3, two, 3); apply(bd3, two, 12);
  const beforeClose = snap(two);
  ok(two.turn === 2, 'دونفره: پس از سه خط نوبت بازیکن دوم است');
  ok(apply(bd3, two, 13) === 1 && two.scores[2] === 1 && two.owner[0] === 2, 'دونفره: خط چهارم مربع را به بازیکن دوم می‌دهد');
  ok(back(bd3, two) === 1, 'دونفره: برگرداندن فقط یک خط برمی‌دارد');
  ok(snap(two) === beforeClose, 'دونفره: پس از برگرداندن، تخته و امتیاز و نوبت همان پیش از خط آخرند');
  ok(back(bd3, two) === 1 && two.turn === 1 && two.edges[12] === 0 && two.edges[3] === 1, 'دونفره: برگرداندن دوم نوبت را به کشنده‌ی خط قبلی می‌دهد');
  back(bd3, two); back(bd3, two);
  ok(snap(two) === empty, 'دونفره: با برگرداندن پیاپی به تخته‌ی خالی می‌رسد');
  ok(back(bd3, two) === 0 && snap(two) === empty, 'دونفره: روی تخته‌ی خالی برگرداندن کاری نمی‌کند');

  // با حریف: بازیکن ۰ و ۱۲ را می‌کشد، حریف ۳، بعد ۱۳ (مربع) و ۱ را
  const ai = fresh('ai');
  apply(bd3, ai, 0); apply(bd3, ai, 3);
  const humanTurn = snap(ai);
  apply(bd3, ai, 12); apply(bd3, ai, 13); apply(bd3, ai, 1);
  ok(ai.turn === 1 && ai.scores[2] === 1, 'با حریف: حریف مربع گرفت و نوبت به بازیکن رسید');
  ok(back(bd3, ai) === 3, 'با حریف: برگرداندن سه حرکت تا نوبت قبلی بازیکن عقب می‌رود');
  ok(snap(ai) === humanTurn, 'با حریف: وضعیت همان پیش از حرکت قبلی بازیکن است');

  // صفحه باید از همین دو تابع استفاده کند، نه منطق خودش را
  const dtHtml = fs.readFileSync(path.join(ROOT, 'www/games/dots/index.html'), 'utf8');
  ok(/E\.applyEdge\(bd, S, e\)/.test(dtHtml), 'صفحه حرکت را با applyEdge ثبت می‌کند');
  ok(/E\.takeBack\(bd, S\)/.test(dtHtml), 'صفحه برگرداندن را با takeBack انجام می‌دهد');
  ok(!/undoOnlyAi/.test(dtHtml), 'پیام «فقط با حریف کامپیوتری» از صفحه رفته است');

  // نام بازیکن یک (#90): تابع واقعی صفحه را با هسته‌ی ساختگی اجرا می‌کنیم
  const pAt = dtHtml.indexOf('function pname(i) {');
  ok(pAt > 0, 'تابع pname در صفحه هست');
  let pd = 0, pEnd = pAt;
  for (let i = dtHtml.indexOf('{', pAt); i < dtHtml.length; i++) {
    if (dtHtml[i] === '{') pd++;
    else if (dtHtml[i] === '}' && --pd === 0) { pEnd = i + 1; break; }
  }
  const mkName = (profileName, mode) => {
    const fakeC = { state: { profile: { name: profileName } }, t: (k) => '<' + k + '>' };
    try {
      return vm.runInNewContext('(function (C, S, prefs) { ' + dtHtml.slice(pAt, pEnd) + ' return pname; })', {})(
        fakeC, { mode, level: 'hard' }, { p2name: '' });
    } catch (e) { ok(false, 'pname اجرا نشد: ' + e.message); return () => undefined; }
  };
  ok(mkName('', '2p')(1) === '<player1>', 'دونفره بی‌نام: بازیکن یک، نه «تو»');
  ok(mkName('', 'ai')(1) === '<you>', 'با حریف بی‌نام: همان «تو»');
  ok(mkName('Sara', '2p')(1) === 'Sara', 'نام پروفایل همچنان اول است');
  ok(mkName('', '2p')(2) === '<player2>', 'بازیکن دو تغییری نکرده');
}

/* --------------------------------------------------------- نونوگرام */
function testNonogram() {
  head('نونوگرام');
  const E = loadEngine('nonogram', 'NonogramEngineFactory');
  const J = (x) => JSON.stringify(x);

  // Solved-board colours (#166): a fixed gradient per puzzle, the same every time
  ok(typeof E.paletteFor === 'function' && typeof E.cellColour === 'function', 'the engine colours the solved board');
  if (typeof E.cellColour === 'function') {
    ok(E.PALETTES.length > 0 && E.PALETTES.every((p) => p.length === 2 && p.every((c) => /^#[0-9A-F]{6}$/.test(c))), 'palettes are pairs of fixed hex colours');
    const pal = E.PALETTES[0];
    ok(E.cellColour(15, 0, pal) === pal[0] && E.cellColour(15, 224, pal) === pal[1], 'the gradient runs from the first colour (top left) to the second (bottom right)');
    const cells = new Array(100).fill(E.BLANK); [3, 17, 42, 88].forEach((i) => { cells[i] = E.FILL; });
    const marked = cells.slice(); marked[5] = E.MARK;
    ok(E.paletteFor(cells) === E.paletteFor(cells.slice()) && E.paletteFor(cells) === E.paletteFor(marked), 'the same solution always gets the same colours; crosses do not change them');
    const seen = new Set();
    for (let s = 0; s < 40; s++) { const g = new Array(100).fill(E.BLANK); for (let k = 0; k < 30; k++) g[(s * 37 + k * 11) % 100] = E.FILL; seen.add(E.paletteFor(g)); }
    ok(seen.size >= 3, 'different boards get different palettes (' + seen.size + ' of ' + E.PALETTES.length + ')');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/nonogram/index.html'), 'utf8');
    ok(/var pal = S\.done \? E\.paletteFor\(S\.cells\) : null;/.test(html) && /g\.fillStyle = pal \? solvedColour\(snapNow, i, pal\) : col\.game;/.test(html), 'the board is coloured only once solved');
    ok(/var pal = E\.paletteFor\(snap\.cells\);/.test(html) && /g\.fillStyle = solvedColour\(snap, i, pal\);/.test(html), 'the share card uses the same colours');
  }

  // عددهای یک خط، از روی قانون: طول دسته‌های پر پشت سر هم به ترتیب
  ok(J(E.clueOf([1, 1, 0, 1, 0, 0, 1, 1, 1])) === '[2,1,3]', 'عددهای خط [۲،۱،۳] درست‌اند');
  ok(J(E.clueOf([0, 0, 0, 0])) === '[]', 'خط خالی عدد ندارد');
  ok(J(E.clueOf([1, 1, 1, 1, 1])) === '[5]', 'خط تمام‌پر یک دسته‌ی پنج است');

  // جدول دست‌ساز ۵×۵ (یک قلب) با عددهایی که از روی شکل با دست شمرده شده‌اند
  const heart = [
    0, 1, 0, 1, 0,
    1, 1, 1, 1, 1,
    1, 1, 1, 1, 1,
    0, 1, 1, 1, 0,
    0, 0, 1, 0, 0
  ];
  const heartRows = [[1, 1], [5], [5], [3], [1]];
  const heartCols = [[2], [4], [4], [4], [2]];
  const hc = E.cluesOf(heart, 5);
  ok(J(hc.rows) === J(heartRows), 'قلب: عددهای سطرها همان شمارش دستی‌اند');
  ok(J(hc.cols) === J(heartCols), 'قلب: عددهای ستون‌ها همان شمارش دستی‌اند');
  const hs = E.solve(heartRows, heartCols);
  ok(hs.solved && J(hs.grid) === J(heart), 'قلب: حل‌کننده از عددها دقیقاً همان شکل را می‌سازد');

  // قانون‌های شناخته‌شده‌ی یک خط
  ok(J(E.solveLine([4], [-1, -1, -1, -1, -1])) === '[-1,1,1,1,-1]', 'دسته‌ی ۴ در ۵ خانه: سه خانه‌ی وسط حتماً پرند');
  ok(J(E.solveLine([], [-1, -1, -1])) === '[0,0,0]', 'خط بی‌عدد: همه خالی‌اند');
  ok(J(E.solveLine([2, 2], [-1, -1, -1, -1, -1])) === '[1,1,0,1,1]', 'دو دسته‌ی ۲ در ۵ خانه فقط یک چیدمان دارد');
  ok(E.solveLine([3], [-1, 0, -1, 0, -1]) === null, 'دسته‌ی ۳ بین خانه‌های خالی جا نمی‌شود: تناقض');
  ok(J(E.solveLine([1], [-1, 1, -1, -1])) === '[0,1,0,0]', 'دسته‌ی ۱ که جایش معلوم است بقیه را خالی می‌کند');

  // حل‌کننده‌ی خط را با شمردن همه‌ی چیدمان‌ها مقایسه می‌کنیم، برای هر خط تا ۷ خانه
  // و هر ترکیب خانه‌ی معلوم. این مستقل از برنامه‌ریزی پویای موتور است.
  let lineCases = 0, lineBad = 0;
  for (let n = 1; n <= 7; n++) {
    const full = [];
    for (let m = 0; m < (1 << n); m++) {
      const L = [];
      for (let i = 0; i < n; i++) L.push((m >> i) & 1);
      full.push(L);
    }
    const byClue = {};
    for (const L of full) (byClue[J(E.clueOf(L))] = byClue[J(E.clueOf(L))] || []).push(L);
    const partials = [];
    for (let m = 0; m < Math.pow(3, n); m++) {
      const P = []; let x = m;
      for (let i = 0; i < n; i++) { P.push((x % 3) - 1); x = Math.floor(x / 3); }
      partials.push(P);
    }
    for (const key of Object.keys(byClue)) {
      const clue = JSON.parse(key);
      for (const P of partials) {
        lineCases++;
        const fits = byClue[key].filter((L) => P.every((v, i) => v === -1 || v === L[i]));
        let want = null;
        if (fits.length) want = P.map((v, i) => fits.every((L) => L[i] === 1) ? 1 : (fits.every((L) => L[i] === 0) ? 0 : -1));
        if (J(E.solveLine(clue, P)) !== J(want)) lineBad++;
      }
    }
  }
  ok(lineCases > 10000, 'مقایسه با شمارش کامل روی ' + lineCases + ' حالت اجرا شد');
  ok(lineBad === 0, 'حل‌کننده‌ی خط با شمارش همه‌ی چیدمان‌ها می‌خواند (' + lineBad + ' اختلاف)');

  // تولید: برای هر اندازه بذرهای زیاد. جدول فقط وقتی پذیرفته است که حل‌کننده‌ی
  // خطی بدون حدس کاملش کند و نتیجه همان جدول تولیدشده باشد.
  let maxMs = 0, maxTries = 0;
  for (const [n, count] of [[5, 40], [10, 40], [15, 25]]) {
    let solved = 0, same = 0, clues = 0, dens = 0, ran = 0;
    for (let i = 0; i < count; i++) {
      const t0 = Date.now();
      const pz = E.generate(rng(n * 1000 + i * 37 + 1), n);
      maxMs = Math.max(maxMs, Date.now() - t0);
      maxTries = Math.max(maxTries, pz.tries);
      ran++;
      const r = E.solve(pz.rows, pz.cols);
      if (r.solved) solved++;
      if (J(r.grid) === J(pz.solution)) same++;
      const c = E.cluesOf(pz.solution, n);
      if (J(c.rows) === J(pz.rows) && J(c.cols) === J(pz.cols) && pz.solution.length === n * n) clues++;
      const f = pz.solution.reduce((a, b) => a + b, 0) / (n * n);
      if (f >= 0.45 && f <= 0.65) dens++;
    }
    ok(ran === count && count > 0, n + '×' + n + ': ' + ran + ' جدول ساخته شد');
    ok(solved === count, n + '×' + n + ': همه بدون حدس حل شدند (' + solved + '/' + count + ')');
    ok(same === count, n + '×' + n + ': جواب حل‌کننده همان جدول تولیدشده است (' + same + '/' + count + ')');
    ok(clues === count, n + '×' + n + ': عددها از خود جدول حساب شده‌اند (' + clues + '/' + count + ')');
    ok(dens === count, n + '×' + n + ': پرشدگی بین ۴۵ و ۶۵ درصد است (' + dens + '/' + count + ')');
  }
  ok(maxMs < 300, 'تولید سریع است (بیشینه ' + maxMs + 'ms)');
  ok(maxTries < 100, 'تولید به سقف قطعی نمی‌رسد (بیشینه ' + maxTries + ' تلاش)');

  // روزانه: همان مسیر صفحه، C.daily('nonogram', date) با hash32 و rng خود هسته
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const hashSrc = (core.match(/function hash32\(str\) \{[\s\S]*?\n  \}/) || [])[0];
  const rngSrc = (core.match(/function rng\(seed\) \{[\s\S]*?\n  \}/) || [])[0];
  ok(!!hashSrc && !!rngSrc, 'hash32 و rng هسته پیدا شدند');
  const sb = {};
  vm.createContext(sb);
  vm.runInContext(hashSrc + '\n' + rngSrc + '\nthis.daily = function (d) { return rng(hash32("chogan|nonogram|" + d)); };', sb);
  const d1 = E.generate(sb.daily('2026-10-02'), 10), d2 = E.generate(sb.daily('2026-10-02'), 10);
  const d3 = E.generate(sb.daily('2026-10-03'), 10);
  ok(d1.n === 10 && J(d1.solution) === J(d2.solution) && J(d1.rows) === J(d2.rows), 'روزانه: یک تاریخ همیشه یک جدول می‌دهد');
  ok(J(d1.solution) !== J(d3.solution), 'روزانه: دو تاریخ دو جدول متفاوت می‌دهند');
  const pageHtml = fs.readFileSync(path.join(ROOT, 'www/games/nonogram/index.html'), 'utf8');
  ok(/C\.daily\('nonogram', daily\)\.rng/.test(pageHtml) && /newGame\(10, dailyDate\)/.test(pageHtml), 'صفحه روزانه‌ی ۱۰×۱۰ را با C.daily می‌سازد');

  // کشیدن انگشت: محور قفل می‌شود
  ok(J(E.strokeCells(5, 0, 3)) === '[0,1,2,3]', 'کشیدن افقی خانه‌های یک سطر را می‌دهد');
  ok(J(E.strokeCells(5, 16, 1)) === '[16,11,6,1]', 'کشیدن عمودی رو به بالا ستون شروع را نگه می‌دارد');
  ok(J(E.strokeCells(5, 0, 16)) === '[0,5,10,15]', 'کشیدن کج روی محور با جابه‌جایی بیشتر قفل می‌شود');

  // یک ضربه = یک قدم برگرداندن؛ پر کردن با کشیدن از روی ضربدر و خانه‌ی پر رد می‌شود
  const S = E.newState({ n: 5, rows: heartRows, cols: heartCols });
  const snap = () => J([S.cells, S.history]);
  const empty = snap();
  let base = S.cells.slice();
  E.applyStroke(S, base, [2], 0, E.MARK);
  ok(E.commit(S, base) === 1 && S.history.length === 1, 'ضربدر یک قدم ثبت می‌کند');
  const afterMark = snap();
  base = S.cells.slice();
  ok(E.targetFor(base[0], 'fill') === E.FILL && E.targetFor(E.FILL, 'fill') === E.BLANK, 'پر کردن روی خانه‌ی پر پاکش می‌کند');
  E.applyStroke(S, base, E.strokeCells(5, 0, 4), E.BLANK, E.FILL);
  ok(J(S.cells.slice(0, 5)) === J([1, 1, 2, 1, 1]), 'کشیدن برای پر کردن ضربدر سر راه را دست نمی‌زند');
  ok(E.commit(S, base) === 4 && S.history.length === 2, 'کل کشیدن یک قدم است');
  base = S.cells.slice();
  ok(E.commit(S, base) === 0 && S.history.length === 2, 'ضربه‌ی بی‌اثر چیزی به تاریخچه اضافه نمی‌کند');
  ok(E.undo(S) && snap() === afterMark, 'برگرداندن کل کشیدن را با هم برمی‌گرداند');
  ok(E.undo(S) && snap() === empty, 'برگرداندن دوم به جدول خالی می‌رسد');
  ok(!E.undo(S) && snap() === empty, 'روی جدول خالی برگرداندن کاری نمی‌کند');

  // برد با جور شدن عددها، با ضربدرها یا بی آن‌ها؛ یک خانه‌ی اشتباه کافی است تا نبرد
  const W = E.newState({ n: 5, rows: heartRows, cols: heartCols });
  for (let i = 0; i < 25; i++) W.cells[i] = heart[i] ? E.FILL : E.MARK;
  ok(E.isSolved(W), 'قلب پرشده با ضربدرها در بقیه حل‌شده است');
  for (let i = 0; i < 25; i++) if (W.cells[i] === E.MARK) W.cells[i] = E.BLANK;
  ok(E.isSolved(W), 'قلب پرشده بدون ضربدر هم حل‌شده است');
  W.cells[0] = E.FILL;
  ok(!E.isSolved(W), 'یک خانه‌ی اضافه یعنی حل نشده');
  const ld = E.linesDone(W);
  ok(!ld.rows[0] && ld.rows[1] && !ld.cols[0] && ld.cols[1], 'فقط سطر و ستون خانه‌ی اضافه جور نیستند');
  // جدولی با دو جواب: هر دو قطر عددها را برآورده می‌کنند و هر دو برد حساب می‌شوند
  const two = E.newState({ n: 2, rows: [[1], [1]], cols: [[1], [1]] });
  two.cells = [1, 0, 0, 1];
  const diagA = E.isSolved(two);
  two.cells = [0, 1, 1, 0];
  ok(diagA && E.isSolved(two), 'هر جوابی که با عددها بخواند برد است');
  ok(!E.solve([[1], [1]], [[1], [1]]).solved, 'همان جدول دوجوابی را حل‌کننده‌ی بدون حدس رد می‌کند');

  // بازی تصادفی: هر ترتیبی از ضربه‌ها با برگرداندن کامل به جدول خالی می‌رسد
  let roundTrips = 0;
  for (let g = 0; g < 30; g++) {
    const r = rng(9000 + g);
    const pz = E.generate(r, 10);
    const T = E.newState(pz);
    const blank = J(T.cells);
    let strokes = 0;
    for (let k = 0; k < 60; k++) {
      const a = r.int(100), b = r.int(100);
      const b0 = T.cells.slice();
      const how = r() < 0.3 ? 'mark' : 'fill';
      const from = b0[a];
      E.applyStroke(T, b0, E.strokeCells(10, a, b), from, E.targetFor(from, how));
      if (E.commit(T, b0)) strokes++;
    }
    let undone = 0;
    while (E.undo(T)) undone++;
    if (undone === strokes && J(T.cells) === blank && T.history.length === 0) roundTrips++;
  }
  ok(roundTrips === 30, 'برگرداندن پیاپی هر بازی تصادفی را به جدول خالی می‌رساند (' + roundTrips + '/30)');

  // صفحه باید از همین تابع‌ها استفاده کند، نه منطق خودش را
  ok(/E\.applyStroke\(S, /.test(pageHtml) && /E\.commit\(S, d\.base\)/.test(pageHtml), 'صفحه ضربه را با applyStroke و commit ثبت می‌کند');
  ok(/E\.undo\(S\)/.test(pageHtml) && /E\.isSolved\(S\)/.test(pageHtml), 'صفحه برگرداندن و برد را از موتور می‌گیرد');
  ok(/C\.stats\.best\('nonogram', 'time-' \+ n, elapsed, true\)/.test(pageHtml), 'بهترین زمان برای هر اندازه جدا ثبت می‌شود');
  console.log('  بیشینه‌ی زمان تولید ' + maxMs + 'ms، بیشینه‌ی تلاش ' + maxTries);
}

/* ------------------------------------------------------------ منقله */
function testMancala() {
  head('منقله');
  const E = loadEngine('mancala', 'MancalaEngineFactory');
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // هر جواب مورد انتظار دستی از روی قاعده نوشته شده، نه با اجرای همین کد.
  // ترتیب خانه‌ها: ۰..۵ گودال‌های پایین، ۶ خانه‌ی پایین، ۷..۱۲ بالا، ۱۳ خانه‌ی بالا.
  const sowCase = (name, board, p, pit, want, check) => {
    const b = board.slice();
    const before = E.total(b);
    const info = E.sow(b, p, pit);
    ok(same(b, want), name + ': تخته ' + JSON.stringify(b));
    ok(E.total(b) === before, name + ': تعداد دانه ثابت ماند');
    if (check) check(info);
  };

  // کاشتن ساده از تخته‌ی آغاز
  sowCase('کاشتن', E.newBoard(4), 0, 0,
    [0, 5, 5, 5, 5, 4, 0, 4, 4, 4, 4, 4, 4, 0],
    (i) => ok(!i.extra && i.next === 1 && same(i.path, [1, 2, 3, 4]), 'کاشتن: مسیر ۱ تا ۴ و نوبت به حریف'));
  // نوبت دوباره: چهار دانه از گودال ۲ آخرش در خانه می‌افتد
  sowCase('نوبت دوباره', E.newBoard(4), 0, 2,
    [4, 4, 0, 5, 5, 5, 1, 4, 4, 4, 4, 4, 4, 0],
    (i) => ok(i.extra && i.next === 0 && i.last === 6, 'نوبت دوباره: آخرین دانه در خانه، نوبت همان بازیکن'));
  // رد شدن از خانه‌ی حریف، بازیکن پایین
  sowCase('رد شدن از خانه‌ی بالا', [0, 2, 0, 0, 0, 9, 0, 1, 1, 1, 1, 1, 1, 0], 0, 5,
    [1, 3, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 0],
    (i) => ok(same(i.path, [6, 7, 8, 9, 10, 11, 12, 0, 1]) && i.path.indexOf(13) < 0 && !i.capture,
      'رد شدن: مسیر از ۱۳ نمی‌گذرد ' + JSON.stringify(i.path)));
  // رد شدن از خانه‌ی پایین، بازیکن بالا، و گرفتن در پایانش
  sowCase('رد شدن از خانه‌ی پایین', [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 9, 0], 1, 12,
    [2, 2, 2, 2, 0, 2, 0, 1, 0, 0, 0, 0, 0, 4],
    (i) => ok(i.path.indexOf(6) < 0 && i.capture === 3 && i.captureFrom === 4 && i.next === 0,
      'رد شدن: بالا از ۶ رد شد و گودال خالی ۸ سه دانه گرفت'));
  // گرفتن
  sowCase('گرفتن', [1, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0], 0, 0,
    [0, 0, 0, 1, 0, 0, 4, 2, 0, 0, 0, 0, 0, 0],
    (i) => ok(i.capture === 4 && i.captureFrom === 11 && !i.over, 'گرفتن: دانه‌ی آخر و سه دانه‌ی روبه‌رو به خانه رفتند'));
  // روبه‌روی خالی: هیچ گرفتنی نیست و دانه سر جایش می‌ماند
  sowCase('روبه‌روی خالی', [1, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0], 0, 0,
    [0, 1, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0],
    (i) => ok(i.capture === 0 && i.next === 1 && !i.over, 'روبه‌روی خالی: چیزی گرفته نشد و نوبت به حریف رسید'));
  // دور کامل با سیزده دانه: از گودال مبدأ رد نمی‌شود و در آن گرفته می‌شود
  sowCase('دور کامل', [13, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0, 0,
    [0, 1, 1, 1, 1, 1, 3, 1, 1, 1, 1, 1, 0, 0],
    (i) => ok(i.capture === 2 && i.last === 0, 'دور کامل: آخرین دانه در گودال مبدأ نشست و گرفت'));
  // پایان: ردیف پایین خالی شد، دانه‌های بالا به خانه‌ی بالا
  sowCase('پایان با ردیف خالی', [0, 0, 0, 0, 0, 1, 5, 3, 0, 2, 0, 0, 0, 4], 0, 5,
    [0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 9],
    (i) => ok(i.over && same(i.sweep, [0, 5]), 'پایان: پنج دانه‌ی بالا به صاحبش رسید'));
  // پایان وقتی ردیف خودِ بازیکن بالا خالی می‌شود
  sowCase('پایان ردیف بالا', [2, 0, 1, 0, 0, 0, 3, 0, 0, 0, 0, 0, 1, 7], 1, 12,
    [0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 8],
    (i) => ok(i.over && same(i.sweep, [3, 0]), 'پایان: سه دانه‌ی پایین به خانه‌ی پایین رفت'));

  ok(same(E.legalMoves([0, 3, 0, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0], 0), [1, 3]), 'گودال خالی حرکت مجاز نیست');
  const st0 = E.newState('2p', null, E.newBoard(4));
  ok(E.applyMove(st0, 7) === null && st0.history.length === 0, 'گودال حریف را نمی‌شود کاشت');

  // ناوردا روی بازی‌های بذری: دانه ثابت، هر بازی تمام می‌شود
  const levels = ['easy', 'medium', 'hard'];
  let games = 0, conserved = true, ended = true, maxMs = 0;
  for (let i = 0; i < 24; i++) {
    const r = rng(i * 389 + 11);
    const board = i % 3 === 0 ? E.newBoard(4) : E.dailyLayout(rng(i * 53 + 2));
    const S = E.newState('2p', null, board);
    const a = levels[i % 3], b = levels[(i + 1) % 3];
    let n = 0;
    while (!S.done && n < 400) {
      const t0 = Date.now();
      const m = E.aiMove(S.board, S.turn, S.turn === 0 ? a : b, r);
      maxMs = Math.max(maxMs, Date.now() - t0);
      if (!E.applyMove(S, m)) { conserved = false; break; }
      if (E.total(S.board) !== 48) conserved = false;
      n++;
    }
    games++;
    if (!S.done || E.sideSeeds(S.board, 0) || E.sideSeeds(S.board, 1) || S.board[6] + S.board[13] !== 48) ended = false;
  }
  ok(games === 24, 'بیست‌وچهار بازی بذری اجرا شد');
  ok(conserved, 'در همه‌ی حرکت‌ها جمع دانه‌ها ۴۸ ماند و هر حرکت هوش مصنوعی مجاز بود');
  ok(ended, 'همه‌ی بازی‌ها تمام شدند و همه‌ی دانه‌ها در دو خانه‌اند');

  // قدرت: هر جفت دوازده بازی، نیمی با شروع هر طرف، نیمی از چیدمان روزانه
  function versus(x, y) {
    let w = 0;
    for (let i = 0; i < 12; i++) {
      const r = rng(i * 131 + 7);
      const S = E.newState('2p', null, i < 4 ? E.newBoard(4) : E.dailyLayout(rng(i * 17 + 1)));
      const lv = i % 2 === 0 ? [x, y] : [y, x];
      while (!S.done) {
        const t0 = Date.now();
        E.applyMove(S, E.aiMove(S.board, S.turn, lv[S.turn], r));
        maxMs = Math.max(maxMs, Date.now() - t0);
      }
      const mine = i % 2 === 0 ? S.board[6] : S.board[13];
      if (mine > 24) w++;
    }
    return w;
  }
  const hm = versus('hard', 'medium');
  ok(hm >= 10, 'سخت از متوسط قوی‌تر است (' + hm + '/12)');
  const me = versus('medium', 'easy');
  ok(me >= 9, 'متوسط از آسان قوی‌تر است (' + me + '/12)');
  ok(maxMs < 900, 'زمان فکر هوش مصنوعی قابل قبول است (' + maxMs + 'ms)');

  // روزانه
  const d1 = E.dailyLayout(rng(20261002)), d2 = E.dailyLayout(rng(20261002));
  ok(same(d1, d2), 'روزانه: یک بذر همیشه یک چیدمان');
  let layoutsOk = true, distinct = new Set();
  for (let i = 0; i < 40; i++) {
    const L = E.dailyLayout(rng(i * 7919 + 1));
    distinct.add(L.join());
    if (E.total(L) !== 48 || L[6] || L[13]) layoutsOk = false;
    for (let k = 0; k < 6; k++) if (L[k] < 1 || L[k] !== L[7 + k]) layoutsOk = false;
  }
  ok(layoutsOk, 'روزانه: ۴۸ دانه، هر گودال دست‌کم یکی، گودال iام دو طرف برابر');
  ok(distinct.size > 30, 'روزانه: بذرهای مختلف چیدمان‌های مختلف می‌دهند (' + distinct.size + '/40)');

  // برگرداندن: دونفره یک حرکت، با حریف تا نوبت قبلی بازیکن
  const snap = (S) => JSON.stringify([S.board, S.turn, S.history, S.done]);
  const two = E.newState('2p', null, E.newBoard(4));
  const empty = snap(two);
  E.applyMove(two, 0);
  const afterFirst = snap(two);
  E.applyMove(two, 7);
  ok(two.turn === 0, 'دونفره: پس از دو حرکت بی‌جایزه نوبت پایین است');
  ok(E.takeBack(two) === 1 && snap(two) === afterFirst, 'دونفره: برگرداندن فقط یک حرکت برمی‌دارد');
  ok(E.takeBack(two) === 1 && snap(two) === empty, 'دونفره: برگرداندن دوم به تخته‌ی آغاز می‌رسد');
  ok(E.takeBack(two) === 0 && snap(two) === empty, 'دونفره: روی تخته‌ی آغاز برگرداندن کاری نمی‌کند');

  const ai = E.newState('ai', 'hard', E.newBoard(4));
  E.applyMove(ai, 2);                    // نوبت دوباره
  const humanTurn = snap(ai);
  E.applyMove(ai, 0);
  E.applyMove(ai, 7);
  ok(ai.turn === 0 && ai.history.length === 3, 'با حریف: پس از حرکت حریف نوبت به بازیکن رسید');
  ok(E.takeBack(ai) === 2 && snap(ai) === humanTurn, 'با حریف: برگرداندن تا پیش از حرکت قبلی بازیکن عقب می‌رود');
  ok(E.takeBack(ai) === 1 && ai.history.length === 0 && ai.turn === 0, 'با حریف: نوبت دوباره‌ی خود بازیکن یک حرکت جدا برمی‌گردد');

  const finished = E.newState('2p', null, [0, 0, 0, 0, 0, 1, 5, 3, 0, 2, 0, 0, 0, 4]);
  E.applyMove(finished, 5);
  ok(finished.done, 'وضعیت پس از حرکت پایانی تمام‌شده است');
  ok(E.takeBack(finished) === 1 && !finished.done && finished.board[5] === 1, 'برگرداندن حرکت پایانی بازی را دوباره باز می‌کند');

  // صفحه باید از همین تابع‌ها استفاده کند، نه منطق خودش را
  const mcHtml = fs.readFileSync(path.join(ROOT, 'www/games/mancala/index.html'), 'utf8');
  ok(/E\.applyMove\(S, pit\)/.test(mcHtml), 'صفحه حرکت را با applyMove ثبت می‌کند');
  ok(/E\.takeBack\(S\)/.test(mcHtml), 'صفحه برگرداندن را با takeBack انجام می‌دهد');
  ok(/E\.dailyLayout\(C\.daily\('mancala'/.test(mcHtml), 'روزانه‌ی صفحه چیدمان را از بذر روز می‌سازد');
  ok(!/localStorage/.test(mcHtml), 'صفحه مستقیم به localStorage دست نمی‌زند');
}

/* --------------------------------------------------------- فری‌سل */
function testFreecell() {
  head('فری‌سل');
  const E = loadEngine('freecell', 'FreecellEngineFactory');
  const N = (c) => E.name(c);
  const P = (s) => {
    const c = E.parse(s);
    if (c < 0) throw new Error('کارت ناشناخته در آزمون: ' + s);
    return c;
  };
  const rows = (cols) => {
    const out = [];
    for (let r = 0; r < 7; r++) {
      const row = [];
      for (let i = 0; i < 8; i++) if (cols[i][r] !== undefined) row.push(N(cols[i][r]));
      out.push(row.join(' '));
    }
    return out.join('\n');
  };
  const cardsOf = (S) => {
    const all = [];
    S.cols.forEach((c) => c.forEach((x) => all.push(x)));
    S.cells.forEach((x) => { if (x >= 0) all.push(x); });
    S.found.forEach((n, s) => { for (let r = 0; r < n; r++) all.push(r * 4 + s); });
    return all;
  };
  const whole = (S) => { const a = cardsOf(S); return a.length === 52 && new Set(a).size === 52 && a.every((x) => x >= 0 && x < 52); };

  // چیدمان منتشرشده در Rosetta Code «Deal cards for FreeCell» (خوانده‌شده ۲۰۲۶-۱۰-۰۲)
  const DEAL1 = [
    'JD 2D 9H JC 5D 7H 7C 5H', 'KD KC 9S 5S AD QC KH 3H', '2S KS 9D QD JS AS AH 3C',
    '4C 5C TS QH 4H AC 4D 7S', '3S TD 4S TH 8H 2C JH 7D', '6D 8S 8D QS 6C 3D 8C TC', '6S 9C 2H 6H'
  ].join('\n');
  const DEAL617 = [
    '7D AD 5C 3S 5S 8C 2D AH', 'TD 7S QD AC 6D 8H AS KH', 'TH QC 3H 9D 6S 8D 3D TC',
    'KD 5H 9S 3C 8S 7H 4D JS', '4C QS 9C 9H 7C 6H 2C 2S', '4S TS 2H 5D JC 6C JH QH', 'JD KS KC 4H'
  ].join('\n');
  ok(rows(E.deal(1)) === DEAL1, 'دست ۱ همان چیدمان منتشرشده است');
  ok(rows(E.deal(617)) === DEAL617, 'دست ۶۱۷ همان چیدمان منتشرشده است');

  let allWhole = true, bad = -1;
  for (let d = 1; d <= 32000 && allWhole; d++) {
    const cols = E.deal(d);
    const flat = [].concat(...cols);
    if (flat.length !== 52 || new Set(flat).size !== 52 || cols.some((c, i) => c.length !== (i < 4 ? 7 : 6))) { allWhole = false; bad = d; }
  }
  ok(allWhole, 'هر ۳۲۰۰۰ دست ۵۲ کارت متمایز دارند، ستون‌ها ۷ و ۶ کارتی' + (bad > 0 ? ' (دست ' + bad + ')' : ''));

  // ۱۱۹۸۲ هرگز داده نمی‌شود، حتی وقتی مولد دقیقاً به آن می‌خورد
  const seq = (vals) => { let i = 0; return () => vals[Math.min(i++, vals.length - 1)]; };
  ok(E.pickDeal(seq([11981.5 / 32000, 0.5])) === 16001, 'وقتی تصادف ۱۱۹۸۲ را می‌دهد دست دیگری انتخاب می‌شود');
  ok(!E.validDeal(11982) && !E.validDeal(0) && !E.validDeal(32001) && !E.validDeal(1.5) && E.validDeal(1) && E.validDeal(32000),
    'بازه‌ی شماره‌ی دست ۱ تا ۳۲۰۰۰ است، بدون ۱۱۹۸۲');

  // روزانه: بذر را با همان کد هسته می‌سازیم، نه نسخه‌ی دوم
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const hashSrc = (core.match(/function hash32\(str\) \{[\s\S]*?\n  \}/) || [])[0];
  const rngSrc = (core.match(/function rng\(seed\) \{[\s\S]*?\n  \}/) || [])[0];
  ok(!!hashSrc && !!rngSrc, 'hash32 و rng هسته پیدا شدند');
  const dsb = {};
  vm.createContext(dsb);
  vm.runInContext(hashSrc + '\n' + rngSrc + '\nthis.dailyRng = function (id, key) { return rng(hash32("chogan|" + id + "|" + key)); };', dsb);
  const dates = [];
  for (let i = 0; i < 400; i++) { const t = new Date(Date.UTC(2026, 0, 1) + i * 86400000); dates.push(t.toISOString().slice(0, 10)); }
  ok(dates.length === 400, 'فهرست تاریخ‌های روزانه خالی نیست');
  let same = true, valid = true;
  const seenDeals = new Set();
  for (const d of dates) {
    const a = E.pickDeal(dsb.dailyRng('freecell', d)), b = E.pickDeal(dsb.dailyRng('freecell', d));
    if (a !== b || rows(E.newGame(a).cols) !== rows(E.newGame(b).cols)) same = false;
    if (!E.validDeal(a)) valid = false;
    seenDeals.add(a);
  }
  ok(same, 'روزانه: یک تاریخ همیشه یک دست و یک چیدمان می‌دهد');
  ok(valid, 'روزانه: دست همیشه بین ۱ و ۳۲۰۰۰ است و هرگز ۱۱۹۸۲ نیست');
  ok(seenDeals.size > 380, 'روزانه: روزهای مختلف دست‌های مختلف می‌گیرند (' + seenDeals.size + '/400)');
  const page = fs.readFileSync(path.join(ROOT, 'www/games/freecell/index.html'), 'utf8');
  ok(/E\.pickDeal\(C\.daily\('freecell', dailyDate\)\.rng\)/.test(page), 'صفحه دست روزانه را با همین pickDeal و بذر هسته می‌سازد');

  // وضعیت دستی: ستون‌ها از چپ، کارت آخر هر رشته روی بقیه
  const make = (cols, cells, found) => {
    const S = {
      deal: 1, cols: cols.map((c) => (c ? c.split(' ').filter(Boolean).map(P) : [])),
      cells: (cells || []).map((x) => (x ? P(x) : -1)), found: found || [0, 0, 0, 0], hist: [], moves: 0, undos: 0
    };
    while (S.cols.length < 8) S.cols.push([]);
    while (S.cells.length < 4) S.cells.push(-1);
    return S;
  };
  // قاعده‌ی ستون: یک رتبه پایین‌تر، رنگ مخالف
  const s1 = make(['5H', '6S', '6D', '7S', '6C', 'KD'], ['4C', '4D', '4S', '3C']);
  ok(E.canMove(s1, 0, 1, 1), '۵ دل روی ۶ پیک می‌نشیند');
  ok(!E.canMove(s1, 0, 1, 2), '۵ دل روی ۶ خشت نمی‌نشیند (هم‌رنگ)');
  ok(!E.canMove(s1, 0, 1, 3), '۵ دل روی ۷ پیک نمی‌نشیند (رتبه)');
  ok(E.canMove(s1, 0, 1, 4), '۵ دل روی ۶ گشنیز می‌نشیند');
  ok(!E.canMove(s1, 1, 1, 0), '۶ پیک روی ۵ دل نمی‌نشیند (رتبه‌ی بالاتر روی پایین‌تر)');
  // خانه‌ی آزاد
  ok(!E.canMove(s1, 0, 1, 8), 'خانه‌ی پر کارت نمی‌گیرد');
  const s2 = make(['5H 4S', 'KD'], ['', 'QC']);
  ok(E.canMove(s2, 0, 1, 8), 'خانه‌ی خالی یک کارت می‌گیرد');
  ok(!E.canMove(s2, 0, 2, 8), 'خانه‌ی آزاد رشته‌ی دوکارتی نمی‌گیرد');
  ok(!E.canMove(s2, 9, 1, 0), 'بی‌بی گشنیز از خانه‌ی آزاد روی ۴ پیک نمی‌نشیند');
  ok(E.canMove(s2, 9, 1, 1), 'بی‌بی گشنیز از خانه‌ی آزاد روی شاه خشت می‌نشیند');
  ok(E.canMove(s2, 9, 1, 2), 'کارت خانه‌ی آزاد به ستون خالی می‌رود');
  ok(!E.canMove(s2, 9, 1, 8), 'از خانه‌ی آزاد به خانه‌ی آزاد دیگر حرکت نیست');
  // پایه
  const s3 = make(['AH', '2H', '3H', '2C', 'AS'], [], [0, 0, 1, 0]);
  ok(!E.canMove(s3, 0, 1, 14), 'آس دل وقتی پایه‌ی دل آس دارد دوباره نمی‌رود');
  ok(E.canMove(s3, 1, 1, 14), '۲ دل روی آس دل در پایه می‌رود');
  ok(!E.canMove(s3, 2, 1, 14), '۳ دل بدون ۲ دل به پایه نمی‌رود');
  ok(!E.canMove(s3, 1, 1, 13), '۲ دل به پایه‌ی خشت نمی‌رود');
  ok(!E.canMove(s3, 3, 1, 12), '۲ گشنیز به پایه‌ی خالی نمی‌رود');
  ok(E.canMove(s3, 4, 1, 15), 'آس پیک به پایه‌ی خالی پیک می‌رود');
  ok(!E.canMove(s3, 14, 1, 0), 'از پایه کارتی برداشته نمی‌شود');

  // سقف رشته: (خانه‌ی آزاد + ۱) × ۲^(ستون خالی)، و نصف وقتی مقصد ستون خالی است.
  // عددها از فرمول مسئله می‌آیند نه از maxMove موتور.
  const RUN = 'KS QH JC TD 9S 8H 7C 6D 5S 4H 3C 2D'.split(' ');
  const otherSuit = { C: 'S', S: 'C', D: 'H', H: 'D' };
  const runCase = (free, empty, toEmpty, n) => {
    const used = new Set(RUN);
    const cols = [RUN.join(' ')];
    if (toEmpty) cols.push('');
    else {
      // مقصد: یک رتبه بالاتر از اولین کارت جابه‌جاشونده، رنگ مخالف، خال دیگر
      const above = RUN[RUN.length - n - 1];
      const t = above[0] + otherSuit[above[1]];
      used.add(t);
      cols.push(t);
    }
    const filler = [];
    for (let c = 0; c < 52; c++) if (!used.has(E.name(c))) filler.push(E.name(c));
    // ستون‌های ۲ تا ۷: به اندازه‌ی لازم خالی، بقیه با یک کارت پرکننده
    const otherEmpty = empty - (toEmpty ? 1 : 0);
    for (let i = 2; i < 8; i++) cols.push(i - 2 < otherEmpty ? '' : filler.shift());
    const cells = [];
    for (let j = 0; j < 4; j++) cells.push(j < free ? '' : filler.shift());
    const S = make(cols, cells);
    const all = cardsOf(S);
    if (new Set(all).size !== all.length) throw new Error('کارت تکراری در آزمون رشته');
    if (E.freeCells(S) !== free || E.emptyCols(S) !== empty) throw new Error('وضعیت آزمون رشته اشتباه ساخته شد');
    return { S, to: 1 };
  };
  const limits = [[0, 0], [1, 0], [3, 0], [4, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [4, 1]];
  ok(limits.length > 0, 'فهرست حالت‌های سقف رشته خالی نیست');
  for (const [f, e] of limits) {
    const lim = (f + 1) * Math.pow(2, e);
    const a = runCase(f, e, false, lim), b = runCase(f, e, false, lim + 1);
    ok(E.canMove(a.S, 0, lim, a.to), 'خانه‌ی آزاد ' + f + '، ستون خالی ' + e + ': رشته‌ی ' + lim + 'تایی روی ستون پر می‌رود');
    ok(!E.canMove(b.S, 0, lim + 1, b.to), 'خانه‌ی آزاد ' + f + '، ستون خالی ' + e + ': رشته‌ی ' + (lim + 1) + 'تایی رد می‌شود');
  }
  const toEmpty = [[0, 1], [1, 1], [2, 2], [0, 3], [4, 1], [1, 3]];
  for (const [f, e] of toEmpty) {
    const lim = (f + 1) * Math.pow(2, e - 1);
    const a = runCase(f, e, true, lim), b = runCase(f, e, true, lim + 1);
    ok(E.canMove(a.S, 0, lim, a.to), 'به ستون خالی، خانه‌ی آزاد ' + f + '، ستون خالی ' + e + ': ' + lim + ' کارت می‌رود');
    ok(!E.canMove(b.S, 0, lim + 1, b.to), 'به ستون خالی، خانه‌ی آزاد ' + f + '، ستون خالی ' + e + ': ' + (lim + 1) + ' کارت رد می‌شود');
  }
  // #572: a run picked by its top card was refused whole when only its lower
  // cards fit the target, or when it was longer than the free cells allow.
  // Expected counts come from the rules, not from the engine.
  const p1 = make(['9S 8H 7C', 'KC', '8D', 'KD', 'KH', 'QS', 'QD', 'QC'], ['', 'AC', 'AD', 'AH']);
  ok(E.fitCount(p1, 0, 3, 2) === 1, 'a 9-8-7 run dropped on the 8 of diamonds moves only the 7 of clubs');
  ok(E.fitCount(p1, 0, 3, 1) === 0, 'nothing of 9-8-7 fits on a king');
  ok(E.fitCount(p1, 0, 3, 8) === 0 && E.fitCount(p1, 0, 3, 12) === 0, 'a run dropped on a free cell or a foundation is not cut down to one card');
  const bm1 = E.bestMove(p1, 0, 3);
  ok(!!bm1 && bm1.to === 2 && bm1.n === 1, 'tapping the 9 of 9-8-7 sends the 7 to the 8 of diamonds');
  // three cards to an empty column with no free cell and one empty column: (0+1)*2^0 = 1
  const p2 = make(['9S 8H 7C', '', 'KC', 'KD', 'KH', 'QS', 'QD', 'QC'], ['JS', 'AC', 'AD', 'AH']);
  ok(E.fitCount(p2, 0, 3, 1) === 1, 'a run too long for an empty column moves as many cards as the rules allow');
  const bm2 = E.bestMove(p2, 0, 3);
  ok(!!bm2 && bm2.to === 1 && bm2.n === 1, 'tapping a run that fits nowhere whole sends its allowed tail to the empty column');
  ok(E.bestMove(p1, 0, 1).n === 1 && E.bestMove(p1, 0, 1).to === 2, 'a single card still goes where bestTarget sends it');
  const fcPage = fs.readFileSync(path.join(ROOT, 'www/games/freecell/index.html'), 'utf8');
  ok(/var to = dropAt\(d\.x \+ d\.dx \+ L\.cw \/ 2, d\.y \+ d\.dy \+ L\.ch \/ 2, d\.cards\[0\]\);/.test(fcPage) && /doMove\(d\.src, k, to,/.test(fcPage),
    'a drop goes to the column under the dragged card first, then the finger, with the run cut to what fits');
  const s4 = make(['8S 7H 6C', '9D', '8C', 'KC', 'KD', 'KH', 'QS', 'QD'], ['', 'AC', 'AD', 'AH']);
  ok(!E.canMove(s4, 0, 2, 1), 'رشته‌ای که اولش روی مقصد نمی‌نشیند رد می‌شود (۷ دل روی ۹ خشت)');
  ok(E.canMove(s4, 0, 2, 2), 'دو کارت با یک خانه‌ی آزاد روی ۸ گشنیز می‌رود');
  ok(!E.canMove(s4, 0, 3, 1), 'سه کارت با یک خانه‌ی آزاد و بدون ستون خالی رد می‌شود');
  const s5 = make(['8S 7H 5C', '6D'], ['', '', 'AD', 'AH']);
  ok(!E.canMove(s5, 0, 2, 1), 'رشته‌ی نامرتب (۷ دل، ۵ گشنیز) با هم جابه‌جا نمی‌شود');

  // حرکت خودکار فقط کارت امن را می‌برد
  const unsafe = make(['3H', 'KS', 'KC'], [], [1, 0, 2, 2]);
  E.autoAll(unsafe);
  ok(unsafe.found[2] === 2 && unsafe.cols[0].length === 1, '۳ دل وقتی ۲ گشنیز هنوز لازم است خودکار نمی‌رود');
  ok(E.canMove(unsafe, 0, 1, 14), '... هرچند با دست می‌شود بردش');
  const safe3 = make(['3H', 'KS', 'KC'], [], [2, 0, 2, 2]);
  E.autoAll(safe3);
  ok(safe3.found[2] === 3 && safe3.cols[0].length === 0, '۳ دل وقتی هر دو ۲ سیاه روی پایه‌اند خودکار می‌رود');
  const two = make(['2D', 'KS'], [], [0, 1, 0, 0]);
  E.autoAll(two);
  ok(two.found[1] === 2, '۲ همیشه امن است');
  const cellAce = make(['KS'], ['AH']);
  E.autoAll(cellAce);
  ok(cellAce.found[2] === 1 && cellAce.cells[0] === -1, 'آس از خانه‌ی آزاد هم خودکار می‌رود');
  // قاعده‌ی امنیت را خود آزمون می‌سنجد
  const safeRule = (S, c) => {
    const r = c >> 2, s = c & 3, red = s === 1 || s === 2;
    if (S.found[s] !== r) return false;
    if (r <= 1) return true;
    const opp = red ? [0, 3] : [1, 2];
    return S.found[opp[0]] >= r && S.found[opp[1]] >= r;
  };

  // بهترین مقصد لمس: پایه، ستون پر، ستون خالی، خانه‌ی آزاد
  const b1 = make(['AS', 'KD', '', '2H'], ['', '', '', '']);
  ok(E.bestTarget(b1, 0, 1) === 15, 'لمس آس: پایه');
  const b2 = make(['5H', '6S', '', 'KD']);
  ok(E.bestTarget(b2, 0, 1) === 1, 'لمس: ستون پر پیش از ستون خالی');
  const b3 = make(['QC 5H', 'KS', '', 'KD']);
  ok(E.bestTarget(b3, 0, 1) === 2, 'لمس: ستون خالی پیش از خانه‌ی آزاد');
  // کارت تنهای یک ستون به ستون خالی دیگر نمی‌رود چون هیچ چیز عوض نمی‌شود
  const b3b = make(['5H', 'KS', '', 'KD']);
  ok(!E.canMove(b3b, 0, 1, 2) && E.bestTarget(b3b, 0, 1) === 8, 'لمس کارت تنها: خانه‌ی آزاد، نه ستون خالی دیگر');
  // هشت ستون با کارت قرمز بالا: هیچ کارتی روی دیگری نمی‌نشیند و هیچ‌کدام آس نیست
  const reds = ['5H', 'KH', '3D', 'QD', '9H', '7D', 'JD', '2H'];
  const b4 = make(reds);
  ok(E.bestTarget(b4, 0, 1) === 8, 'لمس: خانه‌ی آزاد آخرین گزینه');
  // خانه‌های پر با سیاه‌هایی که رتبه‌شان یکی کمتر از هیچ قرمز بالایی نیست
  const b5 = make(reds, ['3C', '5S', '9C', 'KS']);
  ok(E.bestTarget(b5, 0, 1) === -1, 'لمس بی‌مقصد رد می‌شود');
  ok(!E.hasMoves(b5), 'بن‌بست تشخیص داده می‌شود');
  ok(E.hasMoves(b4), 'با خانه‌ی آزاد بن‌بست نیست');

  // بازی تصادفی: کارت‌ها پایسته‌اند، خودکار فقط امن می‌برد، برگرداندن تا ته به همان دست می‌رسد
  let conserved = true, autoSafe = true, undoBack = true, autoCount = 0, agree = true, userMoves = 0;
  for (let g = 0; g < 30; g++) {
    const r = rng(g * 7907 + 11);
    const deal = E.pickDeal(r);
    const S = E.newGame(deal);
    const startSnap = JSON.stringify([S.cols, S.cells, S.found]);
    let steps = 0;
    for (; steps < 300; steps++) {
      const moves = [];
      for (let f = 0; f < 12; f++) {
        const maxN = f < 8 ? E.runLength(S.cols[f]) : 1;
        for (let n = 1; n <= maxN; n++) for (let t = 0; t < 16; t++) if (E.canMove(S, f, n, t)) moves.push([f, n, t]);
      }
      // hasMoves صفحه همان چیزی را بگوید که فهرست کامل حرکت‌ها
      if (E.hasMoves(S) !== moves.length > 0) agree = false;
      if (!moves.length) break;
      const m = moves[r.int(moves.length)];
      userMoves++;
      if (!E.move(S, m[0], m[1], m[2])) { conserved = false; break; }
      for (;;) {
        const before = { found: S.found.slice() };
        const a = E.autoStep(S);
        if (!a) break;
        autoCount++;
        const card = before.found[a[1] - 12] * 4 + (a[1] - 12);
        if (!safeRule(before, card)) autoSafe = false;
      }
      if (!whole(S)) conserved = false;
      if (E.won(S)) break;
    }
    let guard = 0;
    while (E.undo(S) && guard++ < 1000);
    if (JSON.stringify([S.cols, S.cells, S.found]) !== startSnap || S.moves !== 0 || S.deal !== deal) undoBack = false;
  }
  ok(conserved, 'در ۳۰ بازی تصادفی همیشه ۵۲ کارت متمایز روی میز است');
  ok(autoCount > 0, 'حرکت خودکار در بازی‌های تصادفی رخ داد (' + autoCount + ')');
  ok(autoSafe, 'هیچ حرکت خودکاری کارتی را که هنوز لازم است نبرد');
  ok(undoBack, 'برگرداندن پیاپی به همان چیدمان اول دست برمی‌گردد و دست عوض نمی‌شود');
  ok(userMoves > 1000, 'بازی‌های تصادفی واقعاً حرکت کردند (' + userMoves + ')');
  ok(agree, 'تشخیص «حرکتی نمانده» با فهرست کامل حرکت‌ها یکی است');

  // حل‌کننده‌ی آزمون: جست‌وجوی بهترین-اول روی حرکت‌های تک‌کارتی موتور. فقط برای
  // اثبات بردنی بودن است و در صفحه نیست.
  const keyOf = (S) => S.cols.map((c) => c.join(',')).sort().join('|') + '#' +
    S.cells.filter((x) => x >= 0).sort((a, b) => a - b).join(',') + '#' + S.found.join(',');
  const score = (S) => {
    const left = 52 - (S.found[0] + S.found[1] + S.found[2] + S.found[3]);
    let disorder = 0, depth = 0;
    for (const col of S.cols) {
      for (let k = 0; k < col.length; k++) {
        for (let j = k + 1; j < col.length; j++) if (E.rank(col[j]) > E.rank(col[k])) { disorder++; break; }
        if (S.found[E.suit(col[k])] === E.rank(col[k])) depth += col.length - 1 - k;
      }
    }
    return left * 5 + disorder + (4 - E.freeCells(S)) + (8 - E.emptyCols(S)) + depth * 2;
  };
  function solve(deal, limit) {
    const s0 = E.newGame(deal);
    const seen = new Set([keyOf(s0)]);
    // صف اولویت دودویی
    const heap = [];
    const push = (x) => { heap.push(x); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p].f <= heap[i].f) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l].f < heap[m].f) m = l;
          if (r < heap.length && heap[r].f < heap[m].f) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    push({ S: s0, path: null, f: score(s0) });
    let n = 0;
    while (heap.length && n < limit) {
      const cur = pop();
      n++;
      if (E.won(cur.S)) {
        const path = [];
        for (let p = cur.path; p; p = p.prev) path.unshift(p.m);
        return { path, nodes: n, exhausted: false };
      }
      for (let f = 0; f < 12; f++) {
        for (let t = 0; t < 16; t++) {
          if (!E.canMove(cur.S, f, 1, t)) continue;
          const S2 = E.clone(cur.S);
          S2.hist = [];
          E.move(S2, f, 1, t);
          E.autoAll(S2);
          const k = keyOf(S2);
          if (seen.has(k)) continue;
          seen.add(k);
          push({ S: S2, path: { m: [f, 1, t], prev: cur.path }, f: score(S2) });
        }
      }
    }
    return { path: null, nodes: n, exhausted: heap.length === 0 };
  }
  const t0 = Date.now();
  const solvable = [1, 2, 3, 617];
  ok(solvable.length > 0, 'فهرست دست‌های بردنی آزمون خالی نیست');
  for (const d of solvable) {
    const sol = solve(d, 60000);
    ok(!!sol.path, 'دست ' + d + ': حل‌کننده راه برد پیدا کرد (' + sol.nodes + ' گره)');
    if (!sol.path) continue;
    // همان راه را روی بازی تازه با move و autoAll موتور، مثل صفحه، اجرا می‌کنیم
    const S = E.newGame(d);
    let legal = true;
    for (const m of sol.path) {
      if (!E.move(S, m[0], m[1], m[2])) { legal = false; break; }
      E.autoAll(S);
      if (!whole(S)) { legal = false; break; }
    }
    ok(legal && E.won(S), 'دست ' + d + ': ' + sol.path.length + ' حرکت از راه موتور تا آخر بازی شد و برد ثبت شد');
    ok(S.moves === sol.path.length, 'دست ' + d + ': شمار حرکت‌ها همان حرکت‌های بازیکن است');
  }
  // ۱۱۹۸۲ با جست‌وجوی کامل: کل فضای حالت تمام می‌شود بی‌آنکه بردی پیدا شود
  const lost = solve(11982, 200000);
  ok(!lost.path && lost.exhausted, 'دست ۱۱۹۸۲ واقعاً بی‌جواب است (همه‌ی ' + lost.nodes + ' حالت گشته شد)');
  const solveMs = Date.now() - t0;
  ok(solveMs < 15000, 'حل‌ها در زمان معقول تمام شدند (' + solveMs + 'ms)');
  console.log('  چهار دست حل و تا برد بازی شد، ۱۱۹۸۲ با ' + lost.nodes + ' حالت رد شد، ' + solveMs + 'ms');

  // ذخیره‌ی خراب رد می‌شود؛ خانه‌ی null پیش‌تر آس گشنیز دوم می‌ساخت
  const good = E.newGame(5);
  ok(E.validState(JSON.parse(JSON.stringify(good))), 'وضعیت سالم سریال‌شده پذیرفته می‌شود');
  const broken = [
    ['خانه‌ی null', (x) => { x.cells[0] = null; }],
    ['کارت تکراری', (x) => { x.cols[0][0] = x.cols[1][0]; }],
    ['کارت گم', (x) => { x.cols[0].pop(); }],
    ['پایه‌ی بیش از ۱۳', (x) => { x.found[0] = 14; }],
    ['شماره‌ی دست ۱۱۹۸۲', (x) => { x.deal = 11982; }],
    ['ستون کم', (x) => { x.cols.pop(); }],
    ['تاریخچه‌ی خراب', (x) => { x.hist = [[0, 99, 1, 0]]; }]
  ];
  ok(broken.length > 0, 'فهرست ذخیره‌های خراب خالی نیست');
  for (const [label, hurt] of broken) {
    const x = JSON.parse(JSON.stringify(good));
    hurt(x);
    ok(!E.validState(x), 'ذخیره‌ی خراب رد می‌شود: ' + label);
  }
  ok(/E\.validState\(saved\.s\)/.test(page), 'صفحه ذخیره را پیش از ادامه با validState می‌سنجد');

  // صفحه باید حرکت، برگرداندن و حرکت خودکار را از موتور بگیرد
  const ui = page.slice(page.indexOf('/* ==== ENGINE END ==== */'));
  ok(ui.length > 1000, 'بخش صفحه‌ی فری‌سل خوانده شد');
  ok(/E\.move\(S, src, n, to\)/.test(ui), 'صفحه حرکت را با E.move ثبت می‌کند');
  ok(/E\.undo\(S\)/.test(ui), 'صفحه برگرداندن را با E.undo انجام می‌دهد');
  ok(/E\.autoAll\(S\)/.test(ui), 'صفحه حرکت خودکار را با E.autoAll انجام می‌دهد');
  ok(/E\.bestMove\(S, src, n\)/.test(ui), 'a tap takes its target from E.bestMove, which tries bestTarget first');
  ok(!/localStorage/.test(ui), 'صفحه مستقیم به localStorage دست نمی‌زند');

  // بوم پهن، تخته‌ی همان‌اندازه (#102): تابع واقعی layout صفحه با پهناهای مختلف
  const fcHtml = fs.readFileSync(path.join(ROOT, 'www/games/freecell/index.html'), 'utf8');
  const lAt = fcHtml.indexOf('function layout() {');
  ok(lAt > 0, 'تابع layout فری‌سل پیدا شد');
  let lDepth = 0, lEnd = lAt;
  for (let i = fcHtml.indexOf('{', lAt); i < fcHtml.length; i++) {
    if (fcHtml[i] === '{') lDepth++;
    else if (fcHtml[i] === '}' && --lDepth === 0) { lEnd = i + 1; break; }
  }
  const consts = (fcHtml.match(/^ {2}var BOARD_MAX = \d+;$/m) || [''])[0];
  const fcLayout = (W, H) => {
    try {
      return vm.runInNewContext('(function (board) { var L; ' + consts + fcHtml.slice(lAt, lEnd) + ' layout(); return L; })', {})(
        { clientWidth: W, clientHeight: H });
    } catch (e) { ok(false, 'layout اجرا نشد: ' + e.message); return {}; }
  };
  const narrow = fcLayout(680, 900), wide = fcLayout(1600, 900), phone = fcLayout(360, 900);
  // گوشی: عددهای دستی از همان فرمول، gap=max(3,round(360×0.014))=5 و cw=floor((360−45)/8)=39
  ok(phone.cw === 39 && phone.gap === 5, 'گوشی ۳۶۰: اندازه‌ی کارت و فاصله همان قبل است (' + phone.cw + '/' + phone.gap + ')');
  ok(wide.cw === narrow.cw && wide.gap === narrow.gap && wide.ov === narrow.ov && wide.ch === narrow.ch,
    'بوم پهن تخته را بزرگ‌تر یا بازتر نمی‌کند (' + [narrow.cw, narrow.gap] + ' / ' + [wide.cw, wide.gap] + ')');
  ok(wide.x0 === narrow.x0 + (1600 - 680) / 2, 'تخته وسط بوم پهن است (x0 ' + wide.x0 + ')');
  ok(!/\.fc-board \{[^}]*max-width/.test(fcHtml), 'بوم سقف پهنای ۶۸۰ ندارد، پس کارت در حال کشیدن بریده نمی‌شود');
}

/* ---------------------------------------------------------- میخ‌پران */
function testPeg() {
  head('میخ‌پران');
  const E = loadEngine('peg', 'PegEngineFactory');
  const cell = (r, c) => r * 7 + c;
  const empty = () => new Array(49).fill(0);

  // تخته‌ی انگلیسی: ۳۳ سوراخ، چهار گوشه‌ی ۲×۲ بیرون
  ok(E.HOLES.length === 33, 'تخته ۳۳ سوراخ دارد (' + E.HOLES.length + ')');
  ok(E.CENTRE === cell(3, 3) && E.VALID[E.CENTRE], 'مرکز خانه‌ی سطر ۴ ستون ۴ است');
  ok([[0, 0], [1, 1], [0, 6], [1, 5], [5, 0], [6, 1], [5, 6], [6, 6]].every(([r, c]) => !E.VALID[cell(r, c)]), 'گوشه‌ها سوراخ ندارند');
  // ۷۶ پرش هندسی: شمارش دستی روی تخته‌ی انگلیسی
  ok(E.JUMPS.length === 76, 'تعداد پرش‌های هندسی ۷۶ است (' + E.JUMPS.length + ')');
  ok(E.JUMPS.length > 0 && E.JUMPS.every((m) => E.VALID[m.from] && E.VALID[m.over] && E.VALID[m.to] &&
    Math.abs(m.to - m.from) === 2 * Math.abs(m.over - m.from) && (m.from + m.to) === 2 * m.over), 'هر پرش از سوراخ به سوراخ است و میخ وسط دقیقاً بینشان است');

  // قانون پرش روی تخته‌های دست‌ساز
  const b1 = empty();
  b1[cell(3, 1)] = 1; b1[cell(3, 2)] = 1;                 // دو میخ کنار هم، مقصد (۳،۳) خالی
  ok(!!E.jumpAt(b1, cell(3, 1), cell(3, 3)), 'پرش افقی روی میخ به سوراخ خالی مجاز است');
  ok(!E.jumpAt(b1, cell(3, 2), cell(3, 4)), 'پرش روی سوراخ خالی مجاز نیست');
  ok(!!E.jumpAt(b1, cell(3, 2), cell(3, 0)), 'پرش به عقب، به سوراخ لبه، هم مجاز است');
  ok(!E.jumpAt(b1, cell(3, 1), cell(3, 2)), 'جابه‌جایی یک‌خانه‌ای مجاز نیست');
  b1[cell(3, 3)] = 1;
  ok(!E.jumpAt(b1, cell(3, 1), cell(3, 3)), 'فرود روی میخ مجاز نیست');
  const b2 = empty();
  b2[cell(2, 2)] = 1; b2[cell(3, 3)] = 1;
  ok(!E.jumpAt(b2, cell(2, 2), cell(4, 4)), 'پرش اریب مجاز نیست');
  const b3 = empty();
  b3[cell(4, 2)] = 1; b3[cell(5, 2)] = 1;
  ok(!!E.jumpAt(b3, cell(4, 2), cell(6, 2)), 'پرش عمودی به پایین مجاز است');
  const b4 = empty();
  b4[cell(2, 3)] = 1; b4[cell(2, 2)] = 1;
  ok(!!E.jumpAt(b4, cell(2, 3), cell(2, 1)), 'پرش به سوراخ لبه‌ی بازوی چپ مجاز است');
  b4[cell(2, 1)] = 0; b4[cell(1, 2)] = 1; b4[cell(2, 2)] = 0;
  ok(E.legalMoves(b4).length === 0 && E.isOver(b4), 'دو میخ بی‌همسایه: هیچ پرشی نیست و بازی تمام است');
  const S1 = { start: -1, board: b3.slice(), history: [] };
  ok(E.applyMove(S1, cell(4, 2), cell(6, 2)) && S1.board[cell(4, 2)] === 0 && S1.board[cell(5, 2)] === 0 && S1.board[cell(6, 2)] === 1,
    'پرش میخ مبدأ و میخ وسط را برمی‌دارد و مقصد را پر می‌کند');
  ok(!E.applyMove(S1, cell(6, 2), cell(4, 2)) && S1.history.length === 1, 'حرکت غیرمجاز وضعیت را عوض نمی‌کند');

  // شروع استاندارد: ۳۲ میخ، مرکز خالی، دقیقاً چهار پرش و همه به مرکز
  const std = E.startBoard(E.CENTRE);
  ok(E.pegCount(std) === 32 && std[E.CENTRE] === 0, 'شروع استاندارد ۳۲ میخ با مرکز خالی است');
  const first = E.legalMoves(std);
  ok(first.length === 4 && first.every((m) => m.to === E.CENTRE), 'در شروع استاندارد چهار پرش هست و همه به مرکز');

  // بازی‌های تصادفی: هر پرش دقیقاً یک میخ کم می‌کند، بازی دقیقاً وقتی تمام است
  // که پرش مجازی نماند، و برگرداندن پیاپی به خود شروع می‌رسد
  let perJump = true, endRule = true, undoBack = true, replayOk = true, played = 0;
  for (let g = 0; g < 300; g++) {
    const r = rng(g * 7919 + 11);
    const start = E.HOLES[r.int(E.HOLES.length)];
    const S = E.newGame(start);
    const init = JSON.stringify(S.board);
    for (let step = 0; step < 40; step++) {
      const ms = E.legalMoves(S.board);
      if (E.isOver(S.board) !== (ms.length === 0)) endRule = false;
      if (!ms.length) break;
      const before = E.pegCount(S.board);
      const m = ms[r.int(ms.length)];
      if (!E.applyMove(S, m.from, m.to)) { perJump = false; break; }
      if (E.pegCount(S.board) !== before - 1) perJump = false;
    }
    if (!E.isOver(S.board)) endRule = false;
    if (E.pegCount(S.board) !== 32 - S.history.length) perJump = false;
    const re = E.replay(start, S.history);
    if (!re || JSON.stringify(re.board) !== JSON.stringify(S.board)) replayOk = false;
    while (E.undo(S)) { /* تا ته */ }
    if (JSON.stringify(S.board) !== init) undoBack = false;
    played++;
  }
  ok(played === 300, 'سیصد بازی تصادفی اجرا شد');
  ok(perJump, 'هر پرش دقیقاً یک میخ کم می‌کند');
  ok(endRule, 'بازی دقیقاً وقتی تمام است که هیچ پرشی مجاز نباشد');
  ok(replayOk, 'تخته از روی شروع و تاریخچه دوباره ساخته می‌شود');
  ok(undoBack, 'برگرداندن بی‌حساب تا خود شروع می‌رسد');
  ok(E.replay(E.CENTRE, [[cell(3, 1), cell(3, 2), cell(3, 3)], [cell(3, 1), cell(3, 2), cell(3, 3)]]) === null, 'ذخیره‌ی ناسازگار رد می‌شود');
  ok(E.replay(0, []) === null, 'شروع روی گوشه‌ی بی‌سوراخ رد می‌شود');

  // نتیجه و پاداش
  const one = empty(); one[E.CENTRE] = 1;
  const oneOff = empty(); oneOff[cell(0, 3)] = 1;
  ok(E.result(one).won && E.result(one).centre, 'یک میخ در مرکز: برد بی‌نقص');
  ok(E.result(oneOff).won && !E.result(oneOff).centre, 'یک میخ بیرون مرکز: برد ساده');
  ok(!E.result(b4).won && E.result(b4).pegs === 2, 'دو میخ: برد نیست');
  const rw = [1, 2, 3, 6].map((n) => E.reward(n, false));
  ok(E.reward(1, true).coins > rw[0].coins && rw[0].coins > rw[1].coins && rw[1].coins > rw[2].coins && rw[2].coins >= rw[3].coins,
    'میخ کمتر پاداش بیشتر');
  ok(rw[0].coins === 10 && rw[0].points === 40, 'پاداش برد هم‌اندازه‌ی نقطه‌بازی است');

  // حل‌کننده
  let t0 = Date.now();
  const sol = E.solve(std, E.CENTRE);
  const solMs = Date.now() - t0;
  const check = (startHole, path, target) => {
    const S = E.newGame(startHole);
    for (const m of path || []) if (!E.applyMove(S, m.from, m.to)) return false;
    return E.pegCount(S.board) === 1 && (target < 0 || S.board[target] === 1);
  };
  ok(!!sol && sol.length === 31, 'حل‌کننده شروع استاندارد را در ۳۱ پرش حل می‌کند');
  ok(check(E.CENTRE, sol, E.CENTRE), 'راه‌حل با قانون بازی اجرا می‌شود و یک میخ در مرکز می‌ماند');
  ok(E.solve(b4) === null, 'دو میخ بی‌همسایه: حل‌کننده راه‌حلی نمی‌دهد');
  const twoFar = empty(); twoFar[cell(3, 0)] = 1; twoFar[cell(3, 1)] = 1;
  ok(E.solve(twoFar, cell(3, 2)) !== null && E.solve(twoFar, E.CENTRE) === null, 'حل‌کننده مقصد آخرین میخ را رعایت می‌کند');

  // هر شروع روزانه با حل‌کننده تا یک میخ پیش می‌رود
  ok(E.DAILY_HOLES.length > 0, 'فهرست شروع‌های روزانه خالی نیست');
  t0 = Date.now();
  let dailyOk = 0;
  for (const h of E.DAILY_HOLES) {
    const p = E.solve(E.startBoard(h), -1);
    if (E.VALID[h] && p && check(h, p, -1)) dailyOk++;
    else ok(false, 'شروع روزانه‌ی خانه‌ی ' + h + ' حل نشد');
  }
  const dailyMs = Date.now() - t0;
  ok(dailyOk === E.DAILY_HOLES.length, 'همه‌ی ' + dailyOk + ' شروع روزانه تا یک میخ حل می‌شوند');
  ok(solMs + dailyMs < 15000, 'حل‌کننده سریع است (' + (solMs + dailyMs) + 'ms)');

  // بذر روزانه با همان hash32 و rng هسته، تا تاریخ به همان سوراخ صفحه برسد
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const fnSrc = (name) => (core.match(new RegExp('  function ' + name + '\\([\\s\\S]*?\\n  \\}')) || [''])[0];
  const coreRng = vm.runInNewContext(fnSrc('hash32') + fnSrc('rng') + '; (function (g, d) { return rng(hash32("chogan|" + g + "|" + d)); })', {});
  const dates = [];
  for (let i = 0; i < 90; i++) dates.push(new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10));
  ok(dates.length === 90, 'نود تاریخ برای روزانه ساخته شد');
  const holes = dates.map((d) => E.dailyHole(coreRng('peg', d)));
  ok(holes.every((h) => E.DAILY_HOLES.indexOf(h) >= 0), 'هر روزانه یکی از شروع‌های ثابت‌شده است');
  ok(dates.every((d, i) => E.dailyHole(coreRng('peg', d)) === holes[i]), 'یک تاریخ همیشه همان شروع را می‌دهد');
  ok(new Set(holes).size >= 10, 'روزانه‌ها تنوع دارند (' + new Set(holes).size + ' سوراخ متفاوت در ۹۰ روز)');

  // صفحه باید حرکت و برگرداندن را از موتور بگیرد، نه منطق خودش
  const pgHtml = fs.readFileSync(path.join(ROOT, 'www/games/peg/index.html'), 'utf8');
  ok(/E\.applyMove\(S, from, to\)/.test(pgHtml), 'صفحه حرکت را با applyMove ثبت می‌کند');
  ok(/E\.undo\(S\)/.test(pgHtml), 'صفحه برگرداندن را با undo موتور انجام می‌دهد');
  ok(/E\.replay\(v\.start, v\.history\)/.test(pgHtml), 'صفحه ذخیره را از روی تاریخچه بازسازی می‌کند');
  ok(/C\.daily\('peg', /.test(pgHtml) && /E\.dailyHole\(/.test(pgHtml), 'صفحه شروع روزانه را از بذر هسته می‌گیرد');
  ok(!/E\.solve\(/.test(pgHtml.split('/* ==== ENGINE END ==== */')[1] || 'E.solve('), 'صفحه هنگام بار شدن چیزی حل نمی‌کند');
}

/* ----------------------------------------------------------- ریورسی */
function testReversi() {
  head('ریورسی');
  const E = loadEngine('reversi', 'ReversiEngineFactory');
  const at = (r, c) => r * 8 + c;
  const empty = () => new Array(64).fill(0);
  const sorted = (a) => a.slice().sort((x, y) => x - y).join(',');

  // شروع استاندارد: d4 و e5 سفید، e4 و d5 سیاه، و سیاه شروع می‌کند
  const init = E.initial();
  ok(init[at(3, 3)] === 2 && init[at(4, 4)] === 2 && init[at(3, 4)] === 1 && init[at(4, 3)] === 1 &&
    init.filter((x) => x).length === 4, 'شروع استاندارد چهار مهره‌ی وسط');
  ok(E.newState('2p').turn === 1, 'سیاه شروع می‌کند');
  // چهار حرکت مجاز اول سیاه در هر کتاب قواعد: d3، c4، f5، e6
  ok(sorted(E.legalMoves(init, 1)) === sorted([at(2, 3), at(3, 2), at(4, 5), at(5, 4)]), 'حرکت‌های مجاز اول سیاه d3 c4 f5 e6 است');

  // هر هشت جهت جدا، با فاصله‌ی دو و سه مهره
  const dirs = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  ok(dirs.length === 8, 'فهرست جهت‌ها هشت‌تایی است');
  for (const [dr, dc] of dirs) {
    for (const run of [1, 2]) {
      const b = empty();
      const want = [];
      for (let k = 1; k <= run; k++) { b[at(3 + dr * k, 3 + dc * k)] = 2; want.push(at(3 + dr * k, 3 + dc * k)); }
      b[at(3 + dr * (run + 1), 3 + dc * (run + 1))] = 1;
      ok(sorted(E.flipsFor(b, at(3, 3), 1)) === sorted(want), 'جهت ' + dr + ',' + dc + ' با ' + run + ' مهره درست برمی‌گردد');
    }
  }
  // هر هشت جهت با هم
  const star = empty();
  const ring = [];
  for (const [dr, dc] of dirs) { star[at(3 + dr, 3 + dc)] = 2; ring.push(at(3 + dr, 3 + dc)); star[at(3 + 2 * dr, 3 + 2 * dc)] = 1; }
  ok(sorted(E.flipsFor(star, at(3, 3), 1)) === sorted(ring), 'یک حرکت هر هشت جهت را با هم برمی‌گرداند');
  const sStar = { mode: '2p', board: star.slice(), turn: 1, history: [] };
  const rStar = E.applyMove(sStar, at(3, 3));
  ok(rStar && rStar.flips.length === 8 && ring.every((i) => sStar.board[i] === 1), 'applyMove هر هشت مهره را سیاه می‌کند');

  // بدون مهره‌ی خودی در انتهای خط، چیزی برنمی‌گردد و حرکت غیرمجاز است
  const open = empty();
  open[at(0, 1)] = 2; open[at(0, 2)] = 2; open[at(5, 5)] = 1;
  ok(E.flipsFor(open, at(0, 0), 1).length === 0, 'خط باز (بدون مهره‌ی خودی در انتها) برنمی‌گردد');
  const sOpen = { mode: '2p', board: open.slice(), turn: 1, history: [] };
  ok(E.applyMove(sOpen, at(0, 0)) === null && sOpen.board.join() === open.join() && sOpen.history.length === 0,
    'حرکت بدون برگرداندن رد می‌شود و چیزی عوض نمی‌شود');
  ok(E.legalMoves(open, 1).indexOf(at(0, 0)) < 0, 'خانه‌ی بدون برگرداندن در فهرست حرکت‌های مجاز نیست');
  ok(E.applyMove({ mode: '2p', board: init.slice(), turn: 1, history: [] }, at(3, 3)) === null, 'روی خانه‌ی پر نمی‌شود گذاشت');
  // خط نباید از لبه‌ی سطر به سطر بعد بپیچد: خانه‌ی ۸ همسایه‌ی ۷ نیست
  const wrapB = empty();
  wrapB[at(1, 0)] = 2; wrapB[at(1, 1)] = 1;
  ok(E.flipsFor(wrapB, at(0, 7), 1).length === 0, 'خط از لبه‌ی تخته به سطر بعد نمی‌پیچد');

  // رد شدن نوبت و پایان بازی
  const pass = empty();
  pass[at(0, 0)] = 1; pass[at(0, 1)] = 2;
  pass[at(7, 0)] = 1; pass[at(7, 1)] = 2; pass[at(7, 2)] = 2;
  const sPass = { mode: '2p', board: pass, turn: 1, history: [] };
  const r1 = E.applyMove(sPass, at(0, 2));
  ok(r1 && r1.passed === 2 && !r1.over && sPass.turn === 1, 'سفید حرکتی ندارد: نوبتش رد می‌شود و سیاه دوباره بازی می‌کند');
  ok(E.legalMoves(sPass.board, 2).length === 0, 'در همان وضعیت سفید واقعاً حرکتی ندارد');
  const r2 = E.applyMove(sPass, at(7, 3));
  ok(r2 && r2.over && E.isOver(sPass.board), 'وقتی هیچ‌کدام حرکتی ندارند بازی تمام است');
  ok(E.count(sPass.board)[1] === 7 && E.count(sPass.board)[2] === 0, 'شمار پایانی ۷ به ۰');
  ok(!E.isOver(init), 'شروع بازی تمام‌شده نیست');

  // برگرداندن: دونفره یک حرکت، با حریف تا نوبت قبلی بازیکن
  const snap = (S) => JSON.stringify([S.board, S.turn, S.history]);
  const two = E.newState('2p');
  const start = snap(two);
  E.applyMove(two, at(2, 3));
  const afterOne = snap(two);
  E.applyMove(two, at(2, 2));
  ok(two.turn === 1, 'دونفره: بعد از دو حرکت نوبت سیاه است');
  ok(E.takeBack(two) === 1 && snap(two) === afterOne, 'دونفره: برگرداندن فقط یک حرکت برمی‌دارد');
  ok(E.takeBack(two) === 1 && snap(two) === start, 'دونفره: برگرداندن دوم به شروع می‌رسد');
  ok(E.takeBack(two) === 0 && snap(two) === start, 'دونفره: در شروع برگرداندن کاری نمی‌کند');
  const ai = E.newState('ai');
  E.applyMove(ai, at(2, 3)); E.applyMove(ai, at(2, 2));
  const humanTurn = snap(ai);
  E.applyMove(ai, at(3, 2)); E.applyMove(ai, E.legalMoves(ai.board, 2)[0]);
  ok(ai.turn === 1 && E.takeBack(ai) === 2 && snap(ai) === humanTurn, 'با حریف: برگرداندن تا نوبت قبلی بازیکن عقب می‌رود');
  // با حریف وقتی حریف رد کرده: فقط حرکت آخر بازیکن برمی‌گردد
  const aiPass = { mode: 'ai', board: pass.slice(), turn: 1, history: [] };
  aiPass.board = empty();
  aiPass.board[at(0, 0)] = 1; aiPass.board[at(0, 1)] = 2;
  aiPass.board[at(7, 0)] = 1; aiPass.board[at(7, 1)] = 2; aiPass.board[at(7, 2)] = 2;
  E.applyMove(aiPass, at(0, 2));
  const beforeSecond = snap(aiPass);
  E.applyMove(aiPass, at(7, 3));
  ok(E.takeBack(aiPass) === 1 && snap(aiPass) === beforeSecond, 'با حریف: بعد از رد شدن نوبت حریف فقط حرکت آخر بازیکن برمی‌گردد');

  // بازی‌های بذردار: پایان می‌گیرند، شمار با تخته می‌خواند، سخت از متوسط و متوسط از آسان قوی‌تر
  function match(a, b, r) {
    const S = E.newState('2p');
    let guard = 0, maxMs = 0, countOk = true, legalOk = true;
    while (!E.isOver(S.board)) {
      if (guard++ > 70) throw new Error('بازی تمام نشد');
      const p = S.turn;
      const before = E.count(S.board);
      const t0 = Date.now();
      const m = E.aiMove(S.board, p, p === 1 ? a : b, r);
      maxMs = Math.max(maxMs, Date.now() - t0);
      if (E.legalMoves(S.board, p).indexOf(m) < 0) legalOk = false;
      const res = E.applyMove(S, m);
      if (!res) { legalOk = false; break; }
      const n = E.count(S.board);
      const byHand = [0, 1, 2].map((v) => S.board.filter((x) => x === v).length);
      if (n.join() !== byHand.join() || n[p] !== before[p] + 1 + res.flips.length ||
        n[3 - p] !== before[3 - p] - res.flips.length || n[1] + n[2] !== 4 + S.history.length) countOk = false;
    }
    const n = E.count(S.board);
    return { n, maxMs, countOk, legalOk, moves: S.history.length };
  }
  let maxMs = 0, allEnd = 0, allCount = true, allLegal = true;
  const strength = [['hard', 'medium', 10], ['medium', 'easy', 10]];
  for (const [strong, weak, games] of strength) {
    let wins = 0;
    for (let i = 0; i < games; i++) {
      const r = rng(i * 977 + 5);
      const m = i % 2 === 0 ? match(strong, weak, r) : match(weak, strong, r);
      maxMs = Math.max(maxMs, m.maxMs);
      allEnd++;
      allCount = allCount && m.countOk;
      allLegal = allLegal && m.legalOk;
      const diff = i % 2 === 0 ? m.n[1] - m.n[2] : m.n[2] - m.n[1];
      if (diff > 0) wins++;
    }
    ok(wins >= 7, strong + ' از ' + weak + ' قوی‌تر است (' + wins + '/' + games + ')');
  }
  ok(allEnd === 20, 'هر بیست بازی بذردار تمام شد (' + allEnd + ')');
  ok(allLegal, 'هوش مصنوعی فقط حرکت مجاز می‌دهد');
  ok(allCount, 'شمار مهره‌ها بعد از هر حرکت با تخته می‌خواند');
  // سقف مثل نقطه‌بازی؛ روی این لپ‌تاپ بیشینه حدود ۹۰ میلی‌ثانیه است
  ok(maxMs < 900, 'زمان فکر حریف سخت قابل قبول است (' + maxMs + 'ms)');
  ok(E.aiMove(sPass.board, 2, 'hard', rng(1)) === -1, 'بدون حرکت مجاز هوش مصنوعی -۱ می‌دهد');

  // روزانه: یک تاریخ، یک گشایش
  const o1 = E.dailyOpening(rng(20261002), 4), o2 = E.dailyOpening(rng(20261002), 4);
  ok(o1.moves.length === 4 && o1.turn === 1, 'گشایش روزانه چهار حرکت است و نوبت با بازیکن است');
  ok(JSON.stringify(o1) === JSON.stringify(o2), 'یک بذر، یک گشایش');
  ok(o1.board.filter((x) => x).length === 8, 'بعد از گشایش هشت مهره روی تخته است');
  const variety = new Set();
  for (let s = 0; s < 12; s++) variety.add(E.dailyOpening(rng(s * 31 + 7), 4).moves.join());
  ok(variety.size > 1, 'روزهای مختلف گشایش‌های مختلف دارند (' + variety.size + '/12)');

  // صفحه باید از همین تابع‌ها استفاده کند، نه منطق خودش را
  const rvHtml = fs.readFileSync(path.join(ROOT, 'www/games/reversi/index.html'), 'utf8');
  ok(/E\.applyMove\(S, i\)/.test(rvHtml), 'صفحه حرکت را با applyMove ثبت می‌کند');
  ok(/E\.takeBack\(S\)/.test(rvHtml), 'صفحه برگرداندن را با takeBack انجام می‌دهد');
  ok(/E\.dailyOpening\(C\.daily\('reversi'/.test(rvHtml), 'روزانه گشایش را از بذر C.daily می‌سازد');
  // «اتللو» نشان تجاری است؛ نام عمومی بازی ریورسی است
  const gj = fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8');
  ok(!/othello|اتللو|奥赛罗/i.test(rvHtml + gj), 'نام تجاری اتللو در صفحه و فهرست نیست');
}

/* --------------------------------------------------------- تخته‌نرد */
function testBackgammon() {
  head('تخته‌نرد');
  const E = loadEngine('backgammon', 'BackgammonEngineFactory');

  // وضعیت دستی با خانه‌های مطلق (همان شماره‌گذاری بازیکن ۱). مهره‌ای که روی
  // تخته و بار نیست بیرون‌رفته حساب می‌شود تا هر طرف همیشه ۱۵ مهره داشته باشد.
  function pos(w, b, bar) {
    const pts = new Array(24).fill(0);
    for (const k in w) pts[k - 1] += w[k];
    for (const k in b) pts[k - 1] -= b[k];
    const br = [0, (bar && bar[1]) || 0, (bar && bar[2]) || 0];
    const on = (p) => br[p] + pts.reduce((s, v) => s + (p === 1 ? Math.max(v, 0) : Math.max(-v, 0)), 0);
    return { pts, bar: br, off: [0, 15 - on(1), 15 - on(2)] };
  }
  const fmt = (L) => L.map((m) => m.from + '>' + m.to + '/' + m.die).sort().join(' ');

  // ---------------------------------------------------- چیدمان شروع
  const init = E.initial();
  ok(E.count(init, 1) === 15 && E.count(init, 2) === 15, 'شروع: هر طرف ۱۵ مهره');
  ok(E.pips(init, 1) === 167 && E.pips(init, 2) === 167, 'شروع: شمار پیپ هر طرف ۱۶۷ (' + E.pips(init, 1) + '، ' + E.pips(init, 2) + ')');
  ok(init.pts[23] === 2 && init.pts[12] === 5 && init.pts[7] === 3 && init.pts[5] === 5, 'شروع: مهره‌های بازیکن ۱ روی ۲۴، ۱۳، ۸ و ۶');
  ok(init.pts[0] === -2 && init.pts[11] === -5 && init.pts[16] === -3 && init.pts[18] === -5, 'شروع: مهره‌های بازیکن ۲ قرینه‌اند');

  // ------------------------------------------------------------ بار
  const onBar = pos({ 13: 5, 6: 9 }, { 1: 15 }, { 1: 1 });
  let L = E.legalSteps(onBar, 1, [3, 5]);
  ok(L.length > 0 && L.every((m) => m.from === 25), 'بار: تا مهره روی بار است فقط ورود مجاز است (' + fmt(L) + ')');
  ok(fmt(L) === '25>20/5 25>22/3', 'بار: ورود با هر دو تاس روی ۲۲ و ۲۰');
  const twoBar = pos({ 6: 13 }, { 1: 15 }, { 1: 2 });
  const tb = E.newGame(1);
  Object.assign(tb, twoBar, { turn: 1, left: [3, 5], dice: [3, 5], hist: [], winner: 0 });
  E.play(tb, { from: 25, to: 22, die: 3 });
  L = E.legal(tb);
  ok(L.length === 1 && L[0].from === 25 && L[0].to === 20, 'بار: با دو مهره روی بار تاس دوم هم باید ورود باشد');
  const closed = pos({ 6: 14 }, { 19: 2, 20: 2, 21: 2, 22: 2, 23: 2, 24: 2, 1: 3 }, { 1: 1 });
  let blockedAll = true;
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
    if (E.legalSteps(closed, 1, E.diceLeft([a, b])).length) blockedAll = false;
  }
  ok(blockedAll, 'بار: خانه‌ی بسته‌ی حریف با هیچ تاسی ورود نمی‌دهد');
  const cs = E.newGame(2);
  Object.assign(cs, closed, { turn: 1, left: [6, 6, 6, 6], dice: [6, 6], hist: [], winner: 0 });
  ok(E.canEnd(cs) && E.play(cs, { from: 13, to: 7, die: 6 }) === null, 'بار: پشت خانه‌ی بسته فقط پایان نوبت ممکن است');
  const oneOpen = pos({ 6: 14 }, { 19: 2, 20: 2, 21: 2, 23: 2, 24: 2, 1: 5 }, { 1: 1 });
  ok(fmt(E.legalSteps(oneOpen, 1, [3, 5])) === '25>22/3', 'بار: فقط خانه‌ی باز ۲۲ با تاس ۳ ورود می‌دهد');
  // بازیکن ۲ از سمت دیگر وارد می‌شود: خانه‌ی مطلق تاس
  const p2bar = pos({ 24: 15 }, { 19: 14 }, { 2: 1 });
  L = E.legalSteps(p2bar, 2, [2, 4]);
  ok(L.length === 2 && L.every((m) => m.from === 25) && L.map((m) => E.absPoint(2, m.to)).sort().join() === '2,4',
    'بار: بازیکن ۲ روی خانه‌های مطلق ۲ و ۴ وارد می‌شود');

  // ----------------------------------------------------------- زدن
  const hitPos = pos({ 13: 2, 6: 13 }, { 10: 1, 19: 14 });
  const hm = E.legalSteps(hitPos, 1, [3, 1]).find((m) => m.from === 13 && m.to === 10);
  ok(!!hm && hm.hit === true, 'زدن: نشستن روی تک‌مهره‌ی حریف زدن است');
  const hb = { pts: hitPos.pts.slice(), bar: hitPos.bar.slice(), off: hitPos.off.slice() };
  E.applyStep(hb, 1, hm || { from: 13, to: 10, die: 3 });
  ok(hb.bar[2] === 1 && hb.pts[9] === 1, 'زدن: مهره‌ی زده‌شده روی بار می‌رود و خانه مال زننده می‌شود');
  ok(E.count(hb, 1) === 15 && E.count(hb, 2) === 15, 'زدن: تعداد مهره‌ها ثابت می‌ماند');
  const blockedPt = pos({ 13: 2, 6: 13 }, { 10: 2, 19: 13 });
  ok(!E.stepsFor(blockedPt, 1, 3).some((m) => m.from === 13), 'خانه‌ی دومهره‌ای حریف بسته است');

  // --------------------------------------------- هر دو تاس / تاس بزرگ‌تر
  // ۱۰←۴ به‌تنهایی مجاز است ولی بعدش تاس ۱ بازی نمی‌شود، در حالی که ۸←۲ و ۲←۱ هر دو را بازی می‌کند
  const both = pos({ 10: 1, 8: 1 }, { 9: 2, 7: 2, 3: 2, 20: 9 });
  ok(E.stepsFor(both, 1, 6).some((m) => m.from === 10 && m.to === 4), 'هر دو تاس: ۱۰←۴ به‌تنهایی حرکت مجازی است');
  ok(fmt(E.legalSteps(both, 1, [6, 1])) === '8>2/6', 'هر دو تاس: فقط حرکتی که راه تاس دوم را باز می‌گذارد مجاز است (' + fmt(E.legalSteps(both, 1, [6, 1])) + ')');
  ok(E.turnPlays(both, 1, [6, 1]).max === 2, 'هر دو تاس: نوبت کامل دو حرکت است');
  const larger = pos({ 10: 1 }, { 2: 2, 20: 13 });
  ok(E.stepsFor(larger, 1, 2).some((m) => m.from === 10 && m.to === 8), 'تاس بزرگ‌تر: ۱۰←۸ به‌تنهایی مجاز است');
  ok(fmt(E.legalSteps(larger, 1, [6, 2])) === '10>4/6', 'تاس بزرگ‌تر: وقتی فقط یکی بازی می‌شود، بزرگ‌تر اجباری است (' + fmt(E.legalSteps(larger, 1, [6, 2])) + ')');
  const tpL = E.turnPlays(larger, 1, [6, 2]);
  ok(tpL.max === 1 && tpL.plays.length === 1 && tpL.plays[0].steps[0].die === 6, 'تاس بزرگ‌تر: هوش مصنوعی هم همان را می‌بیند');
  // اگر بزرگ‌تر بازی‌شدنی نیست، کوچک‌تر
  const smallOnly = pos({ 10: 1 }, { 4: 2, 2: 2, 20: 11 });
  ok(fmt(E.legalSteps(smallOnly, 1, [6, 2])) === '10>8/2', 'تاس بزرگ‌تر: اگر بسته است کوچک‌تر بازی می‌شود');

  // ------------------------------------------------------------- جفت
  ok(E.diceLeft([3, 3]).join() === '3,3,3,3' && E.diceLeft([2, 5]).join() === '2,5', 'جفت چهار حرکت می‌دهد');
  ok(E.turnPlays(init, 1, [3, 3, 3, 3]).max === 4, 'جفت: از چیدمان شروع چهار حرکت بازی می‌شود');
  const dbl = E.newGame(3);
  Object.assign(dbl, E.initial(), { turn: 1, left: [3, 3, 3, 3], dice: [3, 3], hist: [], winner: 0 });
  let played = 0;
  for (let i = 0; i < 5; i++) { const l = E.legal(dbl); if (l.length && E.play(dbl, l[0])) played++; }
  ok(played === 4 && dbl.left.length === 0 && E.canEnd(dbl), 'جفت: درست چهار حرکت و بعد پایان نوبت');
  const dblPart = pos({ 10: 1 }, { 1: 2, 20: 13 });
  ok(E.turnPlays(dblPart, 1, [3, 3, 3, 3]).max === 2, 'جفت: اگر فقط دو حرکت ممکن است، همان دو');
  // جفت‌ها ترتیب‌های زیادی دارند؛ هر وضعیت پایانی فقط یک بار و هر نوبت با قانون‌ها می‌خواند
  const six = E.turnPlays(init, 1, [6, 6, 6, 6]);
  const keys = new Set(six.plays.map((p) => E.key(p.B)));
  ok(six.plays.length > 0 && keys.size === six.plays.length, 'جفت: وضعیت‌های پایانی تکراری حذف شده‌اند (' + six.plays.length + ')');
  let replayOk = six.plays.length > 0;
  for (const p of six.plays) {
    const t = E.newGame(4);
    Object.assign(t, E.initial(), { turn: 1, left: [6, 6, 6, 6], dice: [6, 6], hist: [], winner: 0 });
    for (const m of p.steps) if (!E.play(t, m)) replayOk = false;
    if (E.key(t) !== E.key(p.B)) replayOk = false;
  }
  ok(replayOk, 'جفت: هر نوبت هوش مصنوعی با play حرکت‌به‌حرکت پذیرفته می‌شود');

  // ------------------------------------------------------- بیرون بردن
  const exact = pos({ 6: 2, 3: 1 }, { 20: 15 });
  L = E.legalSteps(exact, 1, [6, 3]);
  ok(L.some((m) => m.from === 6 && m.to === 0 && m.die === 6) && L.some((m) => m.from === 3 && m.to === 0 && m.die === 3),
    'بیرون بردن: تاس دقیق بیرون می‌برد (' + fmt(L) + ')');
  const high = pos({ 4: 1, 2: 1 }, { 20: 15 });
  ok(fmt(E.stepsFor(high, 1, 6)) === '4>0/6', 'بیرون بردن: تاس بزرگ‌تر فقط از بالاترین خانه‌ی پر');
  ok(fmt(E.stepsFor(high, 1, 3)) === '4>1/3', 'بیرون بردن: تاس ۳ از خانه‌ی ۲ بیرون نمی‌برد چون ۴ بالاتر است');
  const inner = pos({ 6: 1, 1: 1 }, { 20: 15 });
  ok(fmt(E.stepsFor(inner, 1, 5)) === '6>1/5', 'بیرون بردن: وقتی خانه‌ی بالاتر پر است، تاس ۵ از ۱ بیرون نمی‌برد');
  const outside = pos({ 7: 1, 3: 1 }, { 20: 15 });
  ok(!E.stepsFor(outside, 1, 3).some((m) => m.to === 0), 'بیرون بردن: با مهره‌ای بیرون از خانه هیچ مهره‌ای بیرون نمی‌رود');
  ok(!E.stepsFor(pos({ 3: 14 }, { 20: 15 }, { 1: 1 }), 1, 3).some((m) => m.to === 0), 'بیرون بردن: با مهره‌ی روی بار هم نه');
  const p2off = pos({ 1: 15 }, { 21: 1, 23: 1 });
  ok(fmt(E.stepsFor(p2off, 2, 6)) === '4>0/6', 'بیرون بردن: برای بازیکن ۲ هم بالاترین خانه از دید خودش');

  // -------------------------------------------------- نتیجه‌ی پایانی
  const fin = (w, b, bar) => Object.assign(E.newGame(5), pos(w, b, bar), { winner: 1 });
  ok(E.result(fin({}, { 18: 14, 13: 1 })) === 2, 'مارس: بازنده چیزی بیرون نبرده');
  ok(E.result(fin({}, { 18: 14, 3: 1 })) === 3, 'بک‌گمون: مهره‌ی بازنده در خانه‌ی برنده');
  ok(E.result(fin({}, { 18: 14 }, { 2: 1 })) === 3, 'بک‌گمون: مهره‌ی بازنده روی بار');
  ok(E.result(fin({}, { 18: 14 })) === 1, 'برد ساده: بازنده یک مهره بیرون برده');

  // ------------------------------------------- شروع، تاس و برگرداندن
  let openOk = true;
  for (let s = 0; s < 300; s++) {
    const g = E.newGame(s * 2654435761);
    const [a, b] = g.opening;
    if (a === b || a < 1 || a > 6 || b < 1 || b > 6 || g.turn !== (a > b ? 1 : 2) || g.left.join() !== a + ',' + b) openOk = false;
  }
  ok(openOk, 'شروع: هر طرف یک تاس، مساوی دوباره، بزرگ‌تر با همان دو تاس شروع می‌کند');
  const u = E.newGame(777);
  const before = JSON.stringify(u);
  const first = E.legal(u)[0];
  ok(!!E.play(u, first) && E.undo(u) && JSON.stringify(u) === before, 'برگرداندن: وضعیت و تاس دقیقاً همان پیش از حرکت');
  ok(E.undo(u) === false, 'برگرداندن: اول نوبت چیزی برای برگرداندن نیست');
  while (!E.canEnd(u)) E.play(u, E.legal(u)[0]);
  ok(E.endTurn(u) && u.dice.join() === E.rollFor(777, 2).join() && u.hist.length === 0, 'تاس نوبت بعد از بذر و شماره‌ی نوبت می‌آید');
  ok(E.undo(u) === false, 'برگرداندن از مرز نوبت عقب‌تر نمی‌رود');

  // ------------------------------------- بازی‌های کامل هوش مصنوعی
  function match(seed, l1, l2, check) {
    const S = E.newGame(seed);
    let turns = 0, maxMs = 0, bad = '';
    const log = [];
    while (!S.winner && turns < 1000) {
      const t0 = Date.now();
      const steps = E.aiPlay(S, S.turn === 1 ? l1 : l2);
      maxMs = Math.max(maxMs, Date.now() - t0);
      log.push(S.dice.join('') + ':' + steps.map((m) => m.from + '-' + m.to).join(','));
      for (const m of steps) {
        if (!E.play(S, m)) { bad = bad || 'حرکت رد شد ' + JSON.stringify(m); break; }
        if (check && (E.count(S, 1) !== 15 || E.count(S, 2) !== 15)) bad = bad || 'تعداد مهره عوض شد';
        if (S.winner) break;
      }
      if (bad) break;
      if (!S.winner && !E.endTurn(S)) { bad = 'پایان نوبت ممکن نبود'; break; }
      turns++;
    }
    return { winner: S.winner, kind: E.result(S), turns, maxMs, bad, log: log.join(' ') };
  }
  let maxMs = 0, allEnd = true, allOk = true, kinds = new Set();
  const levels = ['easy', 'medium', 'hard'];
  for (let i = 0; i < 24; i++) {
    const r = match(i * 104729 + 7, levels[i % 3], levels[(i + 1) % 3], true);
    maxMs = Math.max(maxMs, r.maxMs);
    if (!r.winner) allEnd = false;
    if (r.bad) { allOk = false; console.log('    ' + r.bad); }
    kinds.add(r.kind);
  }
  ok(allOk, 'بازی‌های خودکار: هر حرکت پذیرفته شد و هر طرف همیشه ۱۵ مهره داشت');
  ok(allEnd, 'بازی‌های خودکار: همه به پایان رسیدند');
  ok([...kinds].every((k) => k >= 1 && k <= 3), 'بازی‌های خودکار: نتیجه ساده، مارس یا بک‌گمون است (' + [...kinds].join(',') + ')');

  function series(a, b, n) {
    let wins = 0;
    for (let i = 0; i < n; i++) {
      const swap = i % 2 === 1;
      const r = swap ? match(i * 7919 + 11, b, a) : match(i * 7919 + 11, a, b);
      maxMs = Math.max(maxMs, r.maxMs);
      if (r.winner === (swap ? 2 : 1)) wins++;
    }
    return wins;
  }
  const hm2 = series('hard', 'medium', 200);
  ok(hm2 > 110, 'سخت از متوسط قوی‌تر است (' + hm2 + '/200)');
  const me = series('medium', 'easy', 30);
  ok(me > 15, 'متوسط از آسان قوی‌تر است (' + me + '/30)');
  ok(maxMs < 900, 'زمان فکر هوش مصنوعی در هر نوبت قابل قبول است (' + maxMs + 'ms)');
  console.log('  سخت در برابر متوسط ' + hm2 + '/200، متوسط در برابر آسان ' + me + '/30، بیشینه‌ی فکر ' + maxMs + 'ms');

  // ------------------------------------------ روزانه و ادامه‌ی بازی
  const d1 = match(0xC0FFEE, 'hard', 'hard'), d2 = match(0xC0FFEE, 'hard', 'hard'), d3 = match(0xC0FFEF, 'hard', 'hard');
  ok(d1.log.length > 0 && d1.log === d2.log, 'یک بذر روزانه همیشه همان بازی را می‌دهد');
  ok(d1.log !== d3.log, 'بذر دیگر بازی دیگری می‌دهد');
  // بازی ذخیره‌شده و برگشته همان آینده را دارد
  const live = E.newGame(4242);
  for (let t = 0; t < 6; t++) { for (const m of E.aiPlay(live, 'hard')) E.play(live, m); E.endTurn(live); }
  const resumed = JSON.parse(JSON.stringify(live));
  const fut = (S) => { const out = []; for (let t = 0; t < 8 && !S.winner; t++) { const st = E.aiPlay(S, 'medium'); out.push(S.dice.join('') + st.map((m) => m.from + '-' + m.to).join()); for (const m of st) E.play(S, m); E.endTurn(S); } return out.join('|'); };
  ok(fut(live) === fut(resumed), 'بازی ادامه‌داده‌شده همان تاس‌ها و همان آینده را دارد');

  // صفحه باید از موتور بگذرد و تاس روزانه را از هسته بگیرد
  const bgHtml = fs.readFileSync(path.join(ROOT, 'www/games/backgammon/index.html'), 'utf8');
  const page = bgHtml.slice(bgHtml.indexOf('/* ==== ENGINE END ==== */'));
  ok(page.length > 1000, 'بخش صفحه‌ی تخته‌نرد خوانده شد');
  ok(/E\.play\(S, m\)/.test(page) && /E\.undo\(S\)/.test(page) && /E\.endTurn\(S\)/.test(page), 'صفحه حرکت، برگرداندن و پایان نوبت را با موتور انجام می‌دهد');
  ok(/C\.daily\('backgammon', daily\)\.seed/.test(page), 'تاس روزانه از بذر هسته می‌آید');
  ok(!/Math\.random\(\)[^\n]*dice|rollFor/.test(page), 'صفحه خودش تاس نمی‌ریزد');

  // اعلان شروع: «تو» دوم‌شخص است و «You starts» / «تو شروع می‌کند» غلط بود (#115)
  const fnBody = (name) => {
    const at = page.indexOf('function ' + name + '(');
    if (at < 0) return '';
    let d = 0;
    for (let i = page.indexOf('{', at); i < page.length; i++) {
      if (page[i] === '{') d++;
      else if (page[i] === '}' && --d === 0) return page.slice(at, i + 1);
    }
    return '';
  };
  const stSrc = fnBody('startsTitle'), pnSrc = fnBody('pname');
  ok(stSrc && pnSrc, 'startsTitle و pname در صفحه‌ی تخته‌نرد هستند');
  const title = (profileName, i) => {
    const fakeC = { state: { profile: { name: profileName } }, t: (k, o) => '<' + k + (o && o.n ? ':' + o.n : '') + '>' };
    try {
      return vm.runInNewContext('(function (C, S, prefs) { ' + stSrc + pnSrc + ' return startsTitle; })', {})(
        fakeC, { mode: 'ai', level: 'hard' }, { p2name: '' })(i);
    } catch (e) { return 'خطا: ' + e.message; }
  };
  ok(title('', 1) === '<youStart>', 'بی‌نام و شروع با خودت: «تو شروع می‌کنی» (' + title('', 1) + ')');
  ok(title('Sara', 1) === '<starts:Sara>', 'با نام پروفایل: «{n} شروع می‌کند»');
  ok(title('', 2) === '<starts:<rival> · <hard>>', 'حریف: سوم‌شخص می‌ماند');
  const str = (lang, key) => { const m = bgHtml.match(new RegExp(key + ": '([^']*)'", 'g')); return m ? m.map((x) => x.split(": '")[1].slice(0, -1)) : []; };
  ok(JSON.stringify(str('', 'youStart')) === JSON.stringify(['تو شروع می‌کنی', 'You start', 'Zaczynasz', '你先走', 'Du fängst an', 'Empiezas tú']), 'youStart reads right in every language');

  // Rotating the board (#378): the page's own geometry and mapping. Every point's centre, the bar
  // and each tray, carried to the screen and back in each quarter turn, must hit the same target.
  const consts = (page.match(/var BAR_K = [^;]+;/) || [''])[0];
  const mapSrc = ['toBoard', 'fromBoard', 'geo', 'rowOf', 'rightCol', 'rowY', 'targetAt'].map(fnBody);
  ok(consts && mapSrc.every(Boolean), 'the board\'s geometry, targetAt and the rotation mapping are in the page (#378)');
  if (consts && mapSrc.every(Boolean)) {
    const mk = vm.runInNewContext('(function (C, S, cw, ch) { ' + consts + mapSrc.join('\n') + ' return { toBoard: toBoard, fromBoard: fromBoard, geo: geo, rowY: rowY, rowOf: rowOf, rightCol: rightCol, targetAt: targetAt }; })', {});
    let tried = 0, hit = 0;
    const misses = [];
    for (const [W0, H0] of [[300, 480], [221, 357]]) {
      const M = mk({ clamp: (v, a, b) => Math.max(a, Math.min(b, v)) }, { turn: 1 }, W0, H0), G = M.geo(W0, H0);
      const spots = [];
      for (let a = 1; a <= 24; a++) spots.push([a, M.rightCol(a) ? G.x0 + G.bw * 0.75 : G.x0 + G.bw * 0.25, M.rowY(G, M.rowOf(a)) + G.rh / 2]);
      spots.push(['bar', G.x0 + G.bw * 0.3, G.barY + G.barH / 2], ['off', G.x0 + G.bw * 0.75, G.trayY + G.trayH / 2]);
      for (let rot = 0; rot < 4; rot++) {
        const SW = rot % 2 ? H0 : W0, SH = rot % 2 ? W0 : H0;
        for (const [want, u, v] of spots) {
          const scr = M.fromBoard(u, v, rot, SW, SH), back = M.toBoard(scr[0], scr[1], rot, SW, SH);
          const inside = scr[0] >= 0 && scr[0] <= SW && scr[1] >= 0 && scr[1] <= SH;
          tried++;
          if (inside && M.targetAt(back[0], back[1]) === want) hit++; else misses.push(rot + ':' + want);
        }
      }
    }
    ok(tried === 208 && hit === tried, 'in all four rotations every point, the bar and the tray map to the screen and back onto themselves (' + hit + ' of ' + tried + (misses.length ? '; ' + misses.slice(0, 4).join(', ') : '') + ')');
    // a quarter turn really turns: point 1's corner of the board is somewhere else on screen each time
    const M2 = mk({ clamp: (v, a, b) => Math.max(a, Math.min(b, v)) }, { turn: 1 }, 300, 480);
    const at = [0, 1, 2, 3].map((rot) => M2.fromBoard(280, 20, rot, rot % 2 ? 480 : 300, rot % 2 ? 300 : 480).map(Math.round).join(','));
    ok(new Set(at).size === 4, 'each quarter turn puts the board somewhere new on screen (' + at.join(' | ') + ')');
  }
  ok(/var b = toBoard\(ev\.clientX - rc\.left, ev\.clientY - rc\.top, quarter\(\), sw, sh\);\s*tapTarget\(targetAt\(b\[0\], b\[1\]\)\);/.test(page),
    'a tap goes through the rotation before it is matched to a point');
  ok(/boardBox\.style\.setProperty\('--fit-ar', side \? String\(1 \/ 0\.64\) : '0\.64'\)/.test(page) && /prefs\.rot = \(quarter\(\) \+ 1\) % 4;\s*ctx\.store\.set\('prefs', prefs\);/.test(page),
    'the slot takes the turned shape at 90 and 270 degrees, and the turn is kept in prefs');
  ok(/g\.rotate\(upright\);\s*g\.fillText\(txt, 0, 1\);/.test(page) && /function drawDie\(g, x, y, s, v, pc, faded, spin\) \{\s*g\.save\(\); g\.translate\(x, y\); g\.rotate\(upright \+ \(spin \|\| 0\)\);/.test(page),
    'numbers and dice turn back so they stay upright');
  ok(LOCALE_CODES.every((l) => new RegExp('\\n      ' + l + ": \\{[\\s\\S]*?rotateBoard: '[^']+'").test(bgHtml)), 'the rotate button is labelled in every language');
}

/* ------------------------------------------------------------- دوز */
function testMorris() {
  head('دوز');
  const E = loadEngine('morris', 'MorrisEngineFactory');

  // تخته از روی قاعده، مستقل از موتور: ۳۲ یال و ۱۶ سه‌تایی
  const EDGES = [
    [0, 1], [1, 2], [2, 14], [14, 23], [23, 22], [22, 21], [21, 9], [9, 0],
    [3, 4], [4, 5], [5, 13], [13, 20], [20, 19], [19, 18], [18, 10], [10, 3],
    [6, 7], [7, 8], [8, 12], [12, 17], [17, 16], [16, 15], [15, 11], [11, 6],
    [1, 4], [4, 7], [9, 10], [10, 11], [12, 13], [13, 14], [16, 19], [19, 22]
  ];
  const MILLS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11], [12, 13, 14], [15, 16, 17], [18, 19, 20], [21, 22, 23],
    [0, 9, 21], [3, 10, 18], [6, 11, 15], [1, 4, 7], [16, 19, 22], [8, 12, 17], [5, 13, 20], [2, 14, 23]
  ];
  ok(EDGES.length === 32 && MILLS.length === 16, 'فهرست‌های مرجع آزمون کامل‌اند');
  ok(E.N === 24 && E.ADJ.length === 24, 'تخته ۲۴ نقطه دارد');
  let sym = true, onLine = true, deg = 0;
  for (let a = 0; a < 24; a++) {
    for (const b of E.ADJ[a]) {
      deg++;
      if (E.ADJ[b].indexOf(a) < 0) sym = false;
      if (E.XY[a][0] !== E.XY[b][0] && E.XY[a][1] !== E.XY[b][1]) onLine = false;
    }
  }
  ok(sym, 'همسایگی دوطرفه است');
  ok(onLine, 'هر دو همسایه روی یک خط افقی یا عمودی‌اند');
  ok(deg === 64, 'مجموع درجه‌ها ۶۴ است، یعنی ۳۲ یال (' + deg + ')');
  const edgeKey = (a, b) => Math.min(a, b) + '-' + Math.max(a, b);
  const want = new Set(EDGES.map((e) => edgeKey(e[0], e[1])));
  const got = new Set();
  E.ADJ.forEach((ns, a) => ns.forEach((b) => got.add(edgeKey(a, b))));
  ok(want.size === got.size && [...want].every((k) => got.has(k)), 'همسایگی دقیقاً همان ۳۲ یال تخته است');
  const millKey = (m) => m.slice().sort((x, y) => x - y).join(',');
  const wantM = new Set(MILLS.map(millKey));
  ok(E.MILLS.length === 16 && E.MILLS.every((m) => wantM.has(millKey(m))), 'هر ۱۶ سه‌تایی درست فهرست شده‌اند');
  ok(E.MILLS_OF.every((ms) => ms.length === 2), 'هر نقطه دقیقاً در دو سه‌تایی است');

  const B = (p1, p2) => { const b = new Array(24).fill(0); p1.forEach((q) => { b[q] = 1; }); p2.forEach((q) => { b[q] = 2; }); return b; };
  const st = (p1, p2, hand, turn, mode) => {
    const S = E.newState(mode || '2p', 'medium');
    S.board = B(p1, p2); S.hand = hand.slice(); S.turn = turn;
    S.reps = {}; S.reps[E.key(S)] = 1;
    return S;
  };

  // تشخیص سه‌تایی
  let b = B([0, 1], [9]);
  ok(E.formsMill(b, 1, 2, -1), 'گذاشتن سومی روی ۰-۱-۲ سه‌تایی است');
  ok(!E.formsMill(b, 1, 14, -1), 'نقطه‌ی بی‌ربط سه‌تایی نمی‌سازد');
  b = B([0, 1, 14], []);
  ok(!E.formsMill(b, 1, 2, 1), 'مهره‌ای که از خود خط می‌رود سه‌تایی همان خط را نمی‌سازد');
  ok(E.formsMill(b, 1, 2, 14), 'آمدن از ۱۴ به ۲ سه‌تایی ۰-۱-۲ را می‌بندد');

  // قاعده‌ی برداشت
  b = B([], [3, 4, 5, 21]);
  ok(E.removable(b, 2).join() === '21', 'مهره‌های داخل سه‌تایی در امان‌اند');
  b = B([], [3, 4, 5, 18, 10]);
  ok(E.removable(b, 2).join() === '3,4,5,10,18', 'وقتی همه داخل سه‌تایی‌اند، هر کدام برداشتنی است');
  b = B([0, 1], [3, 4, 5, 21]);
  const toTwo = E.movesOf(b, [0, 7, 5], 1).filter((m) => m.to === 2);
  ok(toTwo.length === 1 && toTwo[0].remove === 21, 'حرکت سه‌تایی فقط با برداشت مجاز می‌آید');
  const S0 = st([0, 1], [3, 4, 5, 21], [0, 7, 5], 1);
  ok(!E.isLegal(S0, { from: -1, to: 2, remove: -1 }), 'سه‌تایی بدون برداشت غیرمجاز است');
  ok(!E.isLegal(S0, { from: -1, to: 2, remove: 4 }), 'برداشت از سه‌تایی حریف غیرمجاز است');
  ok(E.isLegal(S0, { from: -1, to: 2, remove: 21 }), 'برداشت مهره‌ی آزاد مجاز است');

  // پرواز و جابه‌جایی
  b = B([0, 4, 17], [1, 9, 13, 20]);
  ok(E.phaseOf(b, [0, 0, 0], 1) === 'fly' && E.phaseOf(b, [0, 0, 0], 2) === 'move', 'سه مهره یعنی پرواز، چهار مهره یعنی جابه‌جایی');
  ok(E.steps(b, [0, 0, 0], 1).length === 3 * 17, 'پرواز به هر ۱۷ نقطه‌ی خالی برای هر سه مهره');
  const s2 = E.steps(b, [0, 0, 0], 2).map((s) => s.join('>')).sort().join(' ');
  ok(s2 === ['1>2', '9>10', '9>21', '13>5', '13>12', '13>14', '20>19'].sort().join(' '), 'جابه‌جایی فقط به همسایه‌ی خالی (' + s2 + ')');
  ok(E.phaseOf(b, [0, 1, 0], 1) === 'place', 'تا مهره در دست هست، مرحله گذاشتن است');
  const Sf = st([0, 4, 17], [1, 9, 13, 20], [0, 0, 0], 1);
  ok(E.isLegal(Sf, { from: 17, to: 23, remove: -1 }), 'با سه مهره پرواز به نقطه‌ی دور مجاز است');
  const Sm = st([0, 4, 17, 6], [1, 9, 13, 20], [0, 0, 0], 1);
  ok(!E.isLegal(Sm, { from: 17, to: 23, remove: -1 }), 'با چهار مهره پرواز مجاز نیست');

  // باخت با دو مهره
  const Sp = st([0, 1, 14, 21], [6, 7, 16], [0, 0, 0], 1);
  let r = E.apply(Sp, { from: 14, to: 2, remove: 16 });
  ok(r && r.winner === 1 && r.why === 'pieces', 'حریفی که به دو مهره برسد می‌بازد');
  // باخت با بسته شدن راه: ۲ چهار مهره دارد و همه‌ی همسایه‌هایش پر می‌شود
  const Sb = st([1, 9, 14, 19], [0, 2, 21, 23], [0, 0, 0], 1);
  ok(E.hasMove(Sb.board, Sb.hand, 2), 'پیش از حرکت، حریف راه دارد');
  r = E.apply(Sb, { from: 19, to: 22, remove: -1 });
  ok(r && r.winner === 1 && r.why === 'blocked', 'حریف بی‌راه حرکت می‌بازد');
  // همان وضعیت با سه مهره‌ی حریف بسته نیست چون پرواز می‌کند
  const Sb3 = st([1, 9, 14, 19], [0, 2, 21], [0, 0, 0], 1);
  r = E.apply(Sb3, { from: 19, to: 22, remove: -1 });
  ok(r === null, 'حریف سه‌مهره‌ای با پرواز گیر نمی‌افتد');

  // پنجاه حرکت بدون سه‌تایی
  const Sq = st([0, 5, 18, 16], [23, 6, 20, 11], [0, 0, 0], 1);
  Sq.quiet = E.FIFTY - 1;
  r = E.apply(Sq, { from: 0, to: 1, remove: -1 });
  ok(E.FIFTY === 50 && r && r.winner === 0 && r.why === 'fifty', 'پنجاهمین حرکت بدون سه‌تایی مساوی است');
  const Sq2 = st([0, 1, 14, 21, 3], [6, 7, 16, 18], [0, 0, 0], 1);
  Sq2.quiet = E.FIFTY - 1;
  r = E.apply(Sq2, { from: 14, to: 2, remove: 16 });
  ok(r === null && Sq2.quiet === 0, 'سه‌تایی شمارنده‌ی پنجاه را صفر می‌کند');
  const Sq3 = st([0], [5], [0, 3, 3], 1);
  E.apply(Sq3, { from: -1, to: 9, remove: -1 });
  ok(Sq3.quiet === 0, 'گذاشتن مهره در شمارنده‌ی پنجاه حساب نمی‌شود');

  // تکرار سه‌باره
  const Sr = st([0, 5, 18, 16], [23, 6, 20, 11], [0, 0, 0], 1);
  const loop = [{ from: 0, to: 1 }, { from: 23, to: 14 }, { from: 1, to: 0 }, { from: 14, to: 23 }];
  let rr = null;
  for (let i = 0; i < 4; i++) rr = E.apply(Sr, Object.assign({ remove: -1 }, loop[i]));
  ok(rr === null && Sr.reps[E.key(Sr)] === 2, 'دومین بار یک وضعیت هنوز مساوی نیست');
  for (let i = 0; i < 3; i++) rr = E.apply(Sr, Object.assign({ remove: -1 }, loop[i]));
  ok(rr === null, 'پیش از سومین تکرار بازی ادامه دارد');
  rr = E.apply(Sr, Object.assign({ remove: -1 }, loop[3]));
  ok(rr && rr.winner === 0 && rr.why === 'repeat', 'سومین تکرار یک وضعیت مساوی است');

  // برگرداندن: سه‌تایی و برداشتش یک قدم‌اند؛ دونفره یک حرکت، با حریف تا نوبت بازیکن
  const snap = (S) => JSON.stringify([S.board, S.hand, S.turn, S.quiet, S.reps, S.history, S.result]);
  const two = st([0, 1], [3, 4, 5, 21], [0, 7, 5], 1);
  const before = snap(two);
  E.apply(two, { from: -1, to: 2, remove: 21 });
  ok(two.board[21] === 0 && two.board[2] === 1 && two.turn === 2, 'سه‌تایی و برداشت با هم ثبت شدند');
  ok(E.takeBack(two) === 1 && snap(two) === before, 'دونفره: یک برگرداندن سه‌تایی و برداشتش را با هم برمی‌گرداند');
  ok(E.takeBack(two) === 0 && snap(two) === before, 'روی تاریخچه‌ی خالی برگرداندن کاری نمی‌کند');
  const ai = st([0, 1], [3, 4, 5, 21], [0, 7, 5], 1, 'ai');
  E.apply(ai, { from: -1, to: 9, remove: -1 });
  E.apply(ai, { from: -1, to: 22, remove: -1 });
  const humanTurn = snap(ai);
  E.apply(ai, { from: -1, to: 2, remove: 21 });
  E.apply(ai, { from: -1, to: 23, remove: -1 });
  ok(ai.turn === 1 && E.takeBack(ai) === 2 && snap(ai) === humanTurn, 'با حریف: برگرداندن تا نوبت قبلی بازیکن عقب می‌رود');

  // بازی‌های بذری: پایان، پایستگی مهره، مجاز بودن هر حرکت، قدرت سطح‌ها
  let maxMs = 0, allLegal = true, conserved = true, allEnded = true;
  function match(a, c, seed) {
    const S = E.newState('2p', 'medium');
    const rnd = rng(seed);
    const lost = [0, 0, 0];
    let guard = 0;
    while (!S.result) {
      if (guard++ > 1500) { allEnded = false; break; }
      const t0 = Date.now();
      const m = E.aiMove(S, S.turn === 1 ? a : c, rnd);
      maxMs = Math.max(maxMs, Date.now() - t0);
      if (!m || !E.isLegal(S, m)) { allLegal = false; break; }
      if (m.remove >= 0) lost[E.other(S.turn)]++;
      E.apply(S, m);
      for (const p of [1, 2]) if (E.countOf(S.board, p) + S.hand[p] + lost[p] !== 9) conserved = false;
    }
    return S.result ? S.result.winner : -1;
  }
  function series(strong, weak, n, seed0) {
    let w = 0, l = 0;
    for (let i = 0; i < n; i++) {
      const flip = i % 2 === 1;
      const res = flip ? match(weak, strong, seed0 + i * 977) : match(strong, weak, seed0 + i * 977);
      const sw = flip ? 2 : 1;
      if (res === sw) w++; else if (res > 0) l++;
    }
    return { w, l, n };
  }
  const easyGames = series('easy', 'easy', 12, 11);
  ok(easyGames.n === 12, 'بازی‌های آسان-آسان اجرا شدند');
  const hm = series('hard', 'medium', 8, 501);
  ok(hm.w > hm.n / 2 && hm.w > hm.l, 'سخت از متوسط قوی‌تر است (' + hm.w + ' برد، ' + hm.l + ' باخت از ' + hm.n + ')');
  const me = series('medium', 'easy', 10, 901);
  ok(me.w > me.n / 2 && me.w > me.l, 'متوسط از آسان قوی‌تر است (' + me.w + ' برد، ' + me.l + ' باخت از ' + me.n + ')');
  ok(allEnded, 'همه‌ی بازی‌های بذری تمام شدند');
  ok(allLegal, 'هر حرکت هوش مصنوعی مجاز بود');
  ok(conserved, 'مهره‌ها پایسته‌اند: روی تخته + در دست + برداشته = ۹');
  ok(maxMs < 900, 'زمان فکر هوش مصنوعی قابل قبول است (' + maxMs + 'ms)');

  // روزانه: یک تاریخ، یک بازی
  const daily = (seed) => {
    const S = E.dailyStart(rng(seed));
    const open = JSON.stringify([S.board, S.hand, S.turn]);
    for (let i = 0; i < 12 && !S.result; i++) E.apply(S, E.aiMove(S, 'hard', rng(seed + 1 + S.history.length)));
    return { open, moves: JSON.stringify(S.history.map((h) => h.m)), S0: E.dailyStart(rng(seed)) };
  };
  const d1 = daily(2026), d2 = daily(2026);
  ok(d1.open === d2.open && d1.moves === d2.moves, 'روزانه: یک بذر همیشه همان گشایش و همان حرکت‌های حریف را می‌دهد');
  ok(d1.S0.history.length === 0 && d1.S0.hand[1] === 7 && d1.S0.hand[2] === 7 &&
    E.countOf(d1.S0.board, 1) === 2 && E.countOf(d1.S0.board, 2) === 2, 'روزانه: گشایش دو مهره‌ی هر طرف است و جزو تاریخچه نیست');
  const opens = new Set([1, 2, 3, 4, 5, 6].map((s) => daily(s * 7919).open));
  ok(opens.size >= 4, 'روزانه: روزهای مختلف گشایش‌های مختلف دارند (' + opens.size + '/6)');
  const starts = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => E.dailyStart(rng(s * 31)).turn));
  ok(starts.size === 2, 'روزانه: گاهی بازیکن و گاهی حریف شروع می‌کند');

  // صفحه باید از همین تابع‌های موتور استفاده کند، نه منطق خودش را
  const html = fs.readFileSync(path.join(ROOT, 'www/games/morris/index.html'), 'utf8');
  ok(/E\.apply\(S, m\)/.test(html), 'صفحه حرکت را با apply ثبت می‌کند');
  ok(/E\.takeBack\(S\)/.test(html), 'صفحه برگرداندن را با takeBack انجام می‌دهد');
  ok(/E\.dailyStart\(C\.daily\('morris', daily\)\.rng\)/.test(html), 'صفحه روزانه را از بذر تاریخ می‌سازد');
}

/* ----------------------------------------------------- نبرد دریایی */
function testBattleship() {
  head('نبرد دریایی');
  const E = loadEngine('battleship', 'BattleshipEngineFactory');
  const N = 10;
  ok(E.N === N && E.FLEET.join() === '5,4,3,3,2', 'تخته ۱۰×۱۰ و ناوگان ۵، ۴، ۳، ۳، ۲ است');

  // بررسی مستقل از موتور: خانه‌ها و فاصله‌ی چبیشف را خود آزمون حساب می‌کند
  const cells = (s) => Array.from({ length: s.len }, (_, k) => [s.r + (s.v ? k : 0), s.c + (s.v ? 0 : k)]);
  function legal(ships) {
    if (ships.length !== 5) return 'تعداد';
    if (ships.map((s) => s.len).sort().join() !== '2,3,3,4,5') return 'اندازه‌ها';
    for (const s of ships) for (const [r, c] of cells(s)) if (r < 0 || r >= N || c < 0 || c >= N) return 'بیرون تخته';
    for (let a = 0; a < ships.length; a++) {
      for (let b = a + 1; b < ships.length; b++) {
        for (const [r1, c1] of cells(ships[a])) {
          for (const [r2, c2] of cells(ships[b])) {
            if (Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2)) <= 1) return 'چسبیده یا روی هم';
          }
        }
      }
    }
    return '';
  }

  // چیدمان دستی با جواب معلوم
  const hand = [
    { r: 0, c: 0, len: 5, v: false },   // ردیف ۰، ستون ۰ تا ۴
    { r: 2, c: 0, len: 4, v: true },    // ستون ۰، ردیف ۲ تا ۵
    { r: 2, c: 2, len: 3, v: false },   // ردیف ۲، ستون ۲ تا ۴
    { r: 9, c: 7, len: 3, v: false },   // ردیف ۹، ستون ۷ تا ۹
    { r: 5, c: 9, len: 2, v: true }     // ستون ۹، ردیف ۵ و ۶
  ];
  ok(legal(hand) === '' && E.validFleet(hand), 'چیدمان دستی با یک خانه فاصله مجاز است');
  const without = (i) => hand.map((s, k) => (k === i ? null : s));
  ok(!E.canPlace(without(2), { r: 1, c: 5, len: 3, v: false }, 2), 'کشتی که از گوشه به کشتی دیگر بچسبد رد می‌شود');
  ok(!E.canPlace(without(2), { r: 1, c: 2, len: 3, v: false }, 2), 'کشتی که از پهلو بچسبد رد می‌شود');
  ok(!E.canPlace(without(2), { r: 0, c: 3, len: 3, v: true }, 2), 'کشتی روی کشتی دیگر رد می‌شود');
  ok(!E.canPlace(without(2), { r: 4, c: 8, len: 3, v: false }, 2), 'کشتی بیرون‌زده از تخته رد می‌شود');
  ok(!E.canPlace(without(2), { r: 8, c: 2, len: 3, v: true }, 2), 'کشتی عمودی بیرون‌زده از پایین رد می‌شود');
  ok(E.canPlace(without(2), { r: 2, c: 2, len: 3, v: true }, 2), 'همان کشتی با یک خانه فاصله جا می‌شود');
  ok(!E.validFleet(hand.slice(0, 4)), 'ناوگان چهارکشتی معتبر نیست');
  ok(!E.validFleet(hand.map((s, k) => (k === 4 ? { r: 8, c: 5, len: 2, v: false } : s))), 'ناوگان با دو کشتی گوشه‌به‌گوشه معتبر نیست');
  ok(!E.validFleet(hand.map((s, k) => (k === 4 ? { r: 5, c: 9, len: 3, v: true } : s))), 'ناوگان با اندازه‌ی اشتباه معتبر نیست');

  // ناوگان تصادفی همیشه قانونی است
  const fleets = [];
  for (let i = 0; i < 300; i++) fleets.push(E.randomFleet(rng(i * 7919 + 11)));
  ok(fleets.length === 300, 'فهرست ناوگان‌های تصادفی خالی نیست');
  const badFleets = fleets.map(legal).filter((x) => x);
  ok(badFleets.length === 0, 'هر ۳۰۰ ناوگان تصادفی قانونی‌اند' + (badFleets.length ? ' (' + badFleets[0] + ')' : ''));
  ok(fleets.every((f) => E.validFleet(f)), 'موتور هم همه را معتبر می‌داند');
  ok(new Set(fleets.map((f) => JSON.stringify(f))).size > 290, 'ناوگان‌های تصادفی واقعاً گوناگون‌اند');

  // شلیک روی تخته‌ی دستی: جواب از روی چیدمان معلوم است
  const b = E.makeBoard(hand);
  ok(E.fire(b, 77).result === 'miss' && b.shots[77] === 1, 'شلیک به آب: آب');
  ok(E.fire(b, 0).result === 'hit' && b.shots[0] === 2, 'شلیک به کشتی: اصابت');
  ok(E.fire(b, 0).result === 'repeat' && !E.canFire(b, 0), 'شلیک دوباره به همان خانه ممنوع است');
  ok(E.fire(b, 59).result === 'hit', 'خانه‌ی اول کشتی دوخانه‌ای: اصابت');
  ok(!b.sunk[4], 'کشتی با یک اصابت غرق نشده');
  ok(E.fire(b, 69).result === 'sunk' && b.sunk[4], 'خانه‌ی آخر کشتی دوخانه‌ای: غرق');
  const blk = E.blocked(b);
  ok([48, 49, 58, 68, 78, 79].every((x) => blk[x] && !E.canFire(b, x)), 'خانه‌های دور کشتی غرق‌شده خالی و بسته‌اند');
  ok(!blk[47] && E.canFire(b, 47) && !blk[0], 'خانه‌ی دورتر بسته نیست');
  ok(!E.allSunk(b), 'با یک کشتی غرق‌شده بازی تمام نشده');
  for (const s of hand) for (const [r, c] of cells(s)) E.fire(b, r * N + c);
  ok(E.allSunk(b) && b.sunk.every(Boolean), 'با زدن همه‌ی خانه‌های کشتی‌ها همه غرق‌اند');
  ok(b.shots.filter((x) => x === 2).length === 17, 'هفده خانه اصابت خورده، به اندازه‌ی کل ناوگان');

  // نوبت‌ها یکی‌یکی‌اند و شلیک بی‌جا نوبت را عوض نمی‌کند
  const G = E.newGame(hand, hand, 'medium');
  ok(E.aiFire(G, rng(1)) === null && G.shots.ai === 0, 'حریف پیش از نوبتش شلیک نمی‌کند');
  const p1 = E.playerFire(G, 0);
  ok(p1 && p1.result === 'hit' && G.turn === 'ai', 'بعد از اصابت هم نوبت به حریف می‌رسد');
  ok(E.playerFire(G, 1) === null && G.shots.me === 1, 'بازیکن در نوبت حریف نمی‌تواند شلیک کند');
  ok(E.aiFire(G, rng(2)) !== null && G.turn === 'me' && G.shots.ai === 1, 'حریف یک شلیک می‌کند و نوبت برمی‌گردد');
  ok(E.playerFire(G, 0) === null && G.turn === 'me', 'شلیک تکراری رد می‌شود و نوبت می‌ماند');

  // هوش مصنوعی جای کشتی‌های پنهان را نمی‌بیند: دو تخته با دانسته‌ی یکسان
  // ولی کشتی‌های متفاوت باید شلیک یکسان بگیرند.
  const other = [
    { r: 0, c: 0, len: 2, v: true }, { r: 3, c: 3, len: 5, v: false }, { r: 5, c: 0, len: 4, v: true },
    { r: 9, c: 2, len: 3, v: false }, { r: 6, c: 6, len: 3, v: true }
  ];
  ok(legal(other) === '', 'چیدمان دوم دستی قانونی است');
  const A = E.makeBoard(hand), B = E.makeBoard(other);
  E.fire(A, 0); E.fire(B, 0); E.fire(A, 77); E.fire(B, 77);
  ok(JSON.stringify(E.knowledge(A)) === JSON.stringify(E.knowledge(B)), 'دانسته‌ی دو تخته یکی است');
  for (const lv of ['easy', 'medium', 'hard']) {
    ok(E.aiShot(E.knowledge(A), lv, rng(5)) === E.aiShot(E.knowledge(B), lv, rng(5)), lv + ': شلیک فقط از دانسته‌ها می‌آید');
  }

  // هدف‌گیری روی وضعیت دستی: اصابت ۴۴ و آب در ۴۳، ۴۵، ۳۴ — تنها ادامه ۵۴ است
  const T = E.makeBoard([{ r: 4, c: 4, len: 3, v: true }, { r: 0, c: 8, len: 2, v: true }, { r: 9, c: 0, len: 5, v: false },
    { r: 0, c: 0, len: 4, v: false }, { r: 6, c: 8, len: 3, v: true }]);
  ok(E.validFleet(T.ships), 'تخته‌ی هدف‌گیری قانونی است');
  for (const x of [44, 43, 45, 34]) E.fire(T, x);
  for (const lv of ['medium', 'hard']) ok(E.aiShot(E.knowledge(T), lv, rng(3)) === 54, lv + ': دنباله‌ی اصابت را می‌زند (۵۴)');
  E.fire(T, 54);
  const nextHard = E.aiShot(E.knowledge(T), 'hard', rng(4));
  ok(nextHard === 64, 'سخت: بعد از دو اصابت عمودی در همان راستا ادامه می‌دهد (آمد ' + nextHard + ')');

  // بازی‌های بذردار: هر کشتی بالاخره غرق می‌شود و قدرت سطح‌ها به ترتیب است
  let maxMs = 0;
  const avg = {};
  for (const lv of ['easy', 'medium', 'hard']) {
    let total = 0, allDone = true, worst = 0;
    const n = 40;
    for (let i = 0; i < n; i++) {
      const r = rng(i * 977 + 5);
      const bd = E.makeBoard(E.randomFleet(r));
      let s = 0;
      while (!E.allSunk(bd) && s < 100) {
        const t0 = Date.now();
        const x = E.aiShot(E.knowledge(bd), lv, r);
        maxMs = Math.max(maxMs, Date.now() - t0);
        if (x < 0 || !E.canFire(bd, x)) { allDone = false; break; }
        E.fire(bd, x);
        s++;
      }
      if (!E.allSunk(bd) || !bd.sunk.every(Boolean)) allDone = false;
      total += s; worst = Math.max(worst, s);
    }
    avg[lv] = total / n;
    ok(allDone && worst <= 100, lv + ': در هر ۴۰ بازی همه‌ی کشتی‌ها غرق شدند (بیشینه ' + worst + ' شلیک)');
  }
  ok(avg.hard < avg.medium && avg.medium < avg.easy,
    'سخت کمتر از متوسط و متوسط کمتر از آسان شلیک لازم دارد (' + avg.hard + ' / ' + avg.medium + ' / ' + avg.easy + ')');
  ok(avg.medium - avg.hard >= 2 && avg.easy - avg.medium >= 20, 'فاصله‌ی سطح‌ها شانسی نیست');
  ok(maxMs < 900, 'زمان فکر هوش مصنوعی قابل قبول است (' + maxMs + 'ms)');

  // دست کامل بازیکن در برابر حریف تا آخر
  let ended = 0;
  for (let i = 0; i < 20; i++) {
    const r = rng(i * 31 + 9);
    const g = E.newGame(E.randomFleet(r), E.randomFleet(r), ['easy', 'medium', 'hard'][i % 3]);
    let guard = 0;
    while (!g.winner && guard++ < 250) {
      if (g.turn === 'me') E.playerFire(g, E.aiShot(E.knowledge(g.foe), 'medium', r));
      else E.aiFire(g, r);
    }
    const loser = g.winner === 'me' ? g.me : g.foe;
    const winnerB = g.winner === 'me' ? g.foe : g.me;
    if (g.winner && E.allSunk(winnerB) && !E.allSunk(loser) && Math.abs(g.shots.me - g.shots.ai) <= 1) ended++;
  }
  ok(ended === 20, 'هر ۲۰ دست بذردار با یک برنده تمام شدند (' + ended + ')');

  // روزانه: ناوگان حریف و ترتیب شلیکش از بذر می‌آید؛ صفحه برای هر شلیک
  // بذر «تاریخ|شماره‌ی شلیک» می‌سازد و همین‌جا شبیه‌سازی می‌شود.
  function daily(seed) {
    const g = E.newGame(hand, E.randomFleet(rng(seed)), 'medium');
    let q = 0;
    while (!g.winner && q < 250) {
      if (g.turn === 'me') {
        let x = 0;
        while (!E.canFire(g.foe, x)) x++;
        E.playerFire(g, x);
      } else E.aiFire(g, rng(seed * 1000 + g.shots.ai));
      q++;
    }
    return JSON.stringify([g.foe.ships, g.log]);
  }
  ok(daily(20261002) === daily(20261002), 'روزانه: یک تاریخ همان ناوگان و همان شلیک‌ها را می‌دهد');
  ok(daily(20261002) !== daily(20261003), 'روزانه: تاریخ دیگر دست دیگری است');

  // صفحه از همین موتور استفاده می‌کند و برگرداندن ندارد (شلیک اطلاعات لو می‌دهد)
  const page = fs.readFileSync(path.join(ROOT, 'www/games/battleship/index.html'), 'utf8');
  ok(/E\.playerFire\(S\.G, idx\)/.test(page) && /E\.aiFire\(S\.G, rnd\)/.test(page), 'صفحه شلیک‌ها را با موتور ثبت می‌کند');
  ok(/C\.daily\('battleship', S\.daily\)\.rng/.test(page) && /C\.daily\('battleship', S\.daily \+ '\|' \+ S\.G\.shots\.ai\)/.test(page),
    'صفحه ناوگان و شلیک‌های روزانه را از تاریخ می‌گیرد');
  ok(!/icon: 'undo'/.test(page) && !/takeBack/.test(page), 'نبرد دریایی دکمه‌ی برگرداندن ندارد');
  ok(/ctx\.autosave\(/.test(page), 'صفحه ذخیره‌ی خودکار دارد');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const used = (page.match(/unlock\('([a-z-]+)'\)/g) || []).map((m) => m.split("'")[1]);
  ok(used.length === 3, 'صفحه سه دستاورد باز می‌کند');
  for (const id of used) {
    const row = (core.match(new RegExp("\\{ id: '" + id + "'[^\\n]*\\}")) || [''])[0];
    ok(['fa', 'en', 'zh', 'dfa', 'den', 'dzh'].every((k) => new RegExp('\\b' + k + ": '[^']+'").test(row)), id + ': در جدول دستاوردها با هر سه زبان هست');
  }

  // #304: with the house rule a hit or a sink keeps the turn, only a miss passes it
  {
    const G = E.newGame(hand, hand, 'easy', true);
    let r = E.playerFire(G, 0);
    ok(r.result === 'hit' && G.turn === 'me', 'fire again: a hit keeps your turn');
    r = E.playerFire(G, 1 * N + 5);
    ok(r.result === 'miss' && G.turn === 'ai', 'fire again: a miss passes the turn');
    let k = 0, fine = true;
    while (G.turn === 'ai' && !G.winner && k++ < 200) { const a = E.aiFire(G, rng(70 + k)); if (G.turn !== (a.result === 'miss' ? 'me' : 'ai') && !G.winner) fine = false; }
    ok(k > 0 && fine, 'fire again: the computer keeps firing while it hits and stops at its miss (' + k + ' shots)');
    const H = E.newGame(hand, hand, 'easy', false);
    E.playerFire(H, 0);
    ok(H.turn === 'ai', 'one shot a turn: a hit passes the turn');
    const old = E.newGame(hand, hand, 'easy', true);
    delete old.again;
    E.playerFire(old, 0);
    ok(old.turn === 'ai', 'a game saved before the rule existed keeps one shot a turn');
    const page = fs.readFileSync(path.join(ROOT, 'www/games/battleship/index.html'), 'utf8');
    ok(/if \(typeof prefs\.again !== 'boolean'\) prefs\.again = true;/.test(page) && /E\.newGame\(S\.ships, foeFleet\(\), S\.level, !S\.daily && prefs\.again\)/.test(page) &&
      /\{ value: true, label: C\.t\('hitAgain'\) \}, \{ value: false, label: C\.t\('oneShot'\) \}/.test(page),
      'the rule is on by default, can be switched before the battle, and the daily keeps one shot a turn');
  }
}

/* ------------------------------------------------------------- پل‌ها */
// قانون‌ها اینجا مستقل از موتور دوباره نوشته شده‌اند تا جواب سازنده با
// تعریف بازی سنجیده شود، نه با همان کدی که آن را ساخته (#82).
function bridgesPairs(islands) {
  // همسایه‌های هم‌سطر یا هم‌ستون بدون جزیره‌ی بینشان
  const out = [];
  for (let a = 0; a < islands.length; a++) {
    for (let b = a + 1; b < islands.length; b++) {
      const A = islands[a], B = islands[b];
      if (A.r !== B.r && A.c !== B.c) continue;
      const between = islands.some((P) => P !== A && P !== B && (A.r === B.r
        ? P.r === A.r && P.c > Math.min(A.c, B.c) && P.c < Math.max(A.c, B.c)
        : P.c === A.c && P.r > Math.min(A.r, B.r) && P.r < Math.max(A.r, B.r)));
      if (!between) out.push([a, b]);
    }
  }
  return out;
}
function bridgesCross(islands, p, q) {
  const [A, B] = [islands[p[0]], islands[p[1]]], [C, D] = [islands[q[0]], islands[q[1]]];
  const h1 = A.r === B.r, h2 = C.r === D.r;
  if (h1 === h2) return false;
  const [H1, H2, V1, V2] = h1 ? [A, B, C, D] : [C, D, A, B];
  return V1.c > Math.min(H1.c, H2.c) && V1.c < Math.max(H1.c, H2.c) &&
    H1.r > Math.min(V1.r, V2.r) && H1.r < Math.max(V1.r, V2.r);
}
// links: [[a, b, k]]. خروجی: فهرست قانون‌های شکسته
function bridgesRules(islands, links) {
  const bad = [];
  const pairs = bridgesPairs(islands).map((p) => p.join());
  const sum = islands.map(() => 0);
  const adj = islands.map(() => []);
  for (const [a, b, k] of links) {
    if (pairs.indexOf([Math.min(a, b), Math.max(a, b)].join()) < 0) bad.push('پل ' + a + '-' + b + ' مستقیم و آزاد نیست');
    if (k < 1 || k > 2) bad.push('پل ' + a + '-' + b + ' تعداد ' + k + ' دارد');
    sum[a] += k; sum[b] += k; adj[a].push(b); adj[b].push(a);
  }
  islands.forEach((p, i) => { if (sum[i] !== p.n) bad.push('جزیره‌ی ' + i + ': ' + sum[i] + ' به‌جای ' + p.n); });
  for (let x = 0; x < links.length; x++) {
    for (let y = x + 1; y < links.length; y++) {
      if (bridgesCross(islands, links[x], links[y])) bad.push('پل‌های ' + links[x].slice(0, 2) + ' و ' + links[y].slice(0, 2) + ' هم را قطع می‌کنند');
    }
  }
  const seen = new Set([0]), stack = [0];
  while (stack.length) for (const n of adj[stack.pop()]) if (!seen.has(n)) { seen.add(n); stack.push(n); }
  if (islands.length && seen.size !== islands.length) bad.push('پیوسته نیست (' + seen.size + '/' + islands.length + ')');
  return bad;
}
// جست‌وجوی کامل و ساده، بدون هیچ ترفند موتور، فقط برای تخته‌های کوچک
function bridgesBrute(islands, limit) {
  const pairs = bridgesPairs(islands);
  const vals = pairs.map(() => 0), sum = islands.map(() => 0);
  const lastPair = islands.map(() => -1);
  pairs.forEach((p, i) => { lastPair[p[0]] = i; lastPair[p[1]] = i; });
  let count = 0;
  (function go(i) {
    if (count >= limit) return;
    if (i === pairs.length) {
      const links = pairs.map((p, j) => [p[0], p[1], vals[j]]).filter((l) => l[2] > 0);
      if (bridgesRules(islands, links).length === 0) count++;
      return;
    }
    const [a, b] = pairs[i];
    for (let k = 0; k <= 2; k++) {
      if (sum[a] + k > islands[a].n || sum[b] + k > islands[b].n) break;
      vals[i] = k; sum[a] += k; sum[b] += k;
      // جزیره‌ای که آخرین یالش گذشت باید همین حالا کامل باشد
      if ((lastPair[a] !== i || sum[a] === islands[a].n) && (lastPair[b] !== i || sum[b] === islands[b].n)) go(i + 1);
      sum[a] -= k; sum[b] -= k; vals[i] = 0;
    }
  })(0);
  return count;
}

function testBridges() {
  head('پل‌ها');
  const E = loadEngine('bridges', 'BridgesEngineFactory');
  for (const f of ['build', 'solve', 'generate', 'cycle', 'undo', 'check', 'edgeAt', 'edgeOf']) {
    ok(typeof E[f] === 'function', 'موتور تابع ' + f + ' دارد');
  }
  const links = (g, b) => g.edges.map((e, i) => [e.a, e.b, b[i]]).filter((l) => l[2] > 0);

  // پازل دستی T: یک ۱، یک ۴، یک ۲ و یک ۱. تنها جواب: ۱ و ۲ و ۱ پل از ۴.
  const t = E.build(5, [{ r: 0, c: 0, n: 1 }, { r: 0, c: 2, n: 4 }, { r: 0, c: 4, n: 2 }, { r: 3, c: 2, n: 1 }]);
  const tr = E.solve(t, 2);
  ok(tr.count === 1, 'پازل T دقیقاً یک جواب دارد (' + tr.count + ')');
  const want = { '0-1': 1, '1-2': 2, '1-3': 1 };
  ok(!!tr.solution && t.edges.every((e, i) => (want[e.a + '-' + e.b] || 0) === tr.solution[i]),
    'حل‌کننده جواب شناخته‌شده‌ی پازل T را می‌دهد');

  // چهار جزیره‌ی ۲ در گوشه‌ها: پل دوتایی هم شمارها را درست می‌کند ولی دو تکه می‌شود،
  // پس تنها جواب حلقه‌ی پل‌های تکی است. اینجا قانون پیوستگی کار اصلی را می‌کند.
  const sq = E.build(3, [{ r: 0, c: 0, n: 2 }, { r: 0, c: 2, n: 2 }, { r: 2, c: 0, n: 2 }, { r: 2, c: 2, n: 2 }]);
  ok(sq.edges.length === 4, 'مربع چهار یال دارد');
  const sr = E.solve(sq, 2);
  ok(sr.count === 1 && !!sr.solution && sr.solution.every((v) => v === 1), 'مربع ۲ها: تنها جواب حلقه‌ی پل‌های تکی است');
  const split = sq.edges.map((e) => (e.h ? 2 : 0));
  const cs = E.check(sq, split);
  ok(cs.counts === true, 'دو پل دوتایی افقی شمار همه‌ی جزیره‌ها را درست می‌کند');
  ok(cs.connected === false && cs.solved === false, 'برد رد می‌شود: شمارها درست ولی شبکه دو تکه است');
  ok(bridgesRules(sq.islands, links(sq, split)).length > 0, 'قانون مستقل هم آن را رد می‌کند');
  ok(E.check(sq, [1, 1, 1, 1]).solved === true, 'حلقه‌ی تکی برد است');
  ok(E.check(sq, [1, 1, 1, 0]).solved === false, 'شمار ناقص برد نیست');

  // نردبان ۲ ۳ ۱ / ۲ ۳ ۱: شمارها دو جواب دارند، دو ردیف جدا با پل دوتایی یا
  // نردبان پیوسته. قاعده‌های پیش‌فرض ۱-۱ و ۲-۲ جدا را نمی‌کشند، فقط پیوستگی.
  const ld = E.build(5, [{ r: 0, c: 0, n: 2 }, { r: 0, c: 2, n: 3 }, { r: 0, c: 4, n: 1 },
    { r: 2, c: 0, n: 2 }, { r: 2, c: 2, n: 3 }, { r: 2, c: 4, n: 1 }]);
  const lr = E.solve(ld, 3);
  const ldWant = { '0-1': 1, '1-2': 1, '0-3': 1, '1-4': 1, '3-4': 1, '4-5': 1 };
  ok(lr.count === 1, 'نردبان: حل‌کننده با قانون پیوستگی فقط یک جواب می‌شمارد (' + lr.count + ')');
  ok(!!lr.solution && ld.edges.every((e, i) => (ldWant[e.a + '-' + e.b] || 0) === lr.solution[i]),
    'نردبان: حل‌کننده جواب پیوسته‌ی شناخته‌شده را می‌دهد');
  const rows = ld.edges.map((e) => (e.a + '-' + e.b === '0-1' || e.a + '-' + e.b === '3-4' ? 2 : (e.h ? 1 : 0)));
  ok(bridgesRules(ld.islands, links(ld, rows)).join() === 'پیوسته نیست (3/6)', 'نردبان: دو ردیف جدا فقط قانون پیوستگی را می‌شکند');
  ok(E.check(ld, rows).counts === true && E.check(ld, rows).solved === false, 'نردبان: دو ردیف جدا برد نیست');
  // دو پل افقی موازی: لمس نزدیک ردیف بالا مال بالایی است، وسط دو ردیف مال هیچ‌کدام
  ok(E.edgeAt(ld, 1, 0.3) === E.edgeOf(ld, 0, 1), 'لمس نزدیک پل بالا همان پل بالا را می‌دهد');
  ok(E.edgeAt(ld, 1, 1.7) === E.edgeOf(ld, 3, 4), 'لمس نزدیک پل پایین همان پل پایین را می‌دهد');
  ok(E.edgeAt(ld, 1.2, 1) === -1, 'لمس وسط دو ردیف، دور از هر دو پل، یال نیست');

  // صلیب: پل افقی ۰-۱ و عمودی ۲-۳ از خانه‌ی (۱،۲) رد می‌شوند
  const x = E.build(5, [{ r: 0, c: 2, n: 1 }, { r: 1, c: 0, n: 1 }, { r: 1, c: 4, n: 1 }, { r: 3, c: 2, n: 1 }]);
  const eh = E.edgeOf(x, 1, 2), ev = E.edgeOf(x, 0, 3);
  ok(eh >= 0 && ev >= 0 && x.edges[eh].h && !x.edges[ev].h, 'یال افقی و عمودی صلیب پیدا شدند');
  ok(x.cross[eh].indexOf(ev) >= 0 && x.cross[ev].indexOf(eh) >= 0, 'دو یال صلیب هم را قطع می‌کنند');
  ok(E.solve(x, 2).count === 0, 'صلیب ۱ها جواب ندارد: یا قطع می‌شود یا دو تکه');
  const XS = { bridges: x.edges.map(() => 0), history: [] };
  ok(E.cycle(x, XS, eh) === 1, 'پل افقی گذاشته شد');
  const beforeCross = JSON.stringify(XS);
  ok(E.cycle(x, XS, ev) === -1, 'پلی که پل دیگر را قطع کند پذیرفته نمی‌شود');
  ok(JSON.stringify(XS) === beforeCross, 'حرکت ردشده وضعیت و تاریخچه را دست نمی‌زند');
  ok(E.check(x, x.edges.map((e, i) => (i === eh || i === ev ? 1 : 0))).crossing === true, 'بررسی برد پل‌های متقاطع را می‌بیند');

  // چرخه‌ی ۰←۱←۲←۰ و برگرداندن بی‌حد
  const TS = { bridges: t.edges.map(() => 0), history: [] };
  const e01 = E.edgeOf(t, 0, 1), e12 = E.edgeOf(t, 1, 2);
  const seq = [E.cycle(t, TS, e12), E.cycle(t, TS, e12), E.cycle(t, TS, e12), E.cycle(t, TS, e01)];
  ok(seq.join() === '1,2,0,1', 'زدن پیاپی ۰ ← ۱ ← ۲ ← ۰ می‌چرخد (' + seq.join() + ')');
  ok(E.undo(TS) === e01 && TS.bridges[e01] === 0, 'برگرداندن آخرین پل را برمی‌دارد');
  ok(E.undo(TS) === e12 && TS.bridges[e12] === 2, 'برگرداندن دوم پل دوتایی را برمی‌گرداند');
  E.undo(TS); E.undo(TS);
  ok(TS.bridges.every((v) => v === 0) && TS.history.length === 0, 'با برگرداندن پیاپی به تخته‌ی خالی می‌رسد');
  ok(E.undo(TS) === -1, 'روی تخته‌ی خالی برگرداندن کاری نمی‌کند');

  // لمس: وسط فاصله‌ی دو جزیره یال است، روی خود جزیره یا جای خالی نه
  ok(E.edgeAt(t, 1, 0.1) === e01, 'لمس بین جزیره‌ی ۰ و ۱ همان یال را می‌دهد');
  ok(E.edgeAt(t, 2, 1.5) === E.edgeOf(t, 1, 3), 'لمس روی فاصله‌ی عمودی یال عمودی را می‌دهد');
  ok(E.edgeAt(t, 0, 0) === -1, 'لمس روی خود جزیره یال نیست');
  ok(E.edgeAt(t, 4, 3) === -1, 'لمس جای خالی یال نیست');

  // پازل‌های ساخته‌شده، هر اندازه چند بذر
  const sizes = Object.keys(E.SIZES || {}).map(Number);
  ok(sizes.join() === '7,9,11', 'سه اندازه: ' + sizes.join());
  let maxMs = 0, made = 0, brute = 0;
  for (const sz of sizes) {
    const cfg = E.SIZES[sz];
    for (let i = 0; i < 12; i++) {
      const t0 = Date.now();
      const p = E.generate(rng(9100 + sz * 37 + i * 613), sz);
      maxMs = Math.max(maxMs, Date.now() - t0);
      ok(!!p, sz + ': پازل ساخته شد');
      if (!p) continue;
      made++;
      const g = E.build(p.size, p.islands);
      const n = p.islands.length;
      ok(n >= cfg.min && n <= cfg.max, sz + ': تعداد جزیره در بازه است (' + n + ')');
      ok(p.islands.every((q) => q.r >= 0 && q.c >= 0 && q.r < sz && q.c < sz && q.n >= 1 && q.n <= 8),
        sz + ': جزیره‌ها داخل تخته و عددشان بین ۱ و ۸ است');
      ok(!p.islands.some((a) => p.islands.some((b) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1)),
        sz + ': هیچ دو جزیره‌ای چسبیده نیستند');
      const bad = bridgesRules(p.islands, links(g, p.solution));
      ok(bad.length === 0, sz + ': جواب همه‌ی قانون‌ها را دارد' + (bad.length ? ' (' + bad.slice(0, 3).join('؛ ') + ')' : ''));
      ok(E.solve(g, 2).count === 1, sz + ': جواب یکتاست');
      ok(E.check(g, p.solution).solved === true, sz + ': بررسی برد جواب را می‌پذیرد');
      // تأیید یکتایی با جست‌وجوی کامل مستقل، فقط روی تخته‌ی کوچک که سریع است
      if (sz === 7) {
        const bc = bridgesBrute(p.islands, 2);
        ok(bc === 1, '۷: جست‌وجوی مستقل هم دقیقاً یک جواب می‌یابد (' + bc + ')');
        brute++;
      }
    }
  }
  ok(made === sizes.length * 12 && brute === 12, 'همه‌ی پازل‌ها و بررسی‌های مستقل اجرا شدند (' + made + '، ' + brute + ')');
  ok(maxMs < 400, 'ساختن پازل صفحه را قفل نمی‌کند (بیشینه ' + maxMs + 'ms)');

  // روزانه: یک بذر همیشه یک پازل؛ صفحه بذر را از C.daily می‌گیرد
  const d1 = E.generate(rng(20261002), 9), d2 = E.generate(rng(20261002), 9), d3 = E.generate(rng(20261003), 9);
  ok(JSON.stringify(d1) === JSON.stringify(d2), 'یک بذر همیشه یک پازل می‌دهد');
  ok(JSON.stringify(d1.islands) !== JSON.stringify(d3.islands), 'بذر دیگر پازل دیگری می‌دهد');
  const brHtml = fs.readFileSync(path.join(ROOT, 'www/games/bridges/index.html'), 'utf8');
  ok(/C\.daily\('bridges', daily\)\.rng/.test(brHtml), 'صفحه پازل روزانه را از C.daily می‌سازد');
  ok(/E\.cycle\(g, S, e\)/.test(brHtml) && /E\.undo\(S\)/.test(brHtml), 'صفحه حرکت و برگرداندن را با همین موتور انجام می‌دهد');
  ok(/E\.check\(g, S\.bridges\)/.test(brHtml), 'صفحه برد را با همان بررسی قانون می‌سنجد');
}

/* ------------------------------------------------------------ رمزشکن */
function testCodebreaker() {
  head('رمزشکن');
  const E = loadEngine('mastermind', 'CodebreakerEngineFactory');
  const fb = (s, g) => { const f = E.feedback(s, g); return f.b + 'b' + f.w + 'w'; };

  // پاسخ‌ها با دست از روی قانون حساب شده‌اند، نه از روی خروجی همین موتور.
  // تکرار رنگ در هر دو طرف همان جایی است که پیاده‌سازی‌های خانه‌به‌خانه غلط می‌شمارند.
  const cases = [
    [[0, 1, 2, 3], [0, 1, 2, 3], '4b0w', 'حدس کامل'],
    [[0, 1, 2, 3], [4, 5, 4, 5], '0b0w', 'هیچ رنگ مشترک'],
    [[0, 1, 2, 3], [3, 2, 1, 0], '0b4w', 'همه‌ی رنگ‌ها درست، همه جابه‌جا'],
    [[0, 0, 1, 1], [1, 1, 0, 0], '0b4w', 'دو جفت تکراری، همه جابه‌جا'],
    [[0, 0, 1, 1], [0, 1, 0, 1], '2b2w', 'دو جفت تکراری، نیمه جابه‌جا'],
    [[0, 0, 0, 1], [0, 1, 1, 1], '2b0w', 'تکرار در هر دو طرف: رنگ اضافه سفید نمی‌گیرد'],
    [[0, 1, 1, 2], [1, 1, 1, 1], '2b0w', 'حدس یک‌رنگ فقط به اندازه‌ی رمز می‌شمارد'],
    [[1, 1, 2, 2], [2, 1, 1, 3], '1b2w', 'تکرار در هر دو طرف با یک سیاه'],
    [[3, 3, 3, 3], [3, 0, 0, 0], '1b0w', 'رمز یک‌رنگ، یک خانه درست'],
    [[0, 1, 2, 3], [0, 0, 0, 0], '1b0w', 'حدس تکراری روی رمز بی‌تکرار'],
    [[5, 4, 5, 4], [4, 5, 5, 5], '1b2w', 'سیاه پیش از سفید از شمار کم می‌شود'],
    [[0, 0, 1, 7, 7], [7, 0, 7, 0, 1], '1b4w', 'پنج‌خانه با هشت رنگ'],
    [[2, 2, 2, 6, 6], [6, 6, 2, 2, 2], '1b4w', 'پنج‌خانه، دو رنگ تکراری']
  ];
  ok(cases.length > 0, 'فهرست حالت‌های بازخورد خالی نیست');
  for (const [s, g, want, why] of cases) {
    const got = fb(s, g);
    ok(got === want, 'بازخورد ' + s.join('') + ' / ' + g.join('') + ' = ' + want + ' (' + why + ') — آمد ' + got);
  }

  // قرینگی و حد: جای رمز و حدس عوض شود پاسخ همان است، و سیاه+سفید از خانه‌ها بیشتر نمی‌شود
  const r = rng(8301);
  let sym = 0, bounded = 0, exact = 0;
  const N = 400;
  for (let i = 0; i < N; i++) {
    const lv = E.LEVEL_IDS[i % 3];
    const a = E.makeSecret(r, lv), b = E.makeSecret(r, i % 2 ? 'hard' : lv);
    if (b.length !== a.length) b.length = a.length;
    const g = b.map((x) => x % E.LEVELS[lv].colors);
    if (fb(a, g) === fb(g, a)) sym++;
    const f = E.feedback(a, g);
    if (f.b >= 0 && f.w >= 0 && f.b + f.w <= a.length) bounded++;
    if (E.feedback(a, a).b === a.length && E.feedback(a, a).w === 0) exact++;
  }
  ok(sym === N, 'بازخورد قرینه است (' + sym + '/' + N + ')');
  ok(bounded === N, 'سیاه و سفید منفی نیستند و از تعداد خانه‌ها بیشتر نمی‌شوند (' + bounded + '/' + N + ')');
  ok(exact === N, 'رمز در برابر خودش همیشه تمام‌سیاه است');

  // رمزها قانون سطح را رعایت می‌کنند
  for (const lv of E.LEVEL_IDS) {
    const L = E.LEVELS[lv];
    let good = 0, repeats = 0;
    const seen = new Set();
    for (let i = 0; i < 300; i++) {
      const s = E.makeSecret(rng(500 + i), lv);
      if (E.validCode(L, s, true)) good++;
      if (new Set(s).size < s.length) repeats++;
      for (const c of s) seen.add(c);
    }
    ok(good === 300, lv + ': همه‌ی رمزها طول و رنگ درست دارند');
    ok(seen.size === L.colors, lv + ': همه‌ی ' + L.colors + ' رنگ در رمزها دیده می‌شوند (' + seen.size + ')');
    ok(L.repeats ? repeats > 0 : repeats === 0, lv + (L.repeats ? ': رمز با تکرار هم ساخته می‌شود' : ': رمز آسان تکرار ندارد'));
  }
  ok(E.LEVELS.easy.pegs === 4 && E.LEVELS.easy.colors === 6 && !E.LEVELS.easy.repeats, 'آسان: ۴ از ۶ بی‌تکرار');
  ok(E.LEVELS.normal.pegs === 4 && E.LEVELS.normal.colors === 6 && E.LEVELS.normal.repeats, 'معمولی: ۴ از ۶ با تکرار');
  ok(E.LEVELS.hard.pegs === 5 && E.LEVELS.hard.colors === 8 && E.LEVELS.hard.repeats, 'سخت: ۵ از ۸ با تکرار');
  ok(E.LEVEL_IDS.every((id) => E.LEVELS[id].rows === 10), 'هر سطح ده حدس دارد');

  // حل‌کننده‌ی ساده همه‌ی ۱۲۹۶ رمز معمولی را زیر ده حدس می‌شکند؛ یعنی ده حدس
  // برای بازیکنی که فقط حدس جور با سرنخ‌ها می‌زند کافی است.
  const t0 = Date.now();
  for (const lv of ['easy', 'normal']) {
    const L = E.LEVELS[lv];
    const total = Math.pow(L.colors, L.pegs);
    let n = 0, worst = 0, solvedRight = 0;
    for (let i = 0; i < total; i++) {
      const s = E.codeAt(L, i);
      if (!E.validCode(L, s, true)) continue;
      const gs = E.solve(lv, s) || [];
      n++;
      worst = Math.max(worst, gs.length || 99);
      if (gs.length && gs[gs.length - 1].join() === s.join()) solvedRight++;
    }
    ok(n === (lv === 'easy' ? 360 : 1296), lv + ': همه‌ی رمزهای ممکن بررسی شدند (' + n + ')');
    ok(solvedRight === n, lv + ': حل‌کننده هر رمز را پیدا کرد (' + solvedRight + '/' + n + ')');
    ok(worst <= 10, lv + ': بدترین حالت در ده حدس (' + worst + ')');
  }
  let hardIn10 = 0, hardFound = 0;
  const HN = 40;
  for (let i = 0; i < HN; i++) {
    const s = E.makeSecret(rng(9000 + i * 17), 'hard');
    const gs = E.solve('hard', s) || [];
    if (gs.length && gs[gs.length - 1].join() === s.join()) hardFound++;
    if (gs.length && gs.length <= 10) hardIn10++;
  }
  ok(hardFound === HN, 'سخت: حل‌کننده همه‌ی ' + HN + ' رمز را پیدا کرد (' + hardFound + ')');
  ok(hardIn10 >= HN * 0.9, 'سخت: دست‌کم نود درصد در ده حدس (' + hardIn10 + '/' + HN + ')');
  ok(Date.now() - t0 < 8000, 'حل همه‌ی رمزها زیر هشت ثانیه (' + (Date.now() - t0) + 'ms)');

  // حالت بازی: ثبت، پایان، و نبود برگشت
  const S = E.newState('normal', [0, 0, 1, 2]);
  ok(E.submit(S, [0, 0, 1]) === null && S.rows.length === 0, 'حدس ناقص ثبت نمی‌شود');
  ok(E.submit(S, [0, 0, 1, 6]) === null && S.rows.length === 0, 'رنگ بیرون از سطح ثبت نمی‌شود');
  ok(E.submit(S, [0, 0, 1, -1]) === null && S.rows.length === 0, 'خانه‌ی خالی ثبت نمی‌شود');
  const row = E.submit(S, [2, 0, 0, 1]);
  ok(row && row.b === 1 && row.w === 3 && S.rows.length === 1, 'حدس کامل ثبت شد با بازخورد درست (1b3w)');
  ok(S.cur.join() === '-1,-1,-1,-1', 'بعد از ثبت ردیف تازه خالی است');
  ok(!S.done && !S.won, 'حدس غلط بازی را تمام نمی‌کند');
  ok(E.submit(S, [0, 0, 1, 2]) && S.won && S.done && S.rows.length === 2, 'حدس درست می‌برد');
  ok(E.submit(S, [0, 0, 0, 0]) === null && S.rows.length === 2, 'بعد از پایان حدسی ثبت نمی‌شود');
  ok(typeof E.undo !== 'function' && typeof E.takeBack !== 'function', 'موتور راهی برای برگرداندن حدس ثبت‌شده ندارد');
  const lose = E.newState('hard', [7, 7, 7, 7, 7]);
  for (let i = 0; i < 10; i++) E.submit(lose, [0, 1, 2, 3, 4]);
  ok(lose.done && !lose.won && lose.rows.length === 10, 'ده حدس غلط بازی را با باخت تمام می‌کند');
  ok(E.submit(lose, [7, 7, 7, 7, 7]) === null, 'حدس یازدهم پذیرفته نمی‌شود');

  // ذخیره‌ی دست‌کاری‌شده نباید بار شود
  const okSave = JSON.parse(JSON.stringify(S));
  ok(E.validState(okSave), 'ذخیره‌ی سالم پذیرفته می‌شود');
  const forged = JSON.parse(JSON.stringify(S)); forged.rows[0].b = 4;
  ok(!E.validState(forged), 'ذخیره‌ای که بازخوردش با رمز نمی‌خواند رد می‌شود');
  ok(!E.validState({ level: 'easy', secret: [0, 0, 1, 2], rows: [], cur: [-1, -1, -1, -1] }), 'رمز تکراری در سطح آسان رد می‌شود');
  ok(!E.validState(null), 'ذخیره‌ی خالی رد می‌شود');

  // روزانه: همان بذر هسته، پس یک تاریخ برای همه یک رمز است
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const hashSrc = (core.match(/function hash32\(str\) \{[\s\S]*?\n  \}/) || [])[0];
  ok(!!hashSrc, 'تابع hash32 هسته پیدا شد');
  const hash32 = hashSrc ? vm.runInNewContext('(' + hashSrc + ')') : () => 0;
  const daily = (d) => E.makeSecret(rng(hash32('chogan|mastermind|' + d)), 'normal').join('');
  ok(daily('2026-10-02') === daily('2026-10-02'), 'رمز روزانه برای یک تاریخ همیشه یکی است');
  const days = new Set();
  for (let i = 1; i <= 28; i++) days.add(daily('2026-02-' + String(i).padStart(2, '0')));
  ok(days.size >= 20, 'روزهای مختلف رمزهای مختلف دارند (' + days.size + '/28)');

  // صفحه باید از همین موتور استفاده کند
  const html = fs.readFileSync(path.join(ROOT, 'www/games/mastermind/index.html'), 'utf8');
  ok(/E\.submit\(S, S\.cur\)/.test(html), 'صفحه حدس را با submit موتور ثبت می‌کند');
  ok(/C\.daily\('mastermind', daily\)\.rng/.test(html) && /newGame\('normal', dailyDate\)/.test(html), 'روزانه سطح معمولی و بذر هسته را می‌گیرد');
  ok(!/mastermind/i.test(html.replace(/'mastermind'|\.mastermind\b/g, '')), 'نام تجاری Mastermind در صفحه نیامده');
}

/* ----------------------------------------------------------- آجرشکن */
function testBreakout() {
  head('آجرشکن');
  const E = loadEngine('breakout', 'BreakoutEngineFactory');

  // مرحله‌ها: دوازده تا، هر کدام خوانا، با دست‌کم یک آجر شکستنی و داخل زمین
  ok(E.LEVELS.length === 12, 'دوازده مرحله‌ی ثابت هست (' + E.LEVELS.length + ')');
  ok(E.COLS * E.BW === E.W, 'ستون‌های آجر دقیقاً پهنای زمین را پر می‌کنند');
  for (let i = 0; i < E.LEVELS.length; i++) {
    const rows = E.LEVELS[i];
    const p = E.parseLevel(rows);
    ok(p.errors.length === 0, 'مرحله‌ی ' + (i + 1) + ': بی‌ایراد خوانده شد' + (p.errors.length ? ' (' + p.errors.join('; ') + ')' : ''));
    ok(rows.length <= E.ROWS && rows.every((r) => r.length === E.COLS && /^[.123#]+$/.test(r)),
      'مرحله‌ی ' + (i + 1) + ': در شبکه‌ی ' + E.COLS + '×' + E.ROWS + ' جا می‌شود');
    const breakable = rows.join('').replace(/[^123]/g, '').length;
    ok(breakable > 0 && p.breakable === breakable, 'مرحله‌ی ' + (i + 1) + ': ' + breakable + ' آجر شکستنی');
    ok(p.bricks.length > 0 && p.bricks.every((k) => k.x >= 0 && k.x + k.w <= E.W + 1e-9 && k.y >= 0 && k.y + k.h <= E.PY - 60),
      'مرحله‌ی ' + (i + 1) + ': همه‌ی آجرها داخل زمین و دور از راکت‌اند');
  }
  ok(E.parseLevel(['111']).errors.length > 0, 'سطر کوتاه رد می‌شود');
  ok(E.parseLevel(['1111x1111111']).errors.length > 0, 'نویسه‌ی ناشناخته رد می‌شود');
  ok(E.parseLevel(['############']).errors.length > 0, 'مرحله‌ی بدون آجر شکستنی رد می‌شود');

  // توپی که از بالا روی راکت می‌آید؛ راکت ثابت در x
  function dropOn(offset) {
    const S = E.createGame(0, { rows: ['1...........'] });
    S.attached = false;
    S.px = 180;
    S.ball.x = 180 + offset; S.ball.y = E.PY - E.R - 1; S.ball.vx = 0; S.ball.vy = S.speed;
    const ev = E.step(S, 180);
    return { S, hit: ev.some((e) => e.type === 'paddle') };
  }
  const mid = dropOn(0), right = dropOn(E.PW / 2), left = dropOn(-E.PW / 2);
  const deg = (b) => Math.atan2(b.vx, -b.vy) * 180 / Math.PI;
  ok(mid.hit && Math.abs(mid.S.ball.vx) < 1e-9 && mid.S.ball.vy < 0, 'وسط راکت توپ را صاف بالا می‌فرستد');
  ok(right.hit && deg(right.S.ball) > 45 && deg(right.S.ball) <= 60, 'لبه‌ی راست توپ را به راست کج می‌کند (' + deg(right.S.ball).toFixed(1) + '°)');
  ok(left.hit && Math.abs(deg(left.S.ball) + deg(right.S.ball)) < 1e-9, 'لبه‌ی چپ قرینه‌ی لبه‌ی راست است');
  const sp = Math.hypot(right.S.ball.vx, right.S.ball.vy);
  ok(Math.abs(sp - right.S.speed) < 1e-6, 'برگشت از راکت سرعت را عوض نمی‌کند');

  // توپ قائم زیر یک آجر و راکت درست زیر توپ: هر رفت‌وبرگشت یک ضربه
  function bounceUnder(rows, col, steps) {
    const S = E.createGame(0, { rows });
    const x = col * E.BW + E.BW / 2;
    S.px = x; S.attached = false;
    S.ball.x = x; S.ball.y = E.PY - E.R; S.ball.vx = 0; S.ball.vy = -S.speed;
    const events = [];
    for (let i = 0; i < steps && S.state === 'play'; i++) events.push(...E.step(S, x));
    return { S, events };
  }
  const two = bounceUnder(['.....2......'], 5, 4000);
  const brickHits = two.events.filter((e) => e.type === 'brick');
  ok(brickHits.length === 2 && !brickHits[0].destroyed && brickHits[1].destroyed, 'آجر دوضربه‌ای با ضربه‌ی دوم می‌شکند');
  ok(two.S.state === 'won', 'شکستن آخرین آجر مرحله را تمام می‌کند');
  ok(two.S.score === 5 + 5 + 20 + 3 * 50, 'امتیاز: ۵ برای هر ضربه، ۱۰ برابر سختی برای شکستن، ۵۰ برای هر توپ مانده (' + two.S.score + ')');
  const steel = bounceUnder(['.....#......', '1...........'], 5, 3000);
  const steelHits = steel.events.filter((e) => e.type === 'steel').length;
  ok(steelHits >= 5 && steel.S.bricks[0].hp === 1 && steel.S.state === 'play', 'آجر فولادی با ' + steelHits + ' ضربه نمی‌شکند و بردی حساب نمی‌شود');
  const onlySteelLeft = E.createGame(0, { rows: ['#1..........'] });
  onlySteelLeft.bricks[1].hp = 0;
  ok(E.breakableLeft(onlySteelLeft) === 0, 'آجر فولادی در شمار آجرهای مانده نیست');

  // تونل نزدن: توپ با سرعت بیشینه و بسیار بیشتر از آن، از زاویه‌های مختلف به یک
  // آجر تک شلیک می‌شود. با گام ساده، در بیست برابر سرعت توپ در هر گام ۸۷ واحد
  // جلو می‌رود، بیش از سه برابر ضخامت آجر به‌علاوه‌ی قطر توپ.
  const angles = [];
  for (let a = -55; a <= 55; a += 10) angles.push(a);
  ok(angles.length > 0, 'فهرست زاویه‌های شلیک خالی نیست');
  for (const mult of [1, 4, 20]) {
    let missed = 0, tries = 0;
    for (const a of angles) {
      for (const dxOff of [-12, 0, 12]) {
        tries++;
        const S = E.createGame(0, { rows: ['............', '............', '............', '............', '.....1......'], speed: E.MAX_SPEED * mult });
        const k = S.bricks[0];
        const cx = k.x + k.w / 2 + dxOff, cy = k.y + k.h / 2;
        const rad = a * Math.PI / 180;
        S.attached = false; S.px = 30;
        S.ball.x = cx - Math.sin(rad) * 140; S.ball.y = cy + Math.cos(rad) * 140;
        S.ball.vx = Math.sin(rad) * S.speed; S.ball.vy = -Math.cos(rad) * S.speed;
        let hit = false;
        for (let i = 0; i < 400 && !hit && S.state === 'play'; i++) {
          if (E.step(S, 30).some((e) => e.type === 'brick')) hit = true;
          if (!hit && S.ball.y < k.y - E.R - 1 && S.ball.vy < 0) break;
        }
        if (!hit) missed++;
      }
    }
    ok(missed === 0, 'سرعت ' + mult + '× بیشینه: توپ از آجر رد نشد (' + (tries - missed) + '/' + tries + ')');
  }
  // در بازی واقعی با سرعت بیشینه: توپ هیچ‌وقت داخل دیوار یا آجر زنده نیست
  for (let L = 0; L < E.LEVELS.length; L++) {
    const S = E.createGame(L, { speed: E.MAX_SPEED });
    const r = rng(9100 + L);
    let off = 0, bad = 0, steps = 0;
    for (let i = 0; i < 4000 && S.state === 'play'; i++) {
      if (S.attached) E.launch(S);
      const ev = E.step(S, S.ball.x + off);
      steps++;
      if (ev.some((e) => e.type === 'paddle')) off = (r() * 2 - 1) * E.PW * 0.45;
      const b = S.ball, eps = 1e-6;
      if (b.x < E.R - eps || b.x > E.W - E.R + eps || b.y < E.R - eps) bad++;
      for (const k of S.bricks) {
        if (k.hp > 0 && b.x > k.x - E.R + eps && b.x < k.x + k.w + E.R - eps && b.y > k.y - E.R + eps && b.y < k.y + k.h + E.R - eps) bad++;
      }
    }
    ok(steps > 1000 && bad === 0, 'مرحله‌ی ' + (L + 1) + ' با سرعت بیشینه: ' + steps + ' گام بی‌نفوذ در دیوار و آجر (' + bad + ' نفوذ)');
  }

  // گام ثابت: ورودی یکسان، مسیر یکسان؛ و تکه‌تکه کردن زمان در فریم‌ها نتیجه را عوض نمی‌کند
  // راکت دنبال‌کننده با لغزش سینوسی: تابع قطعی وضعیت، تا توپ نیفتد و مسیر بلند بماند
  const paddleAt = (s) => s.ball.x + 26 * Math.sin(s.steps / 37);
  function directPath(level, n) {
    const S = E.createGame(level), path = [];
    for (let i = 0; i < n && S.state === 'play'; i++) {
      if (S.attached) E.launch(S);
      E.step(S, paddleAt(S));
      path.push(S.ball.x.toFixed(6) + ',' + S.ball.y.toFixed(6));
    }
    return { S, path };
  }
  const p1 = directPath(2, 6000), p2 = directPath(2, 6000);
  ok(p1.path.length === 6000 && p1.S.hits > 0 && new Set(p1.path).size > 1000, 'مسیر آزمون واقعاً حرکت کرد و ' + p1.S.hits + ' ضربه به آجر زد');
  ok(p1.path.join('|') === p2.path.join('|'), 'ورودی یکسان، مسیر توپ یکسان');
  function framedPath(level, n, nextDt) {
    const S = E.createGame(level), path = [];
    let acc = 0, guard = 0;
    // ورودی پیش از هر گام صدا می‌خورد؛ مسیر گام قبلی را همین‌جا برمی‌داریم
    // چون advance چند گام را در یک فریم می‌برد.
    const input = (s) => {
      if (s.steps > 0) path[s.steps - 1] = s.ball.x.toFixed(6) + ',' + s.ball.y.toFixed(6);
      if (s.attached) E.launch(s);
      return paddleAt(s);
    };
    while (S.steps < n && S.state === 'play' && guard++ < 100000) acc = E.advance(S, acc, nextDt(), input, null);
    path[S.steps - 1] = S.ball.x.toFixed(6) + ',' + S.ball.y.toFixed(6);
    return { S, path };
  }
  const jitter = rng(4242);
  const f30 = framedPath(2, 6000, () => 1 / 30);
  const f144 = framedPath(2, 6000, () => 1 / 144);
  const fRand = framedPath(2, 6000, () => 0.004 + jitter() * 0.05);
  const cmp = (a, b) => a.S.steps >= 6000 && b.S.steps >= 6000 && a.S.bricks.map((k) => k.hp).join() === b.S.bricks.map((k) => k.hp).join() &&
    a.S.ball.x === b.S.ball.x && a.S.ball.y === b.S.ball.y && a.S.score === b.S.score;
  const at6000 = (f) => { const S = E.createGame(2); for (let i = 0; i < f.S.steps; i++) { if (S.attached) E.launch(S); E.step(S, paddleAt(S)); } return S; };
  ok(cmp(f30, { S: at6000(f30) }), '۳۰ فریم در ثانیه همان نتیجه‌ی گام‌به‌گام را می‌دهد');
  ok(cmp(f144, { S: at6000(f144) }), '۱۴۴ فریم در ثانیه همان نتیجه‌ی گام‌به‌گام را می‌دهد');
  ok(cmp(fRand, { S: at6000(fRand) }), 'فریم‌های نامنظم همان نتیجه‌ی گام‌به‌گام را می‌دهند');
  const firstN = (f) => f.path.slice(0, 6000).join('|');
  ok(firstN(f30) === p1.path.join('|') && firstN(f144) === p1.path.join('|') && firstN(fRand) === p1.path.join('|'),
    'مسیر گام‌به‌گام در هر سه نرخ فریم با مسیر مستقیم یکی است');
  const big = E.createGame(0);
  E.launch(big);
  const before = big.steps;
  E.advance(big, 0, 5, () => 180, null);
  // ۰٫۱ ثانیه دوازده گام است؛ خطای ممیز شناور ممکن است یکی کمتر بدهد
  ok(big.steps - before >= 11 && big.steps - before <= 12,
    'یک فریم پنج‌ثانیه‌ای بیش از ۰٫۱ ثانیه فیزیک جلو نمی‌برد (' + (big.steps - before) + ' گام)');

  // راکت خودکار که توپ را دنبال می‌کند هر مرحله را در زمان محدود تمام می‌کند
  const BOUND = 60000;   // ۵۰۰ ثانیه‌ی بازی
  for (let L = 0; L < E.LEVELS.length; L++) {
    const S = E.createGame(L), r = rng(L * 31 + 1);
    let off = 0;
    while (S.state === 'play' && S.steps < BOUND) {
      if (S.attached) E.launch(S);
      const ev = E.step(S, S.ball.x + off);
      if (ev.some((e) => e.type === 'paddle')) off = (r() * 2 - 1) * E.PW * 0.4;
    }
    ok(S.state === 'won', 'مرحله‌ی ' + (L + 1) + ': راکت دنبال‌کننده در ' + S.steps + ' گام (سقف ' + BOUND + ') تمامش کرد');
    if (L === 0) ok(S.lost === 0 && E.stars(S) === 3, 'مرحله‌ی ۱: بدون از دست دادن توپ، سه ستاره');
  }

  // توپ‌ها: سه توپ، بعد از هر افتادن توپ روی راکت برمی‌گردد
  const lose = E.createGame(4);
  let lostEv = 0;
  for (let i = 0; i < 20000 && lose.state === 'play'; i++) {
    if (lose.attached) {
      if (lose.lost === 1) ok(lose.lives === 2 && lose.speed === E.baseSpeed(4) && lose.ball.vy === 0, 'بعد از افتادن اول: دو توپ، سرعت پایه، توپ روی راکت');
      E.launch(lose);
    }
    // راکت عمداً دور از توپ
    lostEv += E.step(lose, lose.ball.x < 180 ? 330 : 30).filter((e) => e.type === 'lost').length;
  }
  ok(lose.state === 'lost' && lose.lives === 0 && lostEv === 3, 'با سه توپ افتاده مرحله باخته است');
  ok(E.step(lose, 100).length === 0 && E.launch(lose) === false, 'بعد از باخت گام و پرتاب کاری نمی‌کنند');
  ok(E.stars(lose) === 0, 'مرحله‌ی باخته ستاره ندارد');

  // روزانه: یک مرحله از روی بذر روز
  const days = [];
  for (let d = 0; d < 60; d++) days.push(E.dailyLevel(rng(20261000 + d)));
  ok(days.length === 60 && days.every((x) => x >= 0 && x < 12 && x === Math.floor(x)), 'مرحله‌ی روزانه همیشه یکی از دوازده تاست');
  ok(new Set(days).size >= 6, 'روزهای مختلف مرحله‌های مختلف می‌دهند (' + new Set(days).size + ' مرحله در ۶۰ روز)');
  ok(E.dailyLevel(rng(777)) === E.dailyLevel(rng(777)), 'بذر یکسان، مرحله‌ی روزانه‌ی یکسان');

  // ذخیره و ادامه
  const mid2 = directPath(1, 3000).S;
  const data = JSON.parse(JSON.stringify(E.serialize(mid2)));
  const back = E.restore(data);
  ok(!!back && back.bricks.map((k) => k.hp).join() === mid2.bricks.map((k) => k.hp).join() &&
    back.lives === mid2.lives && back.score === mid2.score && back.level === 1 && back.attached === true,
    'ذخیره و ادامه: آجرها، توپ‌ها و امتیاز همان‌اند و توپ روی راکت است');
  ok(mid2.hits > 0 && mid2.bricks.some((k) => k.hp < k.max), 'ذخیره‌ی آزمون آجر شکسته داشت');
  ok(E.restore(Object.assign({}, data, { hp: data.hp.slice(1) })) === null, 'ذخیره با تعداد آجر نادرست رد می‌شود');
  ok(E.restore(Object.assign({}, data, { level: 12 })) === null && E.restore(Object.assign({}, data, { lives: 0 })) === null && E.restore(null) === null,
    'ذخیره‌ی خراب رد می‌شود');

  // پیشرفت: هر مرحله مرحله‌ی بعد را باز می‌کند، بهترین‌ها کم نمی‌شوند
  let prog = { unlocked: 1, best: {}, complete: false };
  prog = E.recordClear(prog, 0, 2, 500);
  ok(prog.unlocked === 2 && prog.best[0].stars === 2, 'تمام کردن مرحله‌ی ۱ مرحله‌ی ۲ را باز می‌کند');
  prog = E.recordClear(prog, 0, 1, 900);
  ok(prog.unlocked === 2 && prog.best[0].stars === 2 && prog.best[0].score === 900, 'بازی دوباره ستاره‌ی بهتر را کم نمی‌کند و امتیاز بهتر را نگه می‌دارد');
  ok(!prog.complete, 'هنوز کل بازی تمام نشده');
  prog = E.recordClear(prog, 11, 3, 100);
  ok(prog.complete && prog.unlocked === 12, 'مرحله‌ی دوازده بازی را تمام می‌کند و بیش از دوازده باز نمی‌شود');

  // صفحه همین موتور را صدا می‌زند
  const boHtml = fs.readFileSync(path.join(ROOT, 'www/games/breakout/index.html'), 'utf8');
  ok(/E\.advance\(S, acc, dt, input, onEvents\)/.test(boHtml), 'صفحه فیزیک را با advance و گام ثابت جلو می‌برد');
  ok(/E\.launch\(S\)/.test(boHtml), 'صفحه پرتاب را با launch انجام می‌دهد');
  ok(/E\.dailyLevel\(C\.daily\('breakout'/.test(boHtml), 'روزانه‌ی صفحه مرحله را از بذر روز می‌گیرد');
  ok(/C\.onPause\(function \(\) \{\s*if \(S && !over && !S\.attached\) paused = true;/.test(boHtml), 'پنهان شدن برنامه بازی را نگه می‌دارد');
  ok(!/localStorage/.test(boHtml), 'صفحه مستقیم به localStorage دست نمی‌زند');
  ok(!/window\.(__|[A-Za-z]*[Dd]ebug)/.test(boHtml), 'قلاب اشکال‌زدایی روی window نیست');
}

/* ----------------------------------------------------- دفاع از برج */
function testTd() {
  head('دفاع از برج');
  const E = loadEngine('tower-defence', 'TdEngineFactory');

  for (let i = 0; i < 120; i++) {
    const p = E.genPath(rng(i * 7919 + 13), { minTurns: 5 });
    const err = E.validatePath(p);
    if (err) ok(false, 'مسیر بذر ' + i + ': ' + err);
  }
  ok(true, '۱۲۰ نقشه‌ی تصادفی همه معتبرند');

  // ذخیره پیش از موج اول (#66): برج چیده‌شده یعنی بازی در جریان است. قبلاً
  // فقط wave > 0 حساب می‌شد و صفحه خانه‌ی ذخیره را همان‌جا پاک می‌کرد.
  ok(typeof E.inProgress === 'function', 'موتور تابع inProgress دارد');
  const inProg = typeof E.inProgress === 'function' ? E.inProgress : () => null;
  const fresh = E.createGame({ path: E.genPath(rng(4242), { minTurns: 5 }) });
  ok(inProg(fresh) === false, 'تخته‌ی دست‌نخورده در جریان نیست');
  let spot = null;
  for (let rr = 0; rr < E.GH && !spot; rr++) {
    for (let cc = 0; cc < E.GW && !spot; cc++) if (E.canBuild(fresh, rr, cc)) spot = { r: rr, c: cc };
  }
  ok(!!spot, 'خانه‌ی قابل ساخت روی نقشه پیدا شد');
  ok(!!E.build(fresh, spot.r, spot.c, 'archer'), 'برج پیش از موج اول ساخته شد');
  ok(fresh.wave === 0 && fresh.towers.length === 1, 'هنوز موج اول شروع نشده و یک برج روی تخته است');
  ok(inProg(fresh) === true, 'یک برج پیش از موج اول یعنی بازی در جریان است');
  // مسیر برگشت، همان شیء ساده‌ای را می‌بیند که از localStorage درآمده
  ok(inProg(JSON.parse(JSON.stringify(fresh))) === true, 'ذخیره‌ی سریال‌شده هم در جریان است');
  const started = E.createGame({ path: E.genPath(rng(99), { minTurns: 5 }) });
  E.startWave(started, rng(7));
  ok(started.towers.length === 0 && inProg(started) === true, 'موج شروع‌شده بدون برج هم در جریان است');
  fresh.over = true;
  ok(inProg(fresh) === false, 'بازی تمام‌شده در جریان نیست');
  ok(inProg(null) === false, 'ذخیره‌ی نبوده در جریان نیست');

  // پیش‌نمایش برد پیش از خرید (#65)
  ok(typeof E.buildPreview === 'function', 'موتور تابع buildPreview دارد');
  const pv = typeof E.buildPreview === 'function' ? E.buildPreview : () => null;
  const board = E.createGame({ path: E.genPath(rng(777), { minTurns: 5 }) });
  let openCell = null;
  for (let rr = 0; rr < E.GH && !openCell; rr++) {
    for (let cc = 0; cc < E.GW && !openCell; cc++) if (E.canBuild(board, rr, cc)) openCell = { r: rr, c: cc };
  }
  ok(!!openCell, 'خانه‌ی خالی برای پیش‌نمایش پیدا شد');
  const kinds = Object.keys(E.TOWERS);
  ok(kinds.length === 4, 'چهار نوع برج هست');
  const ranges = [];
  for (const k of kinds) {
    const p1 = pv(board, openCell.r, openCell.c, k);
    ok(!!p1, k + ': پیش‌نمایش برمی‌گردد');
    // برد باید از خود موتور بیاید و با سطحی باشد که ساخته می‌شود، یعنی صفر
    ok(p1 && p1.range === E.towerStats(k, 0).range, k + ': برد پیش‌نمایش همان برد برج تازه‌ساخته است');
    ok(p1 && p1.cost === E.TOWERS[k].cost, k + ': هزینه‌ی پیش‌نمایش درست است');
    if (p1) ranges.push(p1.range);
  }
  ok(new Set(ranges).size > 1, 'بردها بین برج‌ها فرق دارند، پس عدد ثابت نیست');
  ok((pv(board, openCell.r, openCell.c, 'archer') || {}).fits === true, 'خانه‌ی خالی با پول کافی قابل ساخت است');
  ok((pv(board, board.path[3].r, board.path[3].c, 'archer') || { fits: true }).fits === false, 'روی مسیر قابل ساخت نیست');
  const poor = E.createGame({ path: board.path, money: 10 });
  ok((pv(poor, openCell.r, openCell.c, 'archer') || { fits: true }).fits === false, 'با پول کم قابل ساخت نیست');
  ok(pv(board, openCell.r, openCell.c, 'nope') === null, 'برج ناشناخته پیش‌نمایش ندارد');
  ok(board.towers.length === 0 && board.money === 200, 'پیش‌نمایش نه برج می‌سازد نه پول کم می‌کند');

  // و صفحه باید همین گزاره را صدا بزند، نه شرط خودش را داشته باشد
  const tdHtml = fs.readFileSync(path.join(ROOT, 'www/games/tower-defence/index.html'), 'utf8');
  const page = tdHtml.slice(tdHtml.indexOf('/* ==== ENGINE END ==== */'));
  ok(page.length > 1000, 'بخش صفحه‌ی دفاع از برج خوانده شد');
  ok((page.match(/E\.inProgress\(/g) || []).length >= 3, 'ذخیره، برگشت و شروع دوباره هر سه از inProgress استفاده می‌کنند');
  ok(!/S\.wave === 0|\.s\.wave > 0/.test(page), 'شرط قدیمی wave در صفحه نمانده است');
  ok((page.match(/E\.buildPreview\(/g) || []).length >= 1, 'رسم، پیش‌نمایش را از موتور می‌گیرد');
  ok(!/towerStats\(armed/.test(page), 'صفحه برد پیش‌نمایش را خودش حساب نمی‌کند');
  ok(/pointerdown/.test(page) && /holdFired/.test(page), 'نگه داشتن انگشت پیش‌نمایش می‌دهد');
  // اسم تابع پیش‌نمایش یک بار با var preview (نوار موج بعدی) تصادم کرد و هر
  // حرکت موشواره خطا می‌داد بی‌آنکه چیزی در کنسول بار صفحه پیدا شود
  ok(/function showRange\(/.test(page) && !/function preview\(/.test(page), 'تابع پیش‌نمایش با نوار موج هم‌نام نیست');
  ok(/if \(holdFired\) \{[^}]*return;/.test(page), 'رها کردن انگشت بعد از پیش‌نمایش برج نمی‌خرد');

  const daily = E.genPath(rng(12345), { minTurns: 5 });
  const daily2 = E.genPath(rng(12345), { minTurns: 5 });
  ok(JSON.stringify(daily) === JSON.stringify(daily2), 'نقشه‌ی روزانه با یک بذر همیشه یکی است');

  // بازیکن خودکار: ترکیب برج‌ها باید بیست موج را ببرد، فقط کمان نباید
  function autoPlay(seed, order, cap, upTo) {
    const r = rng(seed);
    const S = E.createGame({ path: E.genPath(rng(seed), { minTurns: 5 }) });
    const spots = [];
    for (let rr = 0; rr < E.GH; rr++) {
      for (let cc = 0; cc < E.GW; cc++) {
        if (!E.canBuild(S, rr, cc)) continue;
        let best = 1e9;
        S.path.forEach((p) => { const dx = p.c - cc, dy = p.r - rr; best = Math.min(best, dx * dx + dy * dy); });
        spots.push({ r: rr, c: cc, d: best });
      }
    }
    spots.sort((a, b) => a.d - b.d);
    let si = 0, oi = 0, guard = 0;
    while (!S.over && guard++ < 200000) {
      let spent = true;
      while (spent) {
        spent = false;
        if (si < spots.length && (!cap || S.towers.length < cap)) {
          const kind = order[oi % order.length];
          if (S.money >= E.TOWERS[kind].cost) {
            if (E.build(S, spots[si].r, spots[si].c, kind)) { si++; oi++; spent = true; } else si++;
          }
        }
        if (!cap || upTo) {
          for (let t = 0; t < S.towers.length && !spent; t++) {
            const tw = S.towers[t];
            if (tw.level < (upTo || 2) && S.money > E.upgradeCost(tw.kind, tw.level) + 140 && E.upgrade(S, tw)) spent = true;
          }
        }
      }
      if (!S.waveActive) E.startWave(S, r);
      for (let k = 0; k < 400 && S.waveActive && !S.over; k++) E.step(S, 1 / 30, r);
    }
    return S;
  }

  const mixed = ['archer', 'archer', 'cannon', 'frost', 'archer', 'tesla', 'cannon', 'archer', 'frost', 'cannon', 'tesla', 'archer'];
  let mixedWins = 0, archerWins = 0, thinWins = 0;
  for (let i = 0; i < 5; i++) {
    const a = autoPlay(i * 137 + 5, mixed);
    if (a.won) mixedWins++;
    const b = autoPlay(i * 137 + 5, ['archer']);
    if (b.won) archerWins++;
    // بازیکنی که فقط هفت برج می‌گذارد و هیچ‌کدام را ارتقا نمی‌دهد
    const c = autoPlay(i * 137 + 5, mixed, 7);
    if (c.won) thinWins++;
  }
  ok(mixedWins >= 4, 'بازی با ترکیب برج‌ها بردنی است (' + mixedWins + '/5)');
  ok(archerWins <= 1, 'فقط کمان گذاشتن جواب نمی‌دهد (' + archerWins + '/5)');
  ok(thinWins === 0, 'بدون ارتقا و با برج کم نمی‌شود برد (' + thinWins + '/5)');

  // More upgrade levels (#245): a tester kept nine towers, upgraded them all to the old
  // top level and lost to the last boss at wave 18 holding 4233 gold with nothing to buy.
  // The same nine towers upgraded as far as the game allows must now clear wave 20.
  const ML = E.MAX_LEVEL || 2;
  ok(ML === 4, 'towers have five levels (MAX_LEVEL ' + ML + ')');
  const nine = ['archer', 'cannon', 'frost', 'archer', 'tesla', 'cannon', 'archer', 'frost', 'archer'];
  let nineWins = 0;
  for (let i = 0; i < 5; i++) {
    const n = autoPlay(i * 137 + 5, nine, 9, ML);
    if (n.won) nineWins++;
  }
  ok(nineWins >= 4, 'nine towers upgraded to the top level clear all twenty waves (' + nineWins + '/5)');
  for (const kind of Object.keys(E.TOWERS)) {
    let rising = true, dearer = true;
    for (let l = 1; l <= ML; l++) {
      const a = E.towerStats(kind, l - 1), b = E.towerStats(kind, l);
      if (!(b.dps > a.dps && b.range >= a.range)) rising = false;
      if (l < ML && !(E.upgradeCost(kind, l) > E.upgradeCost(kind, l - 1))) dearer = false;
    }
    ok(rising && dearer, kind + ': every level hits harder and costs more than the one before');
    const S3 = E.createGame({ path: E.genPath(rng(3), { minTurns: 5 }), money: 100000 });
    let spot = null;
    for (let rr = 0; rr < E.GH && !spot; rr++) for (let cc = 0; cc < E.GW && !spot; cc++) if (E.canBuild(S3, rr, cc)) spot = [rr, cc];
    E.build(S3, spot[0], spot[1], kind);
    const tw = S3.towers[0];
    let ups = 0;
    while (E.upgrade(S3, tw)) ups++;
    ok(ups === ML && tw.level === ML, kind + ': upgrades stop at the top level (' + ups + ' upgrades)');
  }
  const tdSrc = fs.readFileSync(path.join(ROOT, 'www/games/tower-defence/index.html'), 'utf8');
  const panelSrc = (tdSrc.match(/function towerPanel\(t\) \{([\s\S]*?)\n  \}\n/) || [])[1] || '';
  ok(panelSrc.length > 0, 'towerPanel found');
  ok(/E\.towerStats\(t\.kind, t\.level \+ 1\)/.test(panelSrc) && /grow\(Math\.round\(st\.dps\)/.test(panelSrc) && /grow\(st\.range/.test(panelSrc),
    'the tower panel shows damage and range now and after the upgrade');

  const S2 = E.createGame({ path: E.genPath(rng(9), { minTurns: 5 }) });
  const free = [];
  for (let rr = 0; rr < E.GH; rr++) for (let cc = 0; cc < E.GW; cc++) if (E.canBuild(S2, rr, cc)) free.push([rr, cc]);
  ok(free.length > 40, 'جای ساخت برج به اندازه‌ی کافی هست (' + free.length + ')');
  ok(!E.canBuild(S2, S2.path[3].r, S2.path[3].c), 'روی مسیر نمی‌شود ساخت');

  // نشان برج‌ها و پیام کم‌پولی (#139): دکمه‌ها همه یک مربع بودند و با شکل برج روی نقشه
  // نمی‌خواندند، و اعلان «پول کافی نداری» بالای صفحه روی عدد طلا می‌نشست
  const tdPage = fs.readFileSync(path.join(ROOT, 'www/games/tower-defence/index.html'), 'utf8');
  const towerKinds = Object.keys(E.TOWERS);
  ok(towerKinds.length === 4, 'چهار برج خوانده شد (' + towerKinds.join(',') + ')');
  const tdIcons = (tdPage.match(/var ICON = \{([\s\S]*?)\n  \};/) || [])[1] || '';
  ok(towerKinds.every((k) => new RegExp('\\b' + k + ": \\{ base: '[^']+', mark: '[^']+' \\}").test(tdIcons)), 'هر برج شکل پایه و نماد خودش را دارد');
  const tdBases = towerKinds.map((k) => ((tdIcons.match(new RegExp(k + ": \\{ base: '([^']+)'")) || [])[1]));
  ok(new Set(tdBases).size === 4, 'شکل پایه‌ی چهار برج با هم فرق دارد');
  ok(/iconSvg\(k, def\.color\)/.test(tdPage) && /iconPath\(t\.kind, 'mark'\)/.test(tdPage), 'دکمه و نقشه از یک جدول نماد می‌خوانند');

  // Each white mark must sit inside its base shape with room for its stroke (#249): the
  // archer's diagonal arrow ran out of the triangle and looked broken on a phone.
  // Marks use M/L/H/V (either case) and half-circle arcs only, so their points can be
  // read exactly; anything else fails as unreadable rather than passing unchecked.
  const markPoints = (d) => {
    const toks = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
    const pts = [];
    let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0;
    const num = () => parseFloat(toks[i++]);
    while (i < toks.length) {
      if (/[A-Za-z]/.test(toks[i])) cmd = toks[i++];
      const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
      if (C === 'Z') { x = sx; y = sy; continue; }
      if (C === 'M' || C === 'L') { const a = num(), b = num(); x = rel ? x + a : a; y = rel ? y + b : b; if (C === 'M') { sx = x; sy = y; cmd = rel ? 'l' : 'L'; } pts.push([x, y]); }
      else if (C === 'H') { const a = num(); x = rel ? x + a : a; pts.push([x, y]); }
      else if (C === 'V') { const a = num(); y = rel ? y + a : a; pts.push([x, y]); }
      else if (C === 'A') {
        const r = num(); num(); num(); num(); num(); const a = num(), b = num();
        const ex = rel ? x + a : a, ey = rel ? y + b : b;
        if (Math.abs(Math.hypot(ex - x, ey - y) - 2 * r) > 0.01) return null;
        const cx = (x + ex) / 2, cy = (y + ey) / 2;
        pts.push([cx - r, cy], [cx + r, cy], [cx, cy - r], [cx, cy + r]);
        x = ex; y = ey;
      } else return null;
    }
    return pts;
  };
  const PAD = 1.2;   // half the 2.2 stroke, plus a little air
  const inPoly = (poly, p) => poly.every((a, k) => {
    const b = poly[(k + 1) % poly.length];
    const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    return cross / Math.hypot(b[0] - a[0], b[1] - a[1]) >= PAD;
  });
  const inside = {
    archer: (p) => inPoly([[12, 2], [22.5, 21], [1.5, 21]], p),
    cannon: (p) => Math.hypot(p[0] - 12, p[1] - 12) <= 10.5 - PAD,
    frost: (p) => inPoly([[12, 1.5], [21.1, 6.75], [21.1, 17.25], [12, 22.5], [2.9, 17.25], [2.9, 6.75]], p),
    tesla: (p) => p[0] >= 3.5 + PAD && p[0] <= 20.5 - PAD && p[1] >= 1.5 + PAD && p[1] <= 22.5 - PAD
  };
  for (const k of towerKinds) {
    const mark = (tdIcons.match(new RegExp(k + ": \\{ base: '[^']+', mark: '([^']+)'")) || [])[1] || '';
    const pts = markPoints(mark);
    const out = pts ? pts.filter((p) => !inside[k](p)) : null;
    ok(pts && pts.length > 0 && out.length === 0, k + ': the icon mark stays inside its shape (' + (pts ? out.length + ' of ' + pts.length + ' points outside' : 'unreadable path') + ')');
  }
  ok(!/C\.ui\.toast\(\{ icon: 'coin', title: C\.t\('noMoney'\)/.test(tdPage), 'کم‌پولی دیگر اعلان بالای صفحه نیست');
  ok(/C\.num\(S\.money\) \+ ' \/ ' \+ C\.num\(cost\)/.test(tdPage), 'برجی که پولش نمی‌رسد «طلا / قیمت» نشان می‌دهد');
  const tdToasts = (tdPage.match(/C\.ui\.toast\(\{[^}]*\}/g) || []).filter((t) => t.indexOf("'dailyDone'") < 0);
  ok(tdToasts.length === 0, 'پیام‌های وسط بازی زیر نوار برج‌ها می‌آیند، نه اعلان بالای صفحه (' + tdToasts.length + ')');
  const coreSrc139 = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const toastFn = (coreSrc139.match(/  ui\.toast = function \(o\) \{[\s\S]*?\n  \};/) || [''])[0];
  ok(/_chKey === key/.test(toastFn) && /return old;/.test(toastFn), 'هسته پیام یکسان را دوباره روی هم نمی‌چیند');
}

/* --------------------------------------------------- فایل‌های ثابت */
let games = [];
function testFiles() {
  head('فایل‌ها و فهرست');
  games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  ok(games.length >= 4, 'games.json حداقل چهار بازی دارد');
  for (const g of games) {
    ok(fs.existsSync(path.join(ROOT, 'www', g.path)), g.id + ': فایل بازی هست');
    ok(fs.existsSync(path.join(ROOT, 'www', g.icon)), g.id + ': آیکون هست');
    ok(LOCALE_CODES.every((c) => g.name[c] && g.summary[c]), g.id + ': برای هر زبان جدول هسته نام و توضیح دارد (' + LOCALE_CODES.join(',') + ')');
    ok(/^#[0-9A-Fa-f]{6}$/.test(g.color), g.id + ': رنگ تأکید معتبر است');
    const html = fs.readFileSync(path.join(ROOT, 'www', g.path), 'utf8');
    ok(/dir="rtl"/.test(html), g.id + ': صفحه راست‌چین است');
    ok(html.indexOf('../../lib/chogan.css') > 0, g.id + ': از سیستم طراحی مشترک استفاده می‌کند');
    ok(html.indexOf('../../lib/chogan.js') > 0, g.id + ': به هسته وصل است');
    ok(!/https?:\/\/(?!www\.w3\.org)/.test(html.replace(/github\.com\/choganhq/g, '')), g.id + ': هیچ منبع بیرونی بار نمی‌کند');
  }
  // Every game sits in one of the menu's categories, or it would only show under All (#283)
  const menu = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
  const catsM = menu.match(/var CATS = \[([^\]]*)\]/);
  const cats = catsM ? catsM[1].split(',').map((x) => x.trim().replace(/'/g, '')) : [];
  ok(cats.length >= 2, 'the menu lists its game categories (' + cats.join(',') + ')');
  const offCat = games.filter((g) => cats.indexOf(g.cat) < 0).map((g) => g.id);
  ok(games.length > 0 && offCat.length === 0, 'every game in games.json has a menu category' + (offCat.length ? ' (missing: ' + offCat.join(',') + ')' : ''));
  ok(cats.every((c) => games.some((g) => g.cat === c)), 'no category is empty');
  const catLabels = ['all'].concat(cats).map((c) => 'cat' + c.charAt(0).toUpperCase() + c.slice(1));
  const noLabel = catLabels.filter((k) => (menu.match(new RegExp('\\b' + k + ": '[^']+'", 'g')) || []).length !== LOCALE_CODES.length);
  ok(noLabel.length === 0, 'each category has a label in every language' + (noLabel.length ? ' (' + noLabel.join(',') + ')' : ''));
  ok(/GAMES\.filter\(function \(g\) \{ return g\.cat === c(?: && peopleFit\(g, people\))?; \}\)/.test(menu) && /settings\.gameCat/.test(menu), 'the menu groups the games by cat and remembers the chosen category');
  // A full render() scrolls to the top, so a chip or a pin tap must not jump the page (#285)
  const chipFn = (menu.match(/C\.ui\.segmented\(\['all'\][\s\S]*?function \(v\) \{([\s\S]*?)\n    \}\);/) || [])[1] || '';
  ok(/drawGames\(\)/.test(chipFn) && !/render\(/.test(chipFn), 'a category chip redraws only the games, not the whole page');
  ok(/C\.pins\.toggle\(g\.id\);[\s\S]{0,80}render\(true\)/.test(menu) && /window\.scrollTo\(0, keep \? y : 0\)/.test(menu), 'a pin tap keeps the scroll position');

  // An 18px pin at 1.9 stroke and 45% opacity was a faint smudge on a 173px card (#289)
  const pinCss = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const pinSize = +((menu.match(/C\.icon\('pin', (\d+)\)/) || [])[1] || 0);
  ok(pinSize >= 22, 'the pin icon on a menu card is at least 22px (' + pinSize + ')');
  const pinStroke = +((pinCss.match(/\.ch-game__pin svg \{[^}]*stroke-width: ([\d.]+)/) || [])[1] || 0);
  const pinOp = +((pinCss.match(/\.ch-game__pin \{[^}]*opacity: ([\d.]+)/) || [])[1] || 0);
  ok(pinStroke >= 2.2 && pinOp >= 0.6, 'the pin icon is drawn bold enough to see (stroke ' + pinStroke + ', opacity ' + pinOp + ')');
  ok(/\.ch-game__pin--on \{[^}]*background-color:/.test(pinCss), 'a pinned card shows a filled circle behind its pin');

  // Five languages wrapped onto two rows at every phone width, Español alone below (#291)
  const langCss = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const langPad = +((langCss.match(/\.ch-seg\.ch-langs button \{[^}]*padding-inline: (\d+)px/) || [])[1] || 99);
  ok(/function langPicker[\s\S]{0,250}classList\.add\([^)]*'ch-langs'/.test(menu) && langPad <= 6, 'the language picker uses narrow buttons so five languages fit one phone row (padding ' + langPad + ')');
  // A sixth language sat alone on a full-width second row (#542): three even columns on a phone
  ok(/\.ch-seg\.ch-langs \{[^}]*display: grid;[^}]*grid-template-columns: repeat\(3, 1fr\)/.test(langCss) && LOCALE_CODES.length % 3 === 0, 'the language picker is two even rows of three on a phone (' + LOCALE_CODES.length + ' languages)');

  // The show-welcome button was labelled with 'play' and read «بازی» (#295)
  ok(/C\.t\('showWelcome'\) \}\),[\s\S]{0,200}text: C\.t\('showBtn'\)/.test(menu) && (menu.match(/\bshowBtn: '[^']+'/g) || []).length === LOCALE_CODES.length, 'the show-welcome button has its own "Show" label in every language');

  // The country was a two-letter text box nobody knew what to type into (#293)
  const countrySrc = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const ccList = ((countrySrc.match(/var COUNTRY_CODES = '([A-Z ]+)'\.split/) || [])[1] || '').split(' ').filter(Boolean);
  ok(ccList.length >= 249 && new Set(ccList).size === ccList.length && ccList.every((c) => /^[A-Z]{2}$/.test(c)) && ['IR', 'GB', 'US', 'IN', 'DE', 'CN'].every((c) => ccList.includes(c)), 'the country list has every ISO country once (' + ccList.length + ')');
  ok(/new Intl\.DisplayNames\(\[tag\], \{ type: 'region' \}\)/.test(countrySrc), 'countries are named in the app language');
  ok(/var countryInput = el\('select'/.test(menu) && /C\.countries\(\)/.test(menu) && !/maxlength: '2'/.test(menu), 'the profile picks the country from a list, not a code box');

  // Profile listed every game twice, under "Per game" and again under "Erase data" (#292)
  const dangerSrc = (menu.match(/var danger = el\('div', \{ class: 'ch-card' \}\);([\s\S]*?)sectionHead\(C\.t\('dangerZone'\)\)/) || [])[1] || '';
  ok(dangerSrc.length > 0 && !/GAMES\.forEach\(function \(g\) \{\s*danger\.appendChild/.test(dangerSrc) && /wipeAll/.test(dangerSrc), 'the erase-data card no longer lists every game, only erase everything');
  ok(/class: 'ch-card ch-pergame'/.test(menu) && /onclick: function \(\) \{ C\.feedback\('tap'\); gameSheet\(g\); \}/.test(menu) && /\.ch-pergame \{[^}]*max-height: \d+px; overflow-y: auto/.test(fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8')), 'the per-game list scrolls in a box and a row opens the game sheet');
  const sheetSrc = (menu.match(/function gameSheet\(g\) \{([\s\S]*?)\n  \}\n/) || [])[1] || '';
  ok(/C\.storage\(g\.id\)\.wipe\(\)/.test(sheetSrc) && /C\.t\('eraseWhat'\)/.test(sheetSrc) && /remove\('tutSeen'\); goGame\(g\)/.test(sheetSrc), 'the game sheet erases the game, says what is erased, and reopens its tutorial');
  ok(['howToPlay', 'eraseGame', 'eraseWhat'].every((k) => (menu.match(new RegExp('\\b' + k + ": '", 'g')) || []).length === LOCALE_CODES.length), 'the game sheet strings exist in every language');

  // The About card explains the name (#311)
  ok(/text: C\.t\('whyName'\) \}\),[\s\S]{0,400}C\.t\('whyText'\)[\s\S]{0,120}C\.t\('whyText2'\)/.test(menu) &&
    ['whyName', 'whyText', 'whyText2'].every((k) => (menu.match(new RegExp('\\b' + k + ": '", 'g')) || []).length === LOCALE_CODES.length) &&
    /### Why Chogan/.test(fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8')) && /### چرا چوگان/.test(fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8')),
    'About explains the name Chogan in every language, and the README does too');

  const tpl = fs.readFileSync(path.join(ROOT, 'template/game/index.html'), 'utf8');
  ok(/ENGINE START/.test(tpl) && /ENGINE END/.test(tpl), 'قالب نشانه‌ی موتور را دارد');
  ok(tpl.indexOf('../../lib/chogan.js') > 0, 'قالب به هسته وصل است');
  ok(/\.daily\(/.test(tpl), 'قالب چالش روزانه را نشان می‌دهد');
  ok(/ctx\.autosave\(/.test(tpl), 'قالب ذخیره‌ی خودکار را نشان می‌دهد');

  const ver = fs.readFileSync(path.join(ROOT, 'www/version.js'), 'utf8');
  ok(/APP_VERSION\s*=\s*'[\d.]+'/.test(ver), 'نسخه در version.js خوانا است');
  const sw = fs.readFileSync(path.join(ROOT, 'www/sw.js'), 'utf8');
  ok(sw.indexOf('games.json') > 0, 'سرویس‌ورکر فهرست بازی‌ها را از games.json می‌گیرد');
  ok(sw.indexOf('fonts/vazirmatn-variable.woff2') > 0, 'فونت در فهرست کش هست');
  // فراخوانی واقعی، نه اشاره‌ی داخل توضیح
  const jsFiles = ['www/lib/chogan.js', 'www/index.html'].concat(games.map((g) => 'www/' + g.path));
  for (const f of jsFiles) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    ok(src.indexOf('localStorage.clear(') < 0, f + ': localStorage.clear صدا زده نمی‌شود');
    ok(!/history\.(pushState|replaceState)\s*\(/.test(src), f + ': تاریخچه دستکاری نمی‌شود');
  }
  // اف‌دروید با نسخه‌ی داخل gradle-wrapper.properties می‌سازد. اگر ورک‌فلو
  // نسخه‌ی دیگری را دستی پین کند، CI سبز می‌شود و اف‌دروید چیز دیگری می‌سازد.
  const wrapper = fs.readFileSync(path.join(ROOT, 'android/gradle/wrapper/gradle-wrapper.properties'), 'utf8');
  const gradleVer = (wrapper.match(/gradle-([0-9][^-]*)-bin\.zip/) || [])[1];
  ok(!!gradleVer, 'نسخه‌ی گردل از gradle-wrapper.properties خوانده می‌شود');
  ok(/distributionSha256Sum=[0-9a-f]{64}/.test(wrapper), 'توزیع گردل چک‌سام دارد');
  // هر ورک‌فلویی که اندروید می‌سازد باید گردل را از فایل wrapper بگیرد. قبلاً حلقه
  // ورک‌فلوی بدون setup-gradle را با continue رد می‌کرد، پس حذف setup-gradle چهار
  // بررسی را بی‌صدا از بین می‌برد و تست سبز می‌ماند.
  const wfDirGradle = path.join(ROOT, '.github/workflows');
  const wfAll = fs.readdirSync(wfDirGradle).filter((f) => /\.ya?ml$/.test(f));
  const builders = wfAll.filter((f) =>
    /\bgradle\b[^\n]*\b(assemble|bundle)[A-Za-z]*/.test(fs.readFileSync(path.join(wfDirGradle, f), 'utf8')));
  ok(builders.indexOf('test.yml') >= 0 && builders.indexOf('release.yml') >= 0,
    'ورک‌فلوهای بیلد اندروید test.yml و release.yml پیدا شدند (' + builders.join(', ') + ')');
  for (const wf of builders) {
    const y = fs.readFileSync(path.join(wfDirGradle, wf), 'utf8');
    ok(y.indexOf('gradle/actions/setup-gradle') >= 0, wf + ': اندروید می‌سازد پس setup-gradle دارد');
    ok(!/gradle-version:\s*'([^']+)'/.test(y), wf + ': نسخه‌ی گردل دستی پین نشده');
    ok(/gradle-version:\s*\$\{\{\s*steps\.gradleversion\.outputs\.version/.test(y),
      wf + ': نسخه‌ی گردل از فایل wrapper می‌آید');
  }

  // اف‌دروید توضیح انتشار را در ۵۰۰ کاراکتر بی‌صدا می‌برد (char_limits.whatsNew)،
  // پس متن بلند وسط جمله قیچی می‌شود بدون اینکه جایی خطا بدهد.
  const CHANGELOG_LIMIT = 500;
  const verSrcTxt = fs.readFileSync(path.join(ROOT, 'www/version.js'), 'utf8');
  const code = verSrcTxt.match(/APP_VERSION_CODE\s*=\s*(\d+)/)[1];
  const flDir = path.join(ROOT, 'fastlane/metadata/android');
  const flLocales = fs.readdirSync(flDir).filter((d) => fs.statSync(path.join(flDir, d)).isDirectory());
  ok(flLocales.length > 0, 'فهرست زبان‌های فستلین خالی نیست');
  for (const need of ['en-US', 'fa']) ok(flLocales.indexOf(need) >= 0, 'متادیتای فستلین برای ' + need + ' هست');
  for (const loc of flLocales) {
    // عنوان و توضیح کوتاه سقف دارند و اف‌دروید بی‌صدا می‌بردشان
    for (const [file, cap] of [['title.txt', 50], ['short_description.txt', 80]]) {
      const fp = path.join(flDir, loc, file);
      if (!fs.existsSync(fp)) continue;
      const text = fs.readFileSync(fp, 'utf8').trim();
      ok(text.length > 0 && text.length <= cap, loc + '/' + file + ': ' + text.length + ' نویسه، سقف ' + cap);
    }
  }
  // هر زبانی که پوشه‌ی توضیح انتشار دارد باید برای کد نسخه‌ی فعلی هم یکی داشته باشد،
  // وگرنه کاربر آن زبان توضیح نسخه‌ی قبلی را می‌بیند
  const clLocales = flLocales.filter((l) => fs.existsSync(path.join(flDir, l, 'changelogs')));
  ok(clLocales.length >= 2, 'زبان‌های دارای توضیح انتشار: ' + clLocales.join(','));
  for (const loc of clLocales) {
    const dir = path.join(ROOT, 'fastlane/metadata/android', loc, 'changelogs');
    for (const f of fs.readdirSync(dir)) {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      ok(text.length <= CHANGELOG_LIMIT, loc + '/' + f + ' زیر ' + CHANGELOG_LIMIT + ' کاراکتر است (' + text.length + ')');
    }
    ok(fs.existsSync(path.join(dir, code + '.txt')), loc + ': توضیح انتشار برای کد نسخه‌ی ' + code + ' هست');
  }

  // یک منیفست با نام محلی‌شده. پیش‌فرض انگلیسی است تا کاربر آلمانی هم اسم
  // خوانا بگیرد، و فارسی به شکل name_localized اضافه شده تا مرورگر خودش
  // بر اساس زبان دستگاه انتخاب کند و اسم موقع نصب قفل نشود.
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/manifest.webmanifest'), 'utf8'));
  ok(man.name === 'Chogan' && man.lang === 'en' && man.dir === 'ltr', 'پیش‌فرض منیفست انگلیسی است');
  ok(!fs.existsSync(path.join(ROOT, 'www/manifest-en.webmanifest')), 'منیفست دوم حذف شده');
  for (const k of ['name_localized', 'short_name_localized', 'description_localized']) {
    ok(man[k] && man[k].fa, 'منیفست ' + k + ' فارسی دارد');
  }
  // An installed app's description follows the device language; Spanish was missing until #256
  const manLang = { fa: 'fa', zh: 'zh-Hans', de: 'de', es: 'es', pl: 'pl' };
  ok(LOCALE_CODES.filter((c) => c !== 'en').every((c) => man.description_localized[manLang[c]] && man.description_localized[manLang[c]].value), 'the manifest describes the app in every language');
  ok(man.name_localized.fa.value === 'چوگان', 'نام فارسی در منیفست درست است');
  // The installed desktop app showed the browser's own title bar above the app's (#344)
  const dov = man.display_override || [];
  ok(dov[0] === 'window-controls-overlay' && dov.includes('standalone') && man.display === 'standalone', 'the manifest asks for the window controls overlay first and keeps standalone');
  const wcoCss = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const wco = (wcoCss.match(/@media \(display-mode: window-controls-overlay\) \{([\s\S]*?)\n\}/) || [])[1] || '';
  ok(wco.length > 200, 'the overlay rules sit in their own display-mode block');
  ok(['x', 'width', 'height'].every((v) => new RegExp('env\\(titlebar-area-' + v + ', [^)]+\\)').test(wco)), 'they read the titlebar-area variables, each with a fallback');
  ok(/\.ch-gamebar \{[^}]*max\(var\(--safe-r\), var\(--tb-r\)\)[^}]*max\(var\(--safe-l\), var\(--tb-l\)\)[^}]*app-region: drag/.test(wco), 'the game bar keeps clear of the controls on both sides and drags the window');
  ok(/\.ch-gamebar button[^{]*\{[^}]*app-region: no-drag/.test(wco), 'its buttons stay clickable');
  ok(/--safe-t: max\(env\(safe-area-inset-top, 0px\), var\(--tb-h\)\)/.test(wco), 'everything else clears the controls strip at the top');
  ok(!/titlebar-area/.test(wcoCss.replace(wco, '')), 'no titlebar rule leaks outside the display-mode block');
  // Five languages in one pill ran past the card at 390px and scrolled the page sideways (#256)
  const menuSrc = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
  const cssSrc = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8');
  ok(!/C\.ui\.segmented\(C\.locales\(\)/.test(menuSrc.replace(/function langPicker[\s\S]*?\n  \}/, '')) && (menuSrc.match(/langPicker\(/g) || []).length === 3, 'both language pickers use the wrapping langPicker');
  ok(/\.ch-seg--wrap \{[^}]*flex-wrap: wrap;[^}]*width: 100%;/.test(cssSrc), 'the language picker wraps inside its card');
  // On a phone turned sideways the bottom bar took 62px of a ~360px screen (#538)
  const rail = (wcoCss.match(/@media \(orientation: landscape\) and \(max-height: (\d+)px\) \{([\s\S]*?)\n\}/) || []);
  ok(+rail[1] >= 430 && +rail[1] <= 600, 'a short landscape window (a turned phone, not a desktop) gets its own nav rules');
  const railCss = rail[2] || '';
  ok(/\n  \.ch-nav \{[^}]*inset-inline-start: 0;[^}]*top: 0;[^}]*flex-direction: column;/.test(railCss) && /\.ch-nav__in \{[^}]*flex-direction: column;/.test(railCss), 'there the nav is a column on the reading side');
  ok(/\[dir="rtl"\] body\.ch-menu \{[^}]*padding-right: calc\(var\(--nav-w\) \+ var\(--safe-r\)\)/.test(railCss) && /\[dir="ltr"\] body\.ch-menu \{[^}]*padding-left: calc\(var\(--nav-w\) \+ var\(--safe-l\)\)/.test(railCss), 'the menu makes room for the rail on its side in both directions');
  ok(/\.ch-page \{ padding-bottom: calc\(var\(--s-7\) \+ var\(--safe-b\)\); \}/.test(railCss) && /\.ch-update \{ bottom: calc\(var\(--s-3\) \+ var\(--safe-b\)\);/.test(railCss), 'the page and update bar stop leaving room for a bottom bar');
  // spend(-5) raised the balance and spend(NaN) saved it as null (#540); run the shipped coin code
  const coinSrc = (fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8').match(/(?:  function isPrice[^\n]*\n)?  var coinsApi = \{[\s\S]*?\n  \};/) || [])[0];
  ok(!!coinSrc, 'the coin API is found in the core');
  const coinRun = (start, fn) => {
    const saved = {}, box = { saved, state: { coins: start }, appStore: { get: (k, d) => k in saved ? saved[k] : d, set: (k, v) => { saved[k] = v; } },
      mutate() {}, bump() {}, Chogan: { achievements: { check() {} }, ui: { refreshCoins() {}, coinFly() {} } } };
    vm.createContext(box);
    vm.runInContext(coinSrc + '\nthis.out = (' + fn + ')(coinsApi);', box);
    return { out: box.out, coins: box.state.coins, saved: 'coins' in saved ? saved.coins : 'unsaved' };
  };
  const badPrices = ['0', '-5', '1.5', 'NaN', 'Infinity', '"10"', 'undefined'];
  ok(badPrices.length === 7, 'seven bad prices are tried');
  badPrices.forEach((n) => {
    const r = coinRun(100, 'function (c) { return [c.can(' + n + '), c.spend(' + n + ')]; }');
    ok(r.out[0] === false && r.out[1] === false && r.coins === 100 && r.saved === 'unsaved', 'can and spend refuse ' + n + ' and leave 100 coins untouched (got ' + JSON.stringify(r) + ')');
  });
  const paid = coinRun(100, 'function (c) { return [c.can(40), c.spend(40), c.can(61), c.spend(61)]; }');
  ok(JSON.stringify(paid.out) === '[true,true,false,false]' && paid.coins === 60 && paid.saved === 60, 'a real price is still paid, and one over the balance is still refused');
  ok(man.name_localized.fa.dir === 'rtl', 'نام فارسی جهت راست‌به‌چپ دارد');
  ok(man.name_localized.fa.value !== man.name, 'نام فارسی با پیش‌فرض یکی نیست');
  const menuHtml = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
  ok(/<link rel="manifest" href="manifest\.webmanifest">/.test(menuHtml), 'صفحه لینک منیفست دارد');
  const coreSrc = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  // جابه‌جا کردن لینک منیفست اسم را موقع نصب قفل می‌کرد؛ نباید برگردد
  ok(!/link\[rel="manifest"\]/.test(coreSrc), 'هسته لینک منیفست را جابه‌جا نمی‌کند');
  ok(sw.indexOf('manifest-en.webmanifest') < 0, 'منیفست دوم از فهرست کش سرویس‌ورکر رفته');

  // نام لانچر باید با زبان گوشی عوض شود، وگرنه گوشی انگلیسی هم لیبل فارسی می‌گیرد
  const strDefault = fs.readFileSync(path.join(ROOT, 'android/app/src/main/res/values/strings.xml'), 'utf8');
  const strFa = fs.readFileSync(path.join(ROOT, 'android/app/src/main/res/values-fa/strings.xml'), 'utf8');
  ok(/<string name="app_name">Chogan<\/string>/.test(strDefault), 'نام پیش‌فرض لانچر انگلیسی است');
  ok(/<string name="app_name">چوگان<\/string>/.test(strFa), 'نام فارسی لانچر در values-fa هست');
  const gradleApp = fs.readFileSync(path.join(ROOT, 'android/app/build.gradle'), 'utf8');
  // resValue فقط در پوشه‌ی پیش‌فرض می‌نشیند و values-fa را بی‌اثر می‌کند
  ok(!/resValue\s+'string',\s*'app_name'/.test(gradleApp), 'گریدل نام برنامه را روی منابع سوار نمی‌کند');
  const fastlaneEn = fs.readFileSync(path.join(ROOT, 'fastlane/metadata/android/en-US/title.txt'), 'utf8').trim();
  const fastlaneFa = fs.readFileSync(path.join(ROOT, 'fastlane/metadata/android/fa/title.txt'), 'utf8').trim();
  ok(strDefault.indexOf('>' + fastlaneEn + '<') > 0, 'نام لانچر و عنوان اف‌دروید انگلیسی یکی است');
  ok(strFa.indexOf('>' + fastlaneFa + '<') > 0, 'نام لانچر و عنوان اف‌دروید فارسی یکی است');

  const manifest = fs.readFileSync(path.join(ROOT, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  ok(manifest.indexOf('android:label="@string/app_name"') > 0, 'منیفست لیبل را از منابع می‌گیرد');
  const perms = manifest.match(/uses-permission android:name="([^"]+)"/g) || [];
  ok(perms.length === 1 && perms[0].indexOf('VIBRATE') > 0, 'منیفست فقط مجوز لرزش دارد');
  ok(manifest.indexOf('INTERNET') < 0, 'مجوز اینترنت در منیفست نیست');
}


// سرویس‌ورکر را واقعاً در یک محیط ساختگی اجرا می‌کنیم. چرخه‌ی آپدیت را
// نمی‌شود در کروم بدون سر پایدار تست کرد، ولی منطق خود فایل را می‌شود.
function swHarness(build) {
  const src = fs.readFileSync(path.join(ROOT, 'www/sw.js'), 'utf8');
  const verSrc = fs.readFileSync(path.join(ROOT, 'www/version.js'), 'utf8');
  const listeners = {};
  const opened = [];
  const deleted = [];
  const added = [];
  const sandbox = {
    console,
    Request: function (url, init) { this.url = url; this.cache = (init && init.cache) || 'default'; },
    skipWaitingCalls: 0,
    importScripts: function () {
      vm.runInContext(verSrc, sandbox);
      if (build) sandbox.self.APP_BUILD = build;
    },
    caches: {
      keys: () => Promise.resolve([]),
      open: (name) => { opened.push(name); return Promise.resolve({ addAll: (list) => { added.push.apply(added, list); return Promise.resolve(); } }); },
      delete: (name) => { deleted.push(name); return Promise.resolve(true); },
      match: () => Promise.resolve(null)
    },
    // فهرست بازی‌ها را سرویس‌ورکر موقع نصب می‌خواند
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ games: [{ path: 'games/x/index.html' }] }) })
  };
  sandbox.self = sandbox;
  sandbox.clients = { claim: () => Promise.resolve() };
  sandbox.addEventListener = function (name, fn) { (listeners[name] = listeners[name] || []).push(fn); };
  sandbox.skipWaiting = function () { sandbox.skipWaitingCalls++; };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'sw.js' });

  const fire = function (name, event) {
    let waited = null;
    (listeners[name] || []).forEach((fn) => fn(Object.assign({ waitUntil: (p) => { waited = p; } }, event)));
    return waited || Promise.resolve();
  };
  return { sandbox, listeners, opened, deleted, added, fire };
}

function testSw() {
  head('سرویس‌ورکر');
  const plain = swHarness(null);
  const stamped = swHarness('abc123abc123');
  const version = plain.sandbox.self.APP_VERSION;

  return plain.fire('install').then(() => stamped.fire('install')).then(function () {
    ok(plain.opened[0] === 'chogan-v' + version, 'بدون شناسه‌ی بیلد، اسم کش فقط نسخه است');
    ok(stamped.opened[0] === 'chogan-v' + version + '-abc123abc123', 'شناسه‌ی بیلد وارد اسم کش می‌شود');
    ok(plain.opened[0] !== stamped.opened[0], 'دو انتشار وب پشت سر هم دو کش جدا می‌گیرند');
    // #482: a deploy ten minutes after another filled the new cache with the old
    // games.json from the browser's HTTP cache, and the new game was missing
    const urls = stamped.added.map((r) => (typeof r === 'string' ? r : r.url));
    ok(urls.length > 10 && urls.indexOf('./games.json') >= 0 && urls.indexOf('./games/x/index.html') >= 0, 'install caches the shell and every game (' + urls.length + ' files)');
    ok(stamped.added.every((r) => typeof r === 'object' && r.cache === 'reload'), 'every file of a new cache is fetched from the network, not the browser\'s HTTP cache');
    // نصب دیگر بی‌خبر جای نسخه‌ی قبلی را نمی‌گیرد؛ صفحه باید اول از کاربر بپرسد
    ok(stamped.sandbox.skipWaitingCalls === 0, 'نصب، خودش جای نسخه‌ی قبلی را نمی‌گیرد');

    const msg = (stamped.listeners.message || [])[0];
    ok(typeof msg === 'function', 'سرویس‌ورکر به پیام صفحه گوش می‌دهد');
    msg({ data: { type: 'nope' } });
    ok(stamped.sandbox.skipWaitingCalls === 0, 'پیام ناشناس جای‌گزینی را شروع نمی‌کند');
    msg({});
    ok(stamped.sandbox.skipWaitingCalls === 0, 'پیام بدون data خطا نمی‌دهد');
    msg({ data: { type: 'skipWaiting' } });
    ok(stamped.sandbox.skipWaitingCalls === 1, 'پیام skipWaiting صفحه، جای‌گزینی را شروع می‌کند');

    // فعال‌سازی باید هر کشی جز کش فعلی را پاک کند، وگرنه بیلدهای قدیمی جمع می‌شوند
    const current = stamped.opened[0];
    stamped.sandbox.caches.keys = () => Promise.resolve(['chogan-v0.0.1-old', current]);
    return stamped.fire('activate').then(function () {
      ok(stamped.deleted.length === 1 && stamped.deleted[0] === 'chogan-v0.0.1-old',
        'فعال‌سازی فقط کش‌های قدیمی را پاک می‌کند');
    });
  });
}

// مهر نسخه‌ی وب را همان اسکریپتی می‌زند که ورک‌فلو پیجز اجرا می‌کند. مقدارها با
// ورودی‌های ثابت مقایسه می‌شوند نه با خروجی همان بیلد، وگرنه تست به هر دلیلی سبز می‌شد.
function testVersionStamp() {
  head('مهر نسخه‌ی وب');
  const script = path.join(ROOT, 'tools/stamp-version.sh');
  const exists = fs.existsSync(script);
  ok(exists, 'اسکریپت مهر نسخه هست: tools/stamp-version.sh');
  if (!exists) return;

  const repoSrc = fs.readFileSync(path.join(ROOT, 'www/version.js'), 'utf8');
  // اف‌دروید از سورس می‌سازد و version.js را از main می‌خواند؛ فیلدهای استقرار نباید در ریپو باشند
  for (const k of ['APP_ENV', 'APP_COMMIT', 'APP_DEPLOY', 'APP_BUILD']) {
    ok(repoSrc.indexOf(k) < 0, 'نسخه‌ی ریپو ' + k + ' ندارد');
  }
  const intendedVersion = (repoSrc.match(/APP_VERSION\s*=\s*'([^']+)'/) || [])[1];
  const intendedCode = Number((repoSrc.match(/APP_VERSION_CODE\s*=\s*(\d+)/) || [])[1]);

  const SHA = '0123456789abcdef0123456789abcdef01234567';
  const good = { GITHUB_SHA: SHA, GITHUB_RUN_ID: '987654321', GITHUB_RUN_ATTEMPT: '2', APP_ENV: 'production' };

  function stamp(env) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chogan-stamp-'));
    const file = path.join(dir, 'version.js');
    fs.writeFileSync(file, repoSrc);
    const clean = Object.assign({}, process.env);
    for (const k of ['GITHUB_SHA', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'APP_ENV']) delete clean[k];
    const r = spawnSync('bash', [script, file], { env: Object.assign(clean, env), encoding: 'utf8' });
    const out = fs.readFileSync(file, 'utf8');
    fs.rmSync(dir, { recursive: true, force: true });
    return { status: r.status, out: out };
  }

  const r = stamp(good);
  ok(r.status === 0, 'مهر با ورودی درست موفق است (خروج ' + r.status + ')');
  const sb = { self: {} };
  vm.createContext(sb);
  try { vm.runInContext(r.out, sb); } catch (e) { ok(false, 'خروجی مهر جاوااسکریپت معتبر است: ' + e.message); }
  const v = sb.self;
  ok(v.APP_VERSION === intendedVersion, 'APP_VERSION دست نخورده (' + v.APP_VERSION + ')');
  ok(v.APP_VERSION_CODE === intendedCode, 'APP_VERSION_CODE دست نخورده (' + v.APP_VERSION_CODE + ')');
  ok(v.APP_BUILD === SHA.slice(0, 12), 'APP_BUILD دوازده نویسه‌ی اول کامیت است (' + v.APP_BUILD + ')');
  ok(v.APP_COMMIT === SHA, 'APP_COMMIT کل کامیت است (' + v.APP_COMMIT + ')');
  ok(v.APP_ENV === 'production', 'APP_ENV نام محیط است (' + v.APP_ENV + ')');
  ok(v.APP_DEPLOY === '987654321-2', 'APP_DEPLOY شناسه‌ی اجرا و تلاش است (' + v.APP_DEPLOY + ')');

  // ورودی خراب نباید چیز نامعتبری وارد جاوااسکریپت منتشرشده کند
  const bad = [
    ['کامیت غیرهگز', Object.assign({}, good, { GITHUB_SHA: 'not-a-sha' })],
    ['بدون نام محیط', (function () { const e = Object.assign({}, good); delete e.APP_ENV; return e; })()],
    ['نام محیط با کوتیشن', Object.assign({}, good, { APP_ENV: "prod'uction" })],
    ['شناسه‌ی اجرای غیرعددی', Object.assign({}, good, { GITHUB_RUN_ID: '12x' })]
  ];
  for (const [label, env] of bad) {
    const b = stamp(env);
    ok(b.status !== 0, label + ': مهر رد می‌شود (خروج ' + b.status + ')');
    ok(b.out === repoSrc, label + ': فایل دست نخورده می‌ماند');
  }

  // ورک‌فلو باید همین اسکریپت تست‌شده را اجرا کند، نه نسخه‌ی دیگری از منطق
  // انتشار حالا کار pages داخل test.yml است (#52)، پس همان‌جا را می‌خوانیم.
  const testYml = fs.readFileSync(path.join(ROOT, '.github/workflows/test.yml'), 'utf8');
  const pagesJob = (testYml.match(/\n  pages:\n([\s\S]*?)(?=\n  [a-z][a-z0-9_-]*:\n|$)/) || [])[1] || '';
  ok(pagesJob.length > 0, 'کار pages در test.yml برای بررسی مهر پیدا شد');
  ok(/tools\/stamp-version\.sh\s+www\/version\.js/.test(pagesJob), 'انتشار همان tools/stamp-version.sh را اجرا می‌کند');
  ok(/APP_ENV:\s*production/.test(pagesJob), 'انتشار نام محیط را production می‌دهد');
  const wfDirStamp = path.join(ROOT, '.github/workflows');
  const wfFiles = fs.readdirSync(wfDirStamp).filter((f) => /\.ya?ml$/.test(f));
  ok(wfFiles.length > 0, 'فهرست ورک‌فلوها برای بررسی مهر خالی نیست');
  const inline = wfFiles.filter((f) => fs.readFileSync(path.join(wfDirStamp, f), 'utf8').indexOf('self.APP_BUILD') >= 0);
  ok(inline.length === 0, 'منطق مهر درون هیچ ورک‌فلویی تکرار نشده (' + inline.join(', ') + ')');
}

// انتشار وب باید پشت تست‌ها باشد و بعد از انتشار بررسی شود. این بررسی ساختار
// ورک‌فلو را می‌خواند چون خود اجرای اکشنز اینجا در دسترس نیست.
function testDeployGate() {
  head('دروازه‌ی انتشار وب');
  const wfDir = path.join(ROOT, '.github/workflows');
  const workflows = fs.readdirSync(wfDir).filter((f) => /\.ya?ml$/.test(f));
  ok(workflows.length > 0, 'فهرست ورک‌فلوها خالی نیست (' + wfDir + ')');
  ok(!fs.existsSync(path.join(wfDir, 'pages.yml')), 'ورک‌فلو جدای pages.yml که هم‌زمان با تست‌ها منتشر می‌کرد حذف شده');

  const deployers = workflows.filter((f) => fs.readFileSync(path.join(wfDir, f), 'utf8').indexOf('actions/deploy-pages') >= 0);
  ok(deployers.length === 1 && deployers[0] === 'test.yml', 'فقط test.yml منتشر می‌کند (' + deployers.join(', ') + ')');

  const y = fs.readFileSync(path.join(wfDir, 'test.yml'), 'utf8');
  const m = y.match(/\n  pages:\n([\s\S]*?)(?=\n  [a-z][a-z0-9_-]*:\n|$)/);
  ok(!!m, 'کار pages در test.yml هست');
  if (!m) return;
  const job = m[1];
  const needs = (job.match(/^\s{4}needs:\s*\[([^\]]*)\]/m) || [])[1] || '';
  const needed = needs.split(',').map((x) => x.trim()).filter(Boolean);
  ok(needed.indexOf('test') >= 0 && needed.indexOf('android') >= 0, 'انتشار منتظر test و android می‌ماند (' + needed.join(', ') + ')');
  ok(/if:\s*github\.ref == 'refs\/heads\/main'/.test(job), 'انتشار فقط از main');
  ok(/tools\/web-changed\.sh/.test(job) && job.indexOf('git diff') < 0,
    'تصمیم انتشار را همان tools/web-changed.sh تست‌شده می‌گیرد، نه منطق درون YAML');
  const iDeploy = job.indexOf('actions/deploy-pages');
  const iVerify = job.indexOf('tools/verify-deploy.sh');
  ok(iDeploy >= 0 && iVerify > iDeploy, 'بعد از deploy-pages فایل منتشرشده بررسی می‌شود');
  ok(/steps\.deployment\.outputs\.page_url/.test(job.slice(iVerify)), 'بررسی آدرس را از خروجی خود انتشار می‌گیرد');
  ok(/\$GITHUB_SHA"?\s+production\s+"?\$GITHUB_RUN_ID-\$GITHUB_RUN_ATTEMPT/.test(job.slice(iVerify)),
    'بررسی با همین کامیت، production و همین اجرا مقایسه می‌کند');
}

// اسکریپت بررسی را جلوی یک سرور محلی اجرا می‌کنیم. هر حالت خروجی را از مقدار
// مورد انتظار می‌سنجیم؛ بررسی‌ای که با فایل قدیمی یا ۴۰۴ هم سبز شود بی‌فایده است.
function testVerifyDeploy() {
  head('بررسی استقرار');
  const script = path.join(ROOT, 'tools/verify-deploy.sh');
  const exists = fs.existsSync(script);
  ok(exists, 'اسکریپت بررسی استقرار هست: tools/verify-deploy.sh');
  if (!exists) return Promise.resolve();

  const http = require('http');
  const { execFile } = require('child_process');
  const SHA = '0123456789abcdef0123456789abcdef01234567';
  const OTHER = 'fedcba9876543210fedcba9876543210fedcba98';
  let served = null;
  const server = http.createServer((req, res) => {
    if (served === null) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': 'application/javascript' });
    res.end(served);
  });
  const stamped = (commit, env, deploy) =>
    "self.APP_VERSION = '0.2.4';\nself.APP_VERSION_CODE = 6;\n" +
    "self.APP_BUILD = '" + commit.slice(0, 12) + "';\nself.APP_COMMIT = '" + commit + "';\n" +
    "self.APP_ENV = '" + env + "';\nself.APP_DEPLOY = '" + deploy + "';\n";
  const run = (args) => new Promise((resolve) => {
    execFile('bash', [script].concat(args),
      { env: Object.assign({}, process.env, { VERIFY_TRIES: '2', VERIFY_INTERVAL: '0' }) },
      (err, stdout, stderr) => resolve({ code: err ? (typeof err.code === 'number' ? err.code : -1) : 0, out: stdout + stderr }));
  });

  return new Promise((r) => server.listen(0, '127.0.0.1', r)).then(async () => {
    const url = 'http://127.0.0.1:' + server.address().port + '/version.js';
    const cases = [
      ['مطابق', stamped(SHA, 'production', '111-1'), [url, SHA, 'production', '111-1'], 0],
      ['کامیت دیگر', stamped(OTHER, 'production', '111-1'), [url, SHA, 'production', '111-1'], 1],
      ['محیط دیگر', stamped(SHA, 'staging', '111-1'), [url, SHA, 'production', '111-1'], 1],
      ['همان کامیت، استقرار قبلی', stamped(SHA, 'production', '110-1'), [url, SHA, 'production', '111-1'], 1],
      ['فایل بدون فیلدهای هویت', "self.APP_VERSION = '0.2.4';\n", [url, SHA, 'production', '111-1'], 1],
      ['۴۰۴', null, [url, SHA, 'production', '111-1'], 1],
      ['بدون شناسه‌ی استقرار مورد انتظار', stamped(SHA, 'production', '111-1'), [url, SHA, 'production'], 2],
      ['بدون آدرس', stamped(SHA, 'production', '111-1'), ['', SHA, 'production', '111-1'], 2],
      ['کامیت مورد انتظار خراب', stamped(SHA, 'production', '111-1'), [url, 'not-a-sha', 'production', '111-1'], 2]
    ];
    ok(cases.length > 0, 'فهرست حالت‌های بررسی استقرار خالی نیست');
    for (const [label, body, args, want] of cases) {
      served = body;
      const r = await run(args);
      ok(r.code === want, label + ': خروج ' + want + ' (آمد ' + r.code + ')');
    }
  }).finally(() => server.close());
}

// تصمیم انتشار روی یک مخزن گیت آزمایشی واقعی اجرا می‌شود. هر حالت با خروجی
// مورد انتظار مقایسه می‌شود؛ اشتباه در این تصمیم یعنی کاربرها یا نسخه‌ی تازه را
// نمی‌گیرند یا بی‌دلیل کل پوسته را از نو دانلود می‌کنند.
function testWebChanged() {
  head('تشخیص تغییر نسخه‌ی وب');
  const script = path.join(ROOT, 'tools/web-changed.sh');
  const exists = fs.existsSync(script);
  ok(exists, 'اسکریپت تشخیص تغییر هست: tools/web-changed.sh');
  if (!exists) return;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chogan-changed-'));
  const gitEnv = Object.assign({}, process.env, {
    GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.invalid',
    GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.invalid'
  });
  const git = (args) => spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null'].concat(args),
    { cwd: dir, encoding: 'utf8', env: gitEnv });
  const commit = (file) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), file + ' ' + Math.random());
    git(['add', '-A']);
    git(['commit', '-q', '-m', file]);
    return git(['rev-parse', 'HEAD']).stdout.trim();
  };
  git(['init', '-q']);
  const c0 = commit('www/index.html');
  const c1 = commit('README.md');
  const c2 = commit('android/app/build.gradle');
  const c3 = commit('www/lib/chogan.js');
  const c4 = commit('tools/stamp-version.sh');
  const c5 = commit('.github/workflows/test.yml');
  ok([c0, c1, c2, c3, c4, c5].every((c) => /^[0-9a-f]{40}$/.test(c)), 'مخزن آزمایشی ساخته شد');

  const run = (env) => {
    const clean = Object.assign({}, process.env);
    for (const k of ['GITHUB_EVENT_NAME', 'BEFORE', 'GITHUB_SHA']) delete clean[k];
    const r = spawnSync('bash', [script], { cwd: dir, encoding: 'utf8', env: Object.assign(clean, env) });
    return { code: r.status, out: (r.stdout || '').trim() };
  };
  const push = (before, after) => ({ GITHUB_EVENT_NAME: 'push', BEFORE: before, GITHUB_SHA: after });
  const cases = [
    ['فقط مستند', push(c0, c1), 0, 'deploy=false'],
    ['فقط اندروید', push(c1, c2), 0, 'deploy=false'],
    ['مستند و اندروید در یک push', push(c0, c2), 0, 'deploy=false'],
    ['تغییر www', push(c2, c3), 0, 'deploy=true'],
    ['چند کامیت که یکی‌شان www است', push(c1, c3), 0, 'deploy=true'],
    ['اسکریپت مهر نسخه', push(c3, c4), 0, 'deploy=true'],
    ['ورک‌فلو انتشار', push(c4, c5), 0, 'deploy=true'],
    ['اجرای دستی بدون تغییر وب', { GITHUB_EVENT_NAME: 'workflow_dispatch', BEFORE: c0, GITHUB_SHA: c1 }, 0, 'deploy=true'],
    ['کامیت قبلی تمام صفر', push('0'.repeat(40), c1), 0, 'deploy=true'],
    ['کامیت قبلی ناموجود', push('f'.repeat(40), c1), 0, 'deploy=true'],
    ['کامیت قبلی خالی', push('', c1), 0, 'deploy=true'],
    ['کامیت انتشار خراب', push(c0, 'not-a-sha'), 2, '']
  ];
  ok(cases.length > 0, 'فهرست حالت‌های تشخیص تغییر خالی نیست');
  for (const [label, env, wantCode, wantOut] of cases) {
    const r = run(env);
    ok(r.code === wantCode && r.out === wantOut,
      label + ': خروج ' + wantCode + ' و «' + (wantOut || 'بدون خروجی') + '» (آمد ' + r.code + ' و «' + r.out + '»)');
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

// بررسی مرورگر را در حالت‌هایی اجرا می‌کنیم که نمی‌تواند چیزی را بسنجد و خروج ۲ و
// دلیلش را هر دو می‌خواهیم. فقط کد خروج کافی نیست: بدون کروم هر حالتی خروج ۲ می‌داد
// و حالت games.json خراب به دلیل اشتباه سبز می‌شد.
function testBrowserCheckExits() {
  head('خروج بررسی مرورگر');
  const script = path.join(ROOT, 'tools/browser-check.sh');
  const exists = fs.existsSync(script);
  ok(exists, 'اسکریپت بررسی مرورگر هست: tools/browser-check.sh');
  if (!exists) return;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chogan-bc-'));
  const port = String(20000 + (process.pid % 20000));
  const which = (b) => (spawnSync('bash', ['-c', 'command -v ' + b], { encoding: 'utf8' }).stdout || '').trim();

  // ۱. هیچ کرومی روی PATH نیست
  const bin = path.join(tmp, 'bin');
  fs.mkdirSync(bin);
  for (const b of ['bash', 'dirname', 'python3']) {
    const src = which(b);
    ok(!!src, 'ابزار لازم برای تست پیدا شد: ' + b);
    if (src) fs.symlinkSync(src, path.join(bin, b));
  }
  let r = spawnSync(path.join(bin, 'bash'), [script], {
    encoding: 'utf8', env: { HOME: process.env.HOME || tmp, PATH: bin, PORT: port }
  });
  ok(r.status === 2 && /Chrome/.test(r.stderr || ''),
    'بدون کروم: خروج ۲ با دلیل کروم (آمد ' + r.status + '، «' + (r.stderr || '').trim().split('\n').pop() + '»)');

  // ۲ و ۳. کروم «هست» ولی فهرست صفحه‌ها ساخته نمی‌شود. به‌جای کروم /bin/true می‌دهیم
  // تا بررسی کروم رد شود و فقط دلیل games.json سنجیده شود.
  const fakeChrome = which('true');
  ok(!!fakeChrome, 'جایگزین کروم برای تست پیدا شد');
  const mirror = path.join(tmp, 'mirror');
  fs.mkdirSync(path.join(mirror, 'tools'), { recursive: true });
  fs.mkdirSync(path.join(mirror, 'www'));
  for (const e of fs.readdirSync(ROOT)) {
    if (['tools', 'www', '.git'].indexOf(e) < 0) fs.symlinkSync(path.join(ROOT, e), path.join(mirror, e));
  }
  for (const e of fs.readdirSync(path.join(ROOT, 'tools'))) fs.symlinkSync(path.join(ROOT, 'tools', e), path.join(mirror, 'tools', e));
  for (const e of fs.readdirSync(path.join(ROOT, 'www'))) {
    if (e !== 'games.json') fs.symlinkSync(path.join(ROOT, 'www', e), path.join(mirror, 'www', e));
  }
  const cases = [
    ['games.json خراب', '{"games": [ not json'],
    ['games.json بدون بازی', '{"games": []}']
  ];
  ok(cases.length > 0, 'فهرست حالت‌های games.json خالی نیست');
  for (const [label, content] of cases) {
    fs.writeFileSync(path.join(mirror, 'www/games.json'), content);
    r = spawnSync('bash', [path.join(mirror, 'tools/browser-check.sh'), fakeChrome], {
      encoding: 'utf8', env: Object.assign({}, process.env, { PORT: port })
    });
    ok(r.status === 2 && /games\.json/.test(r.stderr || ''),
      label + ': خروج ۲ با دلیل games.json (آمد ' + r.status + '، «' + (r.stderr || '').trim().split('\n').pop() + '»)');
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

// راه‌انداز محیط توسعه باید هر اجرای مرورگر را با پروفایل تازه باز کند و فقط پردازه‌های
// خودش را با شناسه ببندد. خودآزمایی رفتاری‌اش (tools/dev.sh --selftest) کروم لازم
// دارد و در CI اجرا نمی‌شود؛ این بررسی‌های ارزان جلوی برگشتن این دو قاعده را می‌گیرند.
function testDevScript() {
  head('راه‌انداز محیط توسعه');
  const file = path.join(ROOT, 'tools/dev.sh');
  const exists = fs.existsSync(file);
  ok(exists, 'tools/dev.sh هست');
  if (!exists) return;
  ok((fs.statSync(file).mode & 0o111) !== 0, 'tools/dev.sh اجراشدنی است');
  const code = fs.readFileSync(file, 'utf8').split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  ok(!/\b(pkill|killall|pgrep)\b/.test(code), 'tools/dev.sh پردازه را با نام نمی‌کشد');
  ok(/new_profile\(\)\s*\{\s*mktemp -d\b/.test(code), 'پروفایل هر اجرا با mktemp -d تازه ساخته می‌شود');
  ok(/PROFILE=\$\(new_profile\)/.test(code), 'اجرای تعاملی پروفایلش را از new_profile می‌گیرد');
  const launches = code.match(/--user-data-dir=/g) || [];
  ok(launches.length >= 2, 'هر دو مسیر اجرای کروم پروفایل صریح می‌دهند (' + launches.length + ')');
}

// زبان‌ها. جدول هسته مرجع است و داده‌ها باید با آن بخوانند. برگشت کلید ترجمه‌نشده
// باید انگلیسی باشد نه فارسی، وگرنه زبان سوم وسط متنش فارسی راست‌به‌چپ می‌گیرد.
function testLocales() {
  head('زبان‌ها');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const table = (core.match(/var LOCALES = \[([\s\S]*?)\];/) || [])[1] || '';
  ok(table.length > 0, 'جدول LOCALES در هسته هست');
  const codes = (table.match(/code:\s*'([a-z-]+)'/g) || []).map((m) => m.split("'")[1]);
  ok(codes.join(',') === LOCALE_CODES.join(','), 'کدهای زبان: ' + codes.join(','));
  ok(/code: 'fa'[^}]*dir: 'rtl'/.test(table), 'فارسی راست‌به‌چپ است');
  ok((table.match(/dir: 'rtl'/g) || []).length === 1, 'فقط فارسی راست‌به‌چپ است');
  for (const c of codes) ok(new RegExp("code: '" + c + "'[^}]*date: '").test(table), c + ': قالب تاریخ دارد');

  const iEn = core.indexOf('localStrings.en[key]');
  const iFa = core.indexOf('localStrings.fa[key]');
  ok(iEn > 0 && iFa > iEn, 'کلید ترجمه‌نشده اول به انگلیسی برمی‌گردد، بعد فارسی');

  // تشخیص زبان دستگاه را واقعاً اجرا می‌کنیم، نه اینکه به رجکس نگاه کنیم
  const fn = (core.match(/function deviceLang\(\)[\s\S]*?\n  \}/) || [])[0];
  ok(!!fn, 'تابع deviceLang پیدا شد');
  const cases = [
    ['fa-IR', 'fa'], ['fa', 'fa'],
    ['zh-CN', 'zh'], ['zh', 'zh'], ['zh-Hans-CN', 'zh'], ['zh-SG', 'zh'],
    // فقط چینی ساده‌شده داریم؛ سنتی باید انگلیسی بگیرد نه ترجمه‌ی اشتباه
    ['zh-TW', 'en'], ['zh-HK', 'en'], ['zh-Hant', 'en'],
    ['de-DE', 'de'], ['de', 'de'], ['de-AT', 'de'], ['de-CH', 'de'],
    ['es-ES', 'es'], ['es', 'es'], ['es-MX', 'es'], ['es-419', 'es'],
    ['pl-PL', 'pl'], ['pl', 'pl'],
    ['en-GB', 'en'], ['da-DK', 'en'], ['', 'en']
  ];
  ok(cases.length > 0, 'فهرست حالت‌های زبان دستگاه خالی نیست');
  for (const [tag, want] of cases) {
    const sb = { out: null, global: { navigator: { languages: tag ? [tag] : [], language: tag } } };
    vm.createContext(sb);
    vm.runInContext(fn + '\nout = deviceLang();', sb);
    ok(sb.out === want, 'زبان دستگاه ' + (tag || '<خالی>') + ' → ' + want + ' (آمد ' + sb.out + ')');
  }

  // دیکشنری هر زبان نباید کلیدی داشته باشد که در انگلیسی نیست: آن یعنی غلط تایپی
  // که برگشت خودکار پنهانش می‌کند. کلید کم داشتن مجاز است، چون برگشت برای همین است.
  const files = ['www/lib/chogan.js', 'www/index.html', 'template/game/index.html']
    .concat(games.map((g) => 'www/' + g.path));
  ok(files.length > 3, 'فهرست فایل‌های دیکشنری خالی نیست');
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const dict = (code) => {
      const m = src.match(new RegExp("\\n\\s{4,8}" + code + ":\\s*\\{"));
      if (!m) return null;
      let i = src.indexOf('{', m.index), depth = 0, j = i;
      for (; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}' && --depth === 0) break;
      }
      return new Set((src.slice(i, j).match(/[{,]\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/g) || [])
        .map((x) => x.replace(/[{,\s:]/g, '')));
    };
    const en = dict('en');
    ok(!!en && en.size > 0, f + ': دیکشنری انگلیسی دارد');
    for (const c of LOCALE_CODES) {
      if (c === 'en') continue;
      const d = dict(c);
      if (!d) { ok(c !== 'fa', f + ': دیکشنری ' + c + ' اختیاری است'); continue; }
      const stray = [...d].filter((k) => !en.has(k));
      ok(stray.length === 0, f + ' · ' + c + ': کلید بی‌جفت ندارد' + (stray.length ? ' (' + stray.join(',') + ')' : ''));
    }
  }

  // آلمانی کامل ترجمه شده (#121): برگشت به انگلیسی برای کلید جاافتاده است، نه
  // برای نصفِ یک زبان. هر دیکشنری de همه‌ی کلیدهای en را دارد و جای‌نگهدارها یکی‌اند.
  const dictOf = (src, code) => {
    const m = src.match(new RegExp("\\n\\s{4,8}" + code + ":\\s*\\{"));
    if (!m) return null;
    let i = src.indexOf('{', m.index), depth = 0, j = i;
    for (; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}' && --depth === 0) break;
    }
    const out = {};
    const re = /([A-Za-z_][A-Za-z0-9_]*)\s*:\s*'((?:[^'\\]|\\.)*)'/g;
    let x;
    while ((x = re.exec(src.slice(i, j)))) out[x[1]] = x[2];
    return out;
  };
  const holes = (t) => (t.match(/\{[a-z]+\}/g) || []).sort().join();
  // Spanish followed German the same way (#256)
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const en = dictOf(src, 'en') || {};
    for (const code of ['de', 'es', 'pl']) {
      const de = dictOf(src, code);
      ok(!!de, f + ': ' + code + ' dictionary exists');
      if (!de) continue;
      const miss = Object.keys(en).filter((k) => !(k in de));
      ok(Object.keys(en).length > 0 && miss.length === 0, f + ' · ' + code + ': every English key is translated' + (miss.length ? ' (' + miss.join(',') + ')' : ''));
      const badHoles = Object.keys(en).filter((k) => k in de && holes(en[k]) !== holes(de[k]));
      ok(badHoles.length === 0, f + ' · ' + code + ': placeholders match English' + (badHoles.length ? ' (' + badHoles.join(',') + ')' : ''));
    }
  }
  const achLines = core.split('\n').filter((l) => /^\s*\{ id: '[^']+',.*den: '/.test(l));
  ok(achLines.length >= 60, 'فهرست دستاوردها خوانده شد (' + achLines.length + ')');
  const achNoDe = achLines.filter((l) => !/ de: '[^']+', dde: '[^']+'/.test(l) || !/ es: '[^']+', des: '[^']+'/.test(l)).map((l) => l.match(/id: '([^']+)'/)[1]);
  ok(achNoDe.length === 0, 'every award has a German and a Spanish title and description' + (achNoDe.length ? ' (' + achNoDe.join(',') + ')' : ''));
  // «Du» با فعل سوم‌شخص نمی‌خواند («Du gewinnt»)؛ متنی که نام بازیکن می‌گیرد بی‌فعل صرف‌شده نوشته می‌شود
  const thirdPerson = /\{[an]\} (ist|gewinnt|würfelt|kann|hat|passt|zieht)\b/;
  for (const g of games) {
    const de = dictOf(fs.readFileSync(path.join(ROOT, 'www', g.path), 'utf8'), 'de') || {};
    const bad = Object.keys(de).filter((k) => thirdPerson.test(de[k]));
    ok(bad.length === 0, g.id + ' · de: نام بازیکن با فعل سوم‌شخص نیامده' + (bad.length ? ' (' + bad.join(',') + ')' : ''));
  }  const thirdPersonEs = /\{[an]\} (gana|pierde|es|está|tiene|puede|juega|tira|mueve|pasa|empieza|lleva)\b/;
  for (const g of games) {
    const es = dictOf(fs.readFileSync(path.join(ROOT, 'www', g.path), 'utf8'), 'es') || {};
    const bad = Object.keys(es).filter((k) => thirdPersonEs.test(es[k]));
    ok(bad.length === 0, g.id + ' · es: no third-person verb right after a player name' + (bad.length ? ' (' + bad.join(',') + ')' : ''));
  }


  // نام بازی در نوار بالا از شیء name خود بازی می‌آید، نه games.json. نبودن یک
  // زبان در آن شیء نام را فارسی نشان می‌داد: آلمانی در هر پانزده بازی، چینی در پنج تا (#121)
  for (const g of games) {
    const src = fs.readFileSync(path.join(ROOT, 'www', g.path), 'utf8');
    const m = src.match(/\n    name: (\{[^\n]*\}),\n/) || src.match(/\n  var NAME = (\{[^\n]*\});\n/);
    let obj = null;
    try { obj = m ? vm.runInNewContext('(' + m[1] + ')') : null; } catch (e) { obj = null; }
    ok(!!obj, g.id + ': شیء نام بازی خوانده شد');
    const off = LOCALE_CODES.filter((c) => !obj || obj[c] !== g.name[c]);
    ok(off.length === 0, g.id + ': نام بازی در هر زبان با games.json یکی است' + (off.length ? ' (' + off.join(',') + ')' : ''));
  }
  ok(!/cfg\.name\[state\.settings\.lang\] \|\| cfg\.name\.fa/.test(core), 'نام بازیِ ترجمه‌نشده به انگلیسی برمی‌گردد، نه فارسی');
  // نام نقشه‌های دفاع از برج فقط فارسی و انگلیسی داشت و چینی و آلمانی انگلیسی می‌دیدند (#121)
  const tdSrc = fs.readFileSync(path.join(ROOT, 'www/games/tower-defence/index.html'), 'utf8');
  const maps = tdSrc.match(/\{ id: 'm\d', seed: \d+,[^\n]*\}/g) || [];
  ok(maps.length === 6, 'six fixed tower defence maps were read (' + maps.length + ')');
  ok(maps.every((m) => LOCALE_CODES.every((c) => new RegExp('\\b' + c + ": '[^']+'").test(m))), 'هر نقشه در هر زبان نام دارد');
  ok(!/lang === 'fa' \?/.test(tdSrc), 'نام نقشه با یک انتخاب دوزبانه گرفته نمی‌شود');

  // منیفست وب: نام برند لاتین می‌ماند، توضیح چینی اضافه شده
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/manifest.webmanifest'), 'utf8'));
  const dloc = man.description_localized || {};
  const nloc = man.name_localized || {};
  ok(!!dloc['zh-Hans'], 'منیفست توضیح چینی ساده‌شده دارد');
  ok((dloc['zh-Hans'] || {}).dir === 'ltr', 'توضیح چینی چپ‌به‌راست است');
  ok(!nloc['zh-Hans'], 'نام برند برای چینی ترجمه نشده و لاتین می‌ماند');
  ok(!!dloc.de && dloc.de.dir === 'ltr', 'منیفست توضیح آلمانی دارد');
  ok(!nloc.de, 'نام برند برای آلمانی هم لاتین می‌ماند');
}

/* ------------------------------------------------- منو و دستاوردها */
// تابع واقعی منو را بیرون می‌کشیم و با هسته‌ی ساختگی اجرا می‌کنیم (#85).
/* ------------------------------------------------- card art and backs */
// Runs the real Chogan.cards block from the core against a small DOM stand-in (#181)
function testCardArt() {
  head('Card art and card backs');
  const coreJs = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const coreCss = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8');
  const m = coreJs.match(/\n  Chogan\.cards = \(function \(\) \{[\s\S]*?\n  \}\)\(\);\n/);
  ok(!!m, 'the shared deck block is found in the core');
  if (!m) return;
  const styles = [];
  const root = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
  const fake = (tag, props, kids) => ({ tag, props: props || {}, kids: kids || [], attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(t, fn) { this['on' + t] = fn; } });
  const box = {
    Chogan: { t: (k) => k, feedback() {} },
    state: { settings: {} },
    saves: 0,
    el: fake,
    document: {
      head: { appendChild(n) { styles.push(n); } },
      documentElement: root,
      getElementById(id) { return styles.find((n) => n.props.id === id) || null; }
    },
    Math, encodeURIComponent
  };
  box.saveSettings = () => { box.saves++; };
  vm.createContext(box);
  vm.runInContext('var cards = (function(){ var Chogan = this.Chogan; ' + m[0].replace('Chogan.cards =', 'return') + ' }).call(this);', box);
  const K = box.cards;
  ok(!!K && typeof K.faceSvg === 'function', 'the deck block runs on its own');
  if (!K) return;

  const faces = [10, 11, 12].map((r) => K.faceSvg(r));
  ok(faces.every((s) => /^<svg viewBox="0 0 40 44"[^>]*>[\s\S]*<\/svg>$/.test(s) && /fill="currentColor"/.test(s)), 'jack, queen and king are SVG portraits whose robe takes the suit colour');
  ok(new Set(faces).size === 3, 'the three portraits are different');
  // inlined many times per page: an id would collide, an outside reference would break offline
  ok(faces.every((s) => !/\sid=|href|url\(|https?:/.test(s.replace('http://www.w3.org/2000/svg', ''))), 'portraits carry no id, link or outside reference');
  const curlsOf = (s) => (s.match(/stroke="#4A403A" stroke-width="\.38"/g) || []).length;
  ok(curlsOf(faces[2]) >= 40, 'the Shah has a curly beard (' + curlsOf(faces[2]) + ' curls)');
  ok(curlsOf(faces[1]) >= 20, 'the Bibi has curly hair (' + curlsOf(faces[1]) + ' curls)');
  ok(/translate\([^)]*\) rotate\([^)]*\) scale\(0?\.32\)/.test(faces[2]) && /stroke-width="\.7"/.test(faces[0]), 'robes are patterned: boteh on the Shah, frogging on the Sarbaz');
  ok(faces.every((s) => s.length < 24000), 'each portrait stays under 24 KB (largest ' + Math.max(...faces.map((s) => s.length)) + ')');
  ok(K.faceSvg(12) === faces[2], 'a portrait is built once and reused');

  ok(JSON.stringify(K.BACKS) === '["carpet","termeh"]', 'two card backs: carpet and termeh');
  const backs = K.BACKS.map((n) => K.backSvg(n));
  ok(backs.every((s) => /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 50 70">[\s\S]*<\/svg>$/.test(s)), 'each back is one 5:7 SVG picture');
  ok(backs.every((s) => !/\sid=|href|url\(|https?:/.test(s.replace('http://www.w3.org/2000/svg', ''))), 'backs are self-contained, so they work offline as a data URI');
  ok(new Set(backs).size === 2 && backs.every((s) => s.length < 64000), 'the backs differ and each stays under 64 KB (' + backs.map((s) => s.length).join(', ') + ')');

  // the setting: default, switch, persist, reject
  K.applyBack();
  ok(root.attrs['data-pback'] === 'carpet', 'with no choice saved the back is the carpet');
  ok(styles.length === 1 && styles[0].props.id === 'ch-pbacks' && (styles[0].props.text.match(/data:image\/svg\+xml,/g) || []).length === 2 && /\[data-pback="termeh"\] \.ch-pback\{/.test(styles[0].props.text),
    'one style element carries both backs; the root attribute picks one');
  ok(K.setBack('termeh') === true && box.state.settings.cardBack === 'termeh' && box.saves === 1 && root.attrs['data-pback'] === 'termeh', 'choosing termeh saves it and switches every back on the page');
  ok(K.setBack('stars') === false && box.state.settings.cardBack === 'termeh' && box.saves === 1, 'an unknown back is refused and nothing is saved');
  box.state.settings.cardBack = 'stars'; K.applyBack();
  ok(root.attrs['data-pback'] === 'carpet', 'a corrupt saved value falls back to the carpet');
  box.state.settings.cardBack = 'carpet';
  const pick = K.backPicker();
  ok(pick.tag === 'button' && pick.kids.length === 1 && pick.kids[0].props.class === 'ch-pback' && pick.attrs['aria-label'] === 'cardBack: backCarpet', 'the picker shows the current back and names it');
  pick.onclick();
  ok(box.state.settings.cardBack === 'termeh' && pick.attrs['aria-label'] === 'cardBack: backTermeh', 'a tap on the picker moves to the next back');
  pick.onclick();
  ok(box.state.settings.cardBack === 'carpet', 'and wraps around');
  ok(styles.length === 1, 'the backs are injected once, however often they are applied');

  ok(/cardBack: 'carpet'/.test(coreJs.match(/var DEFAULT_SETTINGS = \{[\s\S]*?\};/)[0]), 'the carpet is the default back');
  ok((coreJs.match(/cardBack: '[^']+', backCarpet: '[^']+', backTermeh: '[^']+',/g) || []).length === LOCALE_CODES.length, 'the picker is named in every language');
  ok(/Chogan\.applyTheme\(\);\s*Chogan\.cards\.applyBack\(\);/.test(coreJs), 'the saved back is applied when a page boots');
  ok(/\.ch-pback \{[^}]*100% 100% no-repeat/.test(coreCss) && !/\.ch-pback \{[^}]*data:image/.test(coreCss), 'the CSS stretches one picture over the back instead of tiling a pattern');
  for (const g of ['pasur', 'hokm']) {
    const page = fs.readFileSync(path.join(ROOT, 'www/games', g, 'index.html'), 'utf8');
    ok(/top\.appendChild\(C\.cards\.backPicker\(\)\);/.test(page), g + ' offers the back picker at the top of the table');
    ok(!/\.ch-pback[^{]*\{[^}]*background-size/.test(page), g + ' does not resize the back into a tile');
  }
}

/* --------------------------------------------------------- Block Drop */
function testBlockDrop() {
  head('Block Drop');
  const E = loadEngine('blockdrop', 'BlockDropEngineFactory');
  const key = (cs) => cs.map((c) => c.join(',')).sort().join(' ');

  // pieces: seven, four cells each, the right number of distinct turns
  ok(E.NAMES.join('') === 'IJLOSTZ' && E.SHAPES.length === 7, 'seven pieces');
  ok(E.SHAPES.every((st) => st.length === 4 && st.every((cs) => cs.length === 4 && new Set(cs.map(String)).size === 4)), 'every piece has four cells in each of its four states');
  const turns = E.SHAPES.map((st) => new Set(st.map(key)).size);
  ok(JSON.stringify(turns) === '[4,4,4,1,4,4,4]', 'every piece but the square has four different turns (' + turns + ')');
  // hand-checked states from the published rotation system
  ok(key(E.cells(0, 1)) === key([[2, 0], [2, 1], [2, 2], [2, 3]]), 'the I piece turned right stands in the third column of its box');
  ok(key(E.cells(5, 1)) === key([[1, 0], [1, 1], [2, 1], [1, 2]]), 'the T piece turned right points right');

  // seven-bag: each run of seven holds every piece once; same seed, same order
  const S1 = E.create('sprint', 12345);
  const seq = [S1.cur.t].concat(E.preview(S1, 6));
  ok(new Set(seq).size === 7, 'the first seven pieces are all different');
  const S2 = E.create('sprint', 12345), S3 = E.create('sprint', 999);
  for (let i = 0; i < 30; i++) { E.hardDrop(S2); }
  const S2b = E.create('sprint', 12345);
  for (let i = 0; i < 30; i++) { E.hardDrop(S2b); }
  ok(JSON.stringify(S2.grid) === JSON.stringify(S2b.grid) && S2.score === S2b.score, 'the same seed plays out identically (the daily is the same for everyone)');
  ok(JSON.stringify([S1.cur.t].concat(E.preview(S1, 6))) !== JSON.stringify([S3.cur.t].concat(E.preview(S3, 6))), 'a different seed gives a different order');
  {
    const S = E.create('sprint', 7), bags = [];
    // take pieces off the queue in order; preview refills it a bag at a time
    const all = [S.cur.t];
    while (all.length < 21) { all.push(S.queue.shift()); E.preview(S, 1); }
    for (let b = 0; b < 3; b++) bags.push(new Set(all.slice(b * 7, b * 7 + 7)).size);
    ok(bags.every((n) => n === 7), 'three bags in a row each hold all seven pieces (' + bags + ')');
  }

  // spawning and moving
  const fresh = () => { const S = E.create('sprint', 1); return S; };
  {
    const S = fresh();
    ok(S.cur.x === 3 && S.cur.r === 0 && !S.over, 'a piece spawns in the middle, unturned');
    let n = 0; while (E.move(S, -1)) n++;
    const minX = Math.min(...E.cells(S.cur.t, 0).map((c) => S.cur.x + c[0]));
    ok(minX === 0 && E.move(S, -1) === false, 'a piece stops at the left wall (' + n + ' steps)');
    while (E.move(S, 1)) {}
    const maxX = Math.max(...E.cells(S.cur.t, 0).map((c) => S.cur.x + c[0]));
    ok(maxX === E.W - 1, 'and at the right wall');
  }

  // wall kick, worked out by hand from the I table: flat on the floor, turn right.
  // The plain turn and the first three kicks all reach below the floor; the fifth,
  // (+1, +2 up), stands the piece in column x+3, rows 18 to 21.
  {
    const S = fresh();
    S.cur = { t: 0, r: 0, x: 3, y: 20 };
    ok(!E.collides(S, 0, 0, 3, 20) && E.collides(S, 0, 0, 3, 21), 'setup: the I piece lies on the floor');
    ok(E.rotate(S, 1) === true, 'the I piece turns on the floor by kicking');
    ok(S.cur.r === 1 && key(E.cells(0, 1).map((c) => [S.cur.x + c[0], S.cur.y + c[1]])) === key([[6, 18], [6, 19], [6, 20], [6, 21]]), 'it ends in column 6, rows 18 to 21 (' + S.cur.x + ',' + S.cur.y + ')');
  }
  {
    // boxed in on every side: no state fits, so nothing changes
    const S = fresh();
    for (let i = 0; i < S.grid.length; i++) S.grid[i] = 1;
    S.cur = { t: 5, r: 0, x: 3, y: 10 };
    E.cells(5, 0).forEach((c) => { S.grid[(10 + c[1]) * E.W + 3 + c[0]] = 0; });
    const before = JSON.stringify(S.cur);
    ok(E.rotate(S, 1) === false && JSON.stringify(S.cur) === before, 'a turn with no room is refused and the piece stays put');
    ok(E.rotate(S, -1) === false, 'both ways');
  }

  // line clears and scoring
  function wellBoard() {
    const S = fresh();
    for (let y = E.H - 4; y < E.H; y++) for (let x = 0; x < E.W; x++) if (x !== 9) S.grid[y * E.W + x] = 2;
    S.grid[(E.H - 5) * E.W + 0] = 7;   // a marker block above the stack
    S.cur = { t: 0, r: 1, x: 7, y: 0 }; // vertical I over column 9
    return S;
  }
  {
    const S = wellBoard();
    const drop = E.ghostY(S) - S.cur.y;
    const ev = E.hardDrop(S);
    ok(ev.cleared === 4 && S.lines === 4, 'a vertical I in the well clears four lines');
    ok(S.score === 800 + 2 * drop, 'four lines score 800 at level 1, plus 2 per row hard-dropped (' + S.score + ')');
    ok(S.grid[(E.H - 1) * E.W + 0] === 7 && S.grid.filter((v) => v).length === 1, 'rows above fall into place: the marker block lands on the floor and nothing else is left');
    ok(S.tetrises === 1 && S.b2b === true, 'a four-line clear is counted and starts back-to-back');
    // second four-line clear in a row: 1.5x, plus a combo of 1 (50)
    for (let y = E.H - 4; y < E.H; y++) for (let x = 0; x < E.W; x++) if (x !== 9) S.grid[y * E.W + x] = 2;
    S.grid[(E.H - 1) * E.W + 9] = 0;
    S.cur = { t: 0, r: 1, x: 7, y: 0 };
    const sc = S.score, d2 = E.ghostY(S) - S.cur.y;
    const ev2 = E.hardDrop(S);
    ok(ev2.cleared === 4 && ev2.b2b === true && S.score - sc === 1200 + 50 + 2 * d2, 'back-to-back four lines score 1200, plus 50 for the combo (' + (S.score - sc) + ')');
  }
  {
    const S = fresh();
    for (let x = 0; x < E.W; x++) if (x < 3 || x > 6) S.grid[(E.H - 1) * E.W + x] = 3;
    S.cur = { t: 0, r: 0, x: 3, y: 0 };
    const ev = E.hardDrop(S);
    ok(ev.cleared === 1 && S.lines === 1 && S.b2b === false, 'a flat I fills a gap of four and clears one line');
  }

  // hold
  {
    const S = fresh();
    const first = S.cur.t, second = E.preview(S, 1)[0];
    ok(E.hold(S) === true && S.hold === first && S.cur.t === second, 'hold puts the piece aside and brings the next');
    ok(E.hold(S) === false && S.hold === first, 'only once until a piece locks');
    E.hardDrop(S);
    const now = S.cur.t;
    ok(E.hold(S) === true && S.cur.t === first && S.hold === now, 'after a lock, hold swaps back');
  }

  // gravity, lock delay and its reset limit
  ok(Math.abs(E.gravity(1) - 1) < 1e-9 && E.gravity(10) < E.gravity(5) && E.gravity(5) < E.gravity(1), 'gravity starts at one row a second and speeds up with the level');
  {
    const S = fresh();
    const y0 = S.cur.y;
    E.tick(S, 1.0);
    ok(S.cur.y === y0 + 1, 'one second at level 1 drops the piece one row');
    E.tick(S, 0.06, true);
    ok(S.cur.y === y0 + 2 && S.score === 1, 'soft drop is twenty times faster and scores one per row');
    S.cur.y = E.ghostY(S);
    const pieces = S.pieces;
    E.tick(S, E.LOCK_DELAY * 0.8);
    ok(S.pieces === pieces, 'a grounded piece waits before locking');
    E.move(S, S.cur.x > 0 ? -1 : 1);
    E.tick(S, E.LOCK_DELAY * 0.8);
    ok(S.pieces === pieces, 'moving it on the ground restarts the wait');
    for (let i = 0; i < E.MAX_RESETS + 2; i++) { E.move(S, (i % 2) ? 1 : -1); E.tick(S, E.LOCK_DELAY * 0.3); }
    ok(S.pieces === pieces + 1, 'but not forever: after ' + E.MAX_RESETS + ' resets it locks');
  }

  // end of round
  {
    const S = fresh();
    S.lines = E.SPRINT_LINES - 1;
    for (let x = 0; x < E.W; x++) if (x < 3 || x > 6) S.grid[(E.H - 1) * E.W + x] = 3;
    S.cur = { t: 0, r: 0, x: 3, y: 0 };
    E.hardDrop(S);
    ok(S.won === true && S.lines === E.SPRINT_LINES, 'the sprint is won on line 40');
    ok(E.move(S, 1) === false && E.hardDrop(S) === null, 'nothing moves after the round is over');
  }
  {
    const S = E.create('marathon', 3);
    ok(E.goal(S) === 100 && E.goal(E.create('sprint', 3)) === 40, 'marathon is 100 lines, sprint 40');
    S.lines = 19; S.level = 2;   // as after nineteen lines
    for (let x = 0; x < E.W; x++) if (x < 3 || x > 6) S.grid[(E.H - 1) * E.W + x] = 3;
    S.cur = { t: 0, r: 0, x: 3, y: 0 };
    const d = E.ghostY(S) - S.cur.y;
    E.hardDrop(S);
    ok(S.level === 3 && S.score === 100 * 2 + 2 * d, 'marathon levels up every ten lines and scores by the level it was at (' + S.level + ', ' + S.score + ')');
  }
  {
    const S = fresh();
    for (let y = 0; y < E.H; y++) for (let x = 0; x < E.W; x++) if (x !== y % E.W) S.grid[y * E.W + x] = 4;
    S.cur = { t: 3, r: 0, x: 3, y: 0 };
    const ev = E.lock(S);
    ok(S.over === true && ev.over === true, 'a full board ends the round when the next piece has no room');
  }

  // saving
  {
    const S = E.create('marathon', 4242);
    for (let i = 0; i < 6; i++) { E.move(S, i % 2 ? 1 : -1); E.hardDrop(S); }
    const R = E.restore(JSON.parse(JSON.stringify(E.serialize(S))));
    ok(!!R && JSON.stringify(R) === JSON.stringify(S), 'a game survives a save and load unchanged');
    for (let i = 0; i < 10; i++) { E.hardDrop(S); E.hardDrop(R); }
    ok(JSON.stringify(R.grid) === JSON.stringify(S.grid) && R.cur.t === S.cur.t, 'and goes on with the same pieces after loading');
    ok(E.restore({ grid: [1, 2] }) === null && E.restore(null) === null, 'a broken save is refused');
  }

  // the page
  const page = fs.readFileSync(path.join(ROOT, 'www/games/blockdrop/index.html'), 'utf8');
  ok(/id: 'blockdrop'/.test(page) && /C\.daily\('blockdrop', daily\)/.test(page), 'the page uses its id for saves and the daily seed');
  ok(/\.ch-gamemain \{ touch-action: none/.test(page), 'dragging on the board is not taken as a scroll');
  ok((page.match(/class: 'bd-btn'/g) || []).length === 1 && /\['hold', C\.t\('holdKey'\)\], \['left'/.test(page), 'the touch pad has hold, left, rotate, right, soft drop and drop');
  ok(/'bd-sprint'/.test(page) && /'bd-tetris'/.test(page) && /'bd-marathon'/.test(page), 'the page unlocks its three achievements');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  ok(['bd-sprint', 'bd-tetris', 'bd-marathon'].every((id) => new RegExp("\\{ id: '" + id + "',[^\\n]*dde: '").test(core) && new RegExp("\\{ id: '" + id + "',[^\\n]*des: '").test(core)), 'the achievements are defined in the core in every language');
  ok(!/Tetris/i.test(page.replace(/tetrises|'bd-tetris'|e\.cleared === 4/g, '')), 'the trademark name is not used in the game');
  // A round could only be restarted by switching mode and back (#327)
  ok(/ctx\.button\(\{ icon: 'refresh', label: C\.t\('newRound'\), onClick: askNew \}\)/.test(page), 'the top bar has a new-round button');
  const ask = (page.match(/function askNew\(\) \{[\s\S]*?\n  \}/) || [''])[0];
  ok(/start\(S\.mode, S\.daily\)/.test(ask) && /C\.ui\.confirm\(/.test(ask), 'it starts the same kind of round again and asks first when one is under way');
}

/* ----------------------------------------------------------- Way Out */
function testWayOut() {
  head('Way Out');
  const E = loadEngine('wayout', 'WayOutEngineFactory');
  ok(['make', 'tap', 'restart', 'carryOn', 'useHint', 'levelDone', 'chain', 'pick', 'generate', 'restore'].every((f) => typeof E[f] === 'function'), 'the engine has its API');
  // People who know the genre as "arrow puzzle" did not recognise Way Out (#326); the name stays, the summary says it
  const woMeta = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games.find((g) => g.id === 'wayout');
  const woWord = { fa: 'پازل پیکانی', en: 'arrow puzzle', zh: '箭头谜题', de: 'Pfeil-Puzzle', es: 'puzle de flechas', pl: 'łamigłówka ze strzałkami' };
  ok(woMeta && LOCALE_CODES.every((c) => woWord[c]), 'Way Out is listed and every language has a genre word');
  ok(woMeta && LOCALE_CODES.every((c) => woMeta.summary[c].toLowerCase().includes(woWord[c].toLowerCase())), 'its summary names the genre in every language');
  ok(woMeta && woMeta.name.fa === 'راه دررو' && woMeta.name.en === 'Way Out', 'the name stays Way Out / راه دررو');

  // Boards as text: one row per line, two characters a cell. '..' empty, '##' a hole,
  // 'a>' the head of arrow a and where it points, 'a1', 'a2', ... its body from the head.
  const board = (txt) => {
    const rows = txt.split('\n').map((r) => r.trim().split(/\s+/));
    const w = rows[0].length, h = rows.length, hole = [], by = {};
    rows.forEach((row, y) => row.forEach((t, x) => {
      hole.push(t === '##' ? 1 : 0);
      if (t === '..' || t === '##') return;
      const a = by[t[0]] = by[t[0]] || { c: [] };
      if ('^>v<'.indexOf(t[1]) >= 0) { a.d = '^>v<'.indexOf(t[1]); a.c[0] = y * w + x; } else a.c[+t[1]] = y * w + x;
    }));
    const names = Object.keys(by).sort();
    const S = E.make(w, h, hole.some(Boolean) ? hole : null, names.map((n) => ({ d: by[n].d, c: by[n].c })));
    return { S, names };
  };
  // what one tap did and where the board is now, in the same words every time
  const act = (B, n) => {
    const S = B.S, r = E.tap(S, B.names.indexOf(n));
    const what = r.out ? 'leaves' : (r.ignored ? 'ignored' : 'blocked by ' + B.names[r.by]);
    const names = (f) => B.names.filter((x, i) => f(i)).join('') || '-';
    return what + '; hearts ' + S.hearts + '; left ' + names((i) => !S.gone[i]) + '; struck ' + names((i) => S.struck[i]) + '; ' +
      (S.done ? 'won' : (S.over ? 'over' : 'playing'));
  };
  const T = '.. .. .. b^ ..\na1 a> .. b1 ..\n.. .. .. b2 ..';
  const T4 = '.. .. .. c^ ..\na1 a> .. c1 ..\n.. .. .. c2 ..\nd1 d> .. c3 ..';
  const cases = [
    ['a head on the edge pointing out leaves at once', '.. .. ..\n.. a1 a>', [['a', 'leaves; hearts 3; left -; struck -; won']]],
    ['empty cells on the way never block', '.. .. .. .. ..\na2 a1 a> .. ..', [['a', 'leaves; hearts 3; left -; struck -; won']]],
    ['a body cell blocks and costs a heart', T, [['a', 'blocked by b; hearts 2; left ab; struck a; playing']]],
    ['the last cell of another arrow blocks too', '.. .. .. b^ ..\n.. .. .. b1 ..\na1 a> .. b2 ..', [['a', 'blocked by b; hearts 2; left ab; struck a; playing']]],
    ['so does the head of a free arrow', '.. .. .. .. ..\na1 a> .. b^ ..\n.. .. .. b1 ..\n.. .. .. b2 ..', [['a', 'blocked by b; hearts 2; left ab; struck a; playing']]],
    ['an arrow leaves once its blocker has gone, with no further cost', T, [
      ['a', 'blocked by b; hearts 2; left ab; struck a; playing'], ['b', 'leaves; hearts 2; left a; struck a; playing'], ['a', 'leaves; hearts 2; left -; struck -; won']]],
    ['tapping the same blocked arrow again is free', T, [
      ['a', 'blocked by b; hearts 2; left ab; struck a; playing'], ['a', 'blocked by b; hearts 2; left ab; struck a; playing'], ['a', 'blocked by b; hearts 2; left ab; struck a; playing']]],
    ['two blocked arrows cost a heart each', T4, [
      ['a', 'blocked by c; hearts 2; left acd; struck a; playing'], ['d', 'blocked by c; hearts 1; left acd; struck ad; playing'],
      ['a', 'blocked by c; hearts 1; left acd; struck ad; playing'], ['c', 'leaves; hearts 1; left ad; struck ad; playing'],
      ['a', 'leaves; hearts 1; left d; struck d; playing'], ['d', 'leaves; hearts 1; left -; struck -; won']]],
    ['holes are passed over', 'a1 a> ## ## ..\n.. .. .. .. ..', [['a', 'leaves; hearts 3; left -; struck -; won']]],
    ['an arrow beyond a hole still blocks', 'a1 a> ## b^ ..\n.. .. .. b1 ..', [['a', 'blocked by b; hearts 2; left ab; struck a; playing']]],
    ['a bent arrow leaves by the line from its head; its bend blocks others', '.. .. .. .. ..\n.. .. a2 a1 a>\n.. .. a3 .. ..\nb1 b> a4 .. ..', [
      ['b', 'blocked by a; hearts 2; left ab; struck b; playing'], ['a', 'leaves; hearts 2; left b; struck b; playing'], ['b', 'leaves; hearts 2; left -; struck -; won']]],
    ['a neighbour is free the moment its blocker is tapped away', T, [
      ['b', 'leaves; hearts 3; left a; struck -; playing'], ['a', 'leaves; hearts 3; left -; struck -; won']]],
    ['the third strike ends the attempt and taps are ignored', '.. .. .. d^ ..\na1 a> .. d1 ..\nb1 b> .. d2 ..\nc1 c> .. d3 ..', [
      ['a', 'blocked by d; hearts 2; left abcd; struck a; playing'], ['b', 'blocked by d; hearts 1; left abcd; struck ab; playing'],
      ['c', 'blocked by d; hearts 0; left abcd; struck abc; over'], ['d', 'ignored; hearts 0; left abcd; struck abc; over']]]
  ];
  for (const [what, txt, steps] of cases) {
    const B = board(txt);
    steps.forEach(([n, want], i) => {
      const got = B.S ? act(B, n) : 'no board';
      ok(got === want, what + ' (tap ' + (i + 1) + ' ' + n + ': ' + got + ')');
    });
  }

  // restart, continue, hints
  {
    const B = board(T4), P = E.progress();
    act(B, 'a');
    E.useHint(B.S, P);
    act(B, 'c');
    E.restart(B.S);
    ok(act(B, 'a') === 'blocked by c; hearts 2; left acd; struck a; playing' && P.hints === 2 && B.S.hint === -1,
      'a restart puts every arrow back with three hearts and no marks, and spent hints stay spent');
    const O = board('.. .. .. d^ ..\na1 a> .. d1 ..\nb1 b> .. d2 ..\nc1 c> .. d3 ..');
    ['a', 'b', 'c'].forEach((n) => act(O, n));
    ok(E.carryOn(O.S) && O.S.hearts === 1 && !O.S.over && O.S.struck[0] && E.left(O.S) === 4 && !E.carryOn(O.S),
      'out of hearts, one free continue gives a single heart and keeps the board and marks');
    O.S.over = true; O.S.hearts = 0;
    ok(!E.carryOn(O.S), 'there is only one continue per level');
  }
  {
    const B = board(T4), P = E.progress(), c = B.names.indexOf('c');
    ok(E.useHint(B.S, P) === c && P.hints === 2, 'a hint names the free arrow and uses one hint');
    ok(E.useHint(B.S, P) === -1 && P.hints === 2, 'a second hint is refused while the first is pending');
    act(B, 'c');
    ok(B.S.hint === -1, 'the pending hint clears when its arrow leaves');
    const h = E.useHint(B.S, P);
    ok((h === 0 || h === 2) && P.hints === 1 && E.isFree(B.S, h), 'the next hint names a free arrow (' + h + ')');
    const Z = board(T);
    ok(E.useHint(Z.S, { hints: 0 }) === -1, 'no hint without one in stock');
  }
  {
    const P = E.progress(), got = [];
    for (let lv = 1; lv <= 29; lv++) if (E.levelDone(P, lv)) got.push(lv);
    ok(got.join() === '4,9,14,19,24,29' && P.hints === 9 && P.level === 30, 'hint gifts come after levels 4, 9, 14, 19, 24, 29 (' + got + '), 9 hints by then');
    ok(!E.levelDone(P, 29) && !E.levelDone(P, 12) && P.hints === 9, 'a level number counts for gifts only once');
  }
  {
    const K = { n: 0, at: 0 };
    const steps = [0, 600, 1500, 1900, 3500, 3900].map((t) => E.chain(K, t));
    ok(steps.join() === '-1,0,1,2,-1,0', 'exits within a second build a chain of three looks (' + steps + ')');
  }

  // saving
  {
    const B = board(T);
    act(B, 'a');
    const R = E.restore(JSON.parse(JSON.stringify(B.S)));
    ok(!!R && R.hearts === 2 && R.struck[0] && !R.struck[1] && E.left(R) === 2 && !R.over && !R.done, 'a save comes back with its hearts, marks and arrows');
    const Z = JSON.parse(JSON.stringify(B.S)); Z.hearts = 0;
    const Zr = E.restore(Z);
    ok(!!Zr && Zr.over, 'a save at no hearts comes back out of hearts');
    const D = JSON.parse(JSON.stringify(B.S)); D.gone = [true, true];
    ok(E.restore(D).done, 'a save with every arrow gone comes back won');
    const bad = JSON.parse(JSON.stringify(B.S)); bad.arrows[1].c[1] = bad.arrows[0].c[0];
    ok(E.restore(bad) === null && E.restore({ w: 3 }) === null && E.restore(null) === null, 'a broken save is refused');
  }

  // a forgiving tap: the arrow under the finger, and a free one when two are as close
  {
    const B = board(T);
    ok(E.pick(B.S, 1.5, 1.5) === 0 && E.pick(B.S, 3.5, 0.5) === 1 && E.pick(B.S, 4.6, 2.5) === 1 && E.pick(B.S, 0.5, 2.9) === -1, 'a tap picks the arrow under or next to it');
    const V = board('.. .. .. .. ..\n.. .. a2 a1 a>\n.. .. a3 .. ..\nb1 b> a4 .. ..');
    ok(E.pick(V.S, 1.9, 3.5) === 0 && E.pick(V.S, 1.5, 3.5) === 1, 'when two arrows are that close the free one is taken');
  }

  // the generator, on many levels and seeds
  {
    let maxMs = 0, boards = 0, sound = 0, own = 0, emptied = 0, pockets = 0, runs = 0, bentAll = 0, enough = 0, fit = 0, falls = 0, same = 0;
    let bentShare = 0, shortShare = 0, shapedOk = 0, shapedWant = 0;
    const freeBy = {}, lenBy = {}, countBy = {};
    for (let lv = 1; lv <= 60; lv++) {
      for (let sd = 0; sd < 6; sd++) {
        const t0 = Date.now();
        const S = E.generate(lv, rng(lv * 977 + sd));
        maxMs = Math.max(maxMs, Date.now() - t0);
        boards++;
        if (sd < 2 && JSON.stringify(S) === JSON.stringify(E.generate(lv, rng(lv * 977 + sd)))) same++;
        const n = S.w * S.h, cells = new Map(), min = lv <= 2 ? 2 : 3;
        let good = true;
        S.arrows.forEach((A, a) => {
          if (A.c.length < min) good = false;
          A.c.forEach((c, i) => {
            if (cells.has(c) || (S.hole && S.hole[c]) || c < 0 || c >= n) good = false;
            cells.set(c, a);
            if (i && Math.abs(c % S.w - A.c[i - 1] % S.w) + Math.abs(Math.floor(c / S.w) - Math.floor(A.c[i - 1] / S.w)) !== 1) good = false;
          });
        });
        if (good) sound++;
        if (S.arrows.every((A, a) => E.ray(S, a).every((c) => A.c.indexOf(c) < 0))) own++;
        // any order of free arrows empties the board
        let all = true;
        for (let k = 0; k < 3; k++) {
          const X = E.restore(JSON.parse(JSON.stringify(S))), r = rng(k + lv * 31 + sd);
          while (E.left(X)) {
            const f = E.freeArrows(X);
            if (!f.length) { all = false; break; }
            E.tap(X, f[Math.floor(r() * f.length)]);
          }
        }
        if (all) emptied++;
        // empty pockets inside the shape are at most two cells
        const seen = new Set();
        let big = 0;
        for (let c = 0; c < n; c++) {
          if (seen.has(c) || cells.has(c) || (S.hole && S.hole[c])) continue;
          let size = 0;
          const st = [c];
          seen.add(c);
          while (st.length) {
            const k = st.pop(), x = k % S.w, y = Math.floor(k / S.w);
            size++;
            [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
              const nx = x + dx, ny = y + dy, nk = ny * S.w + nx;
              if (nx < 0 || ny < 0 || nx >= S.w || ny >= S.h || seen.has(nk) || cells.has(nk) || (S.hole && S.hole[nk])) return;
              seen.add(nk); st.push(nk);
            });
          }
          big = Math.max(big, size);
        }
        if (big <= 2) pockets++;
        // no three neighbouring straight arrows side by side pointing straight out of one edge
        const out = (a) => a !== undefined && !E.bent(S.arrows[a]) && !E.ray(S, a).length;
        let worst = 0;
        S.arrows.forEach((A, a) => {
          if (!out(a)) return;
          const hx = A.c[0] % S.w, hy = Math.floor(A.c[0] / S.w), px = E.DY[A.d], py = E.DX[A.d];
          let run = 1;
          for (let s = 1; ; s++) {
            const x = hx + px * s, y = hy + py * s, b = x >= 0 && y >= 0 && x < S.w && y < S.h ? cells.get(y * S.w + x) : undefined;
            if (b === undefined || S.arrows[b].c[0] !== y * S.w + x || S.arrows[b].d !== A.d || !out(b)) break;
            run++;
          }
          worst = Math.max(worst, run);
        });
        if (worst < 3) runs++;
        if (S.arrows.some(E.bent)) bentAll++;
        const play = n - (S.hole ? S.hole.filter(Boolean).length : 0);
        if (S.arrows.length >= Math.floor(play / 12)) enough++;
        if (S.w <= E.MAX_W && S.h <= E.MAX_H) fit++;
        if (lv > 2 && S.w === 3 && S.h === 3) falls++;
        if (lv >= 8 && lv % 4 === 0) { shapedWant++; if (S.hole) shapedOk++; }
        bentShare += S.arrows.filter(E.bent).length / S.arrows.length;
        shortShare += S.arrows.filter((A) => A.c.length <= 3).length / S.arrows.length;
        const band = lv <= 5 ? 'start' : (lv <= 30 ? 'middle' : 'late');
        (freeBy[band] = freeBy[band] || []).push(E.freeArrows(S).length / S.arrows.length);
        (lenBy[band] = lenBy[band] || []).push(cells.size / S.arrows.length);
        (countBy[band] = countBy[band] || []).push(S.arrows.length);
      }
    }
    const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const fr = ['start', 'middle', 'late'].map((b) => avg(freeBy[b])), ln = ['start', 'middle', 'late'].map((b) => avg(lenBy[b]));
    const nc = ['start', 'middle', 'late'].map((b) => avg(countBy[b]));
    ok(same === 120, 'the same level and seed give the same board (' + same + ' of 120)');
    ok(sound === boards, 'arrows never share a cell, sit on holes or break their path; at least 2 cells, 3 after level 2 (' + sound + ' of ' + boards + ')');
    ok(own === boards, 'no arrow has its own body on its way out (' + own + ')');
    ok(emptied === boards, 'removing any free arrow, in any order, always empties the board (' + emptied + ')');
    ok(pockets === boards, 'no empty pocket of more than two cells (' + pockets + ')');
    ok(runs === boards, 'no run of three straight arrows side by side pointing out of one edge (' + runs + ')');
    ok(bentAll === boards && bentShare / boards > 0.55 && bentShare / boards < 0.9, 'every board has a bent arrow, and most arrows are bent (' + (bentShare / boards).toFixed(2) + ')');
    ok(shortShare / boards > 0.15 && shortShare / boards < 0.45, 'about a quarter of the arrows are short (' + (shortShare / boards).toFixed(2) + ')');
    ok(enough === boards, 'never fewer arrows than playable cells / 12 (' + enough + ')');
    ok(fit === boards && falls === 0, 'boards stay within ' + E.MAX_W + ' × ' + E.MAX_H + ' and the fallback board is never needed');
    ok(shapedOk === shapedWant, 'every fourth level from level 8 has a shaped board (' + shapedOk + ' of ' + shapedWant + ')');
    ok(fr[0] > fr[1] && fr[1] > fr[2] && fr[2] < 0.25, 'fewer arrows are free at the start as levels rise (' + fr.map((x) => x.toFixed(2)) + ')');
    ok(ln[0] < ln[1] && ln[2] >= 5, 'arrows grow longer with the board (' + ln.map((x) => x.toFixed(1)) + ')');
    ok(nc[0] < nc[1] && nc[1] < nc[2], 'boards hold more arrows along the ladder (' + nc.map((x) => x.toFixed(1)) + ')');
    const p1 = E.plan(1), p5 = E.plan(5), p12 = E.plan(12), p40 = E.plan(40), p400 = E.plan(400);
    ok(p1.w === 3 && p1.h === 3 && p5.w * p5.h > 30 && p12.w * p12.h > p5.w * p5.h && p40.w === E.MAX_W && p40.h === E.MAX_H && p400.w === E.MAX_W,
      'the size climbs steeply, then holds at the cap');
    ok(maxMs < 60, 'a board is built fast enough for a phone (at most ' + maxMs + 'ms here)');
  }

  // the page
  const page = fs.readFileSync(path.join(ROOT, 'www/games/wayout/index.html'), 'utf8');
  ok(/id: 'wayout'/.test(page) && /C\.daily\('wayout', daily\)/.test(page), 'the page uses its id for saves and the daily seed');
  ok(/if \(!S \|\| S\.done \|\| S\.over \|\| a < 0 \|\| flying\[a\] \|\| Date\.now\(\) < lockUntil\) return;/.test(page),
    'only the arrow already leaving and the short lock after a strike hold a tap back');
  ok(/function showHint\(\) \{\n\s+if \(!S \|\| S\.done \|\| S\.over \|\| nFlying\) return;/.test(page) && /function askRestart\(\) \{\n\s+if \(!S \|\| S\.done \|\| nFlying \|\| Date\.now\(\) < lockUntil\) return;/.test(page),
    'hint and restart wait until no arrow is sliding, and restart until a blocked arrow has shaken');
  ok(/C\.t\('keepGoing'\)/.test(page) && /C\.t\('tryAgain'\), kind: 'primary', onClick: restartLevel/.test(page) && !/coins\.spend/.test(page),
    'out of hearts offers a free start again and one free heart, nothing to pay');
  ok(/'wo-win'/.test(page) && /'wo-deep'/.test(page) && /'wo-clean'/.test(page), 'the page unlocks its three achievements');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  ok(['wo-win', 'wo-deep', 'wo-clean'].every((id) => new RegExp("\\{ id: '" + id + "',[^\\n]*dde: '").test(core) && new RegExp("\\{ id: '" + id + "',[^\\n]*des: '").test(core)), 'the achievements are defined in the core in every language');
}

// Checks added in review (PR #217): the promises the rules text makes to the player,
// tested over many generated boards rather than on hand-built ones.
function testWayOutPromises() {
  head('Way Out promises');
  const E = loadEngine('wayout', 'WayOutEngineFactory');
  let boards = 0, neverBlocks = true, roundTrip = true, picks = true, fallback = 0, slow = 0, hintFree = true;
  for (const lv of [1, 2, 3, 5, 8, 12, 20, 30, 45, 80, 150, 300]) {
    for (let sd = 0; sd < 4; sd++) {
      const t0 = Date.now(), S = E.generate(lv, rng(lv * 131 + sd * 7));
      if (Date.now() - t0 > 60) slow++;
      boards++;
      if (lv > 2 && S.w === 3 && S.h === 3) fallback++;
      // every arrow cell, tapped at its centre, picks that arrow
      S.arrows.forEach((A, a) => A.c.forEach((c) => { if (E.pick(S, c % S.w + 0.5, Math.floor(c / S.w) + 0.5) !== a) picks = false; }));
      const r = rng(lv + sd * 1000), P = { hints: 99 };
      while (E.left(S)) {
        const free = E.freeArrows(S);
        if (!free.length) { neverBlocks = false; break; }
        // a hint, when asked for, always names an arrow that can leave now
        if (S.hint < 0 && r() < 0.3) { const h = E.useHint(S, P); if (h >= 0 && !E.isFree(S, h)) hintFree = false; }
        const a = free[Math.floor(r() * free.length)];
        E.tap(S, a);
        // taking an arrow out never blocks one that was free
        if (free.some((b) => b !== a && !E.isFree(S, b))) neverBlocks = false;
        if (r() < 0.2) {
          const back = E.restore(JSON.parse(JSON.stringify(S)));
          if (!back || back.hearts !== S.hearts || E.left(back) !== E.left(S) || back.gone.join() !== S.gone.join() || back.hint !== S.hint) roundTrip = false;
        }
      }
      if (!S.done) neverBlocks = false;
    }
  }
  ok(boards === 48, 'generated 48 boards from level 1 to 300');
  ok(neverBlocks, 'on every board, taking out a free arrow never blocks another free one, and the board always empties');
  ok(hintFree, 'every hint names an arrow that can leave at once');
  ok(roundTrip, 'a save taken at any point comes back with the same hearts, arrows and hint');
  ok(picks, 'tapping the centre of any arrow cell picks that arrow');
  ok(fallback === 0 && slow === 0, 'no level up to 300 needs the fallback board or more than 60 ms (' + fallback + ' fallbacks, ' + slow + ' slow)');
  const a = E.generate(20, rng(20261017)), b = E.generate(20, rng(20261017));
  ok(JSON.stringify(a) === JSON.stringify(b), 'the daily board (level 20 from the day\'s seed) is the same on every device');
}

// Owner feedback (#229): the heads had sharp corners and the accent was a loud magenta
function testWayOutLook() {
  head('Way Out look');
  const page = fs.readFileSync(path.join(ROOT, 'www/games/wayout/index.html'), 'utf8');
  const icon = fs.readFileSync(path.join(ROOT, 'www/games/wayout/icon.svg'), 'utf8');
  ok(/\.wo-head path \{[^}]*stroke: var\(--game\); stroke-width: [1-4]; stroke-linejoin: round;/.test(page), 'board heads have only slightly rounded corners (a stroke of at most 4)');
  // A fully rounded, narrow head on a short straight arrow stopped reading as an arrow:
  // the head must be clearly wider than the 13-unit body and wider than it is long
  const tri = page.match(/var tri = 'M' \+ \(hx \+ dx \* (\d+)\)[^\n]*\(hx - dx \* (\d+) \+ px \* (\d+)\)/);
  ok(!!tri && 2 * +tri[3] >= 2 * 13 && 2 * +tri[3] > +tri[1] + +tri[2], 'the head is wide and flat (' + (tri ? 'width ' + 2 * tri[3] + ', length ' + (+tri[1] + +tri[2]) : 'not found') + ')');
  ok(/\.wo-arrow--struck \.wo-body \{ stroke: var\(--c-bad\); \}/.test(page), 'an arrow already struck stays red along its whole body');
  ok(['struck', 'bad', 'chain'].every((k) => new RegExp('\\.wo-arrow--' + k + ' \\.wo-head path \\{ fill: ([^;]+); stroke: \\1; \\}').test(page)), 'coloured heads change fill and stroke together');
  const heads = icon.match(/<path d="M[^"]*z"[^>]*>/g) || [];
  ok(heads.length === 3 && heads.every((h) => /stroke-linejoin="round"/.test(h)), 'the icon\'s three heads have round corners');
  ok((page.match(/l-1?[0-9] -?[0-9]+v[0-9]+z" fill="' \+ col \+ '" stroke="' \+ col \+ '"[^>]*stroke-linejoin="round"/g) || []).length === 1, 'tutorial heads are drawn with round joins');
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  const sat = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; return mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1)); };
  const wo = games.find((g) => g.id === 'wayout');
  // The magenta #B34DAF had saturation 0.40; the owner asked for a calmer, greyer tone like
  // mancala (0.25) or morris (0.31), so the bar is the calmer of those two
  ok(!!wo && sat(wo.color) <= 0.25, 'the accent is a muted tone, saturation at most 0.25 (' + (wo ? sat(wo.color).toFixed(2) : '-') + ')');
  ok(!!wo && /accent: '([^']+)'/.test(page) && page.match(/accent: '([^']+)'/)[1] === wo.color && icon.indexOf(wo.color) > 0, 'page accent, games.json and icon use the same colour');
  const lum = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
  ok(!!wo && 1.05 / (lum(wo.color) + 0.05) >= 4.5, 'white text on the accent keeps 4.5:1 (' + (wo ? (1.05 / (lum(wo.color) + 0.05)).toFixed(2) : '-') + ')');
}

// #228: the browser's context menu showed on right-click in the app and in games
function testContextMenu() {
  head('Browser context menu');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const at = core.indexOf('Chogan.boot = function');
  const boot = core.slice(at, core.indexOf('\n  };\n', at));
  ok(at > 0 && /document\.addEventListener\('contextmenu', function \(e\) \{/.test(boot), 'boot turns off the context menu on every page');
  ok(/tag === 'INPUT' \|\| tag === 'TEXTAREA' \|\| \(t && t\.isContentEditable\)/.test(boot) && /closest\('a\[href\]'\)/.test(boot), 'text fields and links keep their menu');
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  const noBoot = games.filter((g) => !/C\.boot\(|Chogan\.boot\(/.test(fs.readFileSync(path.join(ROOT, 'www', g.path), 'utf8'))).map((g) => g.id);
  ok(games.length > 0 && !noBoot.length, 'every game page calls boot' + (noBoot.length ? ' (not: ' + noBoot.join(', ') + ')' : ''));
}

// #227: flowers and seasons were a plain pink flower and an orange sun; they are now
// our own ink-painting art, the four gentlemen and a scene per season
function testMahjongArt() {
  head('Mahjong flowers and seasons');
  const page = fs.readFileSync(path.join(ROOT, 'www/games/mahjong/index.html'), 'utf8');
  const a = page.indexOf('flowers and seasons (#227)'), b = page.indexOf('  function faceSvg(f) {');
  ok(a > 0 && b > a, 'the art block sits before faceSvg');
  let K = {};
  try { K = new Function(page.slice(page.lastIndexOf('\n', a), b) + '; return { ART: ART, SEASONS: SEASONS };')(); } catch (e) { ok(false, 'the art block runs on its own (' + e.message + ')'); }
  const all = (K.ART || []).concat(K.SEASONS || []).map((f) => f());
  ok(all.length === 8, 'four flowers and four seasons (' + all.length + ')');
  const chars = ['梅', '蘭', '菊', '竹', '春', '夏', '秋', '冬'];
  ok(all.length === 8 && all.every((svg, i) => svg.indexOf('>' + chars[i] + '</text>') > 0 && svg.indexOf('>' + (i % 4 + 1) + '</text>') > 0), 'each tile carries its character and number');
  ok(new Set(all).size === 8, 'all eight paintings differ');
  ok(all.every((svg) => !/href|url\(|<image|<script/i.test(svg)), 'the art is drawn inline, with no images or links');
  ok(/s \+= ART\[f - 34\]\(\);/.test(page) && /s \+= SEASONS\[f - 38\]\(\);/.test(page) && page.indexOf('cy="22" r="8" fill="#E8913A"') < 0, 'faceSvg draws them, and the old sun is gone');
}

// #227: a matched pair gave the generic 'place' blip; it now clacks like two tiles and sparks
function testMahjongClack() {
  head('Mahjong match sound and spark');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const page = fs.readFileSync(path.join(ROOT, 'www/games/mahjong/index.html'), 'utf8');
  const at = core.indexOf('    clack: function () {');
  const body = at > 0 ? core.slice(at, core.indexOf('\n    }', at)) : '';
  ok(at > 0 && (body.match(/noise\(/g) || []).length === 1 && /\[\[0, 3200, 1500\], \[0\.055,/.test(body), 'the core has a two-knock clack sound');
  ok(/clack: \['clack', 'tap'\]/.test(core), 'feedback knows clack, with a light vibration');
  const tapAt = page.indexOf('  function tap(i) {'), tapBody = page.slice(tapAt, page.indexOf('\n  }\n', tapAt));
  // #272: sparking where the tiles lay looked artificial; the pair now flies to the middle and strikes there
  ok(/clash\(sel, i\);\s+E\.remove\(S, sel, i\);/.test(tapBody) && !/spark\(sel, i\)/.test(tapBody) && !/C\.feedback\('(place|clack)'\)/.test(tapBody), 'a match starts the clash before the tiles go, with no sound of its own');
  const clAt = page.indexOf('  function clash(a, b) {'), clBody = clAt > 0 ? page.slice(clAt, page.indexOf('\n  }\n', clAt)) : '';
  ok(clAt > 0 && /var cx = rv\.left \+ rv\.width \/ 2, cy = rv\.top \+ rv\.height \/ 2;/.test(clBody) && /view\.getBoundingClientRect\(\)/.test(clBody), 'the pair meets in the middle of the visible view');
  ok(/var tx = \(k \? cx : cx - w\) - r\.left/.test(clBody) && /scale\(' \+ sc \+ '\)/.test(clBody) && /Math\.min\(Math\.max\(ra\.width \* 1\.8, 44\), rv\.width \/ 5, 96\)/.test(clBody), 'the two tiles grow and land side by side, touching at the centre');
  ok(/setTimeout\(function \(\) \{\s+C\.feedback\('flint'\);\s+burst\(cx, cy, h\);\s+\}, FLY_MS\);/.test(clBody), 'the flint sound and the sparks come when they meet, at the seam');
  ok(/if \(C\.ui\.reduceMotion\(\) [^\n]*\) \{ C\.feedback\('flint'\); return; \}/.test(clBody), 'with reduced motion only the sound plays');
  ok(/\.mj-fly \{ position: fixed; z-index: 100000;/.test(page) && /fly\.remove\(\)/.test(clBody) && /fx\.style\.position = 'fixed';/.test(page) && /fx\.remove\(\)/.test(page), 'the flying tiles and sparks sit above the zoomed board and remove themselves');
  // The first try kept the tiles' inline board position on the copies, so they flew off-screen unseen
  ok(/copy\.removeAttribute\('style'\);/.test(clBody) && /\.mj-fly \.mj-tile \{ position: absolute; inset: 0;/.test(page), 'the flying copy fills its own box, not its old board position');
  const fAt = core.indexOf('    flint: function () {'), fBody = fAt > 0 ? core.slice(fAt, core.indexOf('\n    }', fAt)) : '';
  ok(fAt > 0 && /noise\(\{ freq: 3400/.test(fBody) && /for \(var i = 0; i < 6; i\+\+\)/.test(fBody) && /flint: \['flint', 'tap'\]/.test(core), 'the core has a flint strike sound, with a light vibration');
}

// #227: an optional clock, off by default, that only ever adds a bonus
function testMahjongTimed() {
  head('Mahjong timed mode');
  const page = fs.readFileSync(path.join(ROOT, 'www/games/mahjong/index.html'), 'utf8');
  ok(/var TIME_LIMIT = \{ small: 5 \* 60000, medium: 9 \* 60000, turtle: 15 \* 60000 \};/.test(page), 'time limits are 5, 9 and 15 minutes (turtle 15, as asked)');
  ok(/S\.timed = !daily && !!prefs\.timed;/.test(page) && !/timed: true/.test(page), 'the clock is off unless chosen, and never on the daily');
  const tick = page.slice(page.indexOf('function tickClock()'), page.indexOf('\n  }\n', page.indexOf('function tickClock()')));
  ok(tick.length > 0 && !/S\.done = true|finish\(\)/.test(tick) && /C\.ui\.toast\(/.test(tick), 'running out of time only shows a notice; the game goes on');
  ok(/var spare = S\.timed \? Math\.max\(0, TIME_LIMIT\[S\.layout\] - elapsed\) : 0;/.test(page) && /points \+= bonus;/.test(page), 'only a timed game gets a speed bonus, never a penalty');
  ok(/C\.onPause\(function \(\) \{ if \(!pausedAt\) pausedAt = Date\.now\(\); \}\);/.test(page) && /S\.startedAt \+= Date\.now\(\) - pausedAt;/.test(page), 'the clock stops while the app is in the background');
  const miss = ['untimed', 'timed', 'timeUp', 'timeUpSub', 'speedBonus'].filter((k) => (page.match(new RegExp('[ ,{]' + k + ": '", 'g')) || []).length < LOCALE_CODES.length);
  ok(!miss.length, 'timed-mode strings in every language' + (miss.length ? ' (' + miss.join(', ') + ')' : ''));
}

/* ------------------------------------------------------------ Blackjack (#226) */
// The owner accepted blackjack only without betting: a ten-hand match against the dealer.
function testBlackjack() {
  head('Blackjack');
  const E = loadEngine('blackjack', 'BlackjackEngineFactory');
  const C = (r, s) => r * 4 + (s || 0);           // rank 0 = ace … 12 = king
  const A = 0, K = 12, Q = 11, T = 9;
  const V = (n) => C(n - 1);                     // the number card n, 2 … 10
  const tv = (h) => { const t = E.total(h); return t.value + (t.soft ? 's' : ''); };
  ok(tv([C(A), C(K)]) === '21s' && E.isBlackjack([C(A), C(K)]), 'ace and king are a soft 21 and a blackjack');
  ok(tv([C(A), V(6)]) === '17s' && tv([C(A), V(6), C(K)]) === '17' && tv([C(A), C(A), V(9)]) === '21s' && tv([C(K), C(Q), V(2)]) === '22', 'aces count 11 until that busts, then 1');
  ok(!E.isBlackjack([V(5), V(6), V(10)]) && E.total([V(5), V(6), V(10)]).value === 21, 'three cards making 21 are not a blackjack');
  const d = E.shuffled(rng(5));
  ok(d.length === 52 && new Set(d).size === 52 && E.shuffled(rng(5)).join() === d.join(), 'a deck is the 52 cards, the same for the same seed');
  // deck.pop() takes from the end, so the next card is the last in the array
  const hand = (player, dealer, deck) => ({ player, dealer, deck: deck || [], done: false, result: null });
  let H = hand([C(K), V(7)], [V(10), V(6)], [V(3)]);
  E.stand(H);
  ok(H.dealer.length === 3 && E.total(H.dealer).value === 19 && H.result === 'lose', 'the dealer draws on 16 (16 + 3 = 19 beats 17)');
  H = hand([C(K), V(7)], [C(A), V(6)], [V(9)]);
  E.stand(H);
  ok(H.dealer.length === 2 && H.result === 'push', 'the dealer stands on soft 17');
  H = hand([C(K), V(8)], [C(K), V(6)], [C(K)]);
  E.stand(H);
  ok(H.result === 'win' && E.total(H.dealer).value === 26, 'a dealer bust is a win');
  H = hand([C(K), V(5)], [C(K), V(7)], [C(K)]);
  E.hit(H);
  ok(H.done && H.result === 'bust' && H.dealer.length === 2, 'a bust ends the hand without the dealer drawing');
  H = hand([C(K), V(5)], [C(K), V(7)], [V(6)]);
  E.hit(H);
  ok(H.done && E.total(H.player).value === 21 && H.result === 'win', 'reaching 21 stands by itself (21 against 17)');
  ok(E.settle(hand([C(A), C(K)], [C(A), C(Q)])) === 'push' && E.settle(hand([C(A), C(K)], [C(K), V(9)])) === 'blackjack' && E.settle(hand([C(K), V(9)], [C(A), C(Q)])) === 'lose', 'naturals: both push, yours wins, the dealer\'s wins');
  // Basic strategy, hit or stand only: the printed table
  const adv = (p, up) => E.advice(p, C(up));
  ok(adv([C(T), C(5)], T) === 'hit' && adv([C(T), C(5)], 5) === 'stand' && adv([C(T), C(1)], 2) === 'hit' && adv([C(T), C(1)], 3) === 'stand' &&
    adv([C(A), C(6)], 8) === 'hit' && adv([C(A), C(6)], 7) === 'stand' && adv([C(A), C(5)], 5) === 'hit' && adv([C(T), C(6)], A) === 'stand' && adv([C(8), C(1)], 5) === 'hit',
    'advice matches the basic-strategy table (16 v 10 hit, 16 v 6 stand, 12 v 3 hit, 12 v 4 stand, soft 18 v 9 hit, v 8 stand, soft 17 hit, 17 stand, 11 hit)');
  // Played by the advice over many hands, the results look like real blackjack
  let w = 0, l = 0, p = 0, bj = 0, n = 0;
  const r = rng(2026);
  for (let k = 0; k < 20000; k++) {
    const G = E.deal(r);
    let guard = 0;
    while (!G.done && guard++ < 12) { if (E.advice(G.player, G.dealer[0]) === 'hit') E.hit(G); else E.stand(G); }
    n++; if (E.won(G.result)) w++; else if (E.lost(G.result)) l++; else p++;
    if (G.result === 'blackjack') bj++;
  }
  ok(n === 20000 && w / n > 0.4 && w / n < 0.46 && l / n > 0.45 && l / n < 0.52 && bj / n > 0.04 && bj / n < 0.055,
    'over 20000 hands: about 43% won, 48% lost, 4.7% blackjacks (' + [w, l, p, bj].map((x) => (100 * x / n).toFixed(1) + '%').join(' / ') + ')');
  const page = fs.readFileSync(path.join(ROOT, 'www/games/blackjack/index.html'), 'utf8');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  ok(!/coins\.spend|bet|wager|chip/i.test(page.replace(/Chogan\.cards|C\.cards|Einsätze|betting|no bet/gi, '')), 'there is no betting anywhere in the game');
  ok(/C\.daily\('blackjack', S\.daily \+ '\|' \+ S\.n\)\.rng/.test(page) && /C\.stats\.daily\('blackjack', S\.daily/.test(page), 'the daily deals the same ten hands to everyone and is recorded');
  ok(/id: 'bj-win'/.test(core) && /id: 'bj-21'/.test(core) && /unlock\('bj-win'\)/.test(page) && /unlock\('bj-21'\)/.test(page), 'both blackjack awards exist and are unlocked');
}

function testGridlock() {
  head('Gridlock');
  const E = loadEngine('gridlock', 'GridlockEngineFactory');
  ok(['sound', 'make', 'range', 'move', 'step', 'undo', 'restart', 'useHint', 'nextMove', 'pick', 'nearest', 'cycle', 'clear', 'locked', 'plan', 'dailyPlan', 'generate', 'restore', 'progress', 'levelDone'].every((f) => typeof E[f] === 'function'), 'the engine has its API');

  // A lot as text, one character a cell: '.' empty, '#' a wall, 'R' your car, any other
  // letter a car or truck. Rows count from the top, the exit is in the third row.
  const lot = (txt) => {
    const rows = txt.split('\n').map((r) => r.trim()), R = rows.length, W = rows[0].length, at = {}, walls = [];
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.') return;
      if (ch === '#') walls.push(y * W + x); else (at[ch] = at[ch] || []).push([x, y]);
    }));
    const names = ['R'].concat(Object.keys(at).filter((n) => n !== 'R').sort());
    const cars = names.map((n) => {
      const cs = at[n], h = cs.every((c) => c[1] === cs[0][1]) ? 1 : 0;
      return { h, n: cs.length, l: h ? cs[0][1] : cs[0][0], p: h ? cs[0][0] : cs[0][1] };
    });
    return { S: E.make(R, W, walls, cars), names, R, W, walls, cars };
  };
  const show = (B) => B.names.map((n, i) => n + B.S.cars[i].p).join(' ') + (B.S.done ? ' won' : '') + ' moves ' + B.S.moves;
  const idx = (B, n) => B.names.indexOf(n);
  // a move by name; the line says where every car is afterwards
  const go = (B, n, to) => { E.move(B.S, idx(B, n), to); return show(B); };

  const T = '.....\n.....\nRR.b.\n...b.\n.....';
  const F6 = '......\n......\nRR....\n....a.\n....a.\n......';
  let B = lot(T);
  ok(!!B.S && B.S.best === 2 && show(B) === 'R0 b2 moves 0', 'a hand-built board is made and its fewest moves is counted (2)');
  ok(go(B, 'b', 0) === 'R0 b0 moves 1' && go(B, 'R', 3) === 'R3 b0 won moves 2', 'a car slides to any free cell along its lane, and the red car at the right edge wins');

  // movement bounds
  B = lot(T);
  ok(JSON.stringify(E.range(B.S, 0)) === '{"lo":0,"hi":1}', 'a car stops against the car in its way');
  ok(go(B, 'R', 3) === 'R0 b2 moves 0' && go(B, 'R', 2) === 'R0 b2 moves 0', 'it cannot jump over a car to a free cell beyond it, or onto it');
  B = lot('..a..\n..a..\nRR...\n..#..\n.....');
  ok(JSON.stringify(E.range(B.S, idx(B, 'a'))) === '{"lo":0,"hi":1}' && go(B, 'a', 2) === 'R0 a0 moves 0', 'a wall stops a car like any other obstacle');
  ok(go(B, 'a', -1) === 'R0 a0 moves 0' && go(B, 'a', 9) === 'R0 a0 moves 0' && go(B, 'a', 0.5) === 'R0 a0 moves 0', 'a car never leaves the board, and only whole cells count');
  B = lot('.....\n.....\nRR...\n.....\n.cc..');
  ok(JSON.stringify(E.range(B.S, idx(B, 'c'))) === '{"lo":0,"hi":3}' && E.range(B.S, idx(B, 'c')).hi + 2 === 5, 'a lane runs to the edges of the board, a car of two fills cells p and p + 1');
  B = lot(F6);
  const aI = idx(B, 'a'), colA = B.S.cars[aI].l;
  ok(go(B, 'a', 0) === 'R0 a0 moves 1' && B.S.cars[aI].l === colA, 'a vertical car slides along its column and never changes column');
  ok(JSON.stringify(E.range(lot('.....\n.....\nRR...\n.....\n.ddd.').S, 1)) === '{"lo":0,"hi":2}', 'a truck of three fills three cells');

  // one drag is one move
  B = lot(F6);
  go(B, 'a', 0);
  ok(B.S.moves === 1 && B.S.stack.length === 1 && B.S.stack[0].join() === aI + ',3', 'a slide of three cells is one move, and one entry to undo');
  ok(go(B, 'a', 0) === 'R0 a0 moves 1' && E.move(B.S, aI, 0).ignored === true, 'dropping a car where it already is makes no move');
  B = lot(F6);
  go(B, 'a', 4); go(B, 'a', 3);
  ok(B.S.moves === 2, 'two separate drags are two moves, even back to the start');

  // the win is at column cols - 2 and nowhere else
  for (const [rows, cols] of [[5, 5], [6, 5], [6, 6], [7, 6], [7, 7]]) {
    const txt = [];
    for (let r = 0; r < rows; r++) txt.push(r === 2 ? 'RR' + '.'.repeat(cols - 2) : (r === 0 ? 'a' + '.'.repeat(cols - 1) : (r === 1 ? 'a' + '.'.repeat(cols - 1) : '.'.repeat(cols))));
    const X = lot(txt.join('\n'));
    E.move(X.S, 0, cols - 3);
    const before = X.S.done || E.dist(X.S) !== 1;
    const r2 = E.move(X.S, 0, cols - 2);
    ok(!!X.S && !before && r2.won === true && X.S.done && X.S.cars[0].p === cols - 2, rows + ' x ' + cols + ': one cell short is not a win and the left cell at column ' + (cols - 2) + ' is');
  }
  B = lot(T);
  go(B, 'b', 0); go(B, 'R', 3);
  ok(B.S.done && E.move(B.S, 1, 1).ignored === true && E.undo(B.S) === null && E.step(B.S, 0, -1).ignored === true, 'after the win nothing moves, and there is nothing to undo');
  B = lot('.....\n.....\nRR...\n.....\n.cc..');
  go(B, 'c', 3);
  ok(E.clear(B.S) === true && !B.S.done && B.S.cars[idx(B, 'c')].p === 3, 'a car at the right edge that is not yours is not a win');

  // undo
  B = lot(F6);
  const start = JSON.stringify(B.S.cars);
  go(B, 'a', 0); go(B, 'R', 1);
  const u1 = E.undo(B.S);
  ok(u1 && u1.v === 0 && B.S.cars[0].p === 0 && B.S.moves === 2 && B.S.stack.length === 1, 'undo takes the last slide back and leaves it counted: trying and undoing is not free');
  E.undo(B.S);
  ok(JSON.stringify(B.S.cars) === start && B.S.moves === 2 && B.S.stack.length === 0 && E.undo(B.S) === null, 'undo goes all the way back to the start, a whole slide at a time, and then stops, with both slides still counted');
  go(B, 'a', 2);
  ok(B.S.moves === 3, 'the next slide after an undo is one more move');
  B = lot(T);
  go(B, 'b', 1);
  E.useHint(B.S, { hints: 2 });
  ok(B.S.hint !== null && E.undo(B.S) === null && B.S.stack.length === 1, 'undo is not allowed while a hint runs');

  // the keyboard: steps in a row on one car are one move
  const K = '......\n......\nRR....\n......\n.cc...\n......';
  B = lot(K);
  const cI = idx(B, 'c');
  E.step(B.S, cI, 1); E.step(B.S, cI, 1); E.step(B.S, cI, 1);
  ok(B.S.cars[cI].p === 4 && B.S.moves === 1 && B.S.stack.length === 1 && B.S.stack[0][1] === 1, 'three key steps on one car are one move');
  E.step(B.S, cI, -1); E.step(B.S, cI, -1); E.step(B.S, cI, -1);
  ok(B.S.cars[cI].p === 1 && B.S.moves === 0 && B.S.stack.length === 0, 'steps that come back to where the move began are no move at all');
  E.step(B.S, cI, 1); E.step(B.S, 0, 1);
  ok(B.S.moves === 2, 'a key step on another car is a move of its own');
  B = lot(K);
  E.step(B.S, cI, 1); E.move(B.S, 0, 2); E.step(B.S, cI, 1);
  ok(B.S.moves === 3 && B.S.cars[cI].p === 3, 'a drag in between ends the run of steps, the next step is a new move');
  B = lot(K);
  E.step(B.S, cI, 1); E.undo(B.S); E.step(B.S, cI, 1);
  ok(B.S.moves === 2 && B.S.cars[cI].p === 2 && B.S.stack.length === 1, 'undo ends the run too: the undone slide stays counted, the next step is a new one');
  B = lot(K);
  ok(E.step(B.S, cI, 0).ignored === true && E.step(B.S, cI, NaN).ignored === true && E.step(B.S, cI, 2).ignored === true && E.step(B.S, cI, '1').ignored === true &&
    B.S.moves === 0 && B.S.cars[cI].p === 1 && B.S.stack.length === 0, 'a key step is one cell, forwards or back, and nothing else moves a car');
  B = lot('.....\n.....\nRR...\n.....\n.cc.#');
  E.step(B.S, idx(B, 'c'), 1);
  const blocked = E.step(B.S, idx(B, 'c'), 1);
  ok(blocked.blocked === true && B.S.moves === 1 && B.S.cars[1].p === 2 && E.step(B.S, 0, -1).blocked === true && B.S.moves === 1, 'a key step into a wall or the edge is refused and costs nothing');
  B = lot(K);
  for (let k = 0; k < 6; k++) E.step(B.S, cI, 1);
  ok(B.S.moves === 1 && B.S.cars[cI].p === 4 && E.step(B.S, cI, 1).blocked === true, 'key steps stop at the end of the lane');

  // restart
  B = lot(F6);
  E.useHint(B.S, { hints: 3 });
  const hv = B.S.hint.v;
  E.move(B.S, hv, B.S.hint.to);
  E.restart(B.S);
  ok(JSON.stringify(B.S.cars) === JSON.stringify(lot(F6).S.cars) && B.S.moves === 0 && B.S.stack.length === 0 && B.S.hint === null && !B.S.done, 'a restart puts every car back with the counter at zero and no hint');
  B = lot(T);
  go(B, 'b', 0); go(B, 'R', 3);
  E.restart(B.S);
  ok(!B.S.done && B.S.cars[0].p === 0 && B.S.moves === 0 && B.S.hints === 0, 'a restart after the win starts the board again');

  // hints
  B = lot(T);
  const P = { hints: 2 };
  const hv2 = E.useHint(B.S, P);
  ok(hv2 === idx(B, 'b') && P.hints === 1 && B.S.hints === 1 && B.S.hint.left === 2, 'a hint names the car of a shortest way out, covers two moves and costs one hint');
  ok(E.useHint(B.S, P) === -1 && P.hints === 1, 'a second hint is refused while the first is running');
  ok(E.move(B.S, 0, 1).locked === true && E.step(B.S, 0, 1).locked === true && B.S.moves === 0 && E.locked(B.S, 0) && !E.locked(B.S, 1), 'every car but the hinted one is locked');
  const to0 = B.S.hint.to, off = to0 === 0 ? 1 : 2;
  E.move(B.S, 1, off);
  ok(B.S.hint && B.S.hint.v === 1 && B.S.hint.to === to0 && B.S.hint.left === 2 && B.S.moves === 1, 'the hinted car dropped somewhere else is a move, and the hint stays');
  E.move(B.S, 1, to0);
  ok(B.S.hint && B.S.hint.v === 0 && B.S.hint.to === 3 && B.S.hint.left === 1, 'on the ghost the hint counts one move and aims again from the new position');
  const rr = E.move(B.S, 0, 3);
  ok(rr.won && B.S.hint === null && B.S.done, 'the win ends the hint');
  B = lot('.....\n..cc.\nRRb..\n..b..\n..#..');
  ok(B.S.best === 3, 'a board that needs three moves (' + B.S.best + ')');
  const P3 = { hints: 1 };
  E.useHint(B.S, P3);
  const first = B.S.hint.v;
  E.move(B.S, first, B.S.hint.to);
  const second = B.S.hint.v;
  E.move(B.S, second, B.S.hint.to);
  ok(first !== 0 && second !== first && B.S.hint === null && !E.locked(B.S, 0) && E.dist(B.S) === 1, 'after two hinted moves the hint is over and every car is free again');
  B = lot(T);
  go(B, 'b', 0);
  const P1 = { hints: 1 };
  E.useHint(B.S, P1);
  ok(B.S.hint.left === 1 && B.S.hint.v === 0, 'with one move left the hint covers one');
  ok(E.useHint(lot(T).S, { hints: 0 }) === -1, 'no hint without one in stock');

  // saves: a board comes back with everything, and a broken one is refused
  const mk = () => { const X = lot('.....\n..cc.\nRRb..\n..b..\n..#..'); const hp2 = { hints: 3 }; E.move(X.S, 2, 3); E.useHint(X.S, hp2); E.move(X.S, X.S.hint.v, X.S.hint.to); return X; };
  B = mk();
  const snap = JSON.parse(JSON.stringify(B.S)), back = E.restore(JSON.parse(JSON.stringify(B.S)));
  ok(!!back && JSON.stringify(back.cars) === JSON.stringify(B.S.cars) && back.moves === B.S.moves && JSON.stringify(back.stack) === JSON.stringify(B.S.stack) &&
    JSON.stringify(back.hint) === JSON.stringify(B.S.hint) && back.hints === B.S.hints && back.best === B.S.best && back.level === B.S.level && JSON.stringify(back.start) === JSON.stringify(B.S.start),
    'a save comes back with its cars, moves, undo stack, hint and fewest moves');
  {
    const U2 = lot(F6);
    go(U2, 'a', 0); go(U2, 'R', 1); E.undo(U2.S);
    const back2 = E.restore(JSON.parse(JSON.stringify(U2.S)));
    ok(!!back2 && back2.moves === 2 && back2.stack.length === 1 && JSON.stringify(back2.cars) === JSON.stringify(U2.S.cars), 'a save taken after an undo comes back with the counter above the undo stack');
  }
  const brk = (f) => { const o = JSON.parse(JSON.stringify(snap)); f(o); return E.restore(o) === null; };
  ok(brk((o) => { o.cars[1].l = 1; o.cars[1].p = 2; o.start[1] = 2; }) && brk((o) => { o.cars[1].n = 3; }), 'a save with cars on top of each other, or on a wall, is refused');
  ok(brk((o) => { o.cars[2].p = 4; }) && brk((o) => { o.cars[1].p = -1; }) && brk((o) => { o.cars[1].l = 9; }) && brk((o) => { o.rows = 4; }) && brk((o) => { o.cols = 9; }), 'a save with a car off the board is refused');
  ok(brk((o) => { o.cars[0].l = 1; }) && brk((o) => { o.cars[0].h = 0; }) && brk((o) => { o.cars[0].n = 3; }), 'a save whose red car is not horizontal, two long, in the exit row is refused');
  ok(brk((o) => { o.cars[1].n = 4; }) && brk((o) => { o.cars[1].n = 1; }) && brk((o) => { o.cars[1].n = 2.5; }), 'a car of any other length than two or three is refused');
  ok(brk((o) => { o.cars.push({ h: 1, n: 2, l: 2, p: 3 }); o.start.push(3); }) && brk((o) => { o.cars.length = 1; o.start.length = 1; }), 'another car lying across the exit row, or no other car at all, is refused');
  ok(E.sound(6, 6, [2 * 6], [{ h: 1, n: 2, l: 2, p: 1 }, { h: 0, n: 2, l: 5, p: 3 }]) === false && E.make(6, 6, [2 * 6], [{ h: 1, n: 2, l: 2, p: 1 }, { h: 0, n: 2, l: 5, p: 3 }]) === null &&
    E.make(6, 6, [1 * 6], [{ h: 1, n: 2, l: 2, p: 1 }, { h: 0, n: 2, l: 5, p: 3 }]) !== null, 'a wall in the exit row is refused even where the red car could still get out');
  ok(brk((o) => { o.walls.push(2 * 5 + 4); }) && brk((o) => { o.walls.push(14); }) && brk((o) => { o.walls = [14, 14]; }) && brk((o) => { o.walls = [3, 8, 19]; }) && brk((o) => { o.walls = 'x'; }), 'walls in the exit row, doubled, or more than two are refused');
  ok(brk((o) => { o.start.pop(); }) && brk((o) => { o.stack = [[9, 0]]; }) && brk((o) => { o.stack = [[0, 0.5]]; }) && brk((o) => { o.stack = [[1, 0]]; }) && brk((o) => { o.stack = [[1, 3]]; o.moves = 5; }) && brk((o) => { o.stack = 5; }), 'an undo stack that does not lead back is refused');
  ok(brk((o) => { o.moves = o.stack.length - 1; }) && brk((o) => { o.moves = 'x'; }) && brk((o) => { o.moves = -1; }), 'a move count below the undo stack is refused');
  ok(brk((o) => { o.hint = { v: 9, to: 1, left: 2 }; }) && brk((o) => { o.hint = { v: 2, to: 2, left: 3 }; }) && brk((o) => { o.hint = { v: 2, to: o.cars[2].p, left: 1 }; }) && brk((o) => { o.hint = 'x'; }) && brk((o) => { o.hint = { v: 0, to: 4, left: 1 }; }), 'a hint that cannot happen is refused');
  ok([null, undefined, 5, 'x', [], {}, { cars: 1 }, { rows: 5 }].every((o) => E.restore(o) === null), 'anything that is not a save is refused');
  const stuck = E.make(5, 5, [1 * 5 + 3, 4 * 5 + 3], [{ h: 1, n: 2, l: 2, p: 0 }, { h: 0, n: 2, l: 3, p: 2 }]);
  ok(stuck === null && E.make(5, 5, [], [{ h: 1, n: 2, l: 2, p: 0 }, { h: 0, n: 2, l: 3, p: 1 }, { h: 0, n: 2, l: 4, p: 2 }]).best === 3, 'a board that can never be solved is refused, and the safety-net board takes three moves');
  const swap = lot('.....\n.....\nRR...\n.....\naa.bb');
  const sv = JSON.parse(JSON.stringify(swap.S));
  const ia = swap.names.indexOf('a'), ib = swap.names.indexOf('b');
  sv.cars[ia].p = 3; sv.cars[ib].p = 0;
  ok(E.restore(sv) === null, 'cars that swapped places in one lane could never have got there: the save is refused');

  // hit testing and the keyboard cursor
  B = lot(T);
  ok(E.pick(B.S, 0.5, 2.5) === 0 && E.pick(B.S, 1.99, 2.01) === 0 && E.pick(B.S, 3.5, 3.5) === idx(B, 'b') && E.pick(B.S, 0.5, 0.5) === -1, 'a touch picks the car under it');
  ok(E.pick(B.S, 2.2, 2.5) === 0 && E.pick(B.S, 2.9, 2.5) === idx(B, 'b') && E.pick(B.S, 2.5, 0.5) === -1 && E.pick(B.S, -0.2, 2.5) === 0, 'a touch just beside a car still picks it, within a third of a cell, and empty ground picks nothing');
  B = lot('..a..\n..a..\nRR...\n..#..\n.....');
  ok(E.pick(B.S, 2.5, 3.5) === -1, 'a wall picks nothing');
  B = lot(T);
  ok(E.nearest(B.S, 0, 1) === idx(B, 'b') && E.nearest(B.S, idx(B, 'b'), 3) === 0 && E.nearest(B.S, 0, 3) === -1 && E.nearest(B.S, 0, 0) === -1, 'arrow keys across the lane move the selection to the nearest car in that direction');
  ok(E.clear(B.S) === false && (go(B, 'b', 0), E.clear(B.S)) === true && (go(B, 'R', 3), E.clear(B.S)) === false, 'the road is clear only when nothing stands between the red car and the exit, and not any more once it is out');
  B = lot(T);
  ok(E.cycle(B.S, -1, 1) === 0 && E.cycle(B.S, 0, 1) === 1 && E.cycle(B.S, 1, 1) === 0 && E.cycle(B.S, 0, -1) === 1 && E.cycle(B.S, -1, -1) === 1, 'Space goes through the cars in reading order and wraps round');

  // hint gifts and the ladder
  {
    const Pg = E.progress(), got = [];
    for (let lv = 1; lv <= 29; lv++) if (E.levelDone(Pg, lv)) got.push(lv);
    ok(got.join() === '4,9,14,19,24,29' && Pg.hints === 9 && Pg.level === 30 && E.progress().hints === 3, 'hints: three to start, a gift after levels 4, 9, 14, 19, 24, 29 (' + got + ')');
    ok(!E.levelDone(Pg, 29) && !E.levelDone(Pg, 12) && Pg.hints === 9, 'a level number counts for gifts only once');
    const p1 = E.plan(1), p3 = E.plan(3), p10 = E.plan(10), p12 = E.plan(12), p100 = E.plan(100), p250 = E.plan(250);
    ok(p1.rows === 5 && p1.cols === 5 && p1.lo === 2 && p1.hi === 2 && p1.walls === 0 && p3.rows === 6 && p3.cols === 5 && E.plan(4).rows === 6 && E.plan(4).cols === 6 && p10.rows === 6 && p10.walls === 0, 'the ladder starts on 5 x 5 (two moves), then 6 x 5, then 6 x 6 with no walls');
    ok(p12.walls === 1 && E.plan(11).walls === 0 && E.plan(13).walls === 0 && E.plan(16).walls === 1 && p250.rows === 7 && p250.cols === 7 && p100.hi >= 11 && p100.hi <= 18 && p250.hi >= 13 && p250.hi <= 20, 'walls come on every fourth level from 12, boards grow to 7 x 7 and the target climbs');
    const dp = E.dailyPlan(() => 0.9);
    ok(dp.rows === dp.cols && [6, 7].includes(dp.rows) && dp.lo === 12 && dp.hi === 16, 'the daily is 6 x 6 or 7 x 7, twelve to sixteen moves');
  }

  // the page
  const page = fs.readFileSync(path.join(ROOT, 'www/games/gridlock/index.html'), 'utf8');
  ok(/id: 'gridlock'/.test(page) && /C\.daily\('gridlock', daily\)\.rng/.test(page), 'the page uses its id for saves and the daily seed');
  ok(/if \(E\.locked\(S, v\)\) \{ lockedTry\(\);/.test(page) && /function lockedTry\(\) \{\n\s+C\.feedback\('bad'\);\n\s+if \(S\.hint && nodes\[S\.hint\.v\]\) C\.ui\.shake\(nodes\[S\.hint\.v\]\._wig\);\n\s+C\.ui\.toast\(/.test(page),
    'touching a locked car buzzes, nudges the hinted car and says why');
  ok(!/coins\.spend/.test(page) && /E\.useHint\(S, prog\)/.test(page), 'hints cost hints from the stock, never coins');
  ok(/'gl-win'/.test(page) && /'gl-deep'/.test(page) && /'gl-clean'/.test(page), 'the page unlocks its three achievements');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  ok(['gl-win', 'gl-deep', 'gl-clean'].every((id) => new RegExp("\\{ id: '" + id + "',[^\\n]*dde: '").test(core)), 'the achievements are defined in the core in all four languages');
  ok(/C\.ui\.reduceMotion\(\)/.test(page) && /\.gl-frame \{ direction: ltr;/.test(page), 'motion asks for reduced motion and the lot is not mirrored');
  const engineSrc = (page.match(/\/\* ==== ENGINE START ==== \*\/([\s\S]*?)\/\* ==== ENGINE END ==== \*\//) || [])[1] || '';
  ok(engineSrc.length > 1000 && !/Math\.random|Date\.now|new Date|performance\.now|setTimeout/.test(engineSrc), 'the engine counts attempts and work, never time, and takes its randomness as a parameter');
}

// The promises the rules text makes, over every level from 1 to 300 and several dailies
function testGridlockPromises() {
  head('Gridlock promises');
  const E = loadEngine('gridlock', 'GridlockEngineFactory');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const hashSrc = (core.match(/function hash32\(str\) \{[\s\S]*?\n  \}/) || [])[0];
  const rngSrc = (core.match(/function rng\(seed\) \{[\s\S]*?\n  \}/) || [])[0];
  const sb = {};
  vm.createContext(sb);
  vm.runInContext(hashSrc + '\n' + rngSrc + '\nthis.level = function (L) { return rng((L * 2654435761 + 0x6e1d) >>> 0); };\nthis.daily = function (d) { return rng(hash32("chogan|gridlock|" + d)); };', sb);

  // The fewest moves counted again from nothing but the rules: breadth first over every position
  // from the start, a slide of any length one step, until a position with the red car at cols - 2.
  // With full set it goes on over the whole board and also says how many cars never move.
  const search = (S, full) => {
    const R = S.rows, W = S.cols, n = S.cars.length, cap = 60000;
    const store = new Uint8Array(cap * n), dist = new Int16Array(cap), table = new Int32Array(1 << 17).fill(-1), moves = new Uint8Array(n);
    let best = -1;
    const find = (buf, off, add) => {
      let h = 2166136261;
      for (let i = 0; i < n; i++) h = Math.imul(h ^ buf[off + i], 16777619);
      let slot = (h >>> 0) & (table.length - 1);
      for (;;) {
        const id = table[slot];
        if (id < 0) { if (add >= 0) table[slot] = add; return -1; }
        let same = true;
        for (let i = 0; i < n; i++) if (store[id * n + i] !== buf[off + i]) { same = false; break; }
        if (same) return id;
        slot = (slot + 1) & (table.length - 1);
      }
    };
    let count = 1;
    S.start.forEach((p, i) => { store[i] = p; });
    find(store, 0, 0);
    const tmp = new Uint8Array(n), occ = new Int8Array(R * W);
    for (let s = 0; s < count; s++) {
      occ.fill(-1);
      S.walls.forEach((w) => { occ[w] = -2; });
      for (let i = 0; i < n; i++) {
        const c = S.cars[i], p = store[s * n + i];
        for (let k = 0; k < c.n; k++) occ[c.h ? c.l * W + p + k : (p + k) * W + c.l] = i;
      }
      for (let i = 0; i < n; i++) {
        const c = S.cars[i], p = store[s * n + i];
        for (const dir of [-1, 1]) {
          for (let q = p + dir; ; q += dir) {
            const head = dir < 0 ? q : q + c.n - 1;
            if (head < 0 || head >= (c.h ? W : R)) break;
            if (occ[c.h ? c.l * W + head : head * W + c.l] !== -1) break;
            moves[i] = 1;
            for (let j = 0; j < n; j++) tmp[j] = store[s * n + j];
            tmp[i] = q;
            if (find(tmp, 0, -1) >= 0) continue;
            if (count >= cap) return { best: -1, still: -1 };
            for (let j = 0; j < n; j++) store[count * n + j] = tmp[j];
            dist[count] = dist[s] + 1;
            find(store, count * n, count);
            if (i === 0 && q === W - 2 && best < 0) { best = dist[count]; if (!full) return { best, still: -1 }; }
            count++;
          }
        }
      }
    }
    return { best, still: Array.prototype.filter.call(moves, (m) => !m).length };
  };
  const fewest = (S) => search(S, false).best;

  // the rules once more, read off the board itself rather than through the engine
  const valid = (S) => {
    const cells = new Set(), R = S.rows, W = S.cols;
    if (!(R >= 5 && R <= 7 && W >= 5 && W <= 7) || S.walls.length > 2 || S.cars.length < 2 || S.cars.length > 24) return false;
    for (const w of S.walls) { if (w < 0 || w >= R * W || Math.floor(w / W) === 2 || cells.has(w)) return false; cells.add(w); }
    return S.cars.every((c, i) => {
      if ((c.n !== 2 && c.n !== 3) || (c.h !== 0 && c.h !== 1)) return false;
      if (i === 0 && !(c.h === 1 && c.n === 2 && c.l === 2)) return false;
      if (i > 0 && c.h === 1 && c.l === 2) return false;
      if (c.l < 0 || c.l >= (c.h ? R : W) || c.p < 0 || c.p + c.n > (c.h ? W : R)) return false;
      for (let k = 0; k < c.n; k++) {
        const cell = c.h ? c.l * W + c.p + k : (c.p + k) * W + c.l;
        if (cells.has(cell)) return false;
        cells.add(cell);
      }
      return true;
    });
  };

  let boards = 0, goodBoards = 0, bands = 0, plans = 0, bestOk = 0, checked = 0, hintsWin = 0, saves = 0, saveOk = true, picks = true, falls = 0, slow = 0, maxMs = 0, begun = 0, reach = 0, stuckChecked = 0, stuckOk = 0, paints = 0;
  let totalMs = 0, kinds = [0, 0, 0, 0], means = { a: [], b: [], c: [], d: [] };
  const seg = (L) => (L <= 10 ? 'a' : (L <= 30 ? 'b' : (L <= 80 ? 'c' : 'd')));
  const batch = [];
  for (let L = 1; L <= 300; L++) batch.push({ L, daily: null });
  ['2026-10-17', '2026-10-18', '2026-10-19', '2026-11-02', '2027-01-01', '2027-03-21'].forEach((d) => batch.push({ L: 0, daily: d }));
  for (const item of batch) {
    const t0 = Date.now();
    const S = item.daily ? E.generate(0, sb.daily(item.daily), true) : E.generate(item.L, sb.level(item.L));
    const ms = Date.now() - t0;
    totalMs += ms; maxMs = Math.max(maxMs, ms);
    if (ms > 1500) slow++;
    boards++;
    const P = item.daily ? E.dailyPlan(sb.daily(item.daily)) : E.plan(item.L);
    if (valid(S) && E.sound(S.rows, S.cols, S.walls, S.cars) && E.sound(S.rows, S.cols, S.walls, S.cars.map((c, i) => Object.assign({}, c, { p: S.start[i] })))) goodBoards++;
    if (S.cars[0].p < S.cols - 2 && !S.done && S.best >= 2) begun++;
    if (S.best >= P.lo && S.best <= P.hi) bands++;
    if (S.rows === P.rows && S.cols === P.cols && S.walls.length === P.walls) plans++;
    if (!item.daily && (S.best === 3 && S.rows === 5 && S.cols === 5 && item.L > 3)) falls++;
    if (!item.daily) means[seg(item.L)].push(S.best);
    S.cars.forEach((c, i) => { if (i) kinds[(c.h ? 0 : 1) + (c.n === 3 ? 2 : 0)]++; });
    // the fewest moves, counted again
    checked++;
    if (fewest(S) === S.best) bestOk++;
    // cars that never move in any position are walls in disguise: the plan allows so many, no more
    // (searched over the whole board: the first sixty levels, every fifth after that, and the dailies)
    if (item.daily || item.L <= 60 || item.L % 5 === 0) {
      stuckChecked++;
      if (search(S, true).still <= P.stuck) stuckOk++;
    }
    // cars that touch at the start do not share a paint while there are paints to spare
    {
      const g = E.grid(S);
      let clash = 0;
      for (let y = 0; y < S.rows; y++) for (let x = 0; x < S.cols; x++) {
        for (const [dx, dy] of [[1, 0], [0, 1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx >= S.cols || ny >= S.rows) continue;
          const a = g[y * S.cols + x], b = g[ny * S.cols + nx];
          if (a > 0 && b > 0 && a !== b && ((S.look[a] >> 1) & 3) === ((S.look[b] >> 1) & 3)) clash++;
        }
      }
      if (clash === 0) paints++;
    }
    // following the hints from the start wins in exactly the fewest moves
    {
      const X = JSON.parse(JSON.stringify(S)), Y = E.restore(X), Pr = { hints: 99 };
      let moves = 0, guard = 0, valid2 = !!Y;
      while (Y && !Y.done && guard++ < 60) {
        if (E.useHint(Y, Pr) < 0) { valid2 = false; break; }
        while (Y.hint && !Y.done && guard++ < 60) {
          const h = Y.hint, r = E.move(Y, h.v, h.to);
          if (!r.moved) { valid2 = false; break; }
          moves++;
        }
        if (!valid2) break;
      }
      if (valid2 && Y.done && moves === S.best && Y.moves === S.best) hintsWin++;
    }
    // a save taken at any point comes back the same
    {
      const Y = E.restore(JSON.parse(JSON.stringify(S))), r = sb.level(item.L + 5000 + (item.daily ? 7 : 0)), Pr = { hints: 99 };
      let steps = 0;
      while (Y && !Y.done && steps++ < 14) {
        const t = r();
        if (t < 0.25 && !Y.hint) E.useHint(Y, Pr);
        else if (t < 0.4 && !Y.hint) E.undo(Y);
        else {
          const v = Y.hint ? Y.hint.v : Math.floor(r() * Y.cars.length), rg = E.range(Y, v);
          const to = Y.hint ? Y.hint.to : rg.lo + Math.floor(r() * (rg.hi - rg.lo + 1));
          // never win by luck here: keep the red car away from the exit so every state is tested
          if (v === 0 && to === Y.cols - 2 && !Y.hint) continue;
          E.move(Y, v, to);
        }
        const J = JSON.parse(JSON.stringify(Y)), B2 = E.restore(J);
        saves++;
        if (!B2 || JSON.stringify(B2.cars) !== JSON.stringify(Y.cars) || B2.moves !== Y.moves || JSON.stringify(B2.stack) !== JSON.stringify(Y.stack) ||
          JSON.stringify(B2.hint) !== JSON.stringify(Y.hint) || B2.hints !== Y.hints || B2.best !== Y.best || B2.done !== Y.done) saveOk = false;
      }
    }
    // the keyboard can reach every car: Space goes through them all
    { const seen = new Set([0]); let v = 0; for (let k = 0; k < S.cars.length; k++) { v = E.cycle(S, v, 1); seen.add(v); } if (seen.size === S.cars.length) reach++; }
    // the centre of every cell of every car picks that car
    S.cars.forEach((c, i) => {
      for (let k = 0; k < c.n; k++) {
        const x = c.h ? c.p + k : c.l, y = c.h ? c.l : c.p + k;
        if (E.pick(S, x + 0.5, y + 0.5) !== i) picks = false;
      }
    });
  }
  ok(boards === 306, 'generated levels 1 to 300 and six dailies');
  ok(goodBoards === boards, 'every board is valid: in bounds, no overlap, your car in the exit row, walls off it, no other car lying across it (' + goodBoards + ' of ' + boards + ')');
  ok(bestOk === checked && checked === boards, 'the stored fewest moves equals an independent breadth-first count on every board (' + bestOk + ' of ' + checked + ' agree)');
  ok(hintsWin === boards, 'following the hints from the start wins in exactly the fewest moves, on every board (' + hintsWin + ' of ' + boards + ')');
  ok(bands === boards, 'every level sits in the band of fewest moves its plan asks for (' + bands + ' of ' + boards + ')');
  ok(plans === boards, 'size and walls are the plan\'s (' + plans + ' of ' + boards + ')');
  ok(saveOk && saves > 2000, 'a save taken at any point comes back with the same cars, moves, undo stack and hint (' + saves + ' saves)');
  ok(stuckOk === stuckChecked && stuckChecked >= 100, 'no board has more cars that can never move than its plan allows (' + stuckOk + ' of ' + stuckChecked + ' boards searched whole)');
  ok(paints === boards, 'cars that touch at the start never share one of the four paints (' + paints + ' of ' + boards + ' boards)');
  ok(picks, 'a touch at the centre of any car cell picks that car');
  ok(reach === boards, 'the keyboard reaches every car on every board: Space goes through all of them (' + reach + ' of ' + boards + ')');
  ok(begun === boards, 'every board starts unsolved, at least two moves from the exit');
  ok(falls === 0, 'no level needs the safety-net board');
  ok(slow === 0 && maxMs < 1500, 'no board takes more than a second and a half to make (the slowest took ' + maxMs + ' ms; all ' + boards + ' together ' + (totalMs / 1000).toFixed(1) + ' s)');
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  ok(avg(means.a) < avg(means.b) && avg(means.b) < avg(means.c) && avg(means.c) < avg(means.d) && avg(means.d) >= 11, 'the fewest moves climb along the ladder (' + ['a', 'b', 'c', 'd'].map((k) => avg(means[k]).toFixed(1)).join(', ') + ')');
  const tot = kinds.reduce((x, y) => x + y, 0), share = kinds.map((k) => k / tot);
  ok(share[0] > 0.25 && share[1] > 0.25 && share[0] + share[1] > 0.55 && share[2] + share[3] > 0.1 && share[2] + share[3] < 0.35, 'cars and trucks, lying and standing, all turn up (' + share.map((x) => (100 * x).toFixed(0) + '%').join(' / ') + ')');
  const a = E.generate(0, sb.daily('2026-10-17'), true), b = E.generate(0, sb.daily('2026-10-17'), true), c = E.generate(0, sb.daily('2026-10-18'), true);
  ok(JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a) !== JSON.stringify(c), 'the daily board is the same on every device and differs from day to day');
  ok(JSON.stringify(E.generate(77, sb.level(77))) === JSON.stringify(E.generate(77, sb.level(77))), 'a level is the same board for everyone');
}

// The look: a muted accent, rounded vehicles, a hint that covers the whole car
function testGridlockLook() {
  head('Gridlock look');
  const page = fs.readFileSync(path.join(ROOT, 'www/games/gridlock/index.html'), 'utf8');
  const icon = fs.readFileSync(path.join(ROOT, 'www/games/gridlock/icon.svg'), 'utf8');
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const sat = (hex) => { const [r, g, b] = rgb(hex); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; return mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1)); };
  const hue = (hex) => { const [r, g, b] = rgb(hex); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0; const h = mx === r ? ((g - b) / d) % 6 : (mx === g ? (b - r) / d + 2 : (r - g) / d + 4); return (h * 60 + 360) % 360; };
  const lum = (hex) => rgb(hex).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
  const gl = games.find((g) => g.id === 'gridlock');
  ok(!!gl && sat(gl.color) <= 0.25, 'the accent is a muted tone, saturation at most 0.25 (' + (gl ? sat(gl.color).toFixed(2) : '-') + ')');
  ok(!!gl && /accent: '([^']+)'/.test(page) && page.match(/accent: '([^']+)'/)[1] === gl.color && icon.indexOf(gl.color) > 0, 'page accent, games.json and icon use the same colour');
  ok(!!gl && 1.05 / (lum(gl.color) + 0.05) >= 4.5, 'white text on the accent keeps 4.5:1 (' + (gl ? (1.05 / (lum(gl.color) + 0.05)).toFixed(2) : '-') + ')');
  const dist = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
  const near = games.filter((g) => g.id !== 'gridlock').map((g) => [g.id, dist(hue(g.color), hue(gl.color))]).sort((x, y) => x[1] - y[1])[0];
  ok(!!gl && near[1] >= 15, 'the hue is at least 15 degrees from every other game (nearest ' + near[0] + ', ' + near[1].toFixed(0) + ')');
  ok(!!gl && new RegExp('<rect width="96" height="96" rx="22" fill="' + gl.soft + '"/>').test(icon) && games.findIndex((g) => g.id === 'gridlock') > games.findIndex((g) => g.id === 'snooker') && /^#[0-9A-F]{6}$/.test(gl.soft), 'the icon starts on the soft tint of games.json, and the game comes after the games added before it');

  // vehicles: one list, a sedan and a pickup; outline, glass, wheels and mirrors in one ink
  const parts = page.slice(page.indexOf('function parts(n, goal)'), page.indexOf('function artNode'));
  const rx = (cls) => [...parts.matchAll(new RegExp("\\['rect', \\{ class: '" + cls + "'[^}]*rx: ([0-9.]+)", 'g'))].map((m) => +m[1]);
  const bodies = [...parts.matchAll(/\['path', \{ class: 'gl-body', d: '([^']+)'/g)].map((m) => m[1]);
  ok(bodies.length === 2 && bodies.every((d) => (d.match(/C/g) || []).length >= 2) && rx('gl-body').length === 1 && rx('gl-body')[0] >= 5, 'the sedan and the cab are curved paths, the pickup bed a rounded rect');
  ok(rx('gl-shadow').length === 2 && rx('gl-shadow').every((r) => r >= 10) && rx('gl-roof').length === 2 && rx('gl-roof').every((r) => r >= 2.5) && rx('gl-bed').length === 1 && rx('gl-bed')[0] >= 2.5, 'shadows, roof plates and the bed are rounded too');
  const cls = (name) => (parts.match(new RegExp("class: '" + name + "'", 'g')) || []).length;
  ok(cls('gl-glass') === 3 && cls('gl-mirror') === 2 && cls('gl-wheel') === 2 && cls('gl-slat') === 1 && cls('gl-mark') === 1, 'every vehicle has glass, mirrors and wheels, the pickup a slatted bed, only the red car a chevron');
  ok(/\.gl-glass \{ fill: var\(--gl-glass\); \}/.test(page) && /\.gl-wheel \{ fill: var\(--gl-ink\); \}/.test(page) && /\.gl-mirror \{ fill: var\(--gl-ink\); \}/.test(page) && /\.gl-body \{ stroke: var\(--gl-ink\); stroke-width: 2\.5;/.test(page), 'outline, wheels and mirrors share one ink, the glass is a notch lighter');
  ok(/\.gl-body \{[^}]*stroke-linejoin: round;/.test(page) && /\.gl-wall \{[^}]*stroke-linejoin: round;/.test(page) && /\.gl-curb \{[^}]*stroke-linejoin: round;/.test(page) && /\.gl-mark \{[^}]*stroke-linejoin: round;/.test(page), 'strokes of vehicles, walls, the kerb and the chevron have round joins');
  ok(/\.gl-halo \{[^}]*stroke-linejoin: round;/.test(page) && /\.gl-ghost \{[^}]*stroke-linejoin: round;/.test(page) && /\.gl-cur \{[^}]*stroke-linejoin: round;/.test(page), 'the hint halo, the ghost and the key cursor have round joins');
  const iconRects = [...icon.matchAll(/<rect ([^>]*)\/>/g)].map((m) => m[1]);
  ok(iconRects.length >= 10 && iconRects.every((r) => /rx="\d/.test(r)) && (icon.match(/stroke-linejoin="round"/g) || []).length >= 2, 'every shape in the icon is rounded, the strokes have round joins');
  ok(icon.indexOf(bodies[0]) > 0 && /M63 14l6 6-6 6/.test(icon) && (icon.match(/gl-|var\(/g) || []).length === 0, 'the icon is drawn from parts(2, true), with its colours written out');
  ok(/class: 'gl-shadow'/.test(parts) && /class: 'gl-mark', d: 'M63 14l6 6-6 6'/.test(parts) && /function artMarkup\(n, goal\)/.test(page) && /artMarkup\(n, goal\)/.test(page) && /artNode\(c\.n, v === 0\)/.test(page), 'the board and the tutorial art draw from the same vehicle list');
  ok(/cardShapes\(g, parts\(c\.n, v === 0\), v === 0 \? 'g' : \(\(B\.look\[v\] >> 1\) & 3\), tk\);/.test(page) && /cardShapes\(g, wallParts\(\), '', tk\);/.test(page) && /new Path2D\(a\.d\)/.test(page) && !/C\.rrect\(g, 4 \* u, 5 \* u/.test(page), 'the share card draws the same lists through a small canvas interpreter, no hand-drawn copy');

  // the hint covers the whole vehicle, in the accent (#244), and the ghost is the whole vehicle too
  ok(/sv\('rect', \{ class: 'gl-halo', x: -2, y: -2, width: w \+ 4, height: h \+ 4, rx: 14 \}\)/.test(page) && /var c = S\.cars\[v\], w = c\.h \? c\.n \* U : U, h = c\.h \? U : c\.n \* U;/.test(page), 'the halo is a rounded box around the whole car');
  ok(/\.gl-car--hint \.gl-halo \{ fill-opacity: \.[2-9]; stroke-opacity: 1;/.test(page) && /\.gl-halo \{ fill: var\(--gl-hint\);[^}]*stroke: var\(--gl-hint\);/.test(page) && /\.gl-ghost \{ fill: var\(--gl-hint\);[^}]*stroke: var\(--gl-hint\);/.test(page), 'halo and ghost are drawn in the hint colour, the accent in light and a lighter tone in dark, and filled, not only outlined');
  ok(/\.gl-ghost \{[^}]*stroke-dasharray/.test(page) && !/\.gl-cur \{[^}]*stroke-dasharray/.test(page) && /\.gl-cur \{[^}]*stroke-width: 3;/.test(page), 'the keyboard ring is a solid line and the ghost a dashed one, so the two never look alike');
  ok(/function frameRect\(v, p, grow\) \{\n\s+var c = S\.cars\[v\], xy = lane\(v, p\), w = c\.h \? c\.n \* U : U, h = c\.h \? U : c\.n \* U;/.test(page) && /frameRect\(S\.hint\.v, S\.hint\.to, 2\)/.test(page), 'the ghost outlines every cell the car will cover');

  // tokens only: colours live in the token blocks, light and both dark ones, and nowhere else
  const css = page.slice(page.indexOf('<style>'), page.indexOf('</style>')).replace(/\/\*[\s\S]*?\*\//g, '');
  ok(!/color-mix/.test(page), 'no color-mix');
  const tokenBlocks = css.match(/:root \{[^}]*\}|:root:not\(\[data-theme="light"\]\) \{[^}]*\}|:root\[data-theme="dark"\] \{[^}]*\}/g) || [];
  const rest = tokenBlocks.reduce((s, b) => s.replace(b, ''), css);
  ok(tokenBlocks.length === 3 && !/#[0-9A-Fa-f]{3,8}\b|rgba?\(/.test(rest), 'colours are written only in the three token blocks (' + tokenBlocks.length + ' blocks)');
  ok([0, 1, 2, 3].every((k) => (css.match(new RegExp('--gl-c' + k + ':', 'g')) || []).length === 3) && !/--gl-c4:/.test(css) && ['--gl-goal:', '--gl-goal-roof:', '--gl-concrete:', '--gl-hint:', '--gl-lot:', '--gl-cell:', '--gl-ink:', '--gl-glass:'].every((t) => (css.match(new RegExp(t, 'g')) || []).length === 3), 'four paints, the red, the lot, the ink and the hint colour each have a light and a dark value');
  ok(/\n\s*\.gl-chev \{[^}]*\}/.test(css) && !/\n\s*\.gl-chev \{[^}]*animation/.test(css) && /\.gl-board--clear \.gl-chev \{ animation: gl-run/.test(css) && /svg\.classList\.toggle\('gl-board--clear', E\.clear\(S\)\)/.test(page), 'the exit chevrons stand still and only run while the red car\'s road is clear');
  ok(/class: 'gl-hatch'/.test(page) && /\.gl-hatch \{[^}]*stroke-linecap: round;/.test(css) && /class: 'gl-wall', x: 4\.5, y: 4\.5, width: 31, height: 31, rx: 7/.test(page) && /function wallParts\(\)/.test(page), 'a wall is a rounded concrete block with hatching, not a car');
  const light = css.match(/:root \{([^}]*)\}/)[1], dark = css.match(/:root\[data-theme="dark"\] \{([^}]*)\}/)[1];
  const goal = (light.match(/--gl-goal: (#[0-9A-Fa-f]{6})/) || [])[1];
  ok(!!goal && (hue(goal) < 15 || hue(goal) > 345) && sat(goal) > 0.5, 'your car is a clear warm red (' + goal + ')');
  // the lot is dark asphalt in both themes, so the pale paints glow and only the red car pops
  const tok = (block, name) => (block.match(new RegExp(name + ': (#[0-9A-Fa-f]{6})')) || [])[1];
  ok([light, dark].every((b) => tok(b, '--gl-lot') && lum(tok(b, '--gl-lot')) < 0.05 && lum(tok(b, '--gl-cell')) < 0.06 && lum(tok(b, '--gl-ink')) < 0.02) && /\.gl-lot \{ fill: var\(--gl-lot\); \}/.test(css) && /\.gl-dim \{ fill: var\(--gl-lot\);/.test(css), 'the lot is dark asphalt in both themes, drawn in one ink, and the hint veil is the same asphalt');
  // the user's convention: red goes out. The red car is the only red vehicle: every other paint
  // is a pale neutral (chroma, max minus min, at most .25 in both themes), the red strong and warm
  const chroma = (hex) => { const c = rgb(hex); return Math.max(...c) - Math.min(...c); };
  const isRed = (hex) => !!hex && (hue(hex) < 15 || hue(hex) > 345) && chroma(hex) >= 0.5;
  const neutral = (hex) => !!hex && chroma(hex) <= 0.25;
  const paintsOf = (b) => [0, 1, 2, 3].map((k) => tok(b, '--gl-c' + k));
  ok([light, dark].every((b) => paintsOf(b).every(neutral) && isRed(tok(b, '--gl-goal')) && isRed(tok(b, '--gl-goal-roof')) && neutral(tok(b, '--gl-concrete')) && neutral(tok(b, '--gl-concrete-top'))),
    'red goes out: the red car is the only red vehicle, every other paint and the concrete are pale neutrals in both themes (chroma ' + [light, dark].map((b) => paintsOf(b).map((h) => h ? chroma(h).toFixed(2) : '-').join('/')).join(' and ') + ', red ' + (goal ? chroma(goal).toFixed(2) : '-') + ')');
}

// #234: award notices left before they could be read
function testAwardToasts() {
  head('Award notices');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8');
  const un = core.slice(core.indexOf('    unlock: function (id) {'), core.indexOf('    check: function () {'));
  // #464: Darts reused Dots and Boxes' dt-win and dt-hard, so its own two awards never
  // showed and each game's wins counted for the other; every award id must be unique
  const ids = (core.match(/\{ id: '([a-z0-9-]+)',/g) || []).map((x) => x.slice(7, -2));
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  ok(ids.length > 80 && !dup.length, 'every award id is unique (' + ids.length + ' awards' + (dup.length ? ', twice: ' + dup.join(', ') : '') + ')');
  ok(/Chogan\.ui\.toast\(\{[^}]*ms: 7000\s*\}\);/.test(un), 'an award notice stays seven seconds');
  ok(/node\.addEventListener\('pointerenter', hold\);/.test(core) && /node\.addEventListener\('pointerdown', hold\);/.test(core) && /node\.addEventListener\('pointerleave', release\);/.test(core), 'a finger or the mouse on a notice holds it');
  ok(/node\.addEventListener\('click', function \(\) \{ clearTimeout\(node\._chTimer\); node\._chHide\(\); \}\);/.test(core), 'a tap closes a notice');
  const toast = css.slice(css.indexOf('.ch-toast {'), css.indexOf('}', css.indexOf('.ch-toast {')));
  ok(/pointer-events: auto;/.test(toast), 'a notice receives touches although its host lets them through');
}

// #238: the rival led every game for a player who restarted games, the shuffle was
// silent and its card backs were too small to show the pattern
function testPasurLead() {
  head('Pasur lead and shuffle');
  const page = fs.readFileSync(path.join(ROOT, 'www/games/pasur/index.html'), 'utf8');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const ng = page.slice(page.indexOf('  function newGame(level, daily) {'), page.indexOf('\n  }\n', page.indexOf('  function newGame(level, daily) {')));
  ok(/var first = daily \? 0 : prefs\.next;/.test(ng) && /if \(!daily\) \{ prefs\.next = 1 - first; ctx\.store\.set\('prefs', prefs\); \}/.test(ng), 'every new ordinary game flips who leads, finished or not; the daily is always yours');
  ok(!/prefs\.games % 2\);\n    S = E\.newDeal/.test(page) && /note = C\.t\(first \? 'rivalStarts' : 'youStart'\);/.test(ng), 'the lead no longer follows the finished-game count, and the table says who leads');
  ok(/    riffle: function \(\) \{/.test(core) && /C\.audio\.sfx\('riffle'\);/.test(page), 'the shuffle plays a riffle sound');
  ok(/\.ps-shuffle \.ch-pback \{ position: absolute; width: calc\(var\(--cw\) \* 1\.5\); \}/.test(page), 'the shuffling backs are drawn large');
  const miss = ['youStart', 'rivalStarts'].filter((k) => (page.match(new RegExp('[ ,{]' + k + ": '", 'g')) || []).length < LOCALE_CODES.length);
  ok(!miss.length, 'lead strings in every language' + (miss.length ? ' (' + miss.join(', ') + ')' : ''));
}

// #242: dialog buttons were equal width, so «مرحله‌ی بعد» broke onto two lines
function testModalButtons() {
  head('Dialog buttons');
  const css = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8');
  ok(/\.ch-modal__actions \{[^}]*flex-wrap: wrap;/.test(css), 'dialog buttons wrap to a new row when they do not fit');
  ok(/\.ch-modal__actions \.ch-btn \{[^}]*white-space: nowrap;/.test(css) && !/\.ch-modal__actions \.ch-btn \{ flex: 1; \}/.test(css), 'a dialog button keeps its label on one line instead of a fixed equal width');
}

// #245: a tester wanted waves to start by themselves
function testTdAutoWaves() {
  head('Tower defence auto waves');
  const page = fs.readFileSync(path.join(ROOT, 'www/games/tower-defence/index.html'), 'utf8');
  ok(/var autoBtn = el\('button'/.test(page) && /prefs\.auto = !prefs\.auto;/.test(page) && !/auto: true/.test(page), 'an Auto toggle exists, off unless chosen, and is remembered');
  ok(/if \(prefs\.auto && !S\.over\) autoAt = now \+ AUTO_MS;/.test(page) && /else if \(now >= autoAt\) launchWave\(\);/.test(page), 'with Auto on, a finished wave counts down to the next one');
  ok(/S\.wave > 0 \? performance\.now\(\) \+ AUTO_MS : 0;/.test(page), 'the first wave always waits for the player');
  ok(/autoAt = 0; wasActive = false;/.test(page), 'a new game clears a pending countdown');
  const miss = ['auto', 'nextIn'].filter((k) => (page.match(new RegExp('[ ,{]' + k + ": '", 'g')) || []).length < LOCALE_CODES.length);
  ok(!miss.length, 'auto-wave strings in every language' + (miss.length ? ' (' + miss.join(', ') + ')' : ''));
}

// #245: shots were a one-frame line a tester could not follow
function testTdShots() {
  head('Tower defence visible shots');
  const page = fs.readFileSync(path.join(ROOT, 'www/games/tower-defence/index.html'), 'utf8');
  const ms = page.match(/var SHOT_MS = \{ archer: (\d+), cannon: (\d+), frost: (\d+), tesla: (\d+) \};/);
  ok(!!ms && ms.slice(1, 4).every((x) => +x >= 200), 'archer, cannon and frost shots travel for at least 200 ms (' + (ms ? ms.slice(1).join('/') : 'none') + ')');
  ok(/function takeShots\(now\)/.test(page) && /takeShots\(now\);\n\s+hudTick\(\);/.test(page) && /drawShots\(g, performance\.now\(\)\);/.test(page), 'every frame turns the engine\'s shots into flying projectiles and draws them');
  ok(/if \(f\.kind === 'archer'\)/.test(page) && /\} else if \(f\.kind === 'cannon'\) \{/.test(page) && /impacts\.push\(/.test(page), 'arrows, cannonballs and frost shards each have their own look, and cannon and frost land with a burst');
  ok(/dur: C\.ui\.reduceMotion\(\) \? 90 :/.test(page), 'reduced motion keeps shots short and plain');
  ok(/shotsLive = \[\]; impacts = \[\];/.test(page), 'a new game clears shots still in flight');
}

/* ------------------------------------------------------------ 8-ball (#259) */
// Table physics live in www/lib/cue.js so a snooker game can share them; the
// 8-ball rules and AI sit in the game's engine block on top of it.
function loadEightBall() {
  const sandbox = { self: {}, module: { exports: {} }, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'www/lib/cue.js'), 'utf8'), sandbox, { filename: 'cue.js' });
  const html = fs.readFileSync(path.join(ROOT, 'www/games/eightball/index.html'), 'utf8');
  const m = html.match(/\/\* ==== ENGINE START ==== \*\/([\s\S]*?)\/\* ==== ENGINE END ==== \*\//);
  if (!m) throw new Error('eightball engine markers not found');
  vm.runInContext(m[1], sandbox, { filename: 'eightball-engine.js' });
  return { Cue: sandbox.self.ChoganCue, E: sandbox.EightBallEngineFactory(sandbox.self.ChoganCue), html };
}
function testEightBall() {
  head('8-ball and the shared table physics');
  const t0 = Date.now();
  const { Cue, E, html } = loadEightBall();
  ok(!!Cue && typeof Cue.simulate === 'function' && typeof Cue.tick === 'function', 'cue.js attaches ChoganCue to self');
  const viaRequire = require(path.join(ROOT, 'www/lib/cue.js'));
  ok(typeof viaRequire.simulate === 'function', 'cue.js also loads through module.exports');
  // #278: with the white in hand every drag on it moved the ball, so the break
  // could never be played with the slingshot. Aim up the screen (-90 degrees):
  const up = -Math.PI / 2, pb = Cue.pullsBack;
  ok(typeof pb === 'function' && pb(up, 0, 10) && pb(up, 3, 10) && pb(0, -10, 0.1) && pb(Math.PI, 10, -0.1), 'a pull straight back from the aim, or close to it, counts as a pull');
  ok(typeof pb === 'function' && !pb(up, 0, -10) && !pb(up, 10, 0) && !pb(up, 10, 10) && !pb(up, 0, 0), 'a move forward, sideways, at 45 degrees or not at all moves the white instead');
  for (const g of ['eightball', 'snooker']) {
    const page = fs.readFileSync(path.join(ROOT, 'www/games/' + g + '/index.html'), 'utf8');
    ok(/if \(F\.inHand && dc < grab\) drag = \{ id: e\.pointerId, mode: 'hand'/.test(page) && /drag\.mode = prefs\.aim !== 'turn' && Cue\.pullsBack\(aimA, p\.x - h0\.x, p\.y - h0\.y\) \? 'sling' : 'place'/.test(page),
      g + ': a drag on the white in hand can still become a slingshot shot (with the default point control; #492)');
  }
  const T = E.T, r = T.r;
  ok(T.L === 2 * T.W && T.pockets.length === 6, 'the default table is 2:1 with six pockets');
  const B = (id, x, y) => ({ id, x, y, vx: 0, vy: 0, inPlay: true });
  const toward = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);

  // A straight shot pots the ball into the pocket it is aimed at: a corner and a middle pocket
  let s = Cue.simulate(T, [B(0, 150, 50), B(1, 180, 80)], { angle: Math.PI / 4, power: 0.4 }, 0);
  ok(s.ev.first === 1 && s.ev.potted.join() === '1' && s.ev.pockets.join() === '3', 'a straight shot down the diagonal pots ball 1 in the far corner (' + JSON.stringify(s.ev.potted) + ' in ' + JSON.stringify(s.ev.pockets) + ')');
  s = Cue.simulate(T, [B(0, 100, 60), B(5, 100, 20)], { angle: -Math.PI / 2, power: 0.35 }, 0);
  ok(s.ev.potted.join() === '5' && s.ev.pockets.join() === '4', 'a straight shot pots ball 5 in the middle pocket it faces');
  s = Cue.simulate(T, [B(0, 40, 50), B(1, 80, 50)], { angle: 0.3, power: 0.4 }, 0);
  ok(s.ev.first === null && s.ev.potted.indexOf(1) < 0, 'aimed well wide, the white misses the ball');

  // Two balls: momentum is kept through the collision, the paths split at about
  // 90° as with equal masses, and both end at rest
  let st = Cue.start(T, [B(0, 60, 40), B(1, 100, 44)], { angle: 0, power: 0.5 }, 0);
  let before = null, after = null, guard = 0;
  while (Cue.tick(st) && guard++ < 20000) {
    const [c, o] = st.balls;
    if (!before && st.ev.contacts === 0) before = { px: c.vx + o.vx, py: c.vy + o.vy };
    if (st.ev.contacts === 1 && !after) { after = { px: c.vx + o.vx, py: c.vy + o.vy, c: [c.vx, c.vy], o: [o.vx, o.vy] }; }
    if (st.ev.contacts === 0) before = { px: c.vx + o.vx, py: c.vy + o.vy };
  }
  ok(!!before && !!after, 'the white reached the object ball');
  const pBefore = Math.hypot(before.px, before.py), pAfter = after ? Math.hypot(after.px, after.py) : 0;
  ok(after && Math.abs(pAfter - pBefore) / pBefore < 0.01 && Math.abs(after.py - before.py) < pBefore * 0.01, 'momentum through the collision is kept within 1% (' + (after ? (100 * (pAfter - pBefore) / pBefore).toFixed(3) : '?') + '%)');
  const dot = after ? (after.c[0] * after.o[0] + after.c[1] * after.o[1]) / (Math.hypot(...after.c) * Math.hypot(...after.o)) : 1;
  ok(Math.abs(Math.acos(dot) * 180 / Math.PI - 90) < 6, 'a cut sends the two balls off at about 90° (' + (Math.acos(dot) * 180 / Math.PI).toFixed(1) + '°)');
  ok(!st.moving && st.balls.every((b) => b.vx === 0 && b.vy === 0) && st.ticks < Cue.MAX_TICKS, 'both balls come to rest by friction (' + st.ticks + ' steps)');

  // A cushion reflects: the speed across it turns round, the speed along it stays
  st = Cue.start(T, [B(0, 40, 60)], { angle: Math.atan2(1, 0.5), power: 0.3 }, 0);
  let flip = null;
  while (Cue.tick(st)) if (!flip && st.ev.cushions === 1) flip = { vx: st.balls[0].vx, vy: st.balls[0].vy, y: st.balls[0].y };
  ok(!!flip && flip.vy < 0 && flip.vx > 0 && flip.y <= T.W - r + 1e-9, 'a ball off the bottom cushion comes back up and keeps going the same way along it');

  // Deterministic: the same shot from the same table gives the same table, and the
  // page's step-by-step animation lands exactly where simulate() said
  const rack = E.rack(rng(9));
  const shot = { angle: 0.01, power: 1 };
  const a1 = Cue.simulate(T, rack, shot, 0), a2 = Cue.simulate(T, rack, shot, 0);
  ok(JSON.stringify(a1.balls) === JSON.stringify(a2.balls) && JSON.stringify(a1.ev) === JSON.stringify(a2.ev) && a1.ticks === a2.ticks, 'simulate() is deterministic: same input, identical result');
  const st2 = Cue.start(T, rack, shot, 0);
  while (Cue.tick(st2)) { /* the page's loop */ }
  ok(JSON.stringify(st2.balls) === JSON.stringify(a1.balls), 'stepping tick() by hand ends exactly where simulate() ends');
  ok(rack.every((b) => b.vx === 0) && rack[0].x === E.HEAD * 0.8, 'simulate() does not touch the balls it is given');

  // The rack: fifteen balls in a triangle, the 8 in the middle, one of each group in the back corners
  const ids = rack.map((b) => b.id).sort((x, y) => x - y).join();
  ok(ids === '0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15', 'the rack holds the white and balls 1 to 15');
  const objs = rack.filter((b) => b.id);
  const xs = [...new Set(objs.map((b) => b.x.toFixed(3)))].sort((x, y) => x - y);
  const row = (k) => objs.filter((b) => b.x.toFixed(3) === xs[k]).sort((p, q) => p.y - q.y);
  ok(xs.length === 5 && row(2)[1].id === 8 && Math.abs(row(0)[0].x - E.FOOT.x) < 1e-9, 'apex on the foot spot, the 8 in the middle of the third row');
  ok(E.group(row(4)[0].id) !== E.group(row(4)[4].id), 'the back corners hold one solid and one stripe');
  let overlap = 0;
  for (let i = 0; i < rack.length; i++) for (let j = i + 1; j < rack.length; j++) if (Math.hypot(rack[i].x - rack[j].x, rack[i].y - rack[j].y) < 2 * r) overlap++;
  ok(overlap === 0 && JSON.stringify(E.rack(rng(9))) === JSON.stringify(rack), 'no two racked balls overlap, and a seed always racks the same');

  // Rules, judged from what the physics saw
  const frame = (balls, o) => Object.assign(E.newFrame({ rnd: rng(1) }), { balls, isBreak: false, kitchen: false, inHand: false }, o || {});
  let F = frame([B(0, 150, 50), B(3, 180, 80), B(11, 60, 20), B(8, 60, 80)]);
  let out = E.shoot(F, { angle: Math.PI / 4, power: 0.4 });
  ok(out.res.assigned === 'solid' && out.F.groups.join() === 'solid,stripe' && out.res.continues && out.F.turn === 0 && !out.res.foul, 'open table: potting a solid gives the solids, the other player the stripes, and the shooter goes again');
  F = frame([B(0, 150, 50), B(3, 30, 20), B(11, 60, 20), B(8, 60, 80)]);
  out = E.shoot(F, { angle: Math.PI / 4, power: 0.5 });
  ok(out.res.foul === 'scratch' && out.F.turn === 1 && out.F.inHand && E.ball(out.F, 0).inPlay && E.legalPlace(Object.assign({}, out.F, { balls: out.F.balls.filter((b) => b.id) }), E.ball(out.F, 0).x, E.ball(out.F, 0).y), 'a potted white is a foul: the opponent gets ball in hand with the white back on a free spot');
  F = frame([B(0, 40, 50), B(3, 30, 20), B(11, 80, 50), B(8, 60, 80)], { groups: ['solid', 'stripe'] });
  out = E.shoot(F, { angle: 0, power: 0.3 });
  ok(out.res.first === 11 && out.res.foul === 'wrongFirst' && out.F.turn === 1 && out.F.inHand && out.F.fouls[0] === 1, 'hitting the opponent\'s ball first is a foul with ball in hand');
  F = frame([B(0, 40, 50), B(3, 30, 20), B(11, 80, 50), B(8, 60, 80)]);
  out = E.shoot(F, { angle: toward({ x: 40, y: 50 }, { x: 60, y: 80 }), power: 0.2 });
  ok(out.res.first === 8 && out.res.foul === 'wrongFirst', 'on an open table the 8 may not be hit first');
  F = frame([B(0, 40, 50), B(3, 30, 20), B(11, 80, 50), B(8, 60, 80)]);
  out = E.shoot(F, { angle: toward({ x: 40, y: 50 }, { x: 30, y: 20 }), power: 0.2 });
  ok(out.res.first === 3 && !out.res.foul && !out.res.assigned && out.F.turn === 1 && !out.F.inHand, 'a legal hit with nothing potted passes the turn without ball in hand');
  F = frame([B(0, 150, 50), B(8, 180, 80), B(3, 60, 20), B(11, 60, 80)], { groups: ['solid', 'stripe'] });
  out = E.shoot(F, { angle: Math.PI / 4, power: 0.4 });
  ok(out.res.lose && out.F.over && out.F.winner === 1, 'potting the 8 while your solids are still on the table loses the frame');
  F = frame([B(0, 150, 50), B(8, 180, 80), B(11, 60, 80)], { groups: ['solid', 'stripe'] });
  out = E.shoot(F, { angle: Math.PI / 4, power: 0.4 });
  ok(out.res.win && out.F.over && out.F.winner === 0, 'potting the 8 cleanly once your group is cleared wins the frame');
  F = frame([B(0, 150, 50), B(8, 180, 80), B(11, 60, 80)], { groups: ['solid', 'stripe'] });
  out = E.shoot(F, { angle: Math.PI / 4, power: 1 });
  ok(E.judge(F, { first: 8, potted: [8, 0] }).lose && !E.judge(F, { first: 8, potted: [8] }).lose, 'the 8 with a scratch loses even when your group is cleared');
  ok(E.judge(F, { first: 11, potted: [] }).foul === 'wrongFirst', 'once your group is cleared the 8 must be hit first');
  const brk = E.newFrame({ rnd: rng(3) });
  const jb = E.judge(brk, { first: 1, potted: [8] });
  ok(jb.respot && !jb.lose && !jb.foul, 'the 8 potted on the break goes back on its spot, no loss');
  ok(E.judge(frame([B(0, 1, 1)]), { first: null, potted: [] }).foul === 'noHit', 'hitting nothing is a foul');
  ok(E.legalPlace(brk, E.HEAD - 5, 50) && !E.legalPlace(brk, E.HEAD + 5, 50), 'on the break the white goes only behind the head string');

  // The daily: the same layout for everyone, a few balls, all free
  const D1 = E.newDaily(rng(77), '2026-10-18'), D2 = E.newDaily(rng(77), '2026-10-18');
  const dOverlap = D1.balls.some((b, i) => D1.balls.some((o, j) => j > i && Math.hypot(b.x - o.x, b.y - o.y) < 2 * r));
  ok(JSON.stringify(D1) === JSON.stringify(D2) && D1.balls.length === E.DAILY_BALLS + 1 && !dOverlap && D1.balls.every((b) => b.id !== 8), 'the daily table is the same for the same seed: ' + E.DAILY_BALLS + ' balls, none overlapping, no 8');
  ok(/C\.daily\('eightball', o\.daily\)\.rng/.test(html) && /C\.stats\.daily\('eightball', F\.daily/.test(html), 'the page seeds the daily from C.daily and records it');
  let Dd = E.copy(D1); Dd.balls = [B(0, 150, 50), B(3, 180, 80)];
  out = E.shoot(Dd, { angle: Math.PI / 4, power: 0.4 });
  ok(out.F.over && out.F.winner === 0 && out.F.shots === 1, 'potting the last daily ball clears the table');

  // AI: medium beats easy most of the time, hard does at least as well against medium
  const N = 6, jobs8 = [];
  for (let i = 0; i < N; i++) jobs8.push({ l0: 'medium', l1: 'easy', seed: 500 + i });
  for (let i = 0; i < N; i++) jobs8.push({ l0: 'hard', l1: 'medium', seed: 600 + i });
  const res8 = cueFrames('eightball', jobs8);
  const me = res8.slice(0, N).filter((r) => r.winner === 0).length, hm = res8.slice(N).filter((r) => r.winner === 0).length;
  ok(me >= 4, 'medium AI beats easy AI in most frames (' + me + ' of ' + N + ')');
  ok(hm >= N / 2, 'hard AI wins at least half its frames against medium (' + hm + ' of ' + N + ')');
  const pl = E.planner(E.copy(out.F.over ? frame([B(0, 40, 50), B(3, 30, 20), B(11, 80, 50), B(8, 60, 80)]) : out.F), 'hard', rng(4));
  let slices = 0, worst = 0;
  while (true) { const q = Date.now(); const d = pl.step(6); worst = Math.max(worst, Date.now() - q); slices++; if (d || slices > 400) break; }
  ok(pl.total <= 200 && slices < 60 && worst < 60, 'the hard AI thinks in bounded slices (' + pl.total + ' shots, ' + slices + ' slices, slowest ' + worst + 'ms)');

  // Wiring on the page
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8'), sw = fs.readFileSync(path.join(ROOT, 'www/sw.js'), 'utf8');
  ok(html.indexOf('<script src="../../lib/cue.js"></script>') > 0 && /'\.\/lib\/cue\.js'/.test(sw), 'the page loads lib/cue.js and the service worker caches it');
  ok(!/function tick\(|rollA:|cushionSlide:/.test(html) && /Cue\.tick\(run\)/.test(html) && /run = Cue\.start\(T, F\.balls, shot, 0\)/.test(html), 'the page has no physics of its own and animates with the shared tick()');
  ok(['eb-win', 'eb-hard', 'eb-run'].every((id) => core.indexOf("id: '" + id + "'") > 0 && html.indexOf("unlock('" + id + "')") > 0), 'the three 8-ball awards exist and are unlocked');
  ok(Date.now() - t0 < 5000, 'the 8-ball group runs in under five seconds (' + (Date.now() - t0) + 'ms)');
}

/* ------------------------------------------------------------ snooker (#271) */
// Snooker shares the table physics in www/lib/cue.js with 8-ball; only its
// table options (smaller balls, tighter pockets), rules and AI are its own.
function loadSnooker() {
  const sandbox = { self: {}, module: { exports: {} }, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'www/lib/cue.js'), 'utf8'), sandbox, { filename: 'cue.js' });
  const html = fs.readFileSync(path.join(ROOT, 'www/games/snooker/index.html'), 'utf8');
  const m = html.match(/\/\* ==== ENGINE START ==== \*\/([\s\S]*?)\/\* ==== ENGINE END ==== \*\//);
  if (!m) throw new Error('snooker engine markers not found');
  vm.runInContext(m[1], sandbox, { filename: 'snooker-engine.js' });
  return { Cue: sandbox.self.ChoganCue, E: sandbox.SnookerEngineFactory(sandbox.self.ChoganCue), html };
}
// AI matches for 8-ball and snooker, one frame per job. They were played one after
// another and took about 2.6 and 2.9 s here, but over 5 and 6 s on a GitHub runner,
// so the groups' time limits failed correct commits and held back deploys (#297).
// Each frame has its own seed and shares nothing, so they now run on worker
// threads; every frame is played exactly as before and gives the same result.
const cueEngines = {};
function cueFrameJob(game, j) {
  const E = cueEngines[game] || (cueEngines[game] = (game === 'eightball' ? loadEightBall() : loadSnooker()).E);
  const rr = rng(j.seed);
  let G = game === 'eightball' ? E.newFrame({ mode: 'ai', rnd: rr, first: j.seed % 2 }) : E.newFrame({ mode: 'ai', reds: j.reds, first: j.seed % 2 });
  let n = 0, shots = 0, bad = 0;
  const cap = game === 'eightball' ? 150 : 200;
  while (!G.over && n++ < cap) {
    const sh = E.think(G, G.turn ? j.l1 : j.l0, rr);
    if (sh.place && G.inHand) E.placeCue(G, sh.place.x, sh.place.y);
    const o = E.shoot(G, { angle: sh.angle, power: sh.power });
    shots++;
    if (o.res && (o.res.foul === 'wrongFirst' || o.res.foul === 'noHit')) bad++;
    G = o.F;
  }
  return { winner: G.over ? G.winner : -1, shots, bad };
}
// Runs the jobs on worker threads and blocks until all are done, so the test groups
// stay synchronous. out[0] counts finished jobs; job i writes out[1 + 3i ..].
function cueFrames(game, jobs) {
  ok(jobs.length > 0, game + ': there are AI frames to play');
  const out = new Int32Array(new SharedArrayBuffer(4 * (1 + 3 * jobs.length)));
  const threads = Math.max(1, Math.min(jobs.length, os.availableParallelism ? os.availableParallelism() : os.cpus().length));
  for (let w = 0; w < threads; w++) new Worker(__filename, { workerData: { cueGame: game, jobs, out, from: w, step: threads } });
  const until = Date.now() + 120000;
  for (let done; (done = Atomics.load(out, 0)) < jobs.length;) {
    // a worker that throws never reports, so give up loudly rather than wait forever
    if (Date.now() > until) throw new Error(game + ' AI frames: only ' + done + ' of ' + jobs.length + ' finished');
    Atomics.wait(out, 0, done, 1000);
  }
  return jobs.map((_, i) => ({ winner: out[1 + 3 * i], shots: out[2 + 3 * i], bad: out[3 + 3 * i] }));
}
function testSnooker() {
  head('snooker');
  const t0 = Date.now();
  const { Cue, E, html } = loadSnooker();
  const T = E.T, r = T.r;
  const B = (id, x, y) => ({ id, x, y, vx: 0, vy: 0, inPlay: true });
  const YEL = 22, GRN = 23, BRN = 24, BLU = 25, PNK = 26, BLK = 27;
  ok(T.L === 2 * T.W && T.pockets.length === 6 && r === 2 && T.corner === r * 2.5 && T.side === r * 3.4, 'the snooker table is 2:1 with smaller balls and tighter pockets than the cue.js defaults');
  ok(Cue.table({}).r === 2.6 && Cue.table({}).corner === 2.6 * 2.8, 'the default table (8-ball) is unchanged');

  // The set-up: reds in a triangle behind the pink, colours on their spots, the white in the D
  const counts = E.REDS_OPTIONS.map((n) => {
    const F = E.newFrame({ reds: n });
    const red = F.balls.filter((b) => E.isRed(b.id)), col = F.balls.filter((b) => E.isColour(b.id));
    let overlap = 0;
    for (let i = 0; i < F.balls.length; i++) for (let j = i + 1; j < F.balls.length; j++) if (Math.hypot(F.balls[i].x - F.balls[j].x, F.balls[i].y - F.balls[j].y) < 2 * r) overlap++;
    const spots = col.every((b) => b.x === E.SPOT[b.id - 20].x && b.y === E.SPOT[b.id - 20].y);
    const behind = red.every((b) => b.x > E.SPOT[6].x + 2 * r && b.x < E.SPOT[7].x - 2 * r);
    return red.length === n && col.length === 6 && spots && behind && overlap === 0 && E.inD(F.balls[0].x, F.balls[0].y) && F.inHand && F.phase === 'red' ? n : -n;
  });
  ok(counts.join() === '6,10,15', 'the reds option sets up 6, 10 or 15 reds behind the pink, colours on their spots, nothing overlapping, the white in hand in the D (' + counts.join() + ')');
  ok(E.newFrame({}).reds === 6, 'a frame has six reds unless asked otherwise');
  ok(E.SPOT[4].x === E.BAULK && E.SPOT[2].y > E.SPOT[4].y && E.SPOT[3].y < E.SPOT[4].y && E.SPOT[5].x === T.L / 2 && E.SPOT[6].x === T.L * 0.75 && E.SPOT[7].x > E.SPOT[6].x, 'yellow, brown and green on the baulk line, blue in the middle, pink and black up the table');

  // The tighter pockets still take a straight pot, in a corner and in a middle pocket
  let s = Cue.simulate(T, [B(0, 150, 50), B(1, 180, 80)], { angle: Math.PI / 4, power: 0.4 }, 0);
  ok(s.ev.first === 1 && s.ev.potted.join() === '1' && s.ev.pockets.join() === '3', 'a straight shot pots a red in the far corner');
  s = Cue.simulate(T, [B(0, 100, 60), B(1, 100, 20)], { angle: -Math.PI / 2, power: 0.35 }, 0);
  ok(s.ev.potted.join() === '1' && s.ev.pockets.join() === '4', 'a straight shot pots a red in the middle pocket it faces');

  // A frame in the middle, built by hand: the given balls plus the colours that are not given
  const frame = (balls, o) => {
    const given = balls.map((b) => b.id);
    const rest = E.newFrame({ reds: 1 }).balls.filter((b) => E.isColour(b.id) && given.indexOf(b.id) < 0 && !(o && o.noColours));
    return Object.assign(E.newFrame({ mode: '2p', reds: 1 }), { balls: balls.concat(rest), isBreak: false, inHand: false }, o || {});
  };
  // A red, then a colour: 1 + 7, the black goes back on its spot, a red is on again
  let F = frame([B(0, 160, 40), B(1, 180, 20), B(2, 60, 20)]);
  let out = E.shoot(F, { angle: -Math.PI / 4, power: 0.4 });
  ok(!out.res.foul && out.res.points === 1 && out.F.scores.join() === '1,0' && out.F.turn === 0 && out.F.phase === 'colour' && out.F.brk === 1, 'potting a red scores 1, the shooter stays on and a colour is on');
  F = out.F;
  const blk = E.ball(F, BLK), cue = E.ball(F, 0);
  blk.x = 180; blk.y = 20; cue.x = 160; cue.y = 40;
  out = E.shoot(F, { angle: -Math.PI / 4, power: 0.4 });
  const b7 = E.ball(out.F, BLK);
  ok(!out.res.foul && out.res.points === 7 && out.F.scores.join() === '8,0' && out.F.brk === 8 && out.F.best[0] === 8, 'then potting the black scores 7: a break of 1 + 7');
  ok(b7.inPlay && b7.x === E.SPOT[7].x && b7.y === E.SPOT[7].y && out.F.phase === 'red' && E.targets(out.F).join() === '2', 'the black is re-spotted on its own spot and a red is on again');
  // re-spotting when the spot is taken: the highest free spot
  let G0 = frame([B(0, 30, 30), B(2, E.SPOT[7].x, E.SPOT[7].y), B(BLK, 10, 10)], { noColours: true });
  E.respot(G0, BLK);
  ok(E.ball(G0, BLK).x === E.SPOT[6].x && E.ball(G0, BLK).y === E.SPOT[6].y, 'a colour whose spot is covered goes on the highest free spot (the black on the pink spot while a red covers its own)');
  G0 = frame([B(0, E.SPOT[6].x, E.SPOT[6].y), B(PNK, 10, 10)]);
  E.respot(G0, PNK);
  const p6 = E.ball(G0, PNK);
  ok(p6.y === E.SPOT[6].y && p6.x > E.SPOT[6].x + 2 * r - 0.3 && p6.x < E.SPOT[6].x + 2 * r + 0.3, 'with every spot covered it goes as near its own spot as it can, towards the top cushion');
  // several reds in one shot all count
  F = frame([B(0, 160, 40), B(1, 180, 20), B(2, 60, 20)]);
  ok(E.judge(F, { first: 1, potted: [1, 2] }).points === 2 && !E.judge(F, { first: 1, potted: [1, 2] }).foul, 'two reds in one shot score 2');

  // Colours in order once the reds are gone
  F = frame([B(0, 160, 40), B(1, 180, 20)], { phase: 'red' });
  out = E.shoot(F, { angle: -Math.PI / 4, power: 0.4 });
  ok(out.F.phase === 'colour' && E.reds(out.F).length === 0, 'after the last red a colour is still on');
  F = out.F;
  const pk = E.ball(F, PNK); pk.x = 180; pk.y = 20; E.ball(F, 0).x = 160; E.ball(F, 0).y = 40;
  out = E.shoot(F, { angle: -Math.PI / 4, power: 0.4 });
  ok(out.res.points === 6 && E.ball(out.F, PNK).inPlay && out.F.phase === 'order' && out.F.next === 2 && E.targets(out.F).join() === String(YEL), 'the colour after the last red is re-spotted, then the yellow is on');
  F = frame([B(0, 160, 40), B(YEL, 180, 20)], { phase: 'order', next: 2 });
  out = E.shoot(F, { angle: -Math.PI / 4, power: 0.4 });
  ok(out.res.points === 2 && !E.ball(out.F, YEL).inPlay && out.F.next === 3 && E.targets(out.F).join() === String(GRN), 'in the colours sequence a potted colour stays down and the next one is on');
  F = frame([B(0, 160, 40), B(GRN, 180, 20)], { phase: 'order', next: 2 });
  out = E.shoot(F, { angle: -Math.PI / 4, power: 0.4 });
  ok(out.res.foul === 'wrongFirst' && out.res.penalty === 4 && E.ball(out.F, GRN).inPlay && out.F.scores.join() === '0,4' && out.F.next === 2, 'potting the green while the yellow is on is a foul worth 4, and the green comes back');
  ok(E.judge(frame([B(0, 1, 1)], { phase: 'order', next: 2 }), { first: PNK, potted: [] }).penalty === 6, 'hitting the pink first while the yellow is on gives away 6');

  // Each foul and its penalty
  F = frame([B(0, 160, 40), B(1, 180, 20), B(2, 60, 20)]);
  const J = (FF, ev) => E.judge(FF, ev);
  let j = J(F, { first: null, potted: [] });
  ok(j.foul === 'noHit' && j.penalty === 4, 'hitting nothing with a red on: foul, 4');
  ok(J(frame([B(0, 1, 1)], { phase: 'order', next: 5 }), { first: null, potted: [] }).penalty === 5, 'hitting nothing with the blue on: foul, 5 (the value of the ball on)');
  j = J(F, { first: PNK, potted: [] });
  ok(j.foul === 'wrongFirst' && j.penalty === 6, 'hitting the pink first with a red on: foul, 6');
  j = J(F, { first: 1, potted: [1, BLK] });
  ok(j.foul === 'wrongPot' && j.penalty === 7 && j.points === 0, 'potting the black with a red: foul, 7, the red does not score');
  j = J(frame([B(0, 1, 1)], { phase: 'colour' }), { first: GRN, potted: [GRN, PNK] });
  ok(j.foul === 'wrongPot' && j.penalty === 6, 'with a colour on, potting a second colour besides the one hit: foul, 6');
  j = J(frame([B(0, 1, 1)], { phase: 'colour' }), { first: 1, potted: [] });
  ok(j.foul === 'wrongFirst' && j.penalty === 4, 'with a colour on, hitting a red first: foul, 4');
  j = J(frame([B(0, 1, 1)], { phase: 'colour' }), { first: BLU, potted: [BLU, 0] });
  ok(j.foul === 'inOff' && j.penalty === 5, 'an in-off off the blue with a colour on: foul, 5');
  // in-off: the opponent gets the points and the white in hand in the D
  F = frame([B(0, 160, 40), B(1, 180, 20), B(2, 60, 20)]);
  F = frame([B(0, 160, 40), B(1, 175, 21.7), B(2, 60, 20)]);
  out = E.shoot(F, { angle: -Math.PI / 4, power: 0.8 });
  const c1 = E.ball(out.F, 0);
  ok(out.res.inOff && out.res.foul === 'inOff' && out.F.scores.join() === '0,4' && out.F.turn === 1 && out.F.inHand && c1.inPlay && E.inD(c1.x, c1.y) && out.F.brk === 0, 'an in-off gives the opponent 4 and ball in hand inside the D (' + JSON.stringify(out.res.potted) + ')');
  ok(E.legalPlace(out.F, E.BAULK - 3, T.W / 2 + 4) && !E.legalPlace(out.F, E.BAULK + 3, T.W / 2) && !E.legalPlace(out.F, E.BAULK - E.DR - 1, T.W / 2), 'with ball in hand the white goes only inside the D');
  // a foul re-spots colours that went in and leaves reds down
  F = frame([B(0, 160, 40), B(1, 180, 20), B(2, 60, 20)]);
  const sim = { balls: F.balls.map((b) => Object.assign({}, b, { inPlay: b.id !== 2 && b.id !== PNK })), ev: { first: 2, potted: [2, PNK] } };
  const G1 = E.apply(F, sim, E.judge(F, sim.ev));
  ok(!E.ball(G1, 2).inPlay && E.ball(G1, PNK).inPlay && E.ball(G1, PNK).x === E.SPOT[6].x && G1.scores.join() === '0,6' && G1.turn === 1, 'after a foul a potted red stays down and a potted colour is re-spotted');

  // The frame ends on the black
  F = frame([B(0, 160, 40), B(BLK, 180, 20)], { phase: 'order', next: 7, scores: [20, 13], noColours: true });
  out = E.shoot(F, { angle: -Math.PI / 4, power: 0.4 });
  ok(out.F.over && out.F.winner === 0 && out.F.scores.join() === '27,13', 'potting the last black ends the frame, the higher score wins');
  F = frame([B(0, 160, 40), B(BLK, 180, 20)], { phase: 'order', next: 7, scores: [6, 13], noColours: true });
  out = E.shoot(F, { angle: -Math.PI / 4, power: 0.4 });
  ok(!out.F.over && out.F.shootout && out.F.scores.join() === '13,13' && out.F.turn === 1 && out.F.inHand && E.ball(out.F, BLK).x === E.SPOT[7].x && out.F.next === 7, 'level after the black: it is re-spotted and the other player starts from the D');
  j = E.judge(out.F, { first: null, potted: [] });
  const G2 = E.apply(out.F, { balls: out.F.balls, ev: { first: null, potted: [] } }, j);
  ok(G2.over && G2.winner === 0 && G2.scores.join() === '20,13', 'on the re-spotted black a foul ends the frame for the opponent');
  F = frame([B(0, 30, 50), B(BLK, 180, 20)], { phase: 'order', next: 7, scores: [40, 20], turn: 1, noColours: true });
  const G3 = E.apply(F, { balls: F.balls, ev: { first: null, potted: [] } }, E.judge(F, { first: null, potted: [] }));
  ok(G3.over && G3.winner === 0, 'with only the black left a foul also ends the frame');
  F = frame([B(0, 30, 50), B(BLK, 180, 20)], { phase: 'order', next: 7, scores: [10, 10], noColours: true });
  const G4 = E.apply(F, { balls: F.balls, ev: { first: BLK, potted: [] } }, E.judge(F, { first: BLK, potted: [] }));
  ok(!G4.over && G4.turn === 1, 'a safe touch on the last black passes the turn without ending the frame');

  // Determinism
  const st = E.newFrame({ reds: 15 }), shot = { angle: 0.02, power: 0.5 };
  const a1 = E.shoot(st, shot), a2 = E.shoot(st, shot);
  ok(JSON.stringify(a1.F) === JSON.stringify(a2.F) && a1.sim.ticks === a2.sim.ticks, 'the same shot on the same table gives the same frame');
  ok(JSON.stringify(st) === JSON.stringify(E.newFrame({ reds: 15 })), 'shoot() does not touch the frame it is given');

  // The daily: a seeded table of three reds and the colours
  const D1 = E.newDaily(rng(77), '2026-10-18'), D2 = E.newDaily(rng(77), '2026-10-18'), D3 = E.newDaily(rng(78), '2026-10-19');
  const dOverlap = D1.balls.some((b, i) => D1.balls.some((o, k) => k > i && Math.hypot(b.x - o.x, b.y - o.y) < 2 * r));
  ok(JSON.stringify(D1) === JSON.stringify(D2) && JSON.stringify(D1.balls) !== JSON.stringify(D3.balls), 'the daily table is the same for the same seed and differs for another');
  ok(E.reds(D1).length === E.DAILY_REDS && E.colours(D1).length === 6 && !dOverlap && D1.mode === 'daily' && D1.inHand, 'the daily has ' + E.DAILY_REDS + ' reds, all six colours, nothing overlapping, the white in hand');
  ok(/C\.daily\('snooker', o\.daily\)\.rng/.test(html) && /C\.stats\.daily\('snooker', F\.daily/.test(html), 'the page seeds the daily from C.daily and records it');
  let Dd = E.copy(D1);
  Dd.balls = [B(0, 30, 50), B(1, 150, 50)]; Dd.inHand = false;
  const Gd = E.apply(Dd, { balls: Dd.balls, ev: { first: null, potted: [] } }, E.judge(Dd, { first: null, potted: [] }));
  ok(Gd.turn === 0 && Gd.scores.join() === '0,0' && Gd.fouls[0] === 1 && !Gd.over, 'in the daily a foul costs a shot but gives nobody points');
  Dd = Object.assign(E.copy(D1), { balls: [B(0, 160, 40), B(BLK, 180, 20)], phase: 'order', next: 7, inHand: false });
  out = E.shoot(Dd, { angle: -Math.PI / 4, power: 0.4 });
  ok(out.F.over && out.F.winner === 0, 'potting the last black clears the daily table');

  // AI: medium beats easy, hard does at least as well against medium
  const N = 4, NH = 6, jobsS = [];
  for (let i = 0; i < N; i++) jobsS.push({ l0: 'medium', l1: 'easy', seed: 500 + i, reds: 6 });
  for (let i = 0; i < NH; i++) jobsS.push({ l0: 'hard', l1: 'medium', seed: 600 + i, reds: 4 });
  const resS = cueFrames('snooker', jobsS);
  const me = resS.slice(0, N).filter((r) => r.winner === 0).length, hm = resS.slice(N).filter((r) => r.winner === 0).length;
  const aiShots = resS.reduce((a, r) => a + r.shots, 0), aiBad = resS.reduce((a, r) => a + r.bad, 0);
  ok(me >= 3, 'medium AI beats easy AI in most frames (' + me + ' of ' + N + ', six reds)');
  ok(hm >= NH / 2, 'hard AI wins at least half its frames against medium (' + hm + ' of ' + NH + ', four reds)');
  ok(aiShots > 0 && aiBad / aiShots < 0.1, 'the AI almost always hits a ball that is on first (' + aiBad + ' misses of ' + aiShots + ' shots)');
  const pl = E.planner(E.newFrame({ reds: 15 }), 'hard', rng(4));
  let slices = 0, worst = 0;
  while (true) { const q = Date.now(); const d = pl.step(4); worst = Math.max(worst, Date.now() - q); slices++; if (d || slices > 400) break; }
  ok(pl.total <= 160 && slices < 60 && worst < 80, 'the hard AI thinks in bounded slices on a full rack (' + pl.total + ' shots, ' + slices + ' slices, slowest ' + worst + 'ms)');

  // Wiring on the page
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  ok(html.indexOf('<script src="../../lib/cue.js"></script>') > 0 && !/function tick\(|rollA:|cushionSlide:/.test(html) && /Cue\.tick\(run\)/.test(html) && /run = Cue\.start\(T, F\.balls, shot, 0\)/.test(html), 'the page has no physics of its own and animates with the shared tick()');
  ok(/C\.ui\.segmented\(E\.REDS_OPTIONS\.map/.test(html) && /prefs\.reds = o\.reds/.test(html) && /E\.REDS_OPTIONS\.indexOf\(prefs\.reds\) < 0/.test(html), 'the new-frame dialog offers the reds count and remembers it');
  ok(['sn-win', 'sn-hard', 'sn-break'].every((id) => core.indexOf("id: '" + id + "'") > 0 && html.indexOf("unlock('" + id + "')") > 0), 'the three snooker awards exist and are unlocked');
  ok(Date.now() - t0 < 6000, 'the snooker group runs in under six seconds (' + (Date.now() - t0) + 'ms)');
  // On a 390px phone the AI card read "Opponent · Medi…"; the level now sits on the second line
  const snPage = fs.readFileSync(path.join(ROOT, 'www/games/snooker/index.html'), 'utf8');
  ok(/name = aiCard \? C\.t\('rival'\) : pname\(p\)/.test(snPage) && /if \(aiCard\) sub = C\.t\(F\.level\)/.test(snPage) && /class: 'sn-player__name', text: name \}/.test(snPage), 'the AI card shows the level on its second line, not beside the name');
}

/* ------------------------------------------------------------- پاسور */
function testPasur() {
  head('پاسور');
  const E = loadEngine('pasur', 'PasurEngineFactory');
  const P = (str) => str.split(' ').map(E.parse);

  // Card art (#171), drawn once in the core and shared by every card game (#178)
  const psPage = fs.readFileSync(path.join(ROOT, 'www/games/pasur/index.html'), 'utf8');
  const coreJs = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const coreCss = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8');
  // the portraits and backs themselves are checked in testCardArt (#181)
  ok(/if \(r >= 10\) \{\s*kids\.push\(el\('span', \{ class: 'ch-pcard__mini'/.test(coreJs) && /el\('span', \{ class: 'ch-pcard__face', html: faceSvg\(r\) \}\)/.test(coreJs), 'only jack, queen and king get a portrait; number cards keep the large suit');
  // a game never carries its own copy of the deck (#178)
  ok(psPage.indexOf('function faceSvg') < 0 && psPage.indexOf('data:image/svg+xml') < 0 && /return C\.cards\.el\(c, 'ps-card'/.test(psPage) && /C\.cards\.back\(\)/.test(psPage),
    'Pasur draws its cards with the shared core, not a copy');
  ok(/prefers-reduced-motion: reduce\)'\)\.matches;\s*if \(reduce\) \{ done\(\); return; \}/.test(psPage), 'the shuffle is skipped with reduced motion');
  ok(/function canHumanMove\(\) \{ return S && !S\.done && S\.turn === 0 && !dealing(?: && !sweeping)?; \}/.test(psPage) && /shuffleAnim\(function \(\) \{ paint\(\); maybeAi\(\); \}\);/.test(psPage), 'nobody moves until the shuffle has finished');
  const N = (arr) => arr.map(E.name).sort().join(' ');
  const optsOf = (table, card) => E.options(P(table), E.parse(card)).map((o) => N(o)).sort();
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  ok(E.name(E.parse('10D')) === '10D' && E.parse('10D') === E.TEN_DIAMONDS && E.parse('2C') === E.TWO_CLUBS, 'نام کارت‌ها رفت‌وبرگشت درست است');
  // هر جواب از روی قانون دستی نوشته شده: کارت عددی با جمع ۱۱
  ok(same(optsOf('5C 6D 4H KS', '6S'), ['5C']), '۶ با ۵ برمی‌دارد');
  ok(same(optsOf('5C 6D 4H KS', '2H'), ['4H 5C']), '۲ با ۵ و ۴ برمی‌دارد');
  ok(same(optsOf('5C 6D 4H KS', 'AC'), ['4H 6D']), 'آس یک است و با ۶ و ۴ برمی‌دارد');
  ok(same(optsOf('5C 6D 4H KS', '9C'), []), '۹ راهی ندارد و روی میز می‌نشیند');
  ok(same(optsOf('3C 3D 8H 5S', '8C'), ['3C', '3D']), 'دو راه برای ۸: هر کدام از دو سه');
  ok(same(optsOf('3C 3D 8H 5S', '3S'), ['3C 5S', '3D 5S', '8H']), 'سه راه برای ۳');
  ok(same(optsOf('5C QH KS JD 9H', 'JS'), ['5C 9H JD']), 'سرباز همه‌چیز جز شاه و بی‌بی را برمی‌دارد');
  ok(same(optsOf('QH KS', 'JS'), []), 'سرباز روی میزِ فقط شاه و بی‌بی چیزی برنمی‌دارد');
  ok(same(optsOf('QH QS 5C', 'QD'), ['QH', 'QS']), 'بی‌بی فقط یک بی‌بی برمی‌دارد');
  ok(same(optsOf('QH 5C 6D', 'KD'), []), 'شاه بدون شاه روی میز چیزی برنمی‌دارد');

  const mk = (table, h0, h1, deck) => ({ deck: P(deck || ''), table: P(table), hands: [P(h0), P(h1 || '')],
    caps: [[], []], surs: [0, 0], turn: 0, first: 0, lastCap: -1, log: [], done: false });
  const fix = (S) => { if (S.deck.length === 1 && S.deck[0] < 0) S.deck = []; return S; };

  let S = fix(mk('4C 6D', 'AS', 'KH'));
  let info = E.play(S, E.parse('AS'), null);
  ok(info && info.sur && S.surs[0] === 1 && !S.table.length, 'خالی کردن میز با کارت عددی سور است');
  S = fix(mk('4C 6D', 'JS', 'KH'));
  info = E.play(S, E.parse('JS'), null);
  ok(info && !info.sur && S.surs[0] === 0 && !S.table.length, 'خالی کردن میز با سرباز سور نیست');
  S = fix(mk('3C 3D 8H 5S', '8C 2D', 'KH'));
  ok(E.play(S, E.parse('8C'), null) === null, 'با چند راه باید یکی انتخاب شود');
  ok(E.play(S, E.parse('8C'), P('8H')) === null, 'برداشتی که جمعش ۱۱ نیست رد می‌شود');
  ok(E.play(S, E.parse('2D'), P('3C')) === null, 'کارتی که راه برداشت ندارد چیزی برنمی‌دارد');
  info = E.play(S, E.parse('8C'), P('3D'));
  ok(info && N(S.table) === '3C 5S 8H' && N(S.caps[0]) === '3D 8C' && S.turn === 1, 'برداشت انتخابی درست انجام شد');

  // آخرین کارت: میز مانده به آخرین برداشت‌کننده می‌رسد و سور نیست
  S = fix(mk('5C', 'KD', 'QS'));
  S.lastCap = 1; S.turn = 0;
  info = E.play(S, E.parse('KD'), null);
  ok(info && !S.done && N(S.table) === '5C KD', 'شاه روی میز نشست');
  info = E.play(S, E.parse('QS'), null);
  ok(S.done && !S.table.length && N(S.caps[1]) === '5C KD QS' && S.surs[1] === 0 && info.sweep.length === 3,
    'پایان دست: میز به آخرین برداشت‌کننده رسید و سور حساب نشد');

  // دست تازه وقتی هر دو دست خالی است و دسته تمام نشده
  S = fix(mk('9H', 'KD', 'QS', '2C 3C 4C 5C 6C 7C 8C 9C'));
  S.first = 1;
  E.play(S, E.parse('KD'), null); E.play(S, E.parse('QS'), null);
  ok(S.hands[0].length === 4 && S.hands[1].length === 4 && !S.deck.length && S.turn === 1, 'دست تازه پخش شد و نوبت با شروع‌کننده است');

  // امتیاز: همه‌ی گشنیز = ۷ + دو گشنیز ۲ + آس ۱ + سرباز ۱
  S = fix(mk('', '', ''));
  S.caps[0] = P('AC 2C 3C 4C 5C 6C 7C 8C 9C 10C JC QC KC');
  S.caps[1] = P('10D AD JD AH');
  S.surs = [1, 0];
  const sc = E.score(S);
  ok(sc[0].total === 7 + 2 + 1 + 1 + 5 && sc[0].clubs === 13, 'امتیاز همه‌ی گشنیزها با یک سور ۱۶ است (' + sc[0].total + ')');
  ok(sc[1].total === 3 + 2 + 1 && sc[1].clubPts === 0, 'ده خشت، دو آس و یک سرباز ۶ است (' + sc[1].total + ')');


  // حریف متوسط و سخت میزی نمی‌گذارند که با یک کارت سور شود
  S = fix(mk('3C 4D', '2H KC', 'QS QH'));
  const mMed = E.aiMove(S, 'medium', () => 0.5);
  ok(mMed && E.name(mMed.card) === 'KC', 'متوسط: به‌جای ۲ (که میز را ۹ می‌کرد) شاه را گذاشت');
  // سخت با نمونه‌گیری تصمیم می‌گیرد؛ یک بذر تنها می‌توانست شانسی رد یا قبول شود
  let kc = 0;
  for (let sd = 1; sd <= 8; sd++) {
    const m = E.aiMove(fix(mk('3C 4D', '2H KC', 'QS QH')), 'hard', rng(sd * 97));
    if (m && E.name(m.card) === 'KC') kc++;
  }
  ok(kc >= 6, 'سخت: در دست‌کم ۶ از ۸ بذر شاه را گذاشت (' + kc + ')');

  // دست‌های کامل: هیچ کارتی گم یا تکراری نمی‌شود و جمع امتیاز ۲۰ به‌علاوه‌ی سورهاست
  let games = 0, bad = 0, illegal = 0, wins = { hard: 0, easy: 0 }, undoOk = true, seenJackOnTable = false;
  for (let g = 0; g < 240; g++) {
    const r = rng(5000 + g);
    const D = E.newDeal(r, g % 2);
    if (D.table.some(E.isJ)) seenJackOnTable = true;
    const all = D.deck.concat(D.table, D.hands[0], D.hands[1]);
    if (all.length !== 52 || new Set(all).size !== 52 || D.table.length !== 4 || D.deck.length !== 40) bad++;
    const lv = ['easy', 'medium', 'hard'][g % 3];
    const lv2 = g < 120 ? 'easy' : 'hard';
    let plays = 0;
    while (!D.done && plays < 60) {
      const before = JSON.stringify([D.table, D.hands, D.caps, D.surs, D.turn]);
      const m = E.aiMove(D, D.turn === 0 ? lv2 : lv, r);
      if (!m || !E.play(D, m.card, m.set)) { illegal++; break; }
      plays++;
      if (g === 7 && plays === 5) {
        E.undo(D);
        undoOk = undoOk && JSON.stringify([D.table, D.hands, D.caps, D.surs, D.turn]) === before;
        E.play(D, m.card, m.set);
      }
    }
    games++;
    const caps = D.caps[0].concat(D.caps[1]);
    const s2 = E.score(D);
    if (!D.done || plays !== 48 || caps.length !== 52 || new Set(caps).size !== 52 ||
        s2[0].total + s2[1].total !== 20 + 5 * (D.surs[0] + D.surs[1])) bad++;
    if (lv === 'easy' && lv2 === 'hard' && s2[0].total > s2[1].total) wins.hard++;
    if (lv === 'hard' && lv2 === 'easy' && s2[1].total > s2[0].total) wins.easy++;
  }
  ok(games === 240 && bad === 0 && illegal === 0, '۲۴۰ دست کامل: ۴۸ حرکت، ۵۲ کارت بی‌کم‌وکاست، امتیاز ۲۰ به‌علاوه‌ی سور (خراب ' + bad + '، غیرمجاز ' + illegal + ')');
  ok(!seenJackOnTable, 'هیچ دستی با سرباز روی میز شروع نشد');
  ok(undoOk, 'برگرداندن حالت را دقیقاً به قبل از حرکت برمی‌گرداند');
  ok(wins.hard >= 25 && wins.easy >= 25, 'سخت از آسان بیشتر می‌برد، از هر دو طرف (' + wins.hard + ' و ' + wins.easy + ' از ۴۰)');

  // undoTo: بازیکن و جواب حریف با هم برمی‌گردند
  const U = E.newDeal(rng(42), 0);
  const start = JSON.stringify([U.table, U.hands]);
  let m0 = E.aiMove(U, 'medium', rng(1)); E.play(U, m0.card, m0.set);
  m0 = E.aiMove(U, 'medium', rng(2)); E.play(U, m0.card, m0.set);
  ok(E.undoTo(U, 0) && JSON.stringify([U.table, U.hands]) === start && U.turn === 0 && !U.log.length, 'برگرداندن حرکت تو جواب حریف را هم برمی‌گرداند');

  const r1 = E.newDeal(rng(777), 0), r2 = E.newDeal(rng(777), 0);
  ok(JSON.stringify(r1) === JSON.stringify(r2), 'یک بذر همیشه یک دست می‌دهد');
}

/* ----------------------------------------------------------- ماهجونگ */
function testMahjong() {
  head('ماهجونگ');
  const E = loadEngine('mahjong', 'MahjongEngineFactory');
  const sizes = { small: 72, medium: 108, turtle: 144 };

  // Tiles are sized to the tiles still on the table and the board zooms (#167)
  ok(typeof E.bounds === 'function', 'the engine reports the bounds of the remaining tiles');
  if (typeof E.bounds === 'function') {
    const T = E.deal('turtle', rng(167));
    const pos = E.LAYOUTS.turtle;
    const full = E.bounds(T);
    ok(full.minX === Math.min(...pos.map((p) => p[0])) && full.maxX === Math.max(...pos.map((p) => p[0])) &&
      full.maxY === Math.max(...pos.map((p) => p[1])) && full.maxZ === Math.max(...pos.map((p) => p[2])), 'a full turtle spans the whole layout');
    // remove every tile right of the middle column: the box must shrink to the left half
    const mid = (full.minX + full.maxX) / 2;
    pos.forEach((p, i) => { if (p[0] > mid) T.gone[i] = true; });
    const half = E.bounds(T);
    ok(half.maxX <= mid && half.minX === full.minX, 'the box shrinks as tiles leave (' + half.maxX + ' ≤ ' + mid + ')');
    const top = pos.map((p, i) => p[2] === full.maxZ ? i : -1).filter((i) => i >= 0);
    const T2 = E.deal('turtle', rng(168));
    top.forEach((i) => { T2.gone[i] = true; });
    ok(E.bounds(T2).maxZ < full.maxZ, 'removing the top layer lowers the box height');
    const page = fs.readFileSync(path.join(ROOT, 'www/games/mahjong/index.html'), 'utf8');
    ok(/var b = E\.bounds\(S\);/.test(page), 'the page sizes tiles from the remaining tiles');
    ok(/Z\.z = Math\.min\(3, Math\.max\(1, Z\.z\)\);/.test(page) && /Z\.x = bw <= W \? \(W - bw\) \/ 2 : Math\.min\(0, Math\.max\(W - bw, Z\.x\)\);/.test(page), 'zoom stays between 1× and 3× and the board never leaves the view');
    ok(/if \(eatClick\) \{ e\.stopPropagation\(\); e\.preventDefault\(\);/.test(page), 'a drag or pinch does not also select the tile under the finger');
    ok(/fitBtn\.addEventListener\('click', fitBoard\)/.test(page), 'a Fit board button returns to the whole board');
    ok(/var mainH = ctx\.main\.clientHeight/.test(page), 'the board height comes from the main area, not from its own centred position');
  }
  for (const k of Object.keys(sizes)) {
    const L = E.LAYOUTS[k] || [];
    ok(L.length === sizes[k] && new Set(L.map((p) => p.join(','))).size === L.length, k + ': ' + sizes[k] + ' جای یکتا');
  }
  // قانون آزادی، دستی از روی تعریف
  const all = (n) => new Array(n).fill(true);
  const row = [[0, 0, 0], [2, 0, 0], [4, 0, 0]];
  ok(E.freeIn(row, all(3), 0) && !E.freeIn(row, all(3), 1) && E.freeIn(row, all(3), 2), 'ردیف سه‌تایی: دو سر آزاد، وسط بسته');
  ok(E.freeIn(row, [true, true, false], 1), 'وسط وقتی یک طرفش باز شود آزاد است');
  const stack = [[0, 0, 0], [0, 0, 1]];
  ok(!E.freeIn(stack, all(2), 0) && E.freeIn(stack, all(2), 1), 'کاشی زیرِ کاشی دیگر آزاد نیست');
  const half = [[0, 0, 0], [2, 0, 0], [1, 0, 1]];
  ok(!E.freeIn(half, all(3), 0) && !E.freeIn(half, all(3), 1) && E.freeIn(half, all(3), 2), 'کاشیِ نیم‌جابه‌جا روی دو کاشی هر دو را می‌پوشاند');
  const shifted = [[0, 0, 0], [2, 1, 0], [4, 0, 0]];
  ok(!E.freeIn(shifted, all(3), 1), 'همسایه‌ی نیم‌ردیف بالاتر هم کنار حساب می‌شود');

  ok(E.matches(5, 5) && E.matches(34, 37) && E.matches(38, 41) && !E.matches(34, 38) && !E.matches(0, 1) && !E.matches(33, 34),
    'جفت‌ها: هم‌نقش، گل با گل، فصل با فصل؛ نه گل با فصل');

  // هر دست با ترتیب پخشش تا آخر حل می‌شود
  let deals = 0, solved = 0, faceOk = 0;
  for (const k of Object.keys(sizes)) {
    for (let sd = 0; sd < 25; sd++) {
      const S = E.deal(k, rng(700 + sd));
      deals++;
      const counts = {};
      S.faces.forEach((f) => { const key = f >= 38 ? 's' : (f >= 34 ? 'f' : f); counts[key] = (counts[key] || 0) + 1; });
      if (S.faces.length === sizes[k] && S.faces.every((f) => f >= 0 && f <= 41) && Object.values(counts).every((c) => c % 2 === 0)) faceOk++;
      let good = true;
      for (const [a, b] of S.solution) if (!E.remove(S, a, b)) { good = false; break; }
      if (good && S.done && E.left(S) === 0) solved++;
    }
  }
  ok(deals === 75 && solved === 75, '۷۵ دست (سه چیدمان): همه با ترتیب پخش تا آخر حل شدند (' + solved + ')');
  ok(faceOk === 75, 'نقش‌ها جفت‌جفت‌اند و تعداد کاشی درست است (' + faceOk + ')');

  // حرکت غلط رد می‌شود و برگرداندن دقیق است
  const S = E.deal('small', rng(5));
  const [a0, b0] = S.solution[0];
  const blocked = S.faces.findIndex((f, i) => !E.isFree(S, i));
  ok(blocked >= 0 && !E.remove(S, blocked, a0), 'کاشی بسته برداشته نمی‌شود');
  const other = E.freeTiles(S).find((i) => i !== a0 && !E.matches(S.faces[i], S.faces[a0]));
  ok(other === undefined || !E.remove(S, a0, other), 'دو کاشیِ ناجور برداشته نمی‌شوند');
  const before = JSON.stringify(S.gone);
  ok(E.remove(S, a0, b0) && E.left(S) === 70, 'جفت آزاد و جور برداشته شد');
  ok(E.undo(S) && JSON.stringify(S.gone) === before && S.undos === 1, 'برگرداندن جفت را سر جایش می‌گذارد');

  // بُر زدن وسط بازی: همان نقش‌ها، باز حل‌شدنی، و برگشت‌پذیر
  let shuffledOk = 0;
  for (let sd = 0; sd < 20; sd++) {
    const T = E.deal(sd % 2 ? 'medium' : 'turtle', rng(900 + sd));
    for (let s = 0; s < 10; s++) E.remove(T, T.solution[s][0], T.solution[s][1]);
    const bag = (X) => X.faces.filter((f, i) => !X.gone[i]).map((f) => (f >= 38 ? 's' : (f >= 34 ? 'f' : f))).sort().join();
    const facesBefore = JSON.stringify(T.faces), bagBefore = bag(T);
    const order = E.reshuffle(T, rng(1300 + sd));
    const sameBag = order && bag(T) === bagBefore;
    const undone = JSON.parse(JSON.stringify(T));
    E.undo(undone);
    let good = sameBag && JSON.stringify(undone.faces) === facesBefore && T.shuffles === 1;
    for (const [a, b] of (order || [])) if (!E.remove(T, a, b)) { good = false; break; }
    if (good && T.done) shuffledOk++;
  }
  ok(shuffledOk === 20, 'بُر زدن نقش‌های مانده را نگه می‌دارد، حل‌شدنی می‌ماند و برمی‌گردد (' + shuffledOk + ' از ۲۰)');

  ok(JSON.stringify(E.deal('medium', rng(11))) === JSON.stringify(E.deal('medium', rng(11))), 'یک بذر همیشه یک دست می‌دهد');
}

/* ------------------------------------------------------------- شطرنج */
// #545: two players facing each other across the phone saw Black's pieces upside down
// for the player who had them; a face-to-face view turns them and keeps the board still
function testChessFaceToFace() {
  head('Chess and Chinese chess: a face-to-face view for two players (#545)');
  const cs = fs.readFileSync(path.join(ROOT, 'www/games/chess/index.html'), 'utf8');
  const shapes = (/^  var SHAPES = \{[\s\S]*?^  \};$/m.exec(cs) || [''])[0];
  const fn = (/^  function pieceSvg\(p, up\) \{[\s\S]*?^  \}$/m.exec(cs) || [''])[0];
  ok(!!shapes && !!fn, 'pieceSvg takes the face-to-face turn');
  if (shapes && fn) {
    const sb = {};
    vm.runInNewContext(shapes + fn + ';this.f = pieceSvg;', sb);
    ok(/<g transform="rotate\(180 22\.5 22\.5\)"/.test(sb.f('k', true)) && !/rotate/.test(sb.f('k', false)) && !/rotate/.test(sb.f('K')), 'a turned piece is turned inside its drawing, an upright one is not');
  }
  ok(/function faceUp\(p\) \{ return !isAi\(\) && !isPz\(\) && !!prefs\.face && !!p && p !== p\.toUpperCase\(\); \}/.test(cs), 'only Black turns, only with two players');
  ok(/return prefs\.flip && !prefs\.face && S && S\.turn === 'b'/.test(cs), 'face to face never turns the board');
  ok(/var html = p \? pieceSvg\(p, faceUp\(p\)\) : '';/.test(cs) && /html: pieceSvg\(gone\.p, faceUp\(gone\.p\)\)/.test(cs), 'the board and a taken piece both use the turn');
  ok(/if \(prefs\.face\) prefs\.flip = false;/.test(cs) && /if \(prefs\.flip\) prefs\.face = false;/.test(cs), 'turning the board and face to face exclude each other');
  ok(/@container game \(max-aspect-ratio: 5 \/ 4\) \{ \.cs-player--face \{ transform: rotate\(180deg\); \} \}/.test(cs), 'the row above the board turns too, only while it is above the board');
  const xq = fs.readFileSync(path.join(ROOT, 'www/games/xiangqi/index.html'), 'utf8');
  ok(/\.xq-face \.xq-piece--b \.xq-glyph \{ display: inline-block; transform: rotate\(180deg\); \}/.test(xq) && /board\.classList\.toggle\('xq-face', S\.mode === 'two' && prefs\.face\);/.test(xq), 'Chinese chess turns Black\'s characters face to face, with two players only');
  ok((xq.match(/face: prefs\.face \}/g) || []).length >= 3 && /face: !!prefs\.face \}/.test(xq), 'Chinese chess remembers the choice wherever it saves its settings');
  const keys = ['faceToFace'].every((k) => (cs.match(new RegExp('\\b' + k + ': \'', 'g')) || []).length === LOCALE_CODES.length && (xq.match(new RegExp('\\b' + k + ': \'', 'g')) || []).length === LOCALE_CODES.length);
  ok(keys, 'the option is named in every language in both games');
}

function testChess() {
  head('شطرنج');
  const E = loadEngine('chess', 'ChessEngineFactory');
  // شمارش perft مرجع استاندارد؛ تقریباً هر خطای تولید حرکت این عددها را خراب می‌کند
  const PERFT = [
    // عمق‌ها کم‌اند تا کل تست چند ثانیه بماند؛ قلعه، آن‌پاسان و ارتقا همین‌جا هم پوشش دارند.
    // عمق‌های بیشتر (۱۹۷۲۸۱، ۹۷۸۶۲، ۴۳۲۳۸، ۹۴۶۷، ۶۲۳۷۹) یک بار دستی گرفته و درست بودند.
    [E.START, [20, 400, 8902]],
    ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039]],
    ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812]],
    ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264]],
    ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486]]
  ];
  for (const [f, want] of PERFT) {
    const S = E.parse(f);
    const got = want.map((_, d) => E.perft(S, d + 1));
    ok(got.join() === want.join(), 'perft ' + f.split(' ')[0].slice(0, 16) + '… ' + got.join(',') + ' (مرجع ' + want.join(',') + ')');
  }
  ok(E.fen(E.parse(PERFT[1][0])) === PERFT[1][0], 'FEN رفت‌وبرگشت درست است');

  // بازی کردن با SAN، برای مثال‌های دستی
  const playSan = (start, sans) => {
    let S = E.parse(start || E.START);
    const fens = [E.fen(S)];
    for (const s of sans) {
      const m = E.legal(S).find((x) => E.san(S, x) === s);
      if (!m) return { error: s, S, fens };
      S = E.make(S, m); fens.push(E.fen(S));
    }
    return { S, fens };
  };
  const fool = playSan(null, ['f3', 'e5', 'g4', 'Qh4#']);
  ok(!fool.error && E.status(fool.fens).reason === 'mate' && E.status(fool.fens).winner === 'b', 'مات احمقانه: سیاه با Qh4# می‌برد');
  const stale = E.status(['7k/5Q2/6K1/8/8/8/8/8 b - - 0 1']);
  ok(stale.over && stale.reason === 'stalemate' && stale.winner === null, 'پات مساوی است');
  ok(E.status(['8/8/4k3/8/8/3NK3/8/8 w - - 0 1']).reason === 'material', 'شاه و اسب در برابر شاه: مساوی');
  ok(!E.status(['8/8/4k3/8/8/3RK3/8/8 w - - 0 1']).over, 'شاه و رخ در برابر شاه مساوی نیست');
  ok(E.status(['8/8/4k3/8/8/3NK3/8/8 w - - 100 80']).reason === 'fifty', 'پنجاه حرکت (۱۰۰ نیم‌حرکت) مساوی است');
  const rep = playSan(null, ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']);
  ok(!rep.error && E.status(rep.fens).reason === 'repetition', 'تکرار سه‌باره‌ی وضعیت آغاز مساوی است');
  ok(!E.status(rep.fens.slice(0, 5)).over, 'دو بار تکرار هنوز مساوی نیست');

  // قلعه، آن‌پاسان، ارتقا و نوشتار SAN
  const castle = playSan('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', ['O-O', 'O-O-O']);
  ok(!castle.error && castle.S.board[E.sqIdx('g1')] === 'K' && castle.S.board[E.sqIdx('f1')] === 'R' && castle.S.board[E.sqIdx('c8')] === 'k' && castle.S.board[E.sqIdx('d8')] === 'r', 'قلعه‌ی کوچک و بزرگ شاه و رخ را درست می‌گذارد');
  const noCastle = E.legal(E.parse('r3k2r/8/8/8/8/8/4r3/R3K2R w KQkq - 0 1')).filter((m) => m.castle);
  ok(noCastle.length === 0, 'شاه در کیش قلعه نمی‌رود');
  const throughCheck = E.legal(E.parse('r3k2r/8/8/8/8/8/8/R3K1rR w KQkq - 0 1')).filter((m) => m.castle === 'K');
  ok(throughCheck.length === 0, 'قلعه از خانه‌ی زیر حمله ممنوع است');
  const rookMoved = playSan('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', ['Rh2', 'Ra7', 'Rh1', 'Ra8']);
  ok(!rookMoved.error && rookMoved.S.castle === 'Qk', 'رخِ رفته و برگشته حق قلعه‌ی همان سمت را پس نمی‌گیرد (' + rookMoved.S.castle + ')');
  const ep = playSan('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', ['exd6']);
  ok(!ep.error && !ep.S.board[E.sqIdx('d5')] && ep.S.board[E.sqIdx('d6')] === 'P', 'آن‌پاسان پیاده‌ی d5 را برمی‌دارد');
  const promo = playSan('4k3/1P6/8/8/8/8/8/4K3 w - - 0 1', ['b8=Q+']);
  ok(!promo.error && promo.S.board[E.sqIdx('b8')] === 'Q', 'ارتقا با b8=Q+ نوشته و انجام می‌شود');
  ok(E.legal(E.parse('4k3/1P6/8/8/8/8/8/4K3 w - - 0 1')).filter((m) => m.from === E.sqIdx('b7')).length === 4, 'ارتقا چهار انتخاب دارد');
  const twoKnights = E.parse('4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1');
  const sans = E.legal(twoKnights).map((m) => E.san(twoKnights, m));
  ok(sans.indexOf('Nbd2') >= 0 && sans.indexOf('Nfd2') >= 0, 'دو اسب به یک خانه: ستون مبدأ در نوشتار می‌آید');

  // شطرنج روزانه نداشت (#131)؛ از #144 روزانه‌اش سه معماست. فیلتر منو برای بازی‌های
  // بی‌روزانه‌ی آینده می‌ماند.
  const gj = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  const chess = gj.find((g) => g.id === 'chess');
  ok(chess && chess.daily !== false, 'شطرنج در games.json روزانه دارد (معما)');
  ok(chess && (chess.files || []).indexOf('games/chess/puzzles.js') >= 0, 'puzzles.js در files شطرنج است تا کارگر سرویس نگهش دارد');
  const menuSrc = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
  ok(/function dailyGames\(\) \{ return GAMES\.filter\(function \(g\) \{ return g\.daily !== false; \}\); \}/.test(menuSrc), 'منو بازی‌های بی‌روزانه را جدا می‌کند');
  const dailyUses = (menuSrc.match(/dailyGames\(\)/g) || []).length;
  ok(dailyUses >= 4, 'کارت امروز، تقویم و فهرست روز از dailyGames می‌خوانند (' + dailyUses + ')');
}

/* ------------------------------------------------------- ربات شطرنج */
// ربات تخته‌ی جدای 0x88 دارد (#143)؛ اگر تولید حرکتش با موتور قانون‌ها فرق کند، صفحه
// حرکتش را رد می‌کند و بازی بی‌صدا حرکت اول فهرست را می‌زند. پس همان perft ها اینجا هم.
function testChessBot() {
  head('ربات شطرنج');
  const E = loadEngine('chess', 'ChessEngineFactory');
  const B = loadEngine('chess', 'ChessBotFactory');
  // loadEngine بی ChessBotFactory به module.exports (موتور قانون‌ها) برمی‌گردد
  ok(typeof B.think === 'function' && typeof B.perft === 'function', 'ChessBotFactory در موتور شطرنج هست');
  if (typeof B.think !== 'function') return;
  const PERFT = [
    [E.START, [20, 400, 8902, 197281]],
    ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
    ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
    ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
    ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]]
  ];
  for (const [f, want] of PERFT) {
    const got = want.map((_, d) => B.perft(f, d + 1));
    ok(got.join() === want.join(), 'perft ربات ' + f.split(' ')[0].slice(0, 16) + '… ' + got.join(',') + ' (مرجع ' + want.join(',') + ')');
  }

  const fixed = () => 0.5;   // بدون لرزش، تا نتیجه قطعی باشد
  const sanOf = (f, r) => {
    const S = E.parse(f);
    const m = r && E.legal(S).find((x) => x.from === r.from && x.to === r.to && (x.promo || '') === (r.promo || ''));
    return m ? { san: E.san(S, m), next: E.make(S, m) } : null;
  };
  const m1 = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';
  for (const lv of ['medium', 'hard']) {
    const got = sanOf(m1, B.think(m1, [], { level: lv, rand: fixed }));
    ok(got && got.san === 'Ra8#', 'مات در یک (' + lv + '): ' + (got && got.san));
  }
  const m1b = 'r5k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1';
  const gb = sanOf(m1b, B.think(m1b, [], { level: 'medium', rand: fixed }));
  ok(gb && gb.san === 'Ra1#', 'سیاه هم مات در یک را می‌زند: ' + (gb && gb.san));
  const m2 = 'r2qkb1r/pp2nppp/3p4/2pNN1B1/2BnP3/3P4/PPP2PPP/R2bK2R w KQkq - 1 1';
  for (const lv of ['medium', 'hard']) {
    const r = B.think(m2, [], { level: lv, rand: fixed });
    const got = sanOf(m2, r);
    ok(got && got.san === 'Nf6+' && r.score > 29000, 'مات در دو (' + lv + '): ' + (got && got.san) + ' امتیاز ' + r.score);
  }
  // وزیرِ زیر حمله‌ی پیاده: هیچ سطحی نباید آن را جا بگذارد
  const hang = 'rnb1kbnr/pppp1ppp/8/4p3/3Q4/8/PPPPPPPP/RNB1KBNR w KQkq - 0 3';
  for (const lv of ['easy', 'medium', 'hard']) {
    for (const j of [0, 1]) {
      const got = sanOf(hang, B.think(hang, [], { level: lv, rand: () => j }));
      const q = got && got.next.board.indexOf('Q');
      const lost = !got || q < 0 || E.legal(got.next).some((m) => m.to === q);
      ok(!lost, 'سطح ' + lv + ' وزیر را جا نمی‌گذارد: ' + (got && got.san));
    }
  }

  // روی چیدمان‌های تصادفی همیشه حرکتی برمی‌گرداند که موتور قانون‌ها قبول دارد
  const R = rng(143);
  let positions = 0, bad = 0;
  for (let game = 0; game < 12; game++) {
    let S = E.parse(E.START);
    for (let ply = 0; ply < 90; ply++) {
      const ms = E.legal(S);
      if (!ms.length) break;
      if (ply % 9 === 4) {
        const f = E.fen(S), r = B.think(f, [], { level: 'medium', maxDepth: 2, timeMs: 200 });
        positions++;
        if (!sanOf(f, r)) bad++;
      }
      S = E.make(S, ms[Math.floor(R() * ms.length)]);
    }
  }
  ok(positions >= 80 && bad === 0, 'حرکت ربات روی ' + positions + ' چیدمان تصادفی قانونی است (' + bad + ' نادرست)');
  ok(B.think('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', []) === null, 'در پات ربات حرکتی نمی‌دهد');

  // سقف زمان هر سطح، با ساعت ساختگی تا کندی ماشین CI نتیجه را عوض نکند
  for (const lv of ['easy', 'medium', 'hard']) {
    let t = 0;
    const r = B.think(E.START, [], { level: lv, now: () => (t += 3) });
    ok(r && r.ms <= B.LEVELS[lv].timeMs + 50, 'سطح ' + lv + ' زیر سقف ' + B.LEVELS[lv].timeMs + ' میلی‌ثانیه می‌ماند (' + (r && r.ms) + ')');
  }
  // ربات تکرار را می‌شناسد: با برتری بزرگ چیدمانی را که دو بار دیده، سومی نمی‌کند
  const won = '6k1/8/6K1/8/8/8/8/Q7 w - - 0 1';
  const hist = [won.replace(' w ', ' b '), won, won.replace(' w ', ' b ')].map((x) => x);
  const r3 = B.think(won, hist, { level: 'hard', rand: fixed, maxDepth: 4 });
  ok(r3 && r3.score > 500, 'با تاریخچه هم برتری را می‌بیند (' + (r3 && r3.score) + ')');

  // کارگر فقط متن ChessBotFactory را می‌گیرد؛ پس باید بی هیچ متغیر بیرونی کار کند
  const file = fs.readFileSync(path.join(ROOT, 'www/games/chess/index.html'), 'utf8');
  const src = file.match(/function ChessBotFactory\(\) \{[\s\S]*?\n\}\n/);
  ok(!!src, 'متن ChessBotFactory پیدا شد');
  if (src) {
    const box = { Math, Date, Int8Array, Int16Array, Int32Array };
    vm.createContext(box);
    let alone = null;
    try { alone = vm.runInContext(src[0] + '\nChessBotFactory().think("' + m1 + '", [], { level: "medium" });', box); } catch (e) { alone = String(e); }
    ok(alone && alone.from === 56 && alone.to === 0, 'ربات تنها، بیرون از صفحه، کار می‌کند (' + JSON.stringify(alone) + ')');
  }
  ok(/ChessBotFactory\.toString\(\)/.test(file) && /new Worker\(URL\.createObjectURL/.test(file), 'فکر کردن در Web Worker است');
  ok(/var ms = E\.legal\(S\), m = r && ms\.filter/.test(file), 'حرکت ربات از فیلتر legal موتور قانون‌ها رد می‌شود');
  ok(/if \(isAi\(\) && \(thinking \|\| S\.turn !== G\.human\)\) return;/.test(file), 'وقتی نوبت ربات است لمس تخته کاری نمی‌کند');

  // #287: a Random side in the new-game window. The choice stays 'r' in prefs and each
  // new game flips its own coin; the game itself only ever holds 'w' or 'b'.
  ok(/\{ value: 'r', label: C\.t\('randomSide'\) \}/.test(file), 'the colour picker offers Random');
  ok(/human: sideFor\(prefs\.human, Math\.random\)/.test(file), 'a new game resolves the side from prefs');
  const sf = file.match(/function sideFor\(h, rnd\) \{[^\n]*\}/);
  ok(!!sf, 'sideFor found in the chess page');
  if (sf) {
    const sideFor = vm.runInNewContext('(' + sf[0] + ')');
    ok(sideFor('w', () => 0.9) === 'w' && sideFor('b', () => 0.1) === 'b', 'a fixed colour is kept as chosen');
    ok(sideFor('r', () => 0.1) === 'w' && sideFor('r', () => 0.9) === 'b', 'Random gives white or black by the coin');
    const seen = new Set();
    for (let i = 0; i < 64; i++) seen.add(sideFor('r', Math.random));
    ok(seen.size === 2 && seen.has('w') && seen.has('b'), 'Random over 64 games gives both colours (' + [...seen].join(',') + ')');
  }
}

/* ------------------------------------------------------ معمای شطرنج */
// معماها از پایگاه Lichess می‌آیند (#144). هر کدام با موتور قانون‌های خودمان دوباره بازی
// می‌شود: اگر یک حرکت جواب در legal() نباشد، صفحه آن معما را بی‌پایان رها می‌کند.
function testChessPuzzles() {
  head('معمای شطرنج');
  const E = loadEngine('chess', 'ChessEngineFactory');
  const file = path.join(ROOT, 'www/games/chess/puzzles.js');
  ok(fs.existsSync(file), 'www/games/chess/puzzles.js هست');
  if (!fs.existsSync(file)) return;
  const src = fs.readFileSync(file, 'utf8');
  const box = {};
  vm.createContext(box);
  vm.runInContext(src, box);
  const P = box.CHESS_PUZZLES;
  ok(P && ['easy', 'medium', 'hard'].every((t) => Array.isArray(P[t]) && P[t].length === 200), 'سه سطح، هر کدام ۲۰۰ معما');
  if (!P) return;
  ok(/CC0/.test(src) && /database\.lichess\.org/.test(src) && /tools\/chess-puzzles\.js/.test(src), 'منبع، مجوز CC0 و سازنده در سر فایل آمده');
  const RANGE = { easy: [800, 1300], medium: [1300, 1700], hard: [1700, 2300] };
  const uci = (m) => E.sqName(m.from) + E.sqName(m.to) + (m.promo ? m.promo.toLowerCase() : '');
  const ids = new Set();
  let total = 0, bad = [], mates = 0;
  for (const t of Object.keys(RANGE)) {
    let prev = 0, sorted = true, inRange = true;
    for (const p of P[t]) {
      total++;
      const [id, fen, moves, rating, tag] = p;
      ids.add(id);
      if (rating < prev) sorted = false;
      prev = rating;
      if (rating < RANGE[t][0] || rating >= RANGE[t][1]) inRange = false;
      const list = moves.split(' ');
      // حرکت اول مال حریف است و آخرین حرکت مال بازیکن، پس تعداد زوج است
      if (list.length < 2 || list.length % 2) { bad.push(id + ' طول'); continue; }
      let S = E.parse(fen), fine = true;
      const solver = S.turn === 'w' ? 'b' : 'w';
      for (let k = 0; k < list.length; k++) {
        const m = E.legal(S).find((x) => uci(x) === list[k]);
        if (!m) { fine = false; break; }
        S = E.make(S, m);
      }
      if (!fine) { bad.push(id + ' حرکت'); continue; }
      const st = E.status([E.fen(S)]);
      if (tag) {
        if (!/^m[1-5]$/.test(tag) || +tag[1] !== list.length / 2 || st.reason !== 'mate' || st.winner !== solver) bad.push(id + ' مات');
        else mates++;
      }
    }
    ok(sorted, t + ': به ترتیب رتبه');
    ok(inRange, t + ': همه در بازه‌ی ' + RANGE[t].join('–'));
  }
  ok(total === 600 && ids.size === 600, 'شناسه‌ها یکتا (' + ids.size + ' از ' + total + ')');
  ok(bad.length === 0, 'همه‌ی جواب‌ها با موتور قانون‌ها بازی می‌شوند' + (bad.length ? ': ' + bad.slice(0, 5).join('، ') : ''));
  ok(mates > 50, 'معماهای «مات در n» واقعاً به مات می‌رسند (' + mates + ')');

  const page = fs.readFileSync(path.join(ROOT, 'www/games/chess/index.html'), 'utf8');
  ok(/<script src="puzzles\.js"><\/script>/.test(page), 'صفحه puzzles.js را بار می‌کند');
  ok(/var rng = C\.daily\('chess', daily\)\.rng;\s*PZ_TIERS\.forEach/.test(page), 'روزانه از C.daily همان روز، یکی از هر سطح');
  ok(/C\.stats\.daily\('chess', pz\.daily/.test(page), 'پایان دور روزانه در آمار روزانه ثبت می‌شود');
  ok(/if \(uciOf\(m\) === pz\.sol\[pz\.step\] \|\| mates\)/.test(page), 'هر حرکتِ مات‌کننده هم درست است، مثل Lichess');
  const tool = path.join(ROOT, 'tools/chess-puzzles.js');
  ok(fs.existsSync(tool) && /lichess_db_puzzle\.csv\.zst/.test(fs.readFileSync(tool, 'utf8')), 'سازنده‌ی فهرست در tools/ هست');
}

/* --------------------------------------------- APK اثبات مالکیت کلید */
// Play نام بسته‌ی ما را بدون APK امضاشده با کلید خودمان ثبت نمی‌کند (#152). این ورک‌فلو
// کلید را باز می‌کند و ورودی آزاد می‌گیرد، پس شکلش باید همین بماند.
function testAdiProof() {
  head('APK اثبات مالکیت');
  const f = path.join(ROOT, '.github/workflows/adi-proof.yml');
  ok(fs.existsSync(f), 'ورک‌فلوی adi-proof.yml هست');
  if (!fs.existsSync(f)) return;
  const y = fs.readFileSync(f, 'utf8');
  const on = (y.match(/\non:\n([\s\S]*?)\n[a-z]/) || [])[1] || '';
  ok(/^\s+workflow_dispatch:/m.test(on) && !/\b(push|pull_request|schedule|release):/.test(on), 'فقط دستی اجرا می‌شود');
  const snipLines = y.split('\n').filter((l) => /inputs\.snippet/.test(l));
  ok(snipLines.length === 2 &&
    (y.match(/SNIPPET: \$\{\{ inputs\.snippet \}\}/g) || []).length === 2 &&
    snipLines.every((l) => /^\s+SNIPPET: \$\{\{ inputs\.snippet \}\}$/.test(l)), 'snippet فقط از env خوانده می‌شود');
  ok(/android\/app\/src\/main\/assets\/adi-registration\.properties/.test(y) && /unzip -p "\$APK" assets\/adi-registration\.properties/.test(y), 'نام فایل دقیقاً assets/adi-registration.properties و داخل APK خوانده می‌شود');
  ok(/c3f70a1af8a45558678d1d9b413415d1b0a4c3208835ce78c1f37c4a3a008839/.test(y), 'امضاکننده با کلید همیشگی چوگان مقایسه می‌شود');
  ok(/if: always\(\)\n\s+run: rm -f "\$RUNNER_TEMP\/release\.jks"/.test(y), 'کلید همیشه پاک می‌شود');
  ok(/permissions:\n\s+contents: read/.test(y) && !/gh release|softprops|contents: write/.test(y), 'چیزی منتشر نمی‌شود (فقط contents: read)');
  ok(/retention-days: 1/.test(y), 'artifact فقط یک روز می‌ماند');
}

/* ------------------------------------------------------------- Hokm */
// Persian four-player Hokm (#151). The rules a player feels at once: following
// suit, which card takes a trick, kot scoring and who becomes hakem.
function testHokm() {
  head('Hokm');
  const hokmFile = path.join(ROOT, 'www/games/hokm/index.html');
  ok(fs.existsSync(hokmFile), 'www/games/hokm/index.html exists');
  if (!fs.existsSync(hokmFile)) return;
  const E = loadEngine('hokm', 'HokmEngineFactory');
  const R = rng(151);
  const card = (r, s) => r << 2 | s;              // r: 0 ace … 12 king
  const S = E.newMatch(R, 7);
  ok(S.phase === 'trump' && S.hands[S.hakem].length === 5 && S.hands.filter((h) => h.length === 0).length === 3, 'the hakem sees five cards, the others none, before trump');
  ok(E.chooseTrump(S, 2) && S.hands.every((h) => h.length === 13) && S.phase === 'play' && S.turn === S.hakem, 'after trump everyone holds thirteen and the hakem leads');
  ok(new Set([].concat(...S.hands)).size === 52, 'the deal uses all fifty-two cards once');
  ok(!E.chooseTrump(S, 1), 'trump cannot be chosen twice');
  // #186: the trump picker sat in a modal whose blurred backdrop hid the five cards it
  // asks about, and a tap on the backdrop closed it with no way to reopen it
  const hkSrc = fs.readFileSync(hokmFile, 'utf8');
  const askAt = hkSrc.indexOf('function askTrump');
  ok(askAt > 0, 'hokm has askTrump');
  const askBody = hkSrc.slice(askAt, hkSrc.indexOf('function pickTrump', askAt));
  ok(askBody.length > 0 && !/C\.ui\.(modal|confirm)\(/.test(askBody), 'the trump picker is not a modal over the cards');
  ok(/function paint\(\)[\s\S]*?paintPick\(\)/.test(hkSrc) && /S\.phase === 'trump' && S\.hakem === 0/.test(hkSrc.slice(hkSrc.indexOf('function paintPick'))), 'the picker is painted with the table whenever you are hakem and trump is open');

  // trick winner: trump beats everything, otherwise the highest of the suit led
  const T = { trick: [], trump: 0 };
  ok(E.trickBest([{ p: 0, c: card(5, 1) }, { p: 1, c: card(12, 1) }, { p: 2, c: card(1, 0) }, { p: 3, c: card(0, 1) }], 0).p === 2, 'a low trump beats the ace of the suit led');
  ok(E.trickBest([{ p: 0, c: card(5, 1) }, { p: 1, c: card(12, 2) }, { p: 2, c: card(0, 1) }, { p: 3, c: card(9, 1) }], 0).p === 2, 'without trumps, the ace of the suit led wins; another suit never does');
  ok(E.trickBest([{ p: 0, c: card(5, 1) }, { p: 1, c: card(3, 0) }, { p: 2, c: card(9, 0) }, { p: 3, c: card(0, 1) }], 0).p === 2, 'the higher of two trumps wins');

  // follow suit
  const F = E.newMatch(rng(2), 7); E.chooseTrump(F, 3);
  F.turn = 0; F.trick = [{ p: 3, c: card(5, 1) }];
  F.hands[0] = [card(2, 1), card(7, 1), card(0, 0), card(4, 3)];
  ok(JSON.stringify(E.legal(F, 0).sort()) === JSON.stringify([card(2, 1), card(7, 1)].sort()), 'with the suit led in hand, only those cards are legal');
  F.hands[0] = [card(0, 0), card(4, 3)];
  ok(E.legal(F, 0).length === 2, 'without the suit led, any card is legal');
  ok(E.play(F, 0, card(9, 2)) === null, 'a card not in hand is refused');

  // scoring: seven tricks end the hand; kot and hakem kot
  const K = E.newMatch(rng(3), 7); E.chooseTrump(K, 0);
  K.hakem = 1; K.tricks = [6, 0]; K.turn = 0;
  K.hands = [[card(0, 0)], [card(2, 0)], [card(3, 0)], [card(4, 0)]];
  E.play(K, 0, card(0, 0)); E.play(K, 1, card(2, 0)); E.play(K, 2, card(3, 0)); const kr = E.play(K, 3, card(4, 0));
  ok(kr && kr.hand && kr.hand.team === 0 && kr.hand.points === 3 && kr.hand.hakemKot, 'shutting out the hakem\'s team scores three (hakem kot)');
  ok(K.hakem === 2, 'the hakem passes to the next player when his team loses');
  const K2 = E.newMatch(rng(4), 7); E.chooseTrump(K2, 0);
  K2.hakem = 0; K2.tricks = [6, 0]; K2.turn = 0;
  K2.hands = [[card(0, 0)], [card(2, 0)], [card(3, 0)], [card(4, 0)]];
  E.play(K2, 0, card(0, 0)); E.play(K2, 1, card(2, 0)); E.play(K2, 2, card(3, 0)); const k2 = E.play(K2, 3, card(4, 0));
  ok(k2.hand.points === 2 && k2.hand.kot && !k2.hand.hakemKot && K2.hakem === 0, 'the hakem\'s own team winning 7–0 is a kot of two, and the hakem stays');
  const K3 = E.newMatch(rng(5), 3); E.chooseTrump(K3, 0);
  K3.hakem = 0; K3.tricks = [6, 4]; K3.score = [2, 0]; K3.turn = 0;
  K3.hands = [[card(0, 0)], [card(2, 0)], [card(3, 0)], [card(4, 0)]];
  E.play(K3, 0, card(0, 0)); E.play(K3, 1, card(2, 0)); E.play(K3, 2, card(3, 0)); const k3 = E.play(K3, 3, card(4, 0));
  ok(k3.hand.points === 1 && K3.done && K3.phase === 'done' && K3.score[0] === 3, 'an ordinary hand is one point, and reaching the target ends the match');

  // the AI only ever plays legal cards, and a stronger level wins more
  let illegal = 0, plays = 0, hardWins = 0, matches = 0;
  for (let m = 0; m < 60; m++) {
    const r = rng(1000 + m), M = E.newMatch(r, 3);
    let guard = 0;
    while (!M.done && guard++ < 3000) {
      if (M.phase === 'trump') { E.chooseTrump(M, E.aiTrump(M.hands[M.hakem], 'medium', r)); continue; }
      if (M.phase === 'handover') { E.newHand(M, r); continue; }
      const p = M.turn, c = E.aiPlay(M, p, E.team(p) === 0 ? 'hard' : 'easy', r);
      plays++;
      if (E.legal(M, p).indexOf(c) < 0) illegal++;
      E.play(M, p, c);
    }
    matches++;
    if (M.score[0] > M.score[1]) hardWins++;
  }
  ok(plays > 1000 && illegal === 0, 'the AI plays only legal cards (' + plays + ' plays, ' + illegal + ' illegal)');
  ok(matches === 60 && hardWins >= 40, 'the hard AI team beats the easy one in most matches (' + hardWins + ' of ' + matches + ')');
  const d1 = E.newMatch(rng(77), 3), d2 = E.newMatch(rng(77), 3);
  ok(JSON.stringify(d1.hands) === JSON.stringify(d2.hands) && d1.hakem === d2.hakem, 'the same seed deals the same match (daily)');

  const page = fs.readFileSync(path.join(ROOT, 'www/games/hokm/index.html'), 'utf8');
  ok(/C\.cards\.el\(/.test(page) && /C\.cards\.back\(\)/.test(page) && page.indexOf('function faceSvg') < 0, 'Hokm draws its cards with the shared core');
  ok(/else newMatch\('hard', 3, dailyDate\);/.test(page), 'the daily is a short match against the hard AI');
  // one tap on Next hand must deal exactly one hand
  ok(/function nextHand\(\) \{\s*if \(!S \|\| S\.phase !== 'handover'\) return;/.test(page) && !/onClick: nextHand/.test(page), 'Next hand deals once: only the dialog\'s close deals, and only from the hand-over state');
}

/* ------------------------------------------------ Nonogram picture puzzles */
// Hand-drawn pictures (#172). A picture the line solver can't finish has either
// several solutions or needs guessing, and the player could solve it "wrong" and
// never see the picture; such a picture is redrawn, never shipped.
function testNonogramPictures() {
  head('Nonogram picture puzzles');
  const E = loadEngine('nonogram', 'NonogramEngineFactory');
  const file = path.join(ROOT, 'www/games/nonogram/pictures.js');
  ok(fs.existsSync(file), 'www/games/nonogram/pictures.js exists');
  if (!fs.existsSync(file)) return;
  const box = {};
  vm.createContext(box);
  vm.runInContext(fs.readFileSync(file, 'utf8'), box);
  const P = box.NONOGRAM_PICTURES || [];
  ok(P.length >= 30, 'at least 30 pictures (' + P.length + ')');
  const ids = new Set(P.map((p) => p.id));
  ok(ids.size === P.length, 'picture ids are unique');
  const bad = [];
  for (const p of P) {
    const n = p.rows.length;
    if ([10, 15].indexOf(n) < 0 || p.rows.some((r) => r.length !== n)) { bad.push(p.id + ' size'); continue; }
    if (!LOCALE_CODES.every((l) => typeof p.name[l] === 'string' && p.name[l].length)) { bad.push(p.id + ' name'); continue; }
    const letters = [...new Set(p.rows.join('').replace(/\./g, ''))];
    if (!letters.length || letters.some((c) => !/^#[0-9A-F]{6}$/i.test(p.col[c] || ''))) { bad.push(p.id + ' colour'); continue; }
    const grid = [];
    for (const r of p.rows) for (const ch of r) grid.push(ch === '.' ? E.BLANK : E.FILL);
    const cl = E.cluesOf(grid, n);
    if (cl.rows.length !== n || cl.cols.length !== n) { bad.push(p.id + ' clues'); continue; }
    const res = E.solve(cl.rows, cl.cols);
    if (!res.solved || res.grid.some((v, i) => v !== grid[i])) bad.push(p.id + ' not unique (' + res.grid.filter((v) => v === -1).length + ' cells open)');
  }
  ok(bad.length === 0, 'every picture has one solution the line solver reaches, a name in every language and a colour per letter' + (bad.length ? ': ' + bad.join(', ') : ''));
  // the check itself must be able to fail: two separated cells in a 10×10 are ambiguous
  const amb = new Array(100).fill(E.BLANK); amb[0] = E.FILL; amb[11] = E.FILL;
  const ac = E.cluesOf(amb, 10);
  ok(!E.solve(ac.rows, ac.cols).solved, 'control: an ambiguous picture is caught by the solver');
  const page = fs.readFileSync(path.join(ROOT, 'www/games/nonogram/index.html'), 'utf8');
  ok(/<script src="pictures\.js"><\/script>/.test(page), 'the page loads pictures.js');
  ok(/function solvedColour\(snap, i, pal\) \{\n    var p = snap\.pic && picById\(snap\.pic\);/.test(page) && /g\.fillStyle = pal \? solvedColour\(snapNow, i, pal\) : col\.game;/.test(page) && /g\.fillStyle = solvedColour\(snap, i, pal\);/.test(page), 'board and share card both paint the picture colours');
  const gj = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  const ng = gj.find((g) => g.id === 'nonogram');
  ok(ng && (ng.files || []).indexOf('games/nonogram/pictures.js') >= 0, 'pictures.js is precached for offline play');
}

/* ------------------------------------------------ Android image save and share */
// The WebView ignores <a download> and has no navigator.share, so in the Android
// app the result card's Save image and Share did nothing (#168). A small Java
// bridge does both without any new permission; these checks keep it that way.
function testAndroidShare() {
  head('Android image save and share');
  const javaDir = path.join(ROOT, 'android/app/src/main/java/io/github/choganhq/chogan');
  const bridgeFile = path.join(javaDir, 'ImageBridge.java');
  ok(fs.existsSync(bridgeFile), 'ImageBridge.java exists');
  if (!fs.existsSync(bridgeFile)) return;
  const java = fs.readFileSync(bridgeFile, 'utf8');
  for (const m of ['canSave', 'saveImage', 'shareImage']) {
    ok(new RegExp('@JavascriptInterface\\s+public boolean ' + m + '\\(').test(java), 'bridge method ' + m + ' is exposed to JavaScript');
  }
  ok(/PNG_MAGIC/.test(java) && /MAX_PNG_BYTES/.test(java), 'the bridge only accepts PNGs of bounded size');
  ok(/MediaStore\.Images\.Media\.RELATIVE_PATH/.test(java) && /SDK_INT >= Build\.VERSION_CODES\.Q/.test(java), 'saving uses MediaStore and only on Android 10+, where no permission is needed');
  const main = fs.readFileSync(path.join(javaDir, 'MainActivity.java'), 'utf8');
  ok(/addJavascriptInterface\(new ImageBridge\(this\), "ChoganAndroid"\)/.test(main), 'MainActivity exposes the bridge as ChoganAndroid');
  const manifest = fs.readFileSync(path.join(ROOT, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  const prov = (manifest.match(/<provider[\s\S]*?<\/provider>/) || [''])[0];
  ok(/androidx\.core\.content\.FileProvider/.test(prov) && /android:exported="false"/.test(prov) && /android:grantUriPermissions="true"/.test(prov),
    'the FileProvider is not exported and only grants per share');
  ok(/android:authorities="\$\{applicationId\}\.share"/.test(prov) && /getPackageName\(\) \+ "\.share"/.test(java), 'provider authority matches what the bridge asks for');
  const pathsFile = path.join(ROOT, 'android/app/src/main/res/xml/share_paths.xml');
  const paths = fs.existsSync(pathsFile) ? fs.readFileSync(pathsFile, 'utf8') : '';
  const entries = paths.match(/<[a-z-]+-path\b[^>]*>/g) || [];
  ok(entries.length === 1 && /<cache-path name="share" path="share\/"/.test(entries[0]), 'the provider exposes only cache/share/ (' + entries.length + ' path entries)');
  ok(/new File\(activity\.getCacheDir\(\), "share"\)/.test(java), 'the bridge writes inside that same folder');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const sheet = core.slice(core.indexOf('function cardSheet('));
  ok(sheet.indexOf('global.ChoganAndroid') > 0 && sheet.indexOf('global.ChoganAndroid') < sheet.indexOf('if (file) {'), 'the card sheet prefers the Android bridge over the web paths');
  ok(/droid\.canSave\(\) && droid\.saveImage\(png\(\)\)/.test(sheet) && /else droid\.shareImage\(png\(\), text\)/.test(sheet), 'below Android 10 Save image falls back to the share sheet');
}

/* ------------------------------------------------ Store metadata for Play */
// The same fastlane metadata feeds F-Droid and Google Play (#163). Play rejects
// screenshots longer than 2:1 (ours were 1056×2160) and needs a 1024×500 feature
// graphic, so the files are checked here rather than by an upload that fails.
function testStoreMetadata() {
  head('Store metadata for Play');
  const root = path.join(ROOT, 'fastlane/metadata/android');
  const pngSize = (f) => { const b = fs.readFileSync(f); return b.toString('hex', 0, 8) === '89504e470d0a1a0a' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; };
  const langs = fs.readdirSync(root).filter((d) => fs.existsSync(path.join(root, d, 'title.txt')));
  ok(langs.length >= 4 && langs.indexOf('en-US') >= 0, 'store languages found (' + langs.join(', ') + ')');
  for (const lang of langs) {
    const read = (n) => fs.readFileSync(path.join(root, lang, n), 'utf8').trim();
    const [t, s, f] = [read('title.txt'), read('short_description.txt'), read('full_description.txt')];
    ok([...t].length <= 30 && [...s].length <= 80 && [...f].length <= 4000, lang + ': title ≤ 30, short ≤ 80, full ≤ 4000 (' + [...t].length + '/' + [...s].length + '/' + [...f].length + ')');
    const shots = path.join(root, lang, 'images', 'phoneScreenshots');
    const list = fs.existsSync(shots) ? fs.readdirSync(shots).filter((x) => x.endsWith('.png')) : [];
    ok(list.length >= 2 && list.length <= 8, lang + ': 2–8 phone screenshots (' + list.length + ')');
    const bad = list.filter((x) => { const z = pngSize(path.join(shots, x)); return !z || Math.min(...z) < 320 || Math.max(...z) > 3840 || Math.max(...z) > 2 * Math.min(...z); });
    ok(bad.length === 0, lang + ': every screenshot is a PNG within 320–3840px and at most 2:1' + (bad.length ? ' (' + bad.join(', ') + ')' : ''));
  }
  const fg = path.join(root, 'en-US/images/featureGraphic.png');
  const fz = fs.existsSync(fg) && pngSize(fg);
  ok(!!fz && fz[0] === 1024 && fz[1] === 500, 'en-US feature graphic is 1024×500 (' + (fz ? fz.join('×') : 'missing') + ')');
  const icon = pngSize(path.join(root, 'en-US/images/icon.png'));
  ok(!!icon && icon[0] === 512 && icon[1] === 512, 'en-US icon is 512×512');
  const y = fs.readFileSync(path.join(ROOT, '.github/workflows/play.yml'), 'utf8');
  ok(/options: \[check, upload, listing\]/.test(y) && /play-api\.sh listing fastlane\/metadata\/android/.test(y), 'play.yml can send the listing from the repo metadata');
}

/* ------------------------------------------------ Tower defence: six maps (#221) */
// A player asked for more maps. The three new ones change the path's shape through
// genPath's run lengths; the first three must stay exactly as players know them.
function testTdMaps() {
  head('Tower defence maps');
  const E = loadEngine('tower-defence', 'TdEngineFactory');
  const src = fs.readFileSync(path.join(ROOT, 'www/games/tower-defence/index.html'), 'utf8');
  const lines = src.match(/\{ id: 'm\d', seed: \d+,[^\n]*\}/g) || [];
  const maps = lines.map((l) => ({ id: l.match(/id: '(m\d)'/)[1], seed: +l.match(/seed: (\d+)/)[1],
    opts: Object.assign({ minTurns: 5 }, l.indexOf('opts:') > 0 ? Function('return ' + l.match(/opts: (\{[^}]*\})/)[1])() : {}) }));
  ok(maps.length === 6, 'six maps listed (' + maps.length + ')');
  const pathOf = (m) => E.genPath(rng(m.seed), m.opts);
  const sig = (p) => { let h = 0; for (const ch of p.map((q) => q.r + '.' + q.c).join(' ')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return p.length + ':' + h; };
  // Fingerprints of m1–m3 taken before #221 changed genPath
  const known = { m1: '50:2024945734', m2: '46:711043971', m3: '46:1661566532' };
  for (const id of Object.keys(known)) {
    const m = maps.find((x) => x.id === id);
    ok(!!m && sig(pathOf(m)) === known[id], id + ' is the same path as before (' + (m ? sig(pathOf(m)) : 'missing') + ')');
  }
  const sigs = new Set();
  for (const m of maps) {
    const p = pathOf(m);
    ok(E.validatePath(p) === null, m.id + ': the path is valid (' + (E.validatePath(p) || 'ok') + ')');
    sigs.add(sig(p));
  }
  ok(sigs.size === 6, 'all six paths differ');
  const len = (id) => pathOf(maps.find((x) => x.id === id)).length;
  ok(len('m5') < 32 && len('m5') < Math.min(len('m1'), len('m2'), len('m3')), 'Slope is the short path (' + len('m5') + ')');
  ok(len('m6') > 55, 'Canyon sweeps the width of the board (' + len('m6') + ')');

  // Every map can be won: a plain greedy player (best-covering spot, then upgrades)
  // clears all twenty waves on each one
  const play = (p) => {
    const S = E.createGame({ path: p, money: 200, lives: 20, lastWave: 20 }), r = rng(77), mix = ['cannon', 'tesla', 'archer'];
    const cover = (rr, cc, range) => p.filter((q) => Math.hypot(q.r - rr, q.c - cc) <= range).length;
    let n = 0;
    while (!S.over) {
      for (let g = 0; g < 40; g++) {
        const kind = mix[n % mix.length];
        if (S.towers.length < 16 && S.money >= E.TOWERS[kind].cost) {
          let best = null, bc = -1;
          for (let rr = 0; rr < E.GH; rr++) for (let cc = 0; cc < E.GW; cc++) if (E.canBuild(S, rr, cc)) { const v = cover(rr, cc, E.TOWERS[kind].range); if (v > bc) { bc = v; best = [rr, cc]; } }
          if (best && E.build(S, best[0], best[1], kind)) { n++; continue; }
        }
        const t = S.towers.filter((x) => x.level < 2).sort((a, b) => a.level - b.level)[0];
        if (t && E.upgrade(S, t)) continue;
        break;
      }
      E.startWave(S, r);
      let g = 0;
      while (S.waveActive && !S.over && g++ < 100000) E.step(S, 0.05, r);
    }
    return S;
  };
  for (const m of maps) {
    const S = play(pathOf(m));
    ok(S.won && S.wave === 20, m.id + ': a greedy player wins all twenty waves (' + (S.won ? 'won, ' + S.lives + ' lives' : 'lost at wave ' + S.wave) + ')');
  }
  ok(/function pickMap\(\)/.test(src) && /MAPS\.map\(function \(m\) \{\n      return el\('button'/.test(src), 'maps are picked from a list, not a six-wide segmented row');
  // Map picker (#251): each row draws its own map from pathFor(), and the row has room
  // inside the selected border
  ok(/\[mapThumb\(pathFor\(m\.id\)\), el\('div', \{ class: 'ch-item__label'/.test(src) && /function mapThumb\(path\) \{[\s\S]*?<polyline points=/.test(src),
    'each map in the picker shows a thumbnail of its own path');
  ok(/\.td-mapitem \{[^}]*padding-inline: var\(--s-3\)/.test(src), 'the map row has its own inline padding, so the label clears the selected border');
}

/* ------------------------------------------------ Store text lists every game (0.5.0) */
// Like the README in #188, the store descriptions stopped at chess: Hokm and
// Block Drop shipped in 0.4.0 without a line, and the text still said eighteen.
function testStoreGames() {
  head('Store text lists every game');
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  ok(games.length > 0, 'games.json lists games');
  for (const [lang, key] of [['en-US', 'en'], ['fa', 'fa'], ['zh-CN', 'zh'], ['de-DE', 'de'], ['es-ES', 'es']]) {
    const text = fs.readFileSync(path.join(ROOT, 'fastlane/metadata/android', lang, 'full_description.txt'), 'utf8');
    const miss = games.filter((g) => text.indexOf('* ' + g.name[key].replace(/\u00ad/g, '') + ' ') < 0).map((g) => g.id);
    ok(!miss.length, lang + ': every game has a line in the store description' + (miss.length ? ' (missing: ' + miss.join(', ') + ')' : ''));
  }
}

/* ------------------------------------------------ README game tables */
// #188: the README stopped at Breakout while five more games shipped, and nothing noticed.
// Every game in games.json must have a row in both the English and the Persian table.
function testReadme() {
  head('README game tables');
  const md = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8'));
  const games = Array.isArray(raw) ? raw : raw.games;
  ok(Array.isArray(games) && games.length > 0, 'games.json lists games');
  const section = (start) => {
    const at = md.indexOf(start);
    if (at < 0) return '';
    const end = md.indexOf('\n### ', at + start.length);
    return md.slice(at, end < 0 ? md.length : end);
  };
  const rows = (sec) => sec.split('\n').filter((l) => /^\| /.test(l)).map((l) => l.split('|')[1].trim());
  const en = rows(section('### The games')), fa = rows(section('### بازی‌ها'));
  ok(en.length > 0 && fa.length > 0, 'README has an English and a Persian game table');
  const missEn = games.filter((g) => en.indexOf(g.name.en) < 0).map((g) => g.id);
  const missFa = games.filter((g) => fa.indexOf(g.name.fa) < 0).map((g) => g.id);
  ok(!missEn.length, 'every game has a row in the English table' + (missEn.length ? ' (missing: ' + missEn.join(', ') + ')' : ''));
  ok(!missFa.length, 'every game has a row in the Persian table' + (missFa.length ? ' (missing: ' + missFa.join(', ') + ')' : ''));
}

/* ------------------------------------------------ Menu: pinned and recent (#193) */
// The home page gained a pinned section and a recently played row. Recent is written
// when a game page opens (stats only change when a round ends), pins in the settings.
function testMenuPins() {
  head('Menu pins and recent');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const home = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
  ok(/Chogan\.recent = \{/.test(core) && /Chogan\.pins = \{/.test(core), 'the core has Chogan.recent and Chogan.pins');
  const gameAt = core.indexOf('Chogan.game = function (cfg)');
  ok(gameAt > 0 && /Chogan\.recent\.touch\(cfg\.id\)/.test(core.slice(gameAt, gameAt + 400)), 'opening a game page records it as recent');
  ok(/pinned: \[\]/.test(core), 'pinned is a default setting');
  ok(/C\.pins\.toggle\(g\.id\)/.test(home) && /e\.stopPropagation\(\)/.test(home), 'every menu card has a pin toggle that does not open the game');
  ok(/ch-section--pinned/.test(home) && /C\.recent\.list\(\)/.test(home), 'the home page shows pinned games and recent games');
  const keys = ['pinned', 'recent', 'pin', 'unpin'];
  const missing = [];
  for (const k of keys) { const n = (home.match(new RegExp('[ ,{]' + k + ": '", 'g')) || []).length; if (n < LOCALE_CODES.length) missing.push(k + ' ' + n); }
  ok(!missing.length, 'pin and recent strings exist in every language' + (missing.length ? ' (' + missing.join(', ') + ')' : ''));
  // #481: new games went to the end of their section and the owner couldn't find Hop.
  // The menu's own isNew and row code, run on invented games: new and unplayed only,
  // newest first, pinned ones left out, six at most.
  const isNewSrc = (home.match(/  function isNew\(g\) \{[\s\S]*?\n  \}\n/) || [''])[0];
  const rowSrc = (home.match(/    var freshGames = [\s\S]*?\.slice\(0, 6\)\.map\(function \(x\) \{ return x\.g; \}\);/) || [''])[0];
  ok(isNewSrc.length > 0 && rowSrc.length > 0, 'the menu has a row of new games');
  if (isNewSrc && rowSrc) {
    const day = (k) => new Date(Date.UTC(2026, 9, 25 - k)).toISOString().slice(0, 10);
    const G = [['old', 40], ['a', 9], ['b', 2], ['c', 2], ['played', 1], ['pinned', 1], ['d', 5], ['e', 6], ['f', 7], ['g', 8], ['h', 20]].map((x) => ({ id: x[0], added: day(x[1]) }));
    const sb = { GAMES: G, Date: { now: () => Date.UTC(2026, 9, 25, 12) },
      C: { stats: { get: () => ({ byGame: { played: { plays: 1 } } }) }, keyToDate: (k) => new Date(k + 'T00:00:00Z'), pins: { has: (id) => id === 'pinned' } } };
    vm.runInNewContext(isNewSrc + rowSrc + ';this.out = freshGames.map(function (g) { return g.id; });', sb);
    ok(sb.out.join() === 'c,b,d,e,f,g', 'the row shows unplayed games added in the last three weeks, newest first, no pinned ones, six at most (' + sb.out.join() + ')');
  }
  ok((home.match(/[ ,{]freshRow: '/g) || []).length === LOCALE_CODES.length, 'the row is named in every language');
}

/* ------------------------------------------------ Ways to play (#203) */
// The app runs on the web, on Android and as a Telegram Mini App (@chogangamebot).
// Before #203 neither the app nor the README said so; F-Droid and Telegram were missing.
function testWaysToPlay() {
  head('Ways to play');
  const home = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
  // Profile order (#253): the shop and settings used to sit below a row for every game
  const at253 = (needle) => home.indexOf(needle);
  const shopAt = at253("sectionHead(C.t('unlocks')), unlockShop()"), statsAt = at253("sectionHead(C.t('statsTitle'))");
  const setAt = at253("sectionHead(C.t('settings')), settingsCard()"), perAt = at253("sectionHead(C.t('perGame')), per]");
  ok([shopAt, statsAt, setAt, perAt].every((i) => i > 0), 'profile sections found (' + [shopAt, statsAt, setAt, perAt] + ')');
  ok(shopAt < statsAt && shopAt < perAt, 'characters and palettes come first, under the profile card');
  ok(setAt < perAt, 'settings come before the long per-game list');
  const shopFn = (home.match(/function unlockShop\(\) \{[\s\S]*?\n  \}\n/) || [''])[0];
  ok(shopFn.length > 0 && (shopFn.match(/'grid-template-columns': 'repeat\(4, minmax\(0, 1fr\)\)'/g) || []).length === 2 && !/width: '84px'/.test(shopFn),
    'characters and palettes sit four to a row instead of fixed tiles that wrap three and one');
  const md = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const urls = ['https://choganhq.github.io/chogan/', 'https://f-droid.org/packages/io.github.choganhq.chogan/', 'https://t.me/chogangamebot'];
  const at = home.indexOf("C.t('waysToPlay')");
  ok(at > 0, 'the About card has a ways-to-play row');
  const row = home.slice(at, at + 600);
  const miss = urls.filter((u) => row.indexOf("'" + u + "'") < 0);
  ok(!miss.length, 'the row links the web, F-Droid and Telegram' + (miss.length ? ' (missing: ' + miss.join(', ') + ')' : ''));
  const keys = ['waysToPlay', 'playWeb', 'playAndroid', 'playTelegram'];
  const short = keys.filter((k) => (home.match(new RegExp('[ ,{]' + k + ": '", 'g')) || []).length < LOCALE_CODES.length);
  ok(!short.length, 'ways-to-play strings exist in every language' + (short.length ? ' (' + short.join(', ') + ')' : ''));
  ok(!/telegram-web-app\.js/.test(home), 'no Telegram script is loaded (owner decision 2026-10-15)');
  // Release posts go to @chogan_games (#258); the app and README point there (#261)
  ok(/el\('a', \{ href: 'https:\/\/t\.me\/chogan_games'/.test(home) && (home.match(/[ ,{]news: '/g) || []).length === LOCALE_CODES.length, 'the About card links the news channel, labelled in every language');
  // Without dir=ltr the Persian card showed «chogan_games@»
  ok(/href: 'https:\/\/t\.me\/chogan_games'[^}]*dir: 'ltr'/.test(home), 'the channel name keeps its @ in front in Persian');
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  ok((readme.match(/https:\/\/t\.me\/chogan_games/g) || []).length >= 2, 'both halves of the README link the news channel');
  const fa = md.indexOf('## فارسی');
  ok(fa > 0, 'README has a Persian section');
  for (const [name, sec] of [['English', md.slice(0, fa)], ['Persian', md.slice(fa)]]) {
    const m = urls.filter((u) => sec.indexOf('(' + u + ')') < 0);
    ok(!m.length, 'the ' + name + ' README section links every way to play' + (m.length ? ' (missing: ' + m.join(', ') + ')' : ''));
  }
}

/* ------------------------------------------------ Pasur: played cards on easy (#200) */
// Owner decision 2026-10-14: beginners get a list of the cards already taken, but only
// on the easy level; on medium and hard, remembering them is part of the game.
function testPasurGone() {
  head('Pasur played-cards panel');
  const src = fs.readFileSync(path.join(ROOT, 'www/games/pasur/index.html'), 'utf8');
  const at = src.indexOf('function paintGone()');
  ok(at > 0, 'pasur has paintGone');
  const body = src.slice(at, src.indexOf('\n  }\n', at));
  ok(/if \(S\.level !== 'easy'\) \{ goneBox\.setAttribute\('hidden', ''\); return; \}/.test(body), 'the panel is hidden unless the level is easy');
  ok(/S\.caps\[0\]\.concat\(S\.caps\[1\]\)/.test(body), 'the panel marks exactly the cards in both capture piles');
  ok(/paintGone\(\);/.test(src.slice(src.indexOf('function paint()'), at)), 'the panel is repainted with the table');
  const missing = ['gone', 'goneSub'].filter((k) => (src.match(new RegExp('[ ,{]' + k + ": '", 'g')) || []).length < LOCALE_CODES.length);
  ok(!missing.length, 'panel strings exist in every language' + (missing.length ? ' (' + missing.join(', ') + ')' : ''));
}

/* ------------------------------------------------ Gomoku (#202) */
// Built from PR #215. Its bot did not block open threes and lost in five moves to
// itself, so the engine is checked on the shapes that decide a game, and the levels
// are checked against each other by playing whole games.
/* ------------------------------------------------ Chain Reaction (#302) */
function testChain() {
  head('Chain Reaction');
  const t0 = Date.now();
  const E = loadEngine('chain', 'ChainEngineFactory');
  const html = fs.readFileSync(path.join(ROOT, 'www/games/chain/index.html'), 'utf8');
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  ok(E.SIZES.map((z) => z.cols + 'x' + z.rows).join(',') === '5x7,6x9', 'boards of 5×7 and 6×9');
  const nb = E.neighbours(6, 9), caps = nb.map((l) => l.length);
  ok(caps[0] === 2 && caps[5] === 2 && caps[48] === 2 && caps[53] === 2 && caps[1] === 3 && caps[6] === 3 && caps[7] === 4,
    'a cell bursts at 2 in a corner, 3 on an edge and 4 inside');
  ok(caps.filter((c) => c === 2).length === 4 && caps.filter((c) => c === 3).length === 2 * (4 + 7) && caps.filter((c) => c === 4).length === 4 * 7,
    'four corners, 22 edge cells and 28 inner cells on 6×9');

  const at = (S, cells) => { for (const [i, p, n] of cells) { S.owner[i] = p; S.orbs[i] = n; } return S; };
  let S = E.newGame(6, 9, 2);
  ok(E.legal(S, 0) && E.legalMoves(S).length === 54, 'every cell is open on an empty board');
  S = at(E.newGame(6, 9, 2), [[7, 2, 1]]);
  ok(!E.legal(S, 7) && E.legal(S, 8), "a colour cannot add to the other colour's cell");

  // A corner with one orb gets a second: it bursts into both neighbours
  S = at(E.newGame(6, 9, 2), [[0, 1, 1], [20, 2, 1]]); S.moves = 2;
  let r = E.play(S, 0);
  ok(r.waves.length === 1 && r.state.orbs[0] === 0 && r.state.owner[0] === 0 && r.state.owner[1] === 1 && r.state.orbs[1] === 1 && r.state.owner[6] === 1 && r.state.orbs[6] === 1,
    'a full corner empties and gives one orb to each neighbour');
  ok(r.state.turn === 2 && !r.state.winner, 'the turn passes on');

  // A burst into a full enemy cell takes it over and chains on
  S = at(E.newGame(6, 9, 2), [[0, 1, 1], [1, 2, 2], [30, 2, 1]]); S.moves = 2;
  r = E.play(S, 0);
  ok(r.waves.length === 2 && r.waves[1].burst.join() === '1' && r.state.owner[2] === 1 && r.state.owner[7] === 1 && r.state.owner[6] === 1,
    'a burst takes the full enemy edge cell next to it, which bursts in the next wave in the new colour');
  const sum = (st) => st.orbs.reduce((a, b) => a + b, 0);
  ok(sum(r.state) === sum(S) + 1, 'bursts move orbs, they never create or destroy them');

  // Knock-out: only after every colour has had a first turn
  S = at(E.newGame(6, 9, 2), [[0, 1, 1], [1, 2, 2]]); S.moves = 2;
  r = E.play(S, 0);
  ok(r.state.winner === 1 && r.state.out[2], 'taking the last enemy cell wins');
  S = E.newGame(6, 9, 2);
  r = E.play(S, 10);
  ok(!r.state.winner && !r.state.out[2] && r.state.turn === 2, 'a colour that has not moved yet is not out');
  S = at(E.newGame(6, 9, 3), [[0, 1, 1], [1, 2, 2], [40, 3, 1]]); S.moves = 3;
  r = E.play(S, 0);
  ok(r.state.out[2] && !r.state.winner && r.state.turn === 3, 'with three colours, a knocked-out colour is skipped and play goes on');

  // A board one colour has filled to the brim stops bursting at once
  S = E.newGame(5, 7, 2);
  E.neighbours(5, 7).forEach((l, i) => { S.owner[i] = 1; S.orbs[i] = l.length - 1; });
  S.owner[34] = 2; S.orbs[34] = 1; S.moves = 2;
  r = E.play(S, 0);
  ok(r.state.winner === 1 && r.waves.length < E.MAX_WAVES, 'a chain over a full board ends as soon as one colour owns everything (' + r.waves.length + ' waves)');

  // Whole games: every move legal, orbs kept, the game always ends with one winner
  let ended = 0, kept = true, legalAll = true, worst = 0, played = 0;
  const lv = ['easy', 'medium', 'hard'];
  for (let g = 0; g < 12; g++) {
    const sz = E.SIZES[g % 2], n = 2 + (g % 3), rr = rng(900 + g);
    let st = E.newGame(sz.cols, sz.rows, n), moves = 0;
    while (!st.winner && moves < 1500) {
      const q = Date.now(), m = E.think(st, lv[(g + st.turn) % 3], rr);
      worst = Math.max(worst, Date.now() - q);
      if (!E.legal(st, m)) { legalAll = false; break; }
      const o = E.play(st, m);
      if (!o.state.winner && sum(o.state) !== sum(st) + 1) kept = false;
      st = o.state; moves++; played++;
    }
    if (st.winner && st.out.filter(Boolean).length === n - 1) ended++;
  }
  ok(legalAll, 'bots only make legal moves');
  ok(kept, 'no orb is lost or made in ' + played + ' moves');
  ok(ended === 12, 'every game of 2, 3 and 4 colours ends with one colour left (' + ended + ' of 12)');
  ok(worst < 150, 'a bot move takes well under a frame budget (slowest ' + worst + 'ms)');

  // Strength: medium beats easy, hard beats medium, each side moving first half the time
  const duel = (a, b, seed) => {
    const rr = rng(seed), first = seed % 2;
    let st = E.newGame(6, 9, 2), k = 0;
    while (!st.winner && k++ < 1500) st = E.play(st, E.think(st, (st.turn === 1) !== !!first ? a : b, rr)).state;
    return (st.winner === 1) !== !!first;
  };
  let me = 0, hm = 0;
  for (let i = 0; i < 10; i++) { if (duel('medium', 'easy', 300 + i)) me++; if (duel('hard', 'medium', 400 + i)) hm++; }
  ok(me >= 7, 'medium beats easy in most games (' + me + ' of 10)');
  ok(hm >= 6, 'hard beats medium in most games (' + hm + ' of 10)');

  // Daily: the same board for everyone, mirrored so neither side starts ahead
  const d1 = E.dailyStart(rng(42), 6, 9), d2 = E.dailyStart(rng(42), 6, 9);
  ok(d1.owner.join() === d2.owner.join() && d1.owner.filter((o) => o === 1).length === 2 && d1.owner.filter((o) => o === 2).length === 2,
    'the daily board comes from the seed, two orbs a side');
  ok(d1.owner.every((o, i) => !o || d1.owner[53 - i] === 3 - o) && d1.moves === 2 && d1.turn === 1, 'the daily board is mirrored and you move first');

  // Page wiring and identity
  const gm = games.find((g) => g.id === 'chain');
  ok(!!gm && gm.cat === 'board' && /accent: '([^']+)'/.test(html) && html.match(/accent: '([^']+)'/)[1] === gm.color, 'games.json and the page share the accent; the game is in the board category');
  const icon = fs.readFileSync(path.join(ROOT, 'www/games/chain/icon.svg'), 'utf8');
  ok(!!gm && new RegExp('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon), 'the icon starts on the soft tint of games.json');
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const hue = (h) => { const [a, b, c] = rgb(h), mx = Math.max(a, b, c), d = mx - Math.min(a, b, c); if (!d) return 0; const x = mx === a ? ((b - c) / d) % 6 : mx === b ? (c - a) / d + 2 : (a - b) / d + 4; return (x * 60 + 360) % 360; };
  const lum = (h) => rgb(h).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
  const dist = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
  const near = games.filter((g) => g.id !== 'chain').map((g) => [g.id, dist(hue(g.color), hue(gm.color))]).sort((x, y) => x[1] - y[1])[0];
  ok(near[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5, 'the accent is at least 15° of hue from every other game (nearest ' + near[0] + ', ' + near[1].toFixed(0) + ') and keeps white text at 4.5:1');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  ok(['cr-win', 'cr-hard', 'cr-chain'].every((id) => core.indexOf("id: '" + id + "'") > 0 && html.indexOf("unlock('" + id + "')") > 0), 'the three Chain Reaction awards exist and are unlocked');
  ok(/E\.dailyStart\(C\.daily\('chain', o\.daily\)\.rng/.test(html) && /C\.stats\.daily\('chain', G\.daily/.test(html), 'the daily game starts from the day\'s seed and is recorded');
  ok(/ctx\.autosave\(/.test(html) && /ctx\.tutorialIfNew\(TUT\)/.test(html) && /C\.undoKey\(e\)/.test(html), 'the game autosaves, shows its tutorial once and takes the undo key');
  ok(Date.now() - t0 < 8000, 'the Chain Reaction group runs in under eight seconds (' + (Date.now() - t0) + 'ms)');
}

/* ------------------------------------------------ Ludo (#303) */
function testLudo() {
  head('Ludo');
  const t0 = Date.now();
  const E = loadEngine('ludo', 'LudoEngineFactory');
  const html = fs.readFileSync(path.join(ROOT, 'www/games/ludo/index.html'), 'utf8');
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  const T = E.TRACK, key = (q) => q[0] + ',' + q[1];
  ok(T.length === 52 && new Set(T.map(key)).size === 52, 'the loop has 52 different squares');
  ok(T.every((q, i) => { const n = T[(i + 1) % 52], dx = Math.abs(q[0] - n[0]), dy = Math.abs(q[1] - n[1]); return dx <= 1 && dy <= 1 && dx + dy > 0; }), 'every square of the loop touches the next, the last the first');
  ok(T.every((q) => q[0] >= 0 && q[0] < 15 && q[1] >= 0 && q[1] < 15 && !(q[0] >= 6 && q[0] <= 8 && q[1] >= 6 && q[1] <= 8) && !((q[0] < 6 || q[0] > 8) && (q[1] < 6 || q[1] > 8))),
    'the loop stays on the cross, out of the bases and the middle');
  const homeCells = [0, 1, 2, 3].map((c) => [51, 52, 53, 54, 55].map((p) => E.cell(c, p)));
  ok(homeCells.every((col) => col.every((q) => q && !T.some((t) => key(t) === key(q)))) && new Set(homeCells.flat().map(key)).size === 20, 'each colour has its own 5-square home column, off the loop');
  ok([0, 1, 2, 3].every((c) => { const a = E.cell(c, 50), b = E.cell(c, 51); return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1; }), 'each colour turns into its home column from the square next to it');
  ok([0, 1, 2, 3].every((c) => E.square(c, 0) === 13 * c && E.isSafe(13 * c) && E.isSafe(13 * c + 8)), 'start squares and the stars eight after them are safe');

  // Leaving base, exact rolls, extra rolls
  let S = E.newGame(2, 2);
  ok(S.colours.join() === '0,2', 'two players sit opposite each other');
  ok(E.moves(S, 5).length === 0 && E.dead(S, 5) === 'none' && E.moves(S, 6).length === 1, 'only a six brings a token out, and two tokens in base are one move');
  let r = E.play(S, 0, 6);
  ok(r.state.pos[0][0] === 0 && r.again && r.state.turn === 0 && r.state.sixes === 1, 'a six brings a token to its start square and rolls again');
  r = E.play(r.state, 0, 4);
  ok(r.state.pos[0][0] === 4 && !r.again && r.state.turn === 1 && r.state.sixes === 0, 'a four moves four squares and passes the turn');
  S = E.newGame(2, 2); S.pos[0] = [54, -1];
  ok(!E.canMove(S, 0, 3) && E.canMove(S, 0, 2), 'reaching home needs the exact roll');
  r = E.play(S, 0, 2);
  ok(r.home && r.again && r.state.winner < 0, 'a token reaching home rolls again');
  S = E.newGame(2, 2); S.pos[0] = [56, 53];
  r = E.play(S, 1, 3);
  ok(r.state.winner === 0 && !r.again, 'the last token home wins the game');
  S = E.newGame(2, 2); S.pos[0] = [10, -1]; S.sixes = 2;
  ok(E.dead(S, 6) === 'sixes' && E.play(S, 0, 6) === null, 'a third six in a row loses the turn');
  ok(E.pass(S).turn === 1 && E.pass(S).sixes === 0, 'a lost turn passes on');

  // Captures and safe squares; square() maps each colour's path onto the loop
  S = E.newGame(2, 2); S.pos[0] = [10, -1];
  const enemyAt = (sq) => (sq - 26 + 52) % 52;
  S.pos[1] = [enemyAt(13), -1];
  r = E.play(S, 0, 3);
  ok(r.state.pos[0][0] === 13 && r.captured.length === 0 && r.state.pos[1][0] === enemyAt(13), 'no capture on a safe square (green\'s start)');
  S = E.newGame(2, 2); S.pos[0] = [10, -1]; S.pos[1] = [enemyAt(14), -1];
  r = E.play(S, 0, 4);
  ok(r.captured.length === 1 && r.state.pos[1][0] === -1 && r.again, 'landing on an opponent sends it to base and rolls again');
  S = E.newGame(2, 2); S.pos[0] = [20, -1]; S.pos[1] = [enemyAt(17), enemyAt(30)];
  ok(E.threats(S, 0, E.square(0, 20)) === 1 && E.threats(S, 0, E.square(0, 21)) === 0, 'a token 1 to 6 squares behind is a threat, one ahead is not');
  S = E.newGame(2, 2); S.pos[0] = [3, -1]; S.pos[1] = [48, -1];
  ok(E.threats(S, 0, E.square(0, 3)) === 0, 'a token about to turn into its home column is no threat past its turn');

  // Whole games of every size: legal moves only, every game ends with a winner
  const levels = ['easy', 'medium', 'hard'];
  let ended = 0, legalAll = true, inRange = true, worst = 0;
  for (let g = 0; g < 24; g++) {
    const n = 2 + (g % 3), tk = g % 2 ? 4 : 2, rr = rng(500 + g);
    let st = E.newGame(n, tk), rolls = 0;
    while (st.winner < 0 && rolls < 4000) {
      const roll = E.roll(rr); rolls++;
      if (roll < 1 || roll > 6) { legalAll = false; break; }
      if (E.dead(st, roll)) { st = E.pass(st); continue; }
      const q = Date.now(), k = E.think(st, roll, levels[(g + st.turn) % 3], rr);
      worst = Math.max(worst, Date.now() - q);
      if (!E.canMove(st, k, roll)) { legalAll = false; break; }
      st = E.play(st, k, roll).state;
      if (!st.pos.every((t) => t.every((p) => p >= -1 && p <= 56))) inRange = false;
    }
    if (st.winner >= 0 && st.pos[st.winner].every((p) => p === 56)) ended++;
  }
  ok(legalAll && inRange, 'bots only make legal moves and tokens stay between base and home');
  ok(ended === 24, 'every game of 2, 3 and 4 players, 2 and 4 tokens, ends with a winner (' + ended + ' of 24)');
  ok(worst < 50, 'a bot move is instant (slowest ' + worst + 'ms)');

  // Strength over full games, where skill counts more than the dice
  const duel = (a, b, seed) => {
    const rr = rng(seed), first = seed % 2;
    let st = E.newGame(2, 4), k = 0;
    while (st.winner < 0 && k++ < 4000) {
      const roll = E.roll(rr);
      if (E.dead(st, roll)) { st = E.pass(st); continue; }
      st = E.play(st, E.think(st, roll, (st.turn === 0) !== !!first ? a : b, rr), roll).state;
    }
    return (st.winner === 0) !== !!first;
  };
  let me = 0, hm = 0;
  for (let i = 0; i < 200; i++) { if (duel('medium', 'easy', 2000 + i)) me++; if (duel('hard', 'medium', 3000 + i)) hm++; }
  ok(me >= 130, 'medium beats easy in most full games (' + me + ' of 200)');
  ok(hm >= 106, 'hard beats medium more often than not (' + hm + ' of 200)');

  // Page wiring and identity
  const gm = games.find((g) => g.id === 'ludo');
  ok(!!gm && gm.cat === 'board' && /accent: '([^']+)'/.test(html) && html.match(/accent: '([^']+)'/)[1] === gm.color, 'games.json and the page share the accent; the game is in the board category');
  const icon = fs.readFileSync(path.join(ROOT, 'www/games/ludo/icon.svg'), 'utf8');
  ok(!!gm && new RegExp('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon), 'the icon starts on the soft tint of games.json');
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const hue = (h) => { const [a, b, c] = rgb(h), mx = Math.max(a, b, c), d = mx - Math.min(a, b, c); if (!d) return 0; const x = mx === a ? ((b - c) / d) % 6 : mx === b ? (c - a) / d + 2 : (a - b) / d + 4; return (x * 60 + 360) % 360; };
  const lum = (h) => rgb(h).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
  const dist = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
  const near = games.filter((g) => g.id !== 'ludo').map((g) => [g.id, dist(hue(g.color), hue(gm.color))]).sort((x, y) => x[1] - y[1])[0];
  ok(near[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5, 'the accent is at least 15° of hue from every other game (nearest ' + near[0] + ', ' + near[1].toFixed(0) + ') and keeps white text at 4.5:1');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  ok(['lu-win', 'lu-hard', 'lu-hunter'].every((id) => core.indexOf("id: '" + id + "'") > 0 && html.indexOf("unlock('" + id + "')") > 0), 'the three Ludo awards exist and are unlocked');
  ok(/C\.daily\('ludo', G\.daily \+ '\|' \+ G\.s\.rolls\)\.rng/.test(html) && /C\.stats\.daily\('ludo', G\.daily/.test(html), 'daily dice come from the day\'s seed and the roll number, and the result is recorded');
  ok(/ctx\.autosave\(/.test(html) && /ctx\.tutorialIfNew\(TUT\)/.test(html), 'the game autosaves and shows its tutorial once');
  // A reload or a pause after a bad roll used to throw the die again
  ok(/G\.roll = v;\s*\/\/[^\n]*\n[^\n]*\n\s*save\(\);\s*afterRoll\(v\);/.test(html) && /roll: G\.roll,/.test(html) && /if \(g\.roll >= 1 && g\.roll <= 6\) \{ G\.phase = 'busy'; G\.roll = g\.roll; afterRoll\(g\.roll\); \}/.test(html) &&
    /if \(G\.roll\) \{ G\.phase = 'busy'; G\.msg = ''; afterRoll\(G\.roll\); \}/.test(html), 'a landed die is saved and replayed after a reload or a pause, never thrown again');
  ok(Date.now() - t0 < 6000, 'the Ludo group runs in under six seconds (' + (Date.now() - t0) + 'ms)');
}

/* ------------------------------------------- Snakes and Ladders (#314) */
function testSnakes() {
  head('Snakes and Ladders');
  const t0 = Date.now();
  const E = loadEngine('snakes', 'SnakesEngineFactory');
  const html = fs.readFileSync(path.join(ROOT, 'www/games/snakes/index.html'), 'utf8');
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;

  // The board: 1 bottom left, rows running back and forth, 100 top left
  const cells = [];
  for (let n = 1; n <= 100; n++) cells.push(E.cell(n));
  ok(new Set(cells.map((q) => q.join())).size === 100 && cells.every((q) => q[0] >= 0 && q[0] < 10 && q[1] >= 0 && q[1] < 10), 'the 100 squares fill the 10×10 grid once each');
  ok(cells.every((q, i) => i === 0 || Math.abs(q[0] - cells[i - 1][0]) + Math.abs(q[1] - cells[i - 1][1]) === 1), 'every square touches the next one');
  ok(E.cell(1).join() === '0,9' && E.cell(10).join() === '9,9' && E.cell(11).join() === '9,8' && E.cell(100).join() === '0,0', 'square 1 is bottom left, the second row runs back, 100 is top left');

  // Ladders and snakes
  const L = Object.entries(E.LADDERS).map(([a, b]) => [+a, b]), S = Object.entries(E.SNAKES).map(([a, b]) => [+a, b]);
  ok(L.length >= 6 && S.length >= 6, 'the board has ladders and snakes (' + L.length + ' and ' + S.length + ')');
  ok(L.every(([a, b]) => a >= 1 && b > a && b <= 99) && S.every(([a, b]) => a <= 99 && b < a && b >= 1), 'ladders go up, snakes go down, and none starts or ends on 100');
  const starts = new Set([...L, ...S].map((x) => x[0]));
  ok(starts.size === L.length + S.length, 'no square holds two ladders or snakes');
  ok([...L, ...S].every(([, b]) => !starts.has(b)), 'no ladder or snake ends where another one starts');
  ok([...L, ...S].every(([a, b]) => E.cell(a)[1] !== E.cell(b)[1]), 'every ladder and snake crosses at least one row');
  // The first draft had ladders and snakes crossing into a tangle nobody could
  // follow; drawn as straight lines between square middles, every pair stays a
  // square apart.
  const seg = (a, b, c, d) => {
    const sub = (u, v) => [u[0] - v[0], u[1] - v[1]], dot = (u, v) => u[0] * v[0] + u[1] * v[1];
    const cr = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
    if (cr(a, b, c) * cr(a, b, d) < 0 && cr(c, d, a) * cr(c, d, b) < 0) return 0;
    const pd = (p, x, y) => { const v = sub(y, x), t = Math.max(0, Math.min(1, dot(sub(p, x), v) / dot(v, v))); return Math.hypot(p[0] - x[0] - v[0] * t, p[1] - x[1] - v[1] * t); };
    return Math.min(pd(a, c, d), pd(b, c, d), pd(c, a, b), pd(d, a, b));
  };
  const J = [...L, ...S];
  let close = 99, pair = '';
  for (let i = 0; i < J.length; i++) for (let j = i + 1; j < J.length; j++) {
    const d = seg(E.cell(J[i][0]), E.cell(J[i][1]), E.cell(J[j][0]), E.cell(J[j][1]));
    if (d < close) { close = d; pair = J[i].join('→') + ' and ' + J[j].join('→'); }
  }
  ok(close >= 1, 'no two ladders or snakes cross or run closer than a square (closest ' + pair + ', ' + close.toFixed(2) + ')');

  // Moves
  let S0 = E.newGame(2, false);
  ok(S0.pos.join() === '0,0' && S0.turn === 0 && S0.winner === -1, 'everyone starts off the board');
  let r = E.play(S0, 5);
  ok(r.state.pos[0] === 5 && r.steps.join() === '1,2,3,4,5' && !r.jump && !r.again && r.state.turn === 1, 'a five from the start walks to square 5 and passes the turn');
  r = E.play(S0, 4);
  ok(r.jump && r.jump.kind === 'ladder' && r.jump.from === 4 && r.state.pos[0] === E.LADDERS[4], 'the foot of a ladder takes the token to its top');
  S0 = E.newGame(2, false); S0.pos[0] = 24;
  r = E.play(S0, 6);
  ok(r.jump && r.jump.kind === 'snake' && r.state.pos[0] === E.SNAKES[30] && r.again && r.state.turn === 0, 'a snake\'s head takes the token to its tail, and a six still rolls again');
  S0 = E.newGame(3, false); S0.turn = 2; S0.pos[2] = 4;
  r = E.play(S0, 2);
  ok(r.state.turn === 0 && r.state.rolls === 1, 'the turn wraps round to the first player');
  S0 = E.newGame(2, false); S0.pos[1] = 9;
  r = E.play(S0, 6);
  ok(r.state.pos[0] === 6 && r.state.pos[1] === 9, 'a move never touches another player\'s token');

  // The finish, plain and exact
  S0 = E.newGame(2, false); S0.pos[0] = 97;
  r = E.play(S0, 6);
  ok(r.state.winner === 0 && r.state.pos[0] === 100 && r.steps.join() === '98,99,100' && !r.again, 'in a plain game passing 100 wins, on a six too');
  S0 = E.newGame(2, true); S0.pos[0] = 96;
  r = E.play(S0, 5);
  ok(r.state.winner < 0 && r.bounced && r.steps.join() === '97,98,99,100,99' && r.state.pos[0] === E.SNAKES[99], 'in an exact game the rest bounces back, onto the snake at 99 here');
  S0 = E.newGame(2, true); S0.pos[0] = 97;
  r = E.play(S0, 3);
  ok(r.state.winner === 0 && !r.bounced, 'in an exact game the exact roll wins');
  ok(E.play(r.state, 2) === null && E.play(E.newGame(2, false), 7) === null, 'no move after the game is won, and no roll outside 1 to 6');

  // Whole games: every one ends, and a plain two-player game stays short
  let ended = 0, legal = true;
  const lengths = { 2: [], 4: [] };
  for (let g = 0; g < 600; g++) {
    const n = g % 2 ? 4 : 2, exact = g % 3 === 0, rr = rng(900 + g);
    let st = E.newGame(n, exact), k = 0;
    while (st.winner < 0 && k++ < 3000) {
      const res = E.play(st, E.roll(rr));
      if (!res || !res.state.pos.every((p) => p >= 0 && p <= 100)) { legal = false; break; }
      st = res.state;
    }
    if (st.winner >= 0 && st.pos[st.winner] === 100) ended++;
    if (!exact) lengths[n].push(st.rolls);
  }
  const median = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
  ok(legal && ended === 600, 'every game of 2 and 4 players, plain and exact, ends with a winner on 100 (' + ended + ' of 600)');
  ok(lengths[2].length > 100 && median(lengths[2]) <= 45, 'a plain two-player game is short: median ' + median(lengths[2]) + ' rolls');
  ok(lengths[4].length > 100 && median(lengths[4]) <= 70, 'a plain four-player game: median ' + median(lengths[4]) + ' rolls');

  // Page wiring and identity
  const gm = games.find((g) => g.id === 'snakes');
  ok(!!gm && gm.cat === 'board' && gm.daily === false, 'games.json lists it under board games, with no daily challenge: the dice decide everything, so a daily result would be the same for everyone');
  ok(!!gm && /accent: '([^']+)'/.test(html) && html.match(/accent: '([^']+)'/)[1] === gm.color, 'games.json and the page share the accent');
  const icon = fs.readFileSync(path.join(ROOT, 'www/games/snakes/icon.svg'), 'utf8');
  ok(!!gm && new RegExp('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon), 'the icon starts on the soft tint of games.json');
  // Thirty games leave no hue 15° from all the others, so the accent is held
  // apart by colour difference (CIE76 ΔE) instead of hue alone.
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const lab = (h) => {
    const [R, G, B] = rgb(h).map(lin), f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  };
  const dE = (a, b) => { const A = lab(a), B = lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
  const lum = (h) => rgb(h).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
  const near = games.filter((g) => g.id !== 'snakes').map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0];
  ok(near[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5, 'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + ') and keeps white text at 4.5:1');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  ok(['sl-win', 'sl-ladder', 'sl-snake'].every((id) => core.indexOf("id: '" + id + "'") > 0 && html.indexOf("unlock('" + id + "')") > 0), 'the three Snakes and Ladders awards exist and are unlocked');
  ok(/ctx\.autosave\(/.test(html) && /ctx\.tutorialIfNew\(TUT\)/.test(html) && /G\.roll = v;\s*\/\/[^\n]*\n[^\n]*\n\s*save\(\);/.test(html), 'the game autosaves, also the moment the die lands, and shows its tutorial once');
  // The result window labels its play-again button with the core's 'again'; a
  // game string of that name relabelled it "A six: roll again"
  ok(!/[\s{,]again: '/.test(html), 'the page leaves the core\'s "again" label alone');
  // #513: the die's nudge turns and grows it past its box; in the scrolling side
  // column that showed both scrollbars, so the die keeps a margin as wide as the reach
  const dieCss = (html.match(/\.sl-die \{([^}]*)\}/) || [])[1] || '';
  const nudge = (html.match(/@keyframes sl-nudge \{(.*)\}\s*\n/) || [])[1] || '';
  const dieSize = +((dieCss.match(/width: (\d+)px/) || [])[1] || 0), dieMargin = +((dieCss.match(/margin: (\d+)px/) || [])[1] || 0);
  const degs = (nudge.match(/rotate\(-?[\d.]+deg\)/g) || []).map((s) => Math.abs(parseFloat(s.slice(7))) * Math.PI / 180);
  const scales = (nudge.match(/scale\([\d.]+\)/g) || []).map((s) => parseFloat(s.slice(6)));
  const reach = dieSize / 2 * (Math.max(1, ...scales) * Math.max(...degs.map((a) => Math.cos(a) + Math.sin(a)), 1) - 1);
  ok(dieSize > 0 && degs.length > 0 && dieMargin >= reach, 'the die\'s nudge stays inside its margin (reach ' + reach.toFixed(1) + 'px, margin ' + dieMargin + 'px)');
  ok(Date.now() - t0 < 5000, 'the Snakes and Ladders group runs in under five seconds (' + (Date.now() - t0) + 'ms)');
}

/* ------------------------------------------------ Sliding Puzzle (#324) */
function testSliding() {
  head('Sliding Puzzle');
  const t0 = Date.now();
  const E = loadEngine('sliding', 'SlidingEngineFactory');
  const html = fs.readFileSync(path.join(ROOT, 'www/games/sliding/index.html'), 'utf8');
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  ok(['make', 'tap', 'step', 'line', 'solvable', 'isSolved', 'restore', 'valid'].every((f) => typeof E[f] === 'function'), 'the engine has its API');
  ok(JSON.stringify(E.SIZES) === '[3,4,5]' && E.DAILY_SIZE === 4, 'trays from 3×3 to 5×5, and the daily one is 4×4');

  // Every 3×3 tray the gap can reach from the solved one, found by walking the gap, not by any formula
  const solved3 = E.solvedTiles(3);
  const reach = new Set([solved3.join(',')]);
  let frontier = [solved3];
  while (frontier.length) {
    const next = [];
    for (const t of frontier) {
      const z = t.indexOf(0), r = Math.floor(z / 3), c = z % 3;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr > 2 || cc < 0 || cc > 2) continue;
        const u = t.slice(), j = rr * 3 + cc;
        u[z] = u[j]; u[j] = 0;
        const k = u.join(',');
        if (!reach.has(k)) { reach.add(k); next.push(u); }
      }
    }
    frontier = next;
  }
  ok(reach.size === 181440, 'exactly half of the 3×3 orderings can be reached (' + reach.size + ' of 362880)');
  let agree = 0, total = 0;
  for (const k of reach) {
    if (total >= 20000) break;
    const t = k.split(',').map(Number);
    total++;
    // the same tray with two tiles swapped is out of reach
    const a = t[0] ? 0 : 1, b = t[a + 1] ? a + 1 : a + 2, u = t.slice();
    [u[a], u[b]] = [u[b], u[a]];
    if (E.solvable(t, 3) && !E.solvable(u, 3) && !reach.has(u.join(','))) agree++;
  }
  ok(total === 20000 && agree === total, 'on 3×3 the parity test agrees with the walk, both ways (' + agree + ' of ' + total + ')');

  // On 4×4 and 5×5 the gap's row counts too: random walks from the solved tray never leave the solvable half
  const rnd = rng(0x5117);
  for (const n of [4, 5]) {
    let good = 0, bad = 0;
    for (let w = 0; w < 400; w++) {
      const t = E.solvedTiles(n);
      for (let s = 0; s < 120; s++) {
        const z = t.indexOf(0), r = Math.floor(z / n), c = z % n, opts = [];
        if (r > 0) opts.push(z - n); if (r < n - 1) opts.push(z + n); if (c > 0) opts.push(z - 1); if (c < n - 1) opts.push(z + 1);
        const j = opts[Math.floor(rnd() * opts.length)];
        t[z] = t[j]; t[j] = 0;
      }
      if (E.solvable(t, n)) good++;
      const a = t[0] ? 0 : 1, b = t[a + 1] ? a + 1 : a + 2, u = t.slice();
      [u[a], u[b]] = [u[b], u[a]];
      if (!E.solvable(u, n)) bad++;
    }
    ok(good === 400 && bad === 400, n + '×' + n + ': every walked tray is solvable and every one with two tiles swapped is not (' + good + ', ' + bad + ')');
  }

  // The generator: only solvable trays, never close to sorted, the same for the same seed
  for (const n of E.SIZES) {
    let okCount = 0, far = 0;
    const r = rng(1000 + n);
    for (let i = 0; i < 300; i++) {
      const S = E.make(n, r);
      const fine = E.valid(S.tiles, n) && (n === 3 ? reach.has(S.tiles.join(',')) : E.solvable(S.tiles, n)) && S.moves === 0 && !S.done;
      if (fine) okCount++;
      if (E.misplaced(S.tiles) >= Math.ceil((n * n - 1) * 0.6)) far++;
    }
    ok(okCount === 300, n + '×' + n + ': every generated tray can be solved' + (n === 3 ? ', checked against the walk' : '') + ' (' + okCount + ' of 300)');
    ok(far === 300, n + '×' + n + ': no generated tray starts close to sorted (' + far + ' of 300)');
  }
  const d1 = E.make(4, rng(42)).tiles.join(','), d2 = E.make(4, rng(42)).tiles.join(',');
  ok(d1 === d2 && d1 !== E.make(4, rng(43)).tiles.join(','), 'the same seed deals the same tray, so the daily one is the same for everyone');

  // Moves: a tap slides every tile between it and the gap, each one a move
  const S = { n: 3, tiles: [1, 2, 3, 4, 5, 6, 0, 7, 8], start: [], moves: 0, done: false };
  ok(JSON.stringify(E.line(S.tiles, 3, 8)) === '[7,8]' && E.line(S.tiles, 3, 4).length === 0, 'the tiles in line with the gap are found nearest first; others are not in line');
  let r1 = E.tap(S, 4);
  ok(r1.moved.length === 0 && S.moves === 0, 'a tile off the gap\'s row and column does not move');
  r1 = E.tap(S, 8);
  ok(r1.moved.length === 2 && S.moves === 2 && r1.won && S.done && E.isSolved(S.tiles), 'tapping the far tile slides two tiles, counts two moves and solves the tray');
  ok(E.tap(S, 0).moved.length === 0, 'a solved tray takes no more moves');
  const T = { n: 3, tiles: E.solvedTiles(3), start: [], moves: 0, done: false };
  ok(E.step(T, 3).moved.length === 0 && E.step(T, 1).moved.length === 1 && T.tiles[8] === 8 && T.tiles[7] === 0, 'an arrow moves the tile beside the gap that way, and only if there is one');
  ok(E.step(T, 0).moved.length === 0 && E.step(T, 2).moved.length === 1 && T.tiles[4] === 0 && T.moves === 2, 'up and down work the same way, one move each');

  // Saves
  const good = { n: 4, tiles: E.make(4, rng(7)).tiles, start: E.make(4, rng(7)).tiles, moves: 12 };
  ok(!!E.restore(good) && E.restore(good).moves === 12, 'a whole save is taken back');
  const dup = good.tiles.slice(); dup[0] = dup[1];
  const swapped = good.tiles.slice(), ia = swapped[0] ? 0 : 1, ib = swapped[ia + 1] ? ia + 1 : ia + 2;
  [swapped[ia], swapped[ib]] = [swapped[ib], swapped[ia]];
  ok(!E.restore(Object.assign({}, good, { tiles: dup })) && !E.restore(Object.assign({}, good, { tiles: swapped })) &&
    !E.restore(Object.assign({}, good, { n: 6 })) && !E.restore(Object.assign({}, good, { moves: -1 })) && !E.restore(null),
    'a broken save is dropped: a doubled tile, an unsolvable tray, a wrong size, a bad count');

  // Page wiring and identity
  const gm = games.find((x) => x.id === 'sliding');
  ok(!!gm && gm.cat === 'puzzle' && gm.daily !== false, 'games.json lists it under puzzles, with a daily tray');
  ok(!!gm && /accent: '([^']+)'/.test(html) && html.match(/accent: '([^']+)'/)[1] === gm.color, 'games.json and the page share the accent');
  const icon = fs.readFileSync(path.join(ROOT, 'www/games/sliding/icon.svg'), 'utf8');
  ok(!!gm && new RegExp('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon), 'the icon starts on the soft tint of games.json');
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const lab = (h) => {
    const [R, G, B] = rgb(h).map(lin), f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  };
  const dE = (a, b) => { const A = lab(a), B = lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
  const lum = (h) => rgb(h).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
  const nearest = games.filter((x) => x.id !== 'sliding').map((x) => [x.id, dE(x.color, gm.color)]).sort((x, y) => x[1] - y[1])[0];
  ok(nearest[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5, 'the accent differs from every other game by ΔE ≥ 15 (nearest ' + nearest[0] + ', ' + nearest[1].toFixed(1) + ') and keeps white text at 4.5:1');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  ok(['sp-win', 'sp-five', 'sp-tidy'].every((id) => new RegExp("\\{ id: '" + id + "',[^\\n]*dde: '[^\\n]*des: '").test(core) && html.indexOf("unlock('" + id + "')") > 0), 'the three Sliding Puzzle awards exist in every language and are unlocked');
  ok(/C\.daily\('sliding', daily\)\.rng/.test(html) && /newGame\(E\.DAILY_SIZE, dailyDate\)/.test(html) && /C\.stats\.daily\('sliding', S\.daily/.test(html), 'the daily tray comes from the day\'s seed and its moves are recorded');
  ok(/C\.stats\.best\('sliding', 'moves' \+ n, S\.moves, true\)/.test(html), 'the best is the fewest moves, kept per size');
  // A tray reads 1, 2, 3 from the left in every language, so neither the board nor the arrows flip in RTL
  ok(/\.sp-board \{\s*direction: ltr;/.test(html) && /\{ ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 \}\[k\]/.test(html) && !/rtl/.test(html.slice(html.indexOf('window.addEventListener(\'keydown\''))), 'the tray and its arrows stay left to right in Persian');
  ok(/ctx\.autosave\(/.test(html) && /ctx\.tutorialIfNew\(TUT\)/.test(html) && /after\(r\) \{[\s\S]*?save\(\);/.test(html), 'the game saves after every move and shows its tutorial once');
  ok(!/[\s{,]again: '/.test(html), 'the page leaves the core\'s "again" label alone');
  ok(Date.now() - t0 < 8000, 'the Sliding Puzzle group runs in under eight seconds (' + (Date.now() - t0) + 'ms)');
}

/* ------------------------------------------------ Jigsaw (#325) */
// Checkers (#357): classic English draughts, a bot at three levels, a daily opening
function testCheckers() {
  head('Checkers');
  const t0 = Date.now();
  const E = loadEngine('checkers', 'CheckersEngineFactory');
  const html = fs.readFileSync(path.join(ROOT, 'www/games/checkers/index.html'), 'utf8');
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  // A board from eight rows: . empty, x and o the men of players 1 and 2, X and O kings
  const B = (rows) => rows.join('').split('').map((ch) => ({ '.': 0, x: 1, o: 2, X: 3, O: 4 })[ch]);
  const sq = (r, c) => r * 8 + c;
  const st = (b, turn) => ({ mode: '2p', board: b, turn: turn || 1, quiet: 0, history: [], winner: -1 });

  // The start: twelve men each, on the dark squares, player 1 at the bottom
  const b0 = E.initial(), n0 = E.count(b0);
  ok(n0.men[1] === 12 && n0.men[2] === 12 && b0.every((v, i) => !v || E.dark(i)), 'twelve men a side, all on dark squares');
  ok(b0.slice(40).every((v) => v === 0 || v === 1) && b0.slice(0, 24).every((v) => v === 0 || v === 2), 'player 1 starts at the bottom, player 2 at the top');
  ok(E.moves(b0, 1).length === 7 && E.moves(b0, 2).length === 7, 'each side has the seven usual opening moves');
  ok(E.moves(b0, 1).every((m) => m.path[0] < m.from), 'player 1 moves up the board');

  // A man moves forward only; a king both ways
  const lone = B(['........', '........', '........', '....x...', '........', '........', '........', '........']);
  ok(E.moves(lone, 1).map((m) => m.path[0]).sort().join() === [sq(2, 3), sq(2, 5)].sort().join(), 'a man steps one square diagonally forward, never back');
  const lk = lone.slice(); lk[sq(3, 4)] = 3;
  ok(E.moves(lk, 1).length === 4, 'a king steps one square in all four diagonal directions');

  // Capturing is compulsory and runs to its end
  // the free man comes first in board order, so a generator that adds its steps
  // to the jumps is caught (a first version of this test put it last and missed that)
  const forced = B(['........', '........', '......x.', '...o....', '....x...', '........', '........', '........']);
  const fm = E.moves(forced, 1);
  ok(fm.length === 1 && fm[0].from === sq(4, 4) && fm[0].caps.join() === String(sq(3, 3)) && fm[0].path.join() === String(sq(2, 2)), 'when a jump is open it is the only legal move, for every piece');
  const dbl = B(['........', '........', '...o....', '........', '...o....', '..x.....', '........', '........']);
  const dm = E.moves(dbl, 1);
  ok(dm.length === 1 && dm[0].caps.length === 2 && dm[0].path.join() === [sq(3, 4), sq(1, 2)].join(), 'a double jump is one move that takes both pieces');
  const S1 = st(dbl.slice());
  ok(E.applyMove(S1, { from: sq(5, 2), path: [sq(3, 4)] }) === null, 'stopping halfway through a double jump is illegal');
  // A man that reaches the far row on a jump is crowned and stops there
  const crown = B(['........', '..o.o...', '.x......', '........', '........', '........', '........', '........']);
  const cm = E.moves(crown, 1);
  ok(cm.length === 1 && cm[0].crown && cm[0].caps.length === 1 && cm[0].path.join() === String(sq(0, 3)), 'a jump that crowns a man ends the move, even with another jump in reach');
  const S2 = st(crown.slice());
  E.applyMove(S2, cm[0]);
  ok(S2.board[sq(0, 3)] === 3 && S2.board[sq(1, 2)] === 0 && S2.board[sq(2, 1)] === 0, 'the crowned piece is a king and the jumped man is gone');
  // A player with no move has lost; forty moves each of kings shuffling is a draw
  const last = B(['........', '........', '........', '...o....', '....x...', '........', '........', '........']);
  const S3 = st(last.slice());
  const r3 = E.applyMove(S3, E.moves(S3.board, 1)[0]);
  ok(r3 && r3.over && r3.winner === 1, 'taking the last piece wins');
  const blocked = B(['........', '........', '........', '........', '........', '........', 'o.o.....', '.x...x..']);
  const S4 = st(blocked.slice(), 2);
  ok(E.moves(S4.board, 2).length > 0 && E.moves(B(['.......o', '......x.', '.....x..', '........', '........', '........', '........', '........']), 2).length === 0, 'a blocked piece has no move');
  const kings = B(['.O......', '........', '........', '........', '........', '........', '........', '......X.']);
  const S5 = st(kings.slice());
  for (let i = 0; i < E.DRAW_PLIES.classic && S5.winner < 0; i++) E.applyMove(S5, E.moves(S5.board, S5.turn)[0]);
  ok(S5.winner === 0 && S5.history.length === E.DRAW_PLIES.classic, 'eighty plies without a capture or a man moving is a draw (' + S5.history.length + ')');

  // Spanish draughts, as the issue asked (#357): flying kings, and the capture
  // that takes the most pieces, then the most kings
  const fk = B(['........', '........', '........', '....X...', '........', '........', '........', '........']);
  ok(E.moves(fk, 1, 'classic').length === 4 && E.moves(fk, 1, 'spanish').length === 13, 'a Spanish king flies along its diagonals (13 squares from d5), a classic one steps (4)');
  const far = B(['........', '.......X', '........', '........', '....o...', '........', '........', '........']);
  const fm2 = E.moves(far, 1, 'spanish');
  ok(fm2.length === 3 && fm2.every((m) => m.caps.join() === String(sq(4, 4))) && fm2.map((m) => m.path[0]).sort((a, c) => a - c).join() === [sq(5, 3), sq(6, 2), sq(7, 1)].join(),
    'it captures from a distance and may land on any empty square beyond (' + fm2.length + ' landings)');
  ok(E.moves(far, 1, 'classic').every((m) => !m.caps.length), 'a classic king cannot capture from a distance');
  const qty = B(['........', '........', '.o......', '........', '.o...o..', 'x.....x.', '........', '........']);
  ok(E.moves(qty, 1, 'classic').some((m) => m.caps.length === 1) && E.moves(qty, 1, 'spanish').every((m) => m.caps.length === 2),
    'quantity rule: Spanish keeps only the captures taking the most pieces; classic lets you choose');
  const qual = B(['........', '........', '........', '.O...o..', '..x...x.', '........', '........', '........']);
  const ql = E.moves(qual, 1, 'spanish');
  ok(ql.length === 1 && ql[0].caps.join() === String(sq(3, 1)) && E.moves(qual, 1, 'classic').length === 2, 'quality rule: of equal captures, Spanish must take the king');
  // flying kings soon meet on a diagonal, so the count is started near its end
  const S7 = { mode: '2p', rules: 'spanish', board: kings.slice(), turn: 1, quiet: E.DRAW_PLIES.spanish - 2, history: [], winner: -1 };
  E.applyMove(S7, { from: sq(7, 6), path: [sq(6, 7)] });
  const mid7 = S7.winner;
  E.applyMove(S7, { from: sq(0, 1), path: [sq(1, 0)] });
  ok(E.DRAW_PLIES.spanish === 40 && mid7 === -1 && S7.winner === 0 && S7.quiet === 40, 'Spanish draws on the fortieth king move without a capture, not the thirty-ninth');
  const sp = E.newState('2p', 'spanish'), sr = (() => { let k = 7; return () => ((k = (k * 9301 + 49297) % 233280) / 233280); })();
  let spOk = true;
  for (let i = 0; i < 300 && sp.winner < 0; i++) if (!E.applyMove(sp, E.aiMove(sp.board, sp.turn, i % 2 ? 'hard' : 'easy', sr, 'spanish'))) { spOk = false; break; }
  ok(spOk && sp.winner >= 0 && sp.rules === 'spanish', 'a whole Spanish game between the AIs plays only legal moves and ends (winner ' + sp.winner + ')');
  // Capturing optional, as the reporter plays at home (#391): a jump is one more
  // choice, for either rule set, and a started jump still runs to its end
  const fr = E.moves(forced, 1, 'classic', true);
  ok(fr.length === 4 && fr[0].caps.length === 1 && fr.slice(1).every((m) => !m.caps.length) && fr.some((m) => m.from === sq(4, 4) && !m.caps.length),
    'with optional capture the jump comes first and every step stays legal, the jumping man\'s own included (' + fr.length + ' moves)');
  ok(E.moves(qty, 1, 'spanish', true).some((m) => m.caps.length === 1) && E.moves(qual, 1, 'spanish', true).filter((m) => m.caps.length).length === 2,
    'Spanish quantity and quality rules give way to the choice too');
  const Sf = { mode: '2p', rules: 'classic', free: true, board: forced.slice(), turn: 1, quiet: 0, history: [], winner: -1 };
  const Sx = { mode: '2p', rules: 'classic', board: forced.slice(), turn: 1, quiet: 0, history: [], winner: -1 };
  ok(!!E.applyMove(Sf, { from: sq(2, 6), path: [sq(1, 5)] }) && E.applyMove(Sx, { from: sq(2, 6), path: [sq(1, 5)] }) === null && Sf.board[sq(3, 3)] === 2,
    'a quiet move beside an open jump is played with optional capture and refused without');
  ok(E.applyMove({ mode: '2p', rules: 'classic', free: true, board: dbl.slice(), turn: 1, quiet: 0, history: [], winner: -1 }, { from: sq(5, 2), path: [sq(3, 4)] }) === null,
    'stopping halfway through a double jump stays illegal with optional capture');
  ok(E.newState('ai', 'classic', true).free === true && E.newState('ai').free === false, 'a new game carries the choice, forced by default');
  const frng = (seed) => { let k = seed; return () => ((k = (k * 1103515245 + 12345) % 2147483648) / 2147483648); };
  for (const rules of ['classic', 'spanish']) {
    const F = E.newState('2p', rules, true), fr2 = frng(391);
    let fOk = true, stepsBeside = 0;
    const tf = Date.now();
    for (let i = 0; i < 300 && F.winner < 0; i++) {
      // medium, not hard: hard games here cost about 5 s, which pushed the
      // checkers tests past their 20 s limit on CI (run 39663935567)
      const lv = i % 2 ? 'medium' : 'easy', m = E.aiMove(F.board, F.turn, lv, fr2, rules, true);
      const all = E.moves(F.board, F.turn, rules, true);
      if (m && !m.caps.length && all[0].caps.length) stepsBeside++;
      if (!E.applyMove(F, m)) { fOk = false; break; }
    }
    ok(fOk && F.winner >= 0, 'a whole ' + rules + ' game with optional capture between the AIs plays only legal moves and ends (winner ' + F.winner + ', ' + F.history.length + ' plies, ' + stepsBeside + ' quiet moves beside an open jump, ' + (Date.now() - tf) + ' ms)');
  }
  // measured (#391): hard beat easy 6 of 6 a rule set from both sides, medium
  // beat easy 6 of 6; medium is what is played here, hard costs seconds a game
  const fw = [0, 1, 2, 3, 4, 5].map((g) => {
    const F = E.newState('2p', 'classic', true), r = frng(200 + g), side = g % 2 ? 2 : 1;
    for (let i = 0; i < 400 && F.winner < 0; i++) if (!E.applyMove(F, E.aiMove(F.board, F.turn, F.turn === side ? 'medium' : 'easy', r, 'classic', true))) return -9;
    return F.winner === side ? 1 : 0;
  });
  ok(fw.every((w) => w === 1), 'with optional capture medium still beats easy in 6 of 6 games, from both sides (' + fw.join(',') + ')');
  const tfh = Date.now(); E.aiMove(E.initial(), 1, 'hard', frng(5), 'classic', true); const tFree = Date.now() - tfh;
  ok(tFree < 1500, 'a hard move from the start with optional capture takes under 1.5 s here (' + tFree + ' ms)');
  // (#391 Huevo: every move list also gets the state, for the Queen's edge clock, and Huevo is always optional)
  ok(/prefs\.free = v === 'free';/.test(html) && /free = !daily && \(prefs\.free === true \|\| rules === 'huevo'\);/.test(html) && /E\.aiMove\(S\.board, 2, S\.level, rnd, S\.rules, S\.free, S\)/.test(html) &&
    (html.match(/E\.moves\(S\.board, S\.turn, S\.rules, S\.free, S\)/g) || []).length === 3 && !/E\.moves\(S\.board, S\.turn, S\.rules\)/.test(html) && !/E\.moves\(S\.board, S\.turn, S\.rules, S\.free\)/.test(html) &&
    /var jump = !S\.done && !busy\(\) && !S\.free && /.test(html) && /free: !v\.daily && \(v\.free === true \|\| v\.rules === 'huevo'\),/.test(html),
    'the page offers the choice, keeps the daily game forced, saves it, gives it to the AI and every move list, and drops the "must jump" note');
  ok(/prefs\.rules = v;/.test(html) && /var rules = daily \? 'classic' : prefRules\(\),/.test(html) && /E\.aiMove\(S\.board, 2, S\.level, rnd, S\.rules[,)]/.test(html), 'the page offers both rule sets, keeps the daily game classic and gives the AI the rules in play');

  // Undo puts back exactly what was there, captured pieces included
  const S6 = E.newState('2p');
  for (let i = 0; i < 30 && S6.winner < 0; i++) E.applyMove(S6, E.aiMove(S6.board, S6.turn, 'easy', (() => { let k = i; return () => ((k = (k * 9301 + 49297) % 233280) / 233280); })()));
  const snap = S6.board.join();
  const took = S6.history.reduce((a, h) => a + h.took.length, 0);
  while (S6.history.length) E.takeBack(S6);
  ok(took > 0 && S6.board.join() === E.initial().join() && S6.turn === 1 && snap !== S6.board.join(), 'taking back every move restores the start, with ' + took + ' captures undone');

  // The AI: always legal, and the levels in order. Measured over 10 games a pairing
  // (#357): hard beat medium and easy 10 of 10 from both sides; medium beat easy 7
  // and drew 3.
  const rng = (seed) => { let s = seed; return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648); };
  const match = (l1, l2, seed) => {
    const S = E.newState('2p'), r = rng(seed);
    for (let i = 0; i < 400 && S.winner < 0; i++) {
      const m = E.aiMove(S.board, S.turn, S.turn === 1 ? l1 : l2, r);
      if (!E.applyMove(S, m)) return -9;
    }
    return S.winner;
  };
  const hw = [1, 2, 3, 4].map((k) => match('hard', 'easy', 50 + k)), mw = [1, 2, 3, 4].map((k) => match('medium', 'easy', 70 + k));
  ok(hw.every((w) => w !== -9) && mw.every((w) => w !== -9), 'every AI move is legal');
  ok(hw.filter((w) => w === 1).length >= 4, 'hard beats easy in 4 of 4 games (' + hw.join(',') + ')');
  ok(mw.filter((w) => w === 2).length === 0 && mw.filter((w) => w === 1).length >= 2, 'medium never loses to easy and wins at least 2 of 4 (' + mw.join(',') + ')');
  const tb = Date.now(); E.aiMove(E.initial(), 1, 'hard', rng(5)); const tHard = Date.now() - tb;
  ok(tHard < 1500, 'a hard move from the start takes under 1.5 s here (' + tHard + ' ms)');

  // The daily opening: the same for everyone on a day, and it hands player 1 the move
  const d1 = E.dailyOpening(rng(42), 4), d2 = E.dailyOpening(rng(42), 4);
  ok(d1.board.join() === d2.board.join() && d1.turn === 1 && E.count(d1.board).men[1] + E.count(d1.board).men[2] >= 22, 'the daily opening is seeded, four plies long and ends on player 1\'s turn');
  ok(/var DAILY_PLIES = 4;/.test(html) && /C\.daily\('checkers', daily\)\.rng/.test(html), 'the page seeds it from the day');

  // Page wiring and identity
  const gm = games.find((g) => g.id === 'checkers');
  ok(!!gm && gm.cat === 'board' && gm.daily !== false, 'games.json lists it under board games, with a daily game');
  ok(!!gm && /accent: '([^']+)'/.test(html) && html.match(/accent: '([^']+)'/)[1] === gm.color, 'games.json and the page share the accent');
  const icon = fs.readFileSync(path.join(ROOT, 'www/games/checkers/icon.svg'), 'utf8');
  ok(!!gm && new RegExp('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon), 'the icon starts on the soft tint of games.json');
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const lab = (h) => {
    const [R, G, Bl] = rgb(h).map(lin), f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    const X = (R * 0.4124 + G * 0.3576 + Bl * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + Bl * 0.0722, Z = (R * 0.0193 + G * 0.1192 + Bl * 0.9505) / 1.08883;
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  };
  const dE = (a, b) => { const A = lab(a), Bb = lab(b); return Math.hypot(A[0] - Bb[0], A[1] - Bb[1], A[2] - Bb[2]); };
  const lum = (h) => rgb(h).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
  const near = games.filter((g) => g.id !== 'checkers').map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0];
  ok(near[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5, 'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + ') and keeps white text at 4.5:1');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  ok(['ck-win', 'ck-hard', 'ck-clean'].every((id) => core.indexOf("id: '" + id + "'") > 0 && html.indexOf("unlock('" + id + "')") > 0), 'the three checkers awards exist and are unlocked');
  ok(/class: 'ck-wrap ch-split'/.test(html) && /class: 'ch-fit'/.test(html) && /cv\.width !== px \|\| cv\.height !== px/.test(html), 'the board fills the screen with the core layout (#359) and checks both canvas sides');
  ok(/if \(k === 'Escape' && sel\) \{ sel = null; draw\(\); e\.preventDefault\(\); return; \}/.test(html), 'Escape drops a pick before it would leave the game');
  ok(Date.now() - t0 < 20000, 'the checkers tests finish in under 20 s (' + (Date.now() - t0) + ' ms)');
}

function testJigsaw() {
  head('Jigsaw');
  const t0 = Date.now();
  const E = loadEngine('jigsaw', 'JigsawEngineFactory');
  const html = fs.readFileSync(path.join(ROOT, 'www/games/jigsaw/index.html'), 'utf8');
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  ok(['cut', 'edges', 'outline', 'layout', 'offered', 'picsFor', 'pick', 'deal', 'fits', 'place', 'restore'].every((f) => typeof E[f] === 'function'), 'the engine has its API');
  ok(JSON.stringify(E.COUNTS) === '[12,24,48,96,150]' && E.COUNTS.every((n) => E.CUTS[n][0] * E.CUTS[n][1] === n) && E.DAILY_COUNT === 24 && E.CUTS[96].join() === '8,12' && E.CUTS[150].join() === '10,15',
    '12, 24, 48, 96 (8×12) and 150 (10×15) pieces, each cut into whole rows and columns, and 24 for the daily one (#376)');

  // Piece size on a phone, with the page's own room for the row of pieces and the bars
  const trayH = +((html.match(/var TRAY_H = (\d+)/) || [])[1]);
  const trayW = +((html.match(/TRAY_W = (\d+)/) || [])[1]);
  ok(trayH > 0 && trayW > 0 && typeof E.room === 'function', 'the page\'s layout numbers were found (row ' + trayH + ', column ' + trayW + ')');
  const R = (W, H) => E.room(W, H, trayW, trayH);
  const extra = 110, side = 24;
  // a game page's top bar is about 61px; the rest of the screen is the game's
  const sizes = [];
  for (const [W, H] of [[390, 844], [360, 640]]) {
    for (const n of [12, 24, 48]) {
      const L = E.layout(W - side, H - 61 - trayH - extra, n);
      sizes.push(W + 'x' + H + '/' + n + ': ' + Math.floor(Math.min(L.cw, L.ch)) + 'px');
      ok(Math.min(L.cw, L.ch) >= 44 && L.w <= W - side && L.h <= H - 61 - trayH - extra, 'on a ' + W + '×' + H + ' phone, ' + n + ' pieces are ' + Math.floor(L.cw) + '×' + Math.floor(L.ch) + 'px: at least a fingertip, and the picture fits');
    }
  }
  const L390 = E.layout(390 - side, 844 - 61 - trayH - extra, 48);
  ok(L390.cw >= 58, 'on a 390px phone even 48 pieces are about 60px wide (' + L390.cw.toFixed(1) + ')');
  // 96 is offered everywhere, about 45px a piece on a 390px phone; 150 only where a piece keeps 44px (#376)
  const room = (W, H) => { const r = R(W, H - 61); return [r.w, r.h]; };
  const L96 = E.layout(...room(390, 844), 96), L150 = (W, H) => E.layout(...room(W, H), 150);
  ok(L96.cw >= 44 && L96.ch >= 39, 'on a 390×844 phone 96 pieces are ' + L96.cw.toFixed(1) + '×' + L96.ch.toFixed(1) + 'px');
  const offers = (W, H) => E.offered(...room(W, H)).join();
  ok(offers(390, 844) === '12,24,48,96' && offers(360, 640) === '12,24,48,96' && offers(412, 915) === '12,24,48,96' && offers(1280, 720) === '12,24,48,96' && offers(844, 390) === '12,24,48,96',
    'phones, a phone on its side and a 1280×720 window do not offer 150 pieces (they would be ' + Math.min(L150(390, 844).cw, L150(390, 844).ch).toFixed(1) + ' and ' + Math.min(L150(1280, 720).cw, L150(1280, 720).ch).toFixed(1) + 'px)');
  // a 1280×800 window joined them once the sizes row moved beside the frame (#516): 47px a piece
  ok(offers(768, 1024) === '12,24,48,96,150' && offers(1280, 1024) === '12,24,48,96,150' && offers(1280, 800) === '12,24,48,96,150' && Math.min(L150(1280, 800).cw, L150(1280, 800).ch) >= E.MIN_PIECE && offers(1920, 1080 - 130) === '12,24,48,96,150' && Math.min(L150(768, 1024).cw, L150(768, 1024).ch) >= E.MIN_PIECE,
    'a tablet, a 1280×1024 window and a full-HD browser offer 150 pieces of at least 44px (' + Math.min(L150(768, 1024).cw, L150(768, 1024).ch).toFixed(1) + 'px on the tablet)');
  // #516: on a wide window the pieces go in a column beside the frame, on an upright screen under it
  const pw = (W, H) => { const r = R(W, H); return Math.min(r.w, r.h / E.ASPECT); };
  const below = (W, H) => Math.min(Math.min(W, 900) - side, Math.max(H - trayH - extra, 200) / E.ASPECT);
  ok([[390, 783], [360, 579], [412, 854], [768, 963]].every(([W, H]) => !R(W, H).side && R(W, H).w === Math.min(W, 900) - side && R(W, H).h === H - trayH - extra),
    'phones and an upright tablet keep the row of pieces under the frame, with the same room as before');
  ok([[1920, 950], [1280, 739], [844, 329]].every(([W, H]) => R(W, H).side && pw(W, H) > below(W, H) && R(W, H).w + side + trayW + E.GAP <= W),
    'a full-HD window, a laptop and a phone on its side put the pieces beside the frame, and the picture grows (' + Math.round(below(1920, 950)) + ' → ' + Math.round(pw(1920, 950)) + 'px wide at 1920×950, ' + Math.round(below(844, 329)) + ' → ' + Math.round(pw(844, 329)) + ' on a turned phone)');
  // the reporter's follow-up: the sizes row and the mistakes line go into the column too, so the
  // frame keeps the game area's full height but its padding (889px area at 1920×950: 779 → 864px)
  ok([[1920, 889], [1280, 659], [844, 329]].every(([W, H]) => R(W, H).side && R(W, H).h >= H - 30) && /if \(side\) \{ aside\.append\(top, tray, status\); mid\.append\(frame, aside\); \}/.test(html) && /wrap\.prepend\(top\); wrap\.append\(status\)/.test(html),
    'beside the frame the sizes and the mistakes sit in the column and the picture takes the full height (' + R(1920, 889).h + 'px of 889); under it they go back around the frame');
  ok(/E\.room\(ctx\.main\.clientWidth[^\n]*TRAY_W, TRAY_H\)/.test(html) && /classList\.toggle\('jg-wrap--side', side\)/.test(html) && /\.jg-wrap--side \.jg-tray \{[^}]*overflow-y: auto;[^}]*touch-action: pan-y/.test(html),
    'the page lays out from the engine\'s room and scrolls the side column up and down');
  ok(/side \? Math\.abs\(dx\) < Math\.abs\(dy\) : Math\.abs\(dy\) < Math\.abs\(dx\)/.test(html) && /if \(!side && Math\.abs\(e\.deltaY\)/.test(html),
    'a finger lifts a piece out of the side column sideways, and the wheel scrolls it natively');
  ok(/E\.offered\(r\[0\], r\[1\]\)/.test(html) && /function room\(\) \{/.test(html), 'the page offers the counts from the same room its layout uses');

  // Pictures per size, and a new picture is one not finished yet at that size (#376)
  ok(E.COUNTS.every((n) => E.picsFor(n).length >= 2) && E.PICS.every((id) => ['simple', 'detailed', 'both'].includes(E.FITS[id])) && E.PICS.every((id) => E.COUNTS.some((n) => E.picsFor(n).includes(id))),
    'every count has pictures of its own and every picture is tagged with the sizes it suits (' + E.COUNTS.map((n) => n + ': ' + E.picsFor(n).length).join(', ') + ')');
  ok(E.PICS.filter((id) => E.FITS[id] === 'simple').every((id) => E.picsFor(12).includes(id) && !E.picsFor(48).includes(id)) && E.PICS.filter((id) => E.FITS[id] === 'detailed').every((id) => !E.picsFor(24).includes(id) && E.picsFor(96).includes(id)),
    'simple pictures are offered at 12 and 24 only, detailed ones at 48 and up');
  let pickRuns = 0, pickBad = [];
  for (const n of E.COUNTS) {
    const pool = E.picsFor(n), pr = rng(0x376 + n);
    let fin = [], last = null, round = [], resets = 0;
    for (let g = 0; g < 110; g++) {
      const got = E.pick(n, fin, last, pr);
      pickRuns++;
      if (!pool.includes(got.id)) pickBad.push(n + ': ' + got.id + ' is not for this size');
      if (got.id === last) pickBad.push(n + ': ' + got.id + ' twice in a row');
      if (got.finished.length === 0 && fin.length) { resets++; if (round.length !== pool.length) pickBad.push(n + ': started over after ' + round.length + ' of ' + pool.length); round = []; }
      if (round.includes(got.id)) pickBad.push(n + ': ' + got.id + ' again before the round was over');
      round.push(got.id);
      fin = got.finished.concat([got.id]);
      last = got.id;
    }
    if (resets < Math.floor(110 / pool.length) - 1) pickBad.push(n + ': only ' + resets + ' rounds');
    // a game left unfinished is not counted, and the next one is still another picture
    const a = E.pick(n, [], null, rng(1)), b = E.pick(n, a.finished, a.id, rng(1));
    if (b.id === a.id || b.finished.length) pickBad.push(n + ': an unfinished game counted or repeated');
  }
  ok(pickRuns === 550 && !pickBad.length, 'over 110 finished games per size a picture never comes back before every one of that size is finished, never twice in a row, and an abandoned game is not counted (' + pickRuns + ' picks' + (pickBad.length ? '; ' + pickBad.slice(0, 3).join('; ') : '') + ')');
  const other = E.picsFor(24).filter((id) => !E.picsFor(96).includes(id))[0] || E.picsFor(24)[0];
  ok(!E.pick(96, [other], null, rng(2)).finished.length || !E.picsFor(96).includes(other), 'a picture finished at 24 pieces is still new at 96');
  ok(/prefs\.done\[n\] = got;/.test(html) && /E\.pick\(n, prefs\.done\[n\], prefs\.last, rnd\)/.test(html) && /pool = E\.picsFor\(n\)/.test(html),
    'the page counts a finished picture per size, picks through the engine, and draws the daily picture from the daily size\'s pictures');

  // Edges: a knob on one side is a hole on the other, and the picture's border is straight
  const r = rng(0x1650);
  let edgeOk = 0, edgeAll = 0;
  for (const n of E.COUNTS) {
    const [cols, rows] = E.CUTS[n], K = E.cut(cols, rows, r);
    for (let i = 0; i < n; i++) {
      const e = E.edges(K, i), c = i % cols, row = Math.floor(i / cols);
      edgeAll++;
      const right = c === cols - 1 ? e.right === 0 : (e.right !== 0 && e.right === -E.edges(K, i + 1).left);
      const down = row === rows - 1 ? e.bottom === 0 : (e.bottom !== 0 && e.bottom === -E.edges(K, i + cols).top);
      const border = (row === 0) === (e.top === 0) && (c === 0) === (e.left === 0);
      if (right && down && border) edgeOk++;
    }
  }
  ok(edgeAll === 330 && edgeOk === edgeAll, 'every piece of every cut fits its neighbours and the border is straight (' + edgeOk + ' of ' + edgeAll + ')');

  // The outlines meet: a piece's right side is its right neighbour's left side, point for point
  const sides = (e, cmds) => {
    const out = {}, order = ['top', 'right', 'bottom', 'left'];
    let at = 1, prev = cmds[0].slice(1);
    for (const s of order) {
      const len = e[s] ? 6 : 1, seg = cmds.slice(at, at + len), pts = [prev];
      seg.forEach((c) => { for (let j = 1; j < c.length; j += 2) pts.push([c[j], c[j + 1]]); });
      out[s] = pts;
      prev = seg[seg.length - 1].slice(-2);
      at += len;
    }
    return out;
  };
  const key = (pts, dx, dy) => pts.map((p) => (p[0] + dx).toFixed(3) + ',' + (p[1] + dy).toFixed(3)).sort().join(' ');
  const K2 = E.cut(4, 6, rng(9)), cw = 91, ch = 80.9;
  let meet = 0, tried = 0;
  for (let i = 0; i < 24; i++) {
    const c = i % 4, row = Math.floor(i / 4), e = E.edges(K2, i), me = sides(e, E.outline(e, cw, ch));
    if (c < 3) {
      const en = E.edges(K2, i + 1), nb = sides(en, E.outline(en, cw, ch));
      tried++; if (key(me.right, 0, 0) === key(nb.left, cw, 0)) meet++;
    }
    if (row < 5) {
      const en = E.edges(K2, i + 4), nb = sides(en, E.outline(en, cw, ch));
      tried++; if (key(me.bottom, 0, 0) === key(nb.top, 0, ch)) meet++;
    }
  }
  ok(tried === 38 && meet === tried, 'every shared edge is the same curve from both sides (' + meet + ' of ' + tried + ')');
  const out0 = E.outline({ top: 0, right: 1, bottom: -1, left: 0 }, 100, 100);
  const xs = out0.flatMap((c) => c.slice(1).filter((v, j) => j % 2 === 0)), ys = out0.flatMap((c) => c.slice(1).filter((v, j) => j % 2 === 1));
  ok(Math.max(...xs) <= 100 + E.TAB * 100 + 1e-9 && Math.max(...xs) > 125 && Math.max(...ys) <= 100 && Math.min(...ys) >= 0 && Math.min(...xs) >= 0, 'a knob reaches out about a third of its edge and a hole stays inside the piece');

  // Dealing, dropping, saving
  const S = E.deal(12, 77, rng(77), 'lake');
  ok(S.tray.slice().sort((a, b) => a - b).join(',') === '0,1,2,3,4,5,6,7,8,9,10,11' && !S.placed.length && S.pic === 'lake' && S.cols === 3 && S.rows === 4, 'a deal puts every piece in the row once, shuffled');
  ok(E.deal(24, 5, rng(5), 'night').tray.join() === E.deal(24, 5, rng(5), 'night').tray.join(), 'the same seed deals the same row, so the daily jigsaw is the same for everyone');
  ok(E.fits(S, 4, 100, 100, 100, 100) && E.fits(S, 4, 129, 71, 100, 100) && !E.fits(S, 4, 131, 100, 100, 100) && !E.fits(S, 4, 100, 69, 100, 100) && !E.fits(S, 5, 100, 100, 100, 100),
    'a piece snaps within three tenths of a cell of its own place, and nowhere else');
  ok(E.place(S, 4) && !E.place(S, 4) && S.tray.length === 11 && S.placed[0] === 4 && !S.done, 'a placed piece leaves the row once and locks');
  S.tray.slice().forEach((p) => E.place(S, p));
  ok(S.done && S.placed.length === 12, 'the last piece finishes the picture');
  const sv = { count: 24, seed: 9, pic: 'garden', tray: [3, 1, 2], placed: [0].concat(Array.from({ length: 20 }, (_, i) => i + 4)), misses: 2 };
  ok(!!E.restore(sv) && E.restore(sv).tray.length === 3 && !E.restore(sv).done, 'a whole save is taken back');
  ok(!E.restore(Object.assign({}, sv, { tray: [3, 3, 2] })) && !E.restore(Object.assign({}, sv, { pic: 'photo' })) && !E.restore(Object.assign({}, sv, { count: 20 })) && !E.restore(Object.assign({}, sv, { tray: [3, 1] })) && !E.restore(null),
    'a broken save is dropped: a doubled piece, an unknown picture, a wrong count, a missing piece');

  // The pictures are our own, drawn in code
  const drawn = (html.match(/var DRAW = \{([^}]*)\}/) || [])[1] || '';
  ok(E.PICS.length === 100 && new Set(E.PICS).size === E.PICS.length && E.PICS.every((id) => new RegExp('\\b' + id + ': ' + id + '\\b').test(drawn) && new RegExp('function ' + id + '\\(g\\)').test(html)), 'each of the ' + E.PICS.length + ' pictures has its own drawing function');
  // Every picture really draws, on a canvas that records what it is told (#376). Its shapes,
  // with the colours left out, must differ from every other picture's: a recolour is not a picture.
  const picSrc = (html.match(/function JigsawPictures\(\) \{[\s\S]*?\n\}\n/) || [''])[0];
  const picBox = { console };
  vm.createContext(picBox);
  vm.runInContext(picSrc + '\nthis.P = JigsawPictures();', picBox, { filename: 'jigsaw-pictures.js' });
  const P = picBox.P, shapes = new Map(), weak = [], broke = [];
  const fakeCanvas = () => {
    const log = [], colours = new Set(), round = (v) => typeof v === 'number' ? Math.round(v * 10) / 10 : typeof v;
    const grad = { addColorStop: (o, c) => colours.add(c) };
    const c = new Proxy({}, {
      get: (t, k) => {
        if (k === 'log') return log;
        if (k === 'colours') return colours;
        if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
        if (typeof k === 'string' && /^[a-z]/i.test(k) && !(k in t)) return (...a) => { log.push(k + '(' + a.map(round).join(',') + ')'); };
        return t[k];
      },
      set: (t, k, v) => { if (k === 'fillStyle' || k === 'strokeStyle') { if (typeof v === 'string') colours.add(v); } else t[k] = v; return true; }
    });
    return c;
  };
  for (const id of E.PICS) {
    const cx = fakeCanvas();
    try { P.draw(id, cx, 300, 400); } catch (e) { broke.push(id + ': ' + e.message); continue; }
    const paints = cx.log.filter((l) => /^(fill|stroke|fillRect)\(/.test(l)).length, sig = cx.log.join(';');
    if (paints < 15 || cx.colours.size < 4) weak.push(id + ' (' + paints + ' shapes, ' + cx.colours.size + ' colours)');
    if (shapes.has(sig)) weak.push(id + ' draws the same shapes as ' + shapes.get(sig));
    shapes.set(sig, id);
  }
  ok(JSON.stringify(P.ids.slice().sort()) === JSON.stringify(E.PICS.slice().sort()), 'the engine and the drawings list the same ' + E.PICS.length + ' pictures');
  ok(shapes.size === E.PICS.length && !broke.length && !weak.length, 'every picture draws at least 15 shapes in 4 colours or more, and no two share their shapes (' + shapes.size + ' drawn' + (broke.length ? '; broke: ' + broke.slice(0, 3).join(', ') : '') + (weak.length ? '; ' + weak.slice(0, 3).join(', ') : '') + ')');
  const langs = LOCALE_CODES, blocks = langs.map((l) => (html.match(new RegExp('\\n      ' + l + ': \\{([\\s\\S]*?)\\n      \\}')) || [])[1] || '');
  const unnamed = [];
  E.PICS.forEach((id) => blocks.forEach((b, i) => { if (!new RegExp('\\bpic_' + id + ": '[^']+'").test(b)) unnamed.push(langs[i] + ':' + id); }));
  ok(blocks.every((b) => b.length > 500) && !unnamed.length, 'every picture has a name in every language (' + E.PICS.length * LOCALE_CODES.length + ' names' + (unnamed.length ? '; missing ' + unnamed.slice(0, 5).join(', ') : '') + ')');
  ok(!/<img\b|data:image|url\(|new Image\(|\.png|\.jpe?g|\.webp/i.test(html), 'the page loads no image of any kind: no photo, no file, no data URL');

  // Page wiring and identity
  const gm = games.find((x) => x.id === 'jigsaw');
  ok(!!gm && gm.cat === 'puzzle' && gm.daily !== false, 'games.json lists it under puzzles, with a daily jigsaw');
  ok(!!gm && /accent: '([^']+)'/.test(html) && html.match(/accent: '([^']+)'/)[1] === gm.color, 'games.json and the page share the accent');
  const icon = fs.readFileSync(path.join(ROOT, 'www/games/jigsaw/icon.svg'), 'utf8');
  ok(!!gm && new RegExp('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon), 'the icon starts on the soft tint of games.json');
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const lab = (h) => {
    const [R, G, B] = rgb(h).map(lin), f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  };
  const dE = (a, b) => { const A = lab(a), B = lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
  const lum = (h) => rgb(h).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
  const nearest = games.filter((x) => x.id !== 'jigsaw').map((x) => [x.id, dE(x.color, gm.color)]).sort((x, y) => x[1] - y[1])[0];
  ok(nearest[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5, 'the accent differs from every other game by ΔE ≥ 15 (nearest ' + nearest[0] + ', ' + nearest[1].toFixed(1) + ') and keeps white text at 4.5:1');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  ok(['jg-win', 'jg-48', 'jg-clean'].every((id) => new RegExp("\\{ id: '" + id + "',[^\\n]*dde: '[^\\n]*des: '").test(core) && html.indexOf("unlock('" + id + "')") > 0), 'the three Jigsaw awards exist in every language and are unlocked');
  ok(/C\.daily\('jigsaw', daily\)/.test(html) && /newGame\(E\.DAILY_COUNT, dailyDate\)/.test(html) && /C\.stats\.daily\('jigsaw', S\.daily/.test(html), 'the daily picture and cut come from the day\'s seed and the time is recorded');
  ok(/\.jg-frame \{\s*direction: ltr;/.test(html) && /\.jg-tray \{\s*direction: ltr;/.test(html) && /touch-action: pan-x;/.test(html), 'the picture is not mirrored in Persian, and the row scrolls sideways while an upward drag lifts a piece');
  ok(/ctx\.autosave\(/.test(html) && /ctx\.tutorialIfNew\(TUT\)/.test(html) && /function landed\(i, from\) \{[\s\S]*?save\(\);/.test(html) && /function missed\(i\) \{[\s\S]*?save\(\);/.test(html), 'the game saves after every drop and shows its tutorial once');
  ok(!/[\s{,]again: '/.test(html), 'the page leaves the core\'s "again" label alone');
  ok(Date.now() - t0 < 5000, 'the Jigsaw group runs in under five seconds (' + (Date.now() - t0) + 'ms; ' + sizes.join(', ') + ')');
}

/* ------------------------------- Core labels a game must not redefine (#318) */
// ctx.finish labels the result window's play-again button with the core's
// 'again'. Ludo's strings defined 'again' for "roll again after a six", so its
// button read "Roll again" from #303 until #318.
// Boards fill the screen they are on (#359). Most games stopped their board at a
// fixed 400-620px (Sudoku at min(94vw, 62vh, 520px)), so on a 7-inch phone, a
// tablet or a laptop the board sat in a third to a half of the screen. A game
// listed here sizes its board with the core's .ch-fit slot and keeps no fixed cap.
const FIT_GAMES = ['sudoku', 'reversi', 'dots', 'peg', 'gomoku', 'go', 'chess', 'bridges', 'morris', 'sliding', 'ludo', 'snakes', 'darts', 'chain', 'bowling', 'tower-defence', 'mancala', 'backgammon'];
function testFitScreen() {
  head('Boards fill the screen (#359)');
  const css = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8');
  ok(/\.ch-gamemain \{ container: game \/ size; \}/.test(css), 'the game area is a size container named game');
  ok(/\.ch-fit > \* \{ width: min\(100cqw, 100cqh \* var\(--fit-ar, 1\)\);/.test(css), 'a .ch-fit slot sizes its board by the width and the height it has');
  // #474: the slot's one grid cell grew to the canvas drawn in it, so after turning the
  // phone six canvas games read their upright size back and ran off the screen
  const fitRule = (css.match(/\.ch-fit \{[\s\S]*?\n\}/) || [''])[0];
  ok(/grid-template: minmax\(0, 1fr\) \/ minmax\(0, 1fr\);/.test(fitRule), 'the .ch-fit cell is the slot\'s own size, not its content\'s, so a turned phone redraws the board to fit');
  ok(/@container game \(min-aspect-ratio: 5 \/ 4\) \{\n  \.ch-split \{ flex-direction: row; \}/.test(css), 'in a wide window a .ch-split game puts its other rows beside the board');
  // #469: a bare "--fit-ar: 8 / 9" made calc(100cqw / var(--fit-ar)) mean 100cqw / 8 / 9,
  // a board 72 times too short on an upright phone; a ratio given as a fraction needs calc()
  const allGames = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  const bareRatio = allGames.filter((g) => /--fit-ar:\s*\d+(\.\d+)?\s*\/\s*\d/.test(fs.readFileSync(path.join(ROOT, 'www', g.path), 'utf8'))).map((g) => g.id);
  ok(allGames.length > 0 && !bareRatio.length, 'no game gives --fit-ar as a bare fraction' + (bareRatio.length ? ' (' + bareRatio.join(', ') + ')' : ''));
  ok(FIT_GAMES.length > 0, 'the list of fitted games is not empty');
  for (const id of FIT_GAMES) {
    const html = fs.readFileSync(path.join(ROOT, 'www/games', id, 'index.html'), 'utf8');
    const style = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
    const caps = style.split('\n').filter((l) => /max-width:[^;]*vh[^;]*\d+px|max-width:[^;]*\d+px[^;]*vh/.test(l));
    ok(/class: '(?:[\w-]+ )?ch-fit'/.test(html), id + ': the board sits in a .ch-fit slot');
    ok(caps.length === 0, id + ': no fixed pixel cap on the board' + (caps.length ? ' (' + caps[0].trim() + ')' : ''));
    // className = '…' on a row would drop its ch-above and move it below the board (chess, #359)
    ok(!/\b(box|row|top\w*|playersRow)\.className = /.test(html), id + ': layout rows keep their classes (classList, not className)');
  }
  // Layouts at fixed pixel sizes are zoomed to the game area by the core
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const fsSrc = (core.match(/  ui\.fitScale = (function \(w, h, roomW, roomH, lo, hi\) \{[\s\S]*?\n  \});/) || [])[1];
  ok(!!fsSrc, 'the core has fitScale');
  if (fsSrc) {
    const fitScale = vm.runInNewContext('(' + fsSrc + ')');
    ok(Math.abs(fitScale(440, 640, 1236, 1180, 0.7, 2) - 1.84) < 0.01, 'a 440×640 column on a 10-inch tablet zooms to 1.84, limited by its height');
    ok(fitScale(440, 640, 1856, 1400, 0.7, 2) === 2, 'on a big desktop it stops at 2');
    ok(fitScale(366, 600, 366, 700, 0.7, 2) === 1, 'on the phone it was made for it stays at 1');
    ok(fitScale(440, 640, 820, 300, 0.7, 2) === 0.7 && fitScale(0, 640, 820, 300, 0.7, 2) === 1, 'it never goes below the floor, and an unmeasured layout stays at 1');
  }
  const mm = fs.readFileSync(path.join(ROOT, 'www/games/mastermind/index.html'), 'utf8');
  ok(/var refit = C\.ui\.zoomFit\(wrap, ctx\.main\);/.test(mm) && /if \(refit\) refit\(\);/.test(mm), 'mastermind zooms its column to the game area and refits after each render');
  // Games that size their board in code: no fixed cap on the width or the cell
  const src = (id) => fs.readFileSync(path.join(ROOT, 'www/games', id, 'index.html'), 'utf8');
  ok(/var cell = Math\.min\(110, /.test(src('wayout')) && !/720/.test(src('wayout')), 'way out: cells up to 110px, no 720px cap (its first levels were a 224px square)');
  ok(/var k = Math\.min\(availW \/ VW, Math\.max\(96, availH\) \/ VH, 3\);/.test(src('gridlock')) && !/Math\.min\(wrap\.clientWidth \|\| \d+, \d+\)/.test(src('gridlock')) && /@container game \(min-aspect-ratio: 5 \/ 4\)/.test(src('gridlock')),
    'gridlock: the lot scales up to 3x, has no width cap, and moves its column beside the lot in any wide game area');
  ok(/Math\.min\(110, Math\.floor\(/.test(src('mahjong')) && !/Math\.min\(wrap\.clientWidth \|\| 360, 980\)/.test(src('mahjong')), 'mahjong: tiles up to 110px wide, no 980px cap');
  const bsBox = (src('battleship').match(/\.bs-box[^{]*\{[^}]*\}/g) || []);
  ok(bsBox.length >= 4 && bsBox.every((r) => !/max-width:[^;]*\dpx/.test(r)), 'battleship: the seas have no pixel cap (' + bsBox.length + ' rules)');
  // A new canvas is 300×150: resizing only when the width differed left a 300px-wide
  // board with a 150px backing, drawn squashed (Ludo in phone landscape, #359)
  const gameIds = fs.readdirSync(path.join(ROOT, 'www/games')).filter((d) => fs.existsSync(path.join(ROOT, 'www/games', d, 'index.html')));
  // canvas games size the board from the slot, not from a fixed 520-560px and a guess at the window
  ok(/var maxW = laneBox\.clientWidth \|\| 360, maxH = laneBox\.clientHeight \|\| /.test(src('bowling')), 'bowling: the lane is sized from its slot, not 460px and a guess at the window');
  ok(/cw = Math\.floor\(Math\.min\(bw, bh \* 0\.66\)\);/.test(src('backgammon')), 'backgammon: no 560px cap on the board');
  for (const id of ['ludo', 'snakes', 'darts', 'chain']) ok(/var maxW = boardBox\.clientWidth \|\| 360, maxH = boardBox\.clientHeight \|\| /.test(src(id)), id + ': the board is sized from its slot');
  const widthOnly = gameIds.filter((id) => /if \(\w+\.width !== [^|{]*\) \{/.test(src(id)));
  ok(gameIds.length >= 30 && widthOnly.length === 0, 'every canvas checks both sides before reusing its backing (' + (widthOnly.join(', ') || gameIds.length + ' games') + ')');
  // Card games: the card width follows the game area's width and height, not the window's
  // width up to 60-76px (#359), and the table widens with the cards
  for (const [id, cls] of [['pasur', 'ps-wrap'], ['hokm', 'hk-wrap'], ['blackjack', 'bj-wrap']]) {
    const h = src(id), cw = (h.match(new RegExp('\\.' + cls + ' \\{[^}]*--cw: ([^;]+);')) || [])[1] || '';
    const top = +((cw.match(/(\d+)px\)$/) || [])[1] || 0);
    ok(/cqw/.test(cw) && /cqh/.test(cw) && top >= 100, id + ': cards size by the game area\'s width and height, up to ' + top + 'px (' + cw + ')');
    ok(new RegExp('\\.' + cls + ' \\{[^}]*max-width: max\\(560px, calc\\(var\\(--cw\\) \\* [\\d.]+\\)\\)').test(h), id + ': the table widens with the cards');
  }
}

function testCoreLabels() {
  head('Core labels');
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  ok(games.length > 0, 'games.json lists games');
  for (const g of games) {
    const html = fs.readFileSync(path.join(ROOT, 'www', g.path), 'utf8');
    ok(!/[\s{,]again: '/.test(html), g.id + ': its strings leave the core\'s "again" label alone');
  }
  // The update button read «آپدیت», a loanword, while the privacy page already said
  // «به‌روزرسانی» (#323). Only quoted strings count: comments may still say it.
  const files = ['www/lib/chogan.js', 'www/index.html'].concat(games.map((g) => 'www/' + g.path));
  const loan = files.filter((f) => /'[^'\n]*آپدیت[^'\n]*'/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  ok(loan.length === 0, 'no Persian UI string says «آپدیت»' + (loan.length ? ' (' + loan.join(', ') + ')' : ''));
  // #338: a canvas board is drawn left to right in every language, so an arrow
  // that flips in RTL moves the wrong way there (Gomoku, Go, Chain Reaction)
  const canvasArrows = ['gomoku', 'go', 'chain'];
  for (const id of canvasArrows) {
    const html = fs.readFileSync(path.join(ROOT, 'www/games', id, 'index.html'), 'utf8');
    ok(/createElement\('canvas'\)/.test(html) && /ArrowLeft: \[0, -1\], ArrowRight: \[0, 1\]/.test(html) && !/ArrowLeft[^\n]*isRtl/.test(html),
      id + ': left and right move left and right on its canvas board in every language');
  }
}

/* ------------------------------------------------------- Darts (#313) */
function testDarts() {
  head('Darts');
  const t0 = Date.now();
  const E = loadEngine('darts', 'DartsEngineFactory');
  const html = fs.readFileSync(path.join(ROOT, 'www/games/darts/index.html'), 'utf8');
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;

  // The board: numbers clockwise from 20 at the top, rings at their real radii
  ok(E.ORDER.join() === '20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5', 'the numbers run clockwise in the standard order');
  ok(E.hit(0, 0).label === 'BULL' && E.hit(0, 0).score === 50 && E.hit(0, 0).m === 2, 'the bullseye scores 50 and counts as a double');
  ok(E.hit(0.07, 0).label === '25' && E.hit(0, -0.6).label === 'T20' && E.hit(0, -0.98).label === 'D20' && E.hit(0, -0.8).label === 'S20' && E.hit(0, -1.02).label === 'MISS',
    'bull ring, treble, double, single and outside, straight up from the centre');
  ok(E.hit(0.6, 0).label === 'T6' && E.hit(0, 0.6).label === 'T3' && E.hit(-0.6, 0).label === 'T11', 'right is 6, down is 3, left is 11');
  const labels = [];
  for (const n of E.ORDER) for (const m of ['S', 'D', 'T']) labels.push(m + n);
  labels.push('25', 'BULL');
  const off = labels.filter((l) => { const p = E.aimPoint(l); return E.hit(p[0], p[1]).label !== l; });
  ok(labels.length === 62 && off.length === 0, 'aiming at the middle of each of the 62 beds hits that bed' + (off.length ? ' (' + off.join(',') + ')' : ''));

  // The dart is big enough to see (#358): the first drawing was 0.19 board radii
  // long with a 0.026 barrel, and on a phone the owner could barely find it
  ok(E.DART && E.DART.barrel + E.DART.shaft + E.DART.fin >= 0.35 && E.DART.width >= 0.05,
    'a dart on the board is drawn at least 0.35 board radii long and 0.05 wide (' + JSON.stringify(E.DART) + ')');
  // The flight is an arc, not the first straight line (#358): halfway, the dart is
  // well above the straight line from the hand to the board, it starts and ends
  // where it should, and it points up while rising and down while dropping in
  ok(typeof E.arc === 'function', 'the engine describes the flight path');
  if (typeof E.arc === 'function') {
    const a0 = E.arc(0, 0, 1.3, 0.2, -0.6, 0.75), a5 = E.arc(0.5, 0, 1.3, 0.2, -0.6, 0.75), a1 = E.arc(1, 0, 1.3, 0.2, -0.6, 0.75);
    const lineY = (1.3 + -0.6) / 2;
    ok(Math.abs(a0.x) < 1e-9 && Math.abs(a0.y - 1.3) < 1e-9 && Math.abs(a1.x - 0.2) < 1e-9 && Math.abs(a1.y + 0.6) < 1e-9, 'the flight starts at the hand and ends on the hit point');
    ok(lineY - a5.y >= 0.5, 'halfway, the dart is at least half a board radius above the straight line (' + (lineY - a5.y).toFixed(2) + ')');
    ok(Math.abs(a0.dir) < Math.PI / 2 && Math.abs(a1.dir) > Math.PI / 2, 'it points upward as it leaves the hand and downward as it lands');
  }
  // The hit sound's tones sit where phone speakers play them (#358): a body at
  // 150 Hz and below came out as only a tick
  const thud = (fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8').match(/\n    thud: function \(\) \{([\s\S]*?)\n    \},/) || [])[1] || '';
  const thudTones = [...thud.matchAll(/tone\(\{ freq: (\d+)/g)].map((m) => +m[1]);
  ok(thudTones.length >= 1 && thudTones.every((f) => f >= 180), 'every tone of the dart hit starts at 180 Hz or more (' + thudTones.join(', ') + ')');

  // Checkouts: every score from 2 to 170 that can be finished in three darts
  const none = [];
  let wrong = 0;
  for (let r = 2; r <= 170; r++) {
    const co = E.checkout(r, 3);
    if (!co) { none.push(r); continue; }
    const hits = co.map((l) => { const p = E.aimPoint(l); return E.hit(p[0], p[1]); });
    if (hits.reduce((a, h) => a + h.score, 0) !== r || hits[hits.length - 1].m !== 2) wrong++;
  }
  ok(none.join() === '159,162,163,165,166,168,169', 'exactly the seven scores with no three-dart finish have none (' + none.join(',') + ')');
  ok(wrong === 0, 'every suggested finish adds up and ends on a double');
  ok(E.checkout(170, 3).join() === 'T20,T20,BULL' && E.checkout(40, 1).join() === 'D20' && E.checkout(50, 1).join() === 'BULL' && E.checkout(100, 2).join() === 'T20,D20',
    'the classic finishes: 170, 40, 50 and 100');
  ok(E.checkout(1, 3) === null && E.checkout(171, 3) === null && E.checkout(41, 1) === null, 'no finish from 1, above 170, or an odd score with one dart');

  // Scoring, busts and turns
  const H = (l) => { const p = E.aimPoint(l); return E.hit(p[0], p[1]); };
  let S = E.newGame(2, 501), r = E.throwDart(S, H('T20'));
  ok(r.state.rem[0] === 441 && r.state.turn === 0 && !r.over, 'a dart comes off the score and the turn goes on');
  r = E.throwDart(E.throwDart(r.state, H('T20')).state, H('T20'));
  ok(r.over && r.state.rem[0] === 321 && r.state.turn === 1 && r.state.last.total === 180 && r.state.darts.length === 0, 'three darts end the turn; 180 is the turn\'s total');
  S = E.newGame(2, 501); S.rem[0] = 40; S.turnStart = 40;
  r = E.throwDart(S, H('S20'));
  r = E.throwDart(r.state, H('T20'));
  ok(r.bust && r.over && r.state.rem[0] === 40 && r.state.turn === 1, 'going below zero is a bust: the score goes back to the turn\'s start');
  S = E.newGame(2, 501); S.rem[0] = 21; S.turnStart = 21;
  ok(E.throwDart(S, H('S20')).bust, 'leaving one is a bust');
  S = E.newGame(2, 501); S.rem[0] = 20; S.turnStart = 20;
  ok(E.throwDart(S, H('S20')).bust && !E.throwDart(S, H('D10')).bust && E.throwDart(S, H('D10')).won, 'zero needs a double');
  S.rem[0] = 50; S.turnStart = 50;
  ok(E.throwDart(S, H('BULL')).won && E.throwDart(E.throwDart(S, H('BULL')).state, H('T20')) === null, 'the bullseye finishes 50, and nothing is thrown after the win');
  S = E.newGame(1, 301);
  r = E.throwDart(E.throwDart(E.throwDart(S, H('S1')).state, H('S1')).state, H('S1'));
  ok(r.state.turn === 0 && r.state.rem[0] === 298 && r.state.thrown[0] === 3, 'alone, every turn is yours');

  // Bots: legal aims, full games end, and the levels are in order
  let aimBad = 0;
  for (let rem = 2; rem <= 501; rem++) {
    const st = E.newGame(1, 501); st.rem[0] = rem; st.turnStart = rem;
    const h = H(E.think(st)), left = rem - h.score, co = E.checkout(rem, 3);
    if (co ? h.label !== co[0] : (left < 2 && left !== 0)) aimBad++;
  }
  ok(aimBad === 0, 'a bot aims at a finish when it has one, and never at a bust otherwise (' + aimBad + ' wrong)');
  const solo = (lv, seed) => {
    const rr = rng(seed);
    let st = E.newGame(1, 501), k = 0;
    while (st.winner < 0 && k++ < 600) { const p = E.aimPoint(E.think(st)), d = E.land(p[0], p[1], E.SPREAD[lv], rr); st = E.throwDart(st, d.hit).state; }
    return st.winner === 0 ? st.thrown[0] : Infinity;
  };
  const med = (lv) => { const a = []; for (let i = 0; i < 120; i++) a.push(solo(lv, 7000 + i)); a.sort((x, y) => x - y); return a[60]; };
  const me = med('easy'), mm = med('medium'), mh = med('hard');
  // Top professionals finish 501 in about 15 to 18 darts; a bot at that level
  // (the first tuning, 17) beat a steady human every time, so hard stays above 20
  ok(isFinite(me) && me > mm && mm > mh && mh >= 20, 'harder bots finish 501 in fewer darts, and even hard is no world champion (' + me + ', ' + mm + ', ' + mh + ')');
  ok(me <= 70, 'the easy bot still finishes a 501 in a sensible number of darts (median ' + me + ')');
  let hw = 0;
  for (let i = 0; i < 120; i++) {
    const rr = rng(9000 + i), first = i % 2;
    let st = E.newGame(2, 301), k = 0;
    while (st.winner < 0 && k++ < 800) {
      const lv = (st.turn === 0) !== !!first ? 'hard' : 'medium';
      const p = E.aimPoint(E.think(st)), d = E.land(p[0], p[1], E.SPREAD[lv], rr);
      st = E.throwDart(st, d.hit).state;
    }
    if ((st.winner === 0) !== !!first) hw++;
  }
  ok(hw >= 72, 'hard beats medium in most games of 301 (' + hw + ' of 120)');

  // Page wiring and identity
  const gm = games.find((g) => g.id === 'darts');
  ok(!!gm && gm.cat === 'skill' && gm.daily !== false, 'games.json lists it under skill games, with a daily challenge');
  ok(!!gm && /accent: '([^']+)'/.test(html) && html.match(/accent: '([^']+)'/)[1] === gm.color, 'games.json and the page share the accent');
  const icon = fs.readFileSync(path.join(ROOT, 'www/games/darts/icon.svg'), 'utf8');
  ok(!!gm && new RegExp('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon), 'the icon starts on the soft tint of games.json');
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const lab = (h) => {
    const [R, G, B] = rgb(h).map(lin), f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  };
  const dE = (a, b) => { const A = lab(a), B = lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
  const lum = (h) => rgb(h).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
  const near = games.filter((g) => g.id !== 'darts').map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0];
  ok(near[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5, 'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + ') and keeps white text at 4.5:1');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  ok(['dr-win', 'dr-hard', 'dt-180'].every((id) => core.indexOf("id: '" + id + "'") > 0 && html.indexOf("unlock('" + id + "')") > 0), 'the three darts awards exist and are unlocked');
  // The reporter asked for real sounds: a whoosh on the throw and a thud on the board, from the core
  ok(/    whoosh: function \(\) \{\n(      var b = now\(\);\n)?      noise\(/.test(core) && /    thud: function \(\) \{[\s\S]{0,80}noise\(/.test(core) && /whoosh: \['whoosh', null\], thud: \['thud', 'tap'\]/.test(core), 'the core has a whoosh and a thud, the whoosh without a buzz');
  ok(/if \(m\[1\]\) Chogan\.haptic\(m\[1\]\);/.test(core), 'feedback with no vibration does not fall back to a tap buzz');
  ok(/C\.feedback\('whoosh'\)/.test(html) && /C\.feedback\(h\.m \? 'thud' : 'tap'\)/.test(html), 'a throw whooshes and a dart on the board thuds');
  ok(/C\.daily\('darts', G\.daily \+ '\|' \+ G\.s\.thrown\[0\]\)\.rng/.test(html) && /C\.stats\.daily\('darts', G\.daily/.test(html) && /DAILY_DARTS = 60/.test(html), 'the daily scatter comes from the day and the dart number, is recorded, and stops after 60 darts');
  ok(/ctx\.autosave\(/.test(html) && /ctx\.tutorialIfNew\(TUT\)/.test(html), 'the game autosaves and shows its tutorial once');
  // The two-line aim (#372): an even sweep from edge to edge and back
  ok(typeof E.sweep === 'function', 'the engine has the aiming sweep');
  if (typeof E.sweep === 'function') {
    const at = [0, 0.25, 0.5, 1, 1.5, 2, 2.5, 3].map((u) => +E.sweep(u).toFixed(9));
    ok(JSON.stringify(at) === JSON.stringify([-1, -0.5, 0, 1, 0, -1, 0, 1]), 'the sweep runs -1 to 1 and back at an even speed (' + at + ')');
    let even = true;
    for (let u = 0; u < 4; u += 0.01) if (Math.abs(Math.abs(E.sweep(u + 0.01) - E.sweep(u)) - 0.02) > 1e-9 && Math.floor(u) === Math.floor(u + 0.01)) even = false;
    ok(even, 'the sweep never speeds up or slows down within a pass');
  }
  const reach = +(html.match(/BAR_REACH = ([\d.]+)/) || [])[1];
  ok(reach > 1 && reach < 1.28, 'the lines reach past the double ring but stay on the board (' + reach + ')');
  ok(/if \(prefs\.aim !== 'bars'\) prefs\.aim = 'drag';/.test(html) && /prefs\.aim = prefs\.aim === 'bars' \? 'drag' : 'bars';\s*ctx\.store\.set\('prefs', prefs\);/.test(html), 'the aim control switches both ways and is remembered');
  ok(/if \(prefs\.aim === 'bars'\) \{ G\.msg = ''; stopBar\(\); return; \}/.test(html) && /if \(k === ' ' \|\| k === 'Enter'\) \{ e\.preventDefault\(\); G\.msg = ''; stopBar\(\); \}/.test(html), 'a tap or Space stops the lines in the two-line control');
  ok((html.match(/top\.appendChild\(aimToggle\(\)\)/g) || []).length === 2, 'the aim switch shows in normal games and in the daily');
  ok(/draw\(\);\s*(\/\/[^\n]*\s*)?if \(barsRun\(\)\) kick\(\);\s*\}/.test(html) && /\|\| barsRun\(\)\) && !document\.hidden\) raf = requestAnimationFrame\(loop\)/.test(html), 'every new turn restarts the two-line loop, and a dialog does not stop it (#374)');
  ok(Date.now() - t0 < 8000, 'the Darts group runs in under eight seconds (' + (Date.now() - t0) + 'ms)');
}

/* ----------------------------------------------------- Bowling (#313) */
function testBowling() {
  head('Bowling');
  const t0 = Date.now();
  const E = loadEngine('bowling', 'BowlingEngineFactory');
  const html = fs.readFileSync(path.join(ROOT, 'www/games/bowling/index.html'), 'utf8');
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  const full = () => Array(10).fill(true);

  // The rack: ten pins on the standard triangle, 12 inches (0.286 lane) apart
  const P = E.PINS;
  ok(P.length === 10 && P[0][0] === 0 && P[0][1] === E.HEAD, 'pin 1 stands alone in front, in the middle');
  ok([[1, 2], [3, 4, 5], [6, 7, 8, 9]].every((row) => row.every((i) => Math.abs(P[i][1] - P[row[0]][1]) < 1e-9)) && P[6][0] < 0 && P[9][0] > 0,
    'rows of two, three and four behind it, 7 on the left and 10 on the right');
  let near = Infinity;
  for (let i = 0; i < 10; i++) for (let j = i + 1; j < 10; j++) near = Math.min(near, Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]));
  ok(Math.abs(near - 0.286) < 0.005, 'neighbouring pins are 12 inches apart (' + near.toFixed(3) + ' lane)');

  // Scoring
  const play = (rolls, players) => {
    let S = E.newGame(players || 1);
    for (const n of rolls) { const d = S.standing.map((up, i) => false); let k = n; for (let i = 0; i < 10 && k > 0; i++) if (S.standing[i]) { d[i] = true; k--; } S = E.roll(S, d).state; }
    return S;
  };
  let S = play(Array(12).fill(10));
  ok(S.done && E.total(S.frames[0]) === 300 && E.score(S.frames[0]).join() === '30,60,90,120,150,180,210,240,270,300', 'twelve strikes are a perfect 300, frame by frame');
  S = play(Array(21).fill(5));
  ok(S.done && E.total(S.frames[0]) === 150, 'all fives and spares make 150');
  S = play(Array(20).fill(0));
  ok(S.done && E.total(S.frames[0]) === 0 && S.frames[0][9].length === 2, 'twenty gutter balls are 0, and the tenth frame has no bonus');
  S = play([10, 7, 3, 9, 0, 10, 0, 8, 8, 2, 0, 6, 10, 10, 10, 8, 1]);
  ok(S.done && E.score(S.frames[0]).join() === '20,39,48,66,74,84,90,120,148,167', 'a known card scores 167 frame by frame');
  S = play([10, 10]);
  ok(E.score(S.frames[0])[0] === null && !S.done, 'a strike waits for its two bonus balls before it is scored');
  S = play([7, 3, 10], 2);
  ok(S.frames[0][0].join() === '7,3' && S.frames[1][0].join() === '10' && S.turn === 0 && S.frame === 1, 'two players take whole frames in turn');
  const m = (f, i) => f.map((_, k) => E.mark(f, i, k)).join(' ');
  ok(m([10], 0) === 'X' && m([7, 3], 0) === '7 /' && m([0, 0], 0) === '- -' && m([10, 10, 10], 9) === 'X X X' && m([10, 7, 3], 9) === 'X 7 /' && m([9, 1, 10], 9) === '9 / X' && m([10, 10, 4], 9) === 'X X 4',
    'the scorecard marks strikes, spares and misses, the tenth frame too');

  // The lane
  const g = E.simulate(full(), { x: 0, angle: 0.04, speed: 7.5, spin: 0 });
  ok(g.gutter && g.count === 0, 'a ball that leaves the lane is a gutter ball and knocks nothing');
  // A swipe in the visual check hooked off the wood beside the rack; it rolled on
  // past pin 7 as if still on the lane instead of dropping into the gutter
  const edge = E.simulate(full(), { x: 0.0318, angle: 0.00882, speed: 6.1, spin: 1 });
  ok(edge.gutter && edge.count === 0, 'a ball that hooks off the wood beside the rack is a gutter ball');
  const a1 = E.simulate(full(), { x: 0.3, angle: -0.01, speed: 7.5, spin: 0.5 }), a2 = E.simulate(full(), { x: 0.3, angle: -0.01, speed: 7.5, spin: 0.5 });
  ok(a1.down.join() === a2.down.join() && a1.frames.length === a2.frames.length, 'the same throw always ends the same way');
  const st = full(); st[0] = false; st[1] = false;
  const r2 = E.simulate(st, { x: -0.1, angle: 0.0, speed: 7.5, spin: 0 });
  ok(!r2.down[0] && !r2.down[1], 'pins already down are never counted again');
  const hookA = E.aimAngle(0.3, 0.075, E.HEAD, 7.5, 0.5);
  ok(Math.abs(E.crossing({ x: 0.3, angle: hookA, speed: 7.5, spin: 0.5 }, E.HEAD) - 0.075) < 0.002, 'the aim solver brings a hooking ball to the point it was asked for');
  ok(E.crossing({ x: 0.3, angle: hookA, speed: 7.5, spin: 0.5 }, 8) > 0.3 + Math.sin(hookA) * 8 - 0.01, 'the oiled front of the lane keeps a spinning ball straight');
  const rate = (lo, hi) => {
    let n = 0, s = 0;
    for (let e = lo; e <= hi + 1e-9; e += 0.012) for (const sp of [7.1, 7.5, 7.9]) { const a = E.aimAngle(0.3, e, E.HEAD, sp, 0.5); n++; if (E.simulate(full(), { x: 0.3, angle: a, speed: sp, spin: 0.5 }).count === 10) s++; }
    return s / n;
  };
  const pocket = rate(0.045, 0.105), headOn = rate(-0.02, 0.02), light = rate(0.13, 0.18);
  ok(pocket >= 0.6 && headOn <= 0.35 && light <= 0.2, 'the pocket strikes most of the time, head-on and light hits seldom (' + [pocket, headOn, light].map((v) => (v * 100).toFixed(0) + '%').join(', ') + ')');

  // Bots: full games end, and the levels are in order
  const game = (lv, seed) => { const rr = rng(seed); let s = E.newGame(1); while (!s.done) s = E.roll(s, E.simulate(s.standing, E.think(s.standing, lv, rr)).down).state; return E.total(s.frames[0]); };
  const med = (lv) => { const a = []; for (let i = 0; i < 15; i++) a.push(game(lv, 400 + i)); a.sort((x, y) => x - y); return a[7]; };
  const be = med('easy'), bm = med('medium'), bh = med('hard');
  ok(be < bm && bm < bh && be >= 60 && bh <= 260, 'harder bots score more, and none is perfect (' + be + ', ' + bm + ', ' + bh + ')');

  // Page wiring and identity
  const gm = games.find((x) => x.id === 'bowling');
  ok(!!gm && gm.cat === 'skill' && gm.daily !== false, 'games.json lists it under skill games, with a daily lane');
  ok(!!gm && /accent: '([^']+)'/.test(html) && html.match(/accent: '([^']+)'/)[1] === gm.color, 'games.json and the page share the accent');
  const icon = fs.readFileSync(path.join(ROOT, 'www/games/bowling/icon.svg'), 'utf8');
  ok(!!gm && new RegExp('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon), 'the icon starts on the soft tint of games.json');
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const lab = (h) => {
    const [R, G, B] = rgb(h).map(lin), f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  };
  const dE = (a, b) => { const A = lab(a), B = lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
  const lum = (h) => rgb(h).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
  const nearest = games.filter((x) => x.id !== 'bowling').map((x) => [x.id, dE(x.color, gm.color)]).sort((x, y) => x[1] - y[1])[0];
  ok(nearest[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5, 'the accent differs from every other game by ΔE ≥ 15 (nearest ' + nearest[0] + ', ' + nearest[1].toFixed(1) + ') and keeps white text at 4.5:1');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  ok(['bw-win', 'bw-hard', 'bw-turkey'].every((id) => core.indexOf("id: '" + id + "'") > 0 && html.indexOf("unlock('" + id + "')") > 0), 'the three bowling awards exist and are unlocked');
  // The reporter asked for the sound of the ball rolling and of the pins
  ok(/    roll: function \(\) \{[\s\S]{0,40}noise\(/.test(core) && /    pin: function \(\) \{[\s\S]{0,40}noise\(/.test(core) && /roll: \['roll', null\], pin: \['pin', null\]/.test(core), 'the core has a rolling rumble and a pin knock, without a buzz');
  ok(/C\.feedback\('roll'\)/.test(html) && /C\.feedback\('pin'\)/.test(html), 'a ball rumbles down the lane and each struck pin knocks');
  ok(/C\.daily\('bowling', daily\)\.rng\(\)/.test(html) && /C\.stats\.daily\('bowling', G\.daily/.test(html), 'the daily lane\'s oil comes from the day\'s seed, and the score is recorded');
  // The first throw of a game read the swipe with a size the canvas had not been
  // drawn at yet (the font arrived and the layout grew), so it started 0.06 off
  ok(/var V = shown = view\(\)/.test(html) && /function readSwipe\(pts\) \{\n    var V = shown \|\| view\(\)/.test(html) && /document\.fonts\.ready\.then/.test(html),
    'a swipe is read against the picture on screen, which is redrawn once the font is in');
  ok(/ctx\.autosave\(/.test(html) && /ctx\.tutorialIfNew\(TUT\)/.test(html), 'the game autosaves and shows its tutorial once');
  ok(Date.now() - t0 < 10000, 'the Bowling group runs in under ten seconds (' + (Date.now() - t0) + 'ms)');
}

function testGomoku() {
  head('Gomoku');
  const E = loadEngine('gomoku', 'GomokuEngineFactory');
  const n = 15, at = (r, c) => r * n + c;
  const board = (stones) => { const b = E.emptyBoard(n); for (const [r, c, p] of stones) b[at(r, c)] = p; return b; };
  ok(E.emptyBoard(n).length === 225 && E.SIZES.join(',') === '9,13,15', 'boards of 9, 13 and 15 lines');

  // Five through the last stone in each of the four directions; four is not a win
  for (const [dr, dc, name] of [[0, 1, 'horizontal'], [1, 0, 'vertical'], [1, 1, 'diagonal'], [1, -1, 'anti-diagonal']]) {
    const five = [0, 1, 2, 3, 4].map((k) => [5 + dr * k, 7 + dc * k, 1]);
    const b = board(five.slice(0, 4));
    ok(E.winLine(b, n, at(five[3][0], five[3][1]), 1) === null, name + ': four in a row is not a win');
    const res = E.applyMove(b, n, at(five[4][0], five[4][1]), 1);
    ok(res.won && res.line.length === 5, name + ': the fifth stone wins and the line has five cells');
    const mid = E.applyMove(board([five[0], five[1], five[3], five[4]]), n, at(five[2][0], five[2][1]), 1);
    ok(mid.won, name + ': filling the gap in the middle also wins');
  }
  ok(!E.applyMove(board([[7, 3, 1], [7, 4, 1], [7, 5, 1], [7, 6, 2]]), n, at(7, 7), 1).won, 'a line broken by the opponent is not five');
  ok(E.applyMove(board([[7, 3, 1], [7, 4, 1], [7, 6, 1], [7, 7, 1], [7, 8, 1]]), n, at(7, 5), 1).line.length === 6, 'six in a row also wins (free-style gomoku)');
  ok(E.applyMove(board([[7, 7, 1]]), n, at(7, 7), 2) === null, 'an occupied crossing is refused');
  const full = []; for (let i = 0; i < 81; i++) full.push(((i % 9) + ((i / 9) | 0) * 2) % 4 < 2 ? 1 : 2);
  full[80] = 0;
  const last = E.applyMove(full, 9, 80, full[79] === 1 ? 2 : 1);
  ok(last && (last.won || last.draw), 'filling the last crossing ends the game');
  ok(E.candidates(E.emptyBoard(n), n).join() === String(at(7, 7)), 'the first move is the centre');

  for (const level of ['easy', 'medium', 'hard']) {
    ok(E.think(board([[7, 3, 2], [7, 4, 2], [7, 5, 2], [7, 6, 2], [3, 3, 1], [3, 4, 1], [3, 5, 1], [3, 6, 1]]), n, 2, level, () => 0.99) === at(7, 7) ||
      E.think(board([[7, 3, 2], [7, 4, 2], [7, 5, 2], [7, 6, 2], [3, 3, 1], [3, 4, 1], [3, 5, 1], [3, 6, 1]]), n, 2, level, () => 0.99) === at(7, 2), level + ': takes its own five before blocking');
  }
  for (const level of ['medium', 'hard']) {
    const four = board([[7, 3, 1], [7, 4, 1], [7, 5, 1], [7, 6, 1], [6, 6, 2], [8, 8, 2], [5, 5, 2]]);
    const m = E.think(four, n, 2, level);
    ok(m === at(7, 7) || m === at(7, 2), level + ': blocks a four');
    const three = board([[7, 5, 1], [7, 6, 1], [7, 7, 1], [9, 9, 2]]);
    const b3 = E.think(three, n, 2, level);
    ok([at(7, 4), at(7, 8), at(7, 3), at(7, 9)].includes(b3), level + ': closes an open three (' + ((b3 / n) | 0) + ',' + (b3 % n) + ')');
  }

  // Whole games between the levels, from seeded openings, each level taking both colours
  const play = (a, b, seed) => {
    const r = rng(seed);
    let B = E.dailyOpening(r, n).board, p = 1, worst = 0;
    for (let k = 0; k < n * n; k++) {
      const t = Date.now();
      const m = E.think(B, n, p, p === 1 ? a : b, r);
      worst = Math.max(worst, Date.now() - t);
      const res = E.applyMove(B, n, m, p);
      if (!res) return { illegal: true, worst };
      B = res.board;
      if (res.won) return { w: p, worst };
      if (res.draw) return { w: 0, worst };
      p = 3 - p;
    }
    return { w: 0, worst };
  };
  const match = (x, y, games) => {
    let xw = 0, yw = 0, illegal = 0, worst = 0;
    for (let g = 0; g < games; g++) {
      const xBlack = g % 2 === 0, res = play(xBlack ? x : y, xBlack ? y : x, 500 + g);
      worst = Math.max(worst, res.worst);
      if (res.illegal) illegal++;
      else if (res.w && (res.w === 1) === xBlack) xw++;
      else if (res.w) yw++;
    }
    return { xw, yw, illegal, worst };
  };
  const he = match('hard', 'easy', 12), me = match('medium', 'easy', 12), hm = match('hard', 'medium', 12);
  ok(!he.illegal && !me.illegal && !hm.illegal, 'no level ever plays an illegal move');
  ok(he.xw >= 10, 'hard beats easy in at least 10 of 12 games (' + he.xw + '-' + he.yw + ')');
  ok(me.xw >= 10, 'medium beats easy in at least 10 of 12 games (' + me.xw + '-' + me.yw + ')');
  ok(hm.xw > hm.yw, 'hard wins more games than medium (' + hm.xw + '-' + hm.yw + ')');
  ok(Math.max(he.worst, me.worst, hm.worst) < 300, 'every bot move takes under 300 ms here (' + Math.max(he.worst, me.worst, hm.worst) + ' ms)');

  const o1 = E.dailyOpening(rng(42), n), o2 = E.dailyOpening(rng(42), n);
  ok(o1.board.join() === o2.board.join() && o1.turn === 1, 'the daily opening is the same for the same seed and black moves next');
  ok(o1.board.filter((v) => v === 1).length === 2 && o1.board.filter((v) => v === 2).length === 2 &&
    o1.moves.every((i) => Math.abs(((i / n) | 0) - 7) <= 2 && Math.abs(i % n - 7) <= 2), 'the opening is two stones each, near the centre');

  const html = fs.readFileSync(path.join(ROOT, 'www/games/gomoku/index.html'), 'utf8');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  ok(/E\.dailyOpening\(C\.daily\('gomoku', o\.daily\)\.rng, n\)/.test(html), 'the daily game starts from the day\'s seed');
  ok(/C\.stats\.daily\('gomoku', S\.daily/.test(html), 'a finished daily game is recorded');
  ok(/id: 'gk-win'/.test(core) && /id: 'gk-hard'/.test(core) && /unlock\('gk-win'\)/.test(html) && /unlock\('gk-hard'\)/.test(html), 'both gomoku awards exist and are unlocked');
  ok(!/C\.ui\.prompt/.test(html), 'no call to C.ui.prompt, which the core does not have');
}

/* ------------------------------------------------ Go (#205) */
// 9×9 go with area scoring. The rules that decide games (capture, suicide, ko,
// counting) are checked on fixed positions; the bot by its answers and by play.
function testGo() {
  head('Go');
  const E = loadEngine('go', 'GoEngineFactory');
  const N = 9, at = (r, c) => r * N + c;
  const pos = (stones, turn) => { const s = E.newState(); for (const [r, c, p] of stones) s.board[at(r, c)] = p; s.turn = turn || 1; return s; };
  ok(E.N === 9 && E.KOMI === 6.5 && E.newState().turn === 1, '9×9, komi 6.5, black starts');

  let s = pos([[3, 4, 1], [5, 4, 1], [4, 3, 1], [4, 4, 2]]);
  ok(E.play(s, at(4, 5)) && s.board[at(4, 4)] === 0 && s.caps[1] === 1, 'closing the last liberty captures a stone');
  s = pos([[0, 0, 2], [0, 1, 1]]);
  ok(E.play(s, at(1, 0)) && s.board[0] === 0, 'a corner stone has two liberties and is captured');
  s = pos([[3, 4, 2], [3, 5, 2], [4, 3, 1], [4, 6, 1], [2, 4, 1], [2, 5, 1], [3, 3, 1], [3, 6, 1]]);
  ok(E.play(s, at(4, 4)) && E.play(s, E.PASS) && E.play(s, at(4, 5)) && s.board[at(3, 4)] === 0 && s.board[at(3, 5)] === 0 && s.caps[1] === 2, 'a two-stone group is captured together');
  s = pos([[0, 1, 2], [1, 0, 2]]);
  ok(!E.play(s, at(0, 0)) && s.board[0] === 0 && s.turn === 1, 'suicide is refused and changes nothing');
  s = pos([[0, 1, 2], [1, 0, 2], [0, 2, 1], [1, 1, 1], [2, 0, 1]]);
  ok(E.play(s, at(0, 0)) && s.board[at(0, 1)] === 0 && s.board[at(1, 0)] === 0, 'a move with no liberty is fine when it captures');

  // Ko: black takes at (4,4); white may not take back at (4,3) at once
  s = pos([[3, 3, 1], [5, 3, 1], [4, 2, 1], [3, 4, 2], [5, 4, 2], [4, 5, 2], [4, 3, 2]]);
  ok(E.play(s, at(4, 4)) && s.board[at(4, 3)] === 0 && s.ko === at(4, 3), 'taking a single stone sets the ko point');
  ok(!E.play(s, at(4, 3)), 'the ko stone cannot be retaken straight away');
  ok(E.play(s, at(0, 8)) && E.play(s, at(8, 8)) && E.play(s, at(4, 3)) && s.board[at(4, 4)] === 0, 'after a move elsewhere the ko can be retaken');

  s = E.newState();
  ok(E.play(s, E.PASS) && E.play(s, E.PASS) && s.passes === 2, 'two passes in a row end the game');
  ok(E.score(E.newState().board).black === 0 && E.score(E.newState().board).white === 6.5, 'an empty board scores 0 to 6.5');
  const wall = pos([]);
  for (let r = 0; r < 9; r++) { wall.board[at(r, 4)] = 1; wall.board[at(r, 5)] = 2; }
  const sw = E.score(wall.board);
  ok(sw.black === 45 && sw.white === 42.5 && sw.winner === 1, 'area counts stones plus surrounded points (45 to 36 + 6.5)');
  ok(E.isEye(pos([[3, 4, 1], [5, 4, 1], [4, 3, 1], [4, 5, 1]]).board, at(4, 4), 1) &&
    !E.isEye(pos([[3, 4, 1], [5, 4, 1], [4, 3, 1], [4, 5, 1], [3, 3, 2], [5, 5, 2]]).board, at(4, 4), 1), 'an eye with two enemy diagonals is a false eye');

  // A hopeless stone left in the opponent's area at the end is counted as dead
  const end = pos([]);
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) end.board[at(r, c)] = c <= 4 ? 1 : 2;
  for (const [r, c] of [[1, 1], [4, 3], [7, 2], [1, 7], [4, 6], [7, 7]]) end.board[at(r, c)] = 0;
  end.board[at(4, 2)] = 2;
  const f = E.finalScore(end, rng(7), 200);
  ok(f.dead.length === 1 && f.dead[0] === at(4, 2), 'the lone white stone in black\'s area is dead (' + f.dead.join(',') + ')');
  ok(f.black === 45 && f.white === 42.5 && f.winner === 1, 'and the whole left side counts for black after removal (' + f.black + ' to ' + f.white + ')');

  // The bot: takes a big capture, never plays an illegal move, passes when only its own eyes are left
  const atari = pos([[2, 3, 2], [2, 4, 2], [2, 5, 2], [1, 3, 1], [1, 4, 1], [1, 5, 1], [2, 2, 1], [3, 3, 1], [3, 4, 1], [3, 5, 1], [6, 6, 2]], 1);
  ok(E.think(atari, 'medium', rng(3)) === at(2, 6), 'medium captures three stones in atari');
  const eyes = pos([]);
  for (let i = 0; i < 81; i++) eyes.board[i] = 1;
  eyes.board[at(2, 2)] = 0; eyes.board[at(6, 6)] = 0;
  ok(E.think(eyes, 'easy', rng(1)) === E.PASS, 'with only its own eyes left the bot passes');

  const play = (a, b, seed) => {
    const r = rng(seed), g = E.newState();
    let illegal = 0;
    while (g.passes < 2 && g.moves < 200) {
      const lv = g.turn === 1 ? a : b, m = E.think(g, lv[0], r, lv[1]);
      if (!E.play(g, m)) { illegal++; E.play(g, E.PASS); }
    }
    return { w: E.score(g.board).winner, illegal };
  };
  let strong = 0, weak = 0, bad = 0;
  for (let k = 0; k < 4; k++) {
    const strongBlack = k % 2 === 0, res = play(strongBlack ? ['medium', 400] : ['easy'], strongBlack ? ['easy'] : ['medium', 400], 900 + k);
    bad += res.illegal;
    if ((res.w === 1) === strongBlack) strong++; else weak++;
  }
  ok(bad === 0, 'no illegal move in four whole games');
  ok(strong >= 3, 'a 400-playout bot beats easy in at least 3 of 4 games (' + strong + '-' + weak + ')');
  ok(E.BUDGET.easy < E.BUDGET.medium && E.BUDGET.medium < E.BUDGET.hard, 'the levels differ by playout budget');
  let t0 = Date.now();
  E.think(E.newState(), 'hard', rng(5));
  const hardMs = Date.now() - t0;
  ok(hardMs < 2000, 'a hard opening move takes under 2 s here (' + hardMs + ' ms)');

  const o1 = E.dailyOpening(rng(11)), o2 = E.dailyOpening(rng(11));
  ok(o1.board.join() === o2.board.join() && o1.turn === 1 && o1.board.filter((v) => v).length === 4, 'the daily opening is four stones, the same for the same seed, black to move');

  const html = fs.readFileSync(path.join(ROOT, 'www/games/go/index.html'), 'utf8');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  ok(/E\.dailyOpening\(C\.daily\('go', o\.daily\)\.rng\)/.test(html) && /C\.stats\.daily\('go', S\.daily/.test(html), 'the daily game starts from the day\'s seed and is recorded');
  ok(/E\.finalScore\(S\.g, rnd, 300\)/.test(html), 'the game is counted with dead stones removed');
  ok(/id: 'go-win'/.test(core) && /id: 'go-hard'/.test(core) && /unlock\('go-win'\)/.test(html) && /unlock\('go-hard'\)/.test(html), 'both go awards exist and are unlocked');
}

/* ------------------------------------------------ Persian calendar in Persian (#213) */
// The daily calendar drew Gregorian months even in Persian. The grid now follows
// the Persian calendar there, while daily keys stay Gregorian (C.dateKey).
function testPersianCalendar() {
  head('Persian calendar');
  const home = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const at = home.indexOf('function makeCal(persian)');
  ok(at > 0, 'the menu has a calendar helper');
  if (at < 0) return;
  const makeCal = new Function(home.slice(at, home.indexOf('\n  }\n', at) + 4) + '; return makeCal;')();
  const key = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const P = makeCal(true), G = makeCal(false);
  ok(P.persian === true && G.persian === false, 'Persian is used only when asked for and supported');
  // Fixed points of the Persian calendar: 1 Farvardin 1405 is 21 March 2026, the
  // first six months have 31 days, the next five 30, and Esfand 1404 (not a leap year) 29.
  const cases = [
    [new Date(2026, 9, 17), '2026-09-23', 30, 'Mehr 1405'],
    [new Date(2026, 2, 21), '2026-03-21', 31, 'Farvardin 1405'],
    [new Date(2026, 2, 20), '2026-02-20', 29, 'Esfand 1404'],
    [new Date(2026, 7, 22), '2026-07-23', 31, 'Mordad 1405']
  ];
  for (const [d, start, len, name] of cases) {
    const s = P.start(d);
    ok(key(s) === start && P.length(s) === len, name + ' starts ' + start + ' and has ' + len + ' days (got ' + key(s) + ', ' + P.length(s) + ')');
  }
  const mehr = P.start(new Date(2026, 9, 17));
  ok(key(P.next(mehr)) === '2026-10-23' && key(P.prev(mehr)) === '2026-08-23', 'next and previous Persian months (Aban, Shahrivar)');
  const oct = G.start(new Date(2026, 9, 17));
  ok(key(oct) === '2026-10-01' && G.length(oct) === 31 && key(G.prev(oct)) === '2026-09-01' && G.length(G.prev(oct)) === 30, 'other languages keep Gregorian months');
  ok(/var cal = makeCal\(C\.state\.settings\.lang === 'fa'\)/.test(home) && /var date = cal\.add\(cur, day - 1\);/.test(home), 'the daily page draws its grid with it');
  ok(/var key = C\.dateKey\(date\);/.test(home), 'daily keys stay Gregorian');
  ok(/code: 'fa',[^}]*date: 'fa-IR-u-ca-persian'/.test(core), 'Persian dates are written in the Persian calendar');
}

/* ------------------------------------------------ Games opened from a shortcut (#214) */
// A reporter pinned single games to the home screen; their back button led into
// the whole menu. A shortcut-opened game now stands alone, until the menu opens a game.
function testShortcutStandalone() {
  head('Games opened from a shortcut');
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/manifest.webmanifest'), 'utf8'));
  const sc = man.shortcuts || [];
  ok(sc.length > 0 && sc.every((x) => /\?from=shortcut$/.test(x.url)), 'every shortcut URL says it comes from a shortcut');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const sw = fs.readFileSync(path.join(ROOT, 'www/sw.js'), 'utf8');
  ok(/ignoreSearch: true/.test(sw), 'the service worker serves the query URL from the cache');
  ok(/get\('from'\) === 'shortcut'\) ss\(SHORTCUT_KEY, cfg\.id\)/.test(core), 'a game remembers it was opened from its shortcut');
  ok(/standalone \? \[title\] : \[backBtn, title\]/.test(core), 'the top bar has no back button then');
  ok(/if \(standalone\) return;/.test(core), 'Escape and Backspace do not leave the game then');
  ok(/if \(!standalone\) actions\.push\(\{ label: Chogan\.t\('menu'\)/.test(core), 'the result dialog has no Menu button then');
  ok(/Chogan\.markNav = function \(\) \{ ss\(NAV_KEY, 'menu'\); ss\(SHORTCUT_KEY, ''\); \}/.test(core), 'opening a game from the menu clears the shortcut mark');
}

/* ------------------------------------------------ Privacy page top bar (#207) */
// The page had only a small text link back and its title bar stayed light in dark
// mode, because its theme-color meta was fixed while the app changes it on theme.
function testPrivacyBar() {
  head('Privacy page top bar');
  const html = fs.readFileSync(path.join(ROOT, 'www/privacy.html'), 'utf8');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  ok(/<header class="ch-gamebar[^"]*"/.test(html), 'the page has the same top bar as the games');
  ok(/<a class="ch-iconbtn[^"]*" id="back" href="\.\/"/.test(html), 'the bar has a back button to the app');
  const colours = (core.match(/dark \? '(#[0-9A-F]{6})' : '(#[0-9A-F]{6})'/) || []).slice(1);
  ok(colours.length === 2, 'the core sets two theme colours');
  ok(colours.length === 2 && html.indexOf("dark ? '" + colours[0] + "' : '" + colours[1] + "'") > 0, 'the page sets the same dark and light theme colours as the app');
  ok(/prefers-color-scheme: dark/.test(html) && /addEventListener\('change', paint\)/.test(html), 'the page follows the system theme when no theme is chosen');
}

/* ------------------------------------------------ Privacy policy page */
// Play requires a public privacy policy URL (#161). The page says nothing is
// collected and the Android app has no internet permission; these checks keep
// that claim true and the page available offline.
function testPrivacyPage() {
  head('Privacy policy page');
  const f = path.join(ROOT, 'www/privacy.html');
  ok(fs.existsSync(f), 'www/privacy.html exists');
  if (!fs.existsSync(f)) return;
  const html = fs.readFileSync(f, 'utf8');
  ok(/<section lang="fa" dir="rtl">/.test(html) && /<section lang="en" dir="ltr">/.test(html), 'Persian and English sections');
  ok(/choganhq@gmail\.com/.test(html), 'contact email present');
  // An undefined variable silently drops the whole declaration: var(--s-8) once
  // removed all the page's padding and the text touched the screen edge
  const css = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8') + html;
  const used = [...new Set([...html.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]))];
  const undef = used.filter((v) => !new RegExp(v.replace(/-/g, '\\-') + '\\s*:').test(css));
  ok(used.length > 0 && undef.length === 0, 'every CSS variable the page uses is defined' + (undef.length ? ' (missing: ' + undef.join(', ') + ')' : ''));
  const sw = fs.readFileSync(path.join(ROOT, 'www/sw.js'), 'utf8');
  ok(/'\.\/privacy\.html'/.test(sw), 'the service worker precaches privacy.html');
  const manifest = fs.readFileSync(path.join(ROOT, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  const perms = [...manifest.matchAll(/uses-permission[^>]*android:name="([^"]+)"/g)].map((m) => m[1]);
  ok(perms.length > 0 && perms.every((p) => p === 'android.permission.VIBRATE'), 'Android declares only VIBRATE, as the page says (' + perms.join(', ') + ')');
  ok(/android:allowBackup="false"/.test(manifest), 'Android backup is off, as the page says');
  const menu = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
  ok(/href: 'privacy\.html'/.test(menu), 'the profile links to the privacy page');
}

/* ------------------------------------------------ Google Play API */
// tools/play-api.sh holds the Play service account key and is the only path from
// CI to Play (#159). It runs here against a mock Play: the token endpoint checks
// the JWT signature with the matching public key, the edits API records every
// call, so the test sees exactly what Play would have received.
function testPlayApi() {
  head('Google Play API');
  const script = path.join(ROOT, 'tools/play-api.sh');
  const exists = fs.existsSync(script);
  ok(exists, 'tools/play-api.sh exists');
  const wf = path.join(ROOT, '.github/workflows/play.yml');
  ok(fs.existsSync(wf), 'play.yml exists');
  if (!exists || !fs.existsSync(wf)) return Promise.resolve();
  const y = fs.readFileSync(wf, 'utf8');
  const on = (y.match(/\non:\n([\s\S]*?)\n[a-z]/) || [])[1] || '';
  ok(/^\s+workflow_dispatch:/m.test(on) && !/\b(push|pull_request|schedule|release):/.test(on), 'play.yml: manual dispatch only');
  ok(/options: \[internal, alpha\]/.test(y) && !/production/.test(y.replace(/^#.*$/mg, '')), 'play.yml: only testing tracks, never production');
  ok(y.split('\n').filter((l) => /secrets\.PLAY_SERVICE_ACCOUNT_JSON/.test(l)).every((l) => /^\s+PLAY_SERVICE_ACCOUNT_JSON: \$\{\{ secrets\.PLAY_SERVICE_ACCOUNT_JSON \}\}$/.test(l)), 'play.yml: the service account key only reaches steps through env');
  ok(!/\$\{\{ inputs\.[a-z]+ \}\}/.test(y.split('\n').filter((l) => /^\s+run:/.test(l)).join('\n')), 'play.yml: inputs never interpolated into run lines');
  ok(/if: always\(\)\n\s+run: rm -f "\$RUNNER_TEMP\/release\.jks"/.test(y), 'play.yml: the keystore is always removed');
  ok(/c3f70a1af8a45558678d1d9b413415d1b0a4c3208835ce78c1f37c4a3a008839/.test(y), 'play.yml: the bundle signer is checked before upload');
  const crypto = require('crypto');
  const http = require('http');
  const { execFile } = require('child_process');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const PKG = 'io.github.choganhq.chogan';
  let calls = [], tokenOk = null, failOn = null, bundleVc = '17';
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
      if (req.url === '/token') {
        const form = new URLSearchParams(body.toString());
        const parts = (form.get('assertion') || '').split('.');
        const claims = parts.length === 3 ? JSON.parse(Buffer.from(parts[1], 'base64url').toString()) : {};
        tokenOk = parts.length === 3 && form.get('grant_type') === 'urn:ietf:params:oauth:grant-type:jwt-bearer' &&
          crypto.verify('sha256', Buffer.from(parts[0] + '.' + parts[1]), publicKey, Buffer.from(parts[2], 'base64url')) &&
          claims.iss === 'ci@chogan-play.iam.gserviceaccount.com' && claims.scope === 'https://www.googleapis.com/auth/androidpublisher' &&
          claims.exp - claims.iat === 600;
        return tokenOk ? send(200, { access_token: 'tok-123' }) : send(400, { error: 'invalid_grant' });
      }
      calls.push({ m: req.method, u: req.url, auth: req.headers.authorization, body: body.toString().slice(0, 200), len: body.length });
      if (failOn && req.url.indexOf(failOn) >= 0) return send(403, { error: { message: 'The caller does not have permission' } });
      const base = '/androidpublisher/v3/applications/' + PKG + '/edits';
      if (req.method === 'POST' && req.url === base) return send(200, { id: 'E1' });
      if (req.method === 'GET' && req.url === base + '/E1/tracks') return send(200, { tracks: [{ track: 'internal', releases: [] }] });
      if (req.method === 'DELETE' && req.url === base + '/E1') return send(204, {});
      if (req.method === 'POST' && req.url === '/upload' + base + '/E1/bundles?uploadType=media') return send(200, { versionCode: Number(bundleVc) });
      if (req.method === 'PUT' && req.url === base + '/E1/tracks/internal') return send(200, {});
      if (req.method === 'POST' && req.url === base + '/E1:commit') return send(200, {});
      if (req.method === 'PUT' && /\/E1\/listings\/[a-zA-Z-]+$/.test(req.url)) return send(200, JSON.parse(body.toString()));
      if (req.method === 'DELETE' && /\/E1\/listings\/[a-zA-Z-]+(\/[a-zA-Z]+)?$/.test(req.url)) return send(200, {});
      if (req.method === 'POST' && /^\/upload.*\/E1\/listings\/[a-zA-Z-]+\/[a-zA-Z]+\?uploadType=media$/.test(req.url)) return send(200, { image: {} });
      if (req.method === 'PATCH' && req.url === base + '/E1/details') return send(200, JSON.parse(body.toString()));
      if (req.method === 'GET' && req.url === base + '/E1/listings') return send(200, { listings: [{ language: 'en-GB' }, { language: 'en-US' }, { language: 'fa' }] });
      send(404, { error: { message: 'unexpected ' + req.method + ' ' + req.url } });
    });
  });
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'play-'));
  const aab = path.join(tmp, 'app.aab');
  fs.writeFileSync(aab, Buffer.alloc(4096, 7));
  const run = (args, env) => new Promise((resolve) => {
    calls = []; tokenOk = null;
    execFile('bash', [script].concat(args), { env: Object.assign({}, process.env, env) },
      (err, stdout, stderr) => resolve({ code: err ? (typeof err.code === 'number' ? err.code : -1) : 0, out: stdout + stderr }));
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', r)).then(async () => {
    const origin = 'http://127.0.0.1:' + server.address().port;
    const sa = JSON.stringify({ client_email: 'ci@chogan-play.iam.gserviceaccount.com', private_key: pem, token_uri: origin + '/token' });
    const env = { PLAY_SERVICE_ACCOUNT_JSON: sa, PLAY_API: origin };

    let r = await run(['check'], env);
    ok(r.code === 0 && tokenOk === true, 'check: a JWT signed with the service account key is accepted (' + r.code + ')');
    ok(calls.length === 3 && calls.every((c) => c.auth === 'Bearer tok-123'), 'check: three calls, all with the token');
    ok(calls.length === 3 && calls[2].m === 'DELETE', 'check: the edit is deleted, nothing is committed');
    ok(/track internal/.test(r.out), 'check: the tracks are printed');

    r = await run(['upload', aab, 'internal', '17'], env);
    const up = calls.find((c) => c.u.indexOf('/upload/') === 0);
    const put = calls.find((c) => c.m === 'PUT');
    ok(r.code === 0 && !!up && up.len === 4096, 'upload: the whole bundle is sent (' + (up && up.len) + ' bytes)');
    ok(!!put && JSON.parse(put.body).releases[0].status === 'draft' && JSON.parse(put.body).releases[0].versionCodes[0] === '17',
      'upload: the track gets versionCode 17 as a draft by default');
    ok(calls.length > 0 && calls[calls.length - 1].u.endsWith('/E1:commit'), 'upload: the edit is committed last');

    bundleVc = '16';
    r = await run(['upload', aab, 'internal', '17'], env);
    ok(r.code === 1 && !calls.some((c) => c.m === 'PUT'), 'upload: a bundle Play reads as another versionCode stops before the track changes');
    bundleVc = '17';

    failOn = '/edits';
    r = await run(['check'], env);
    ok(r.code === 1 && /403/.test(r.out) && /permission/.test(r.out), 'a refused call exits 1 and shows Play\'s message');
    failOn = null;

    r = await run(['check'], { PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'x@y', private_key: pem.replace(/MII/, 'MIJ'), token_uri: origin + '/token' }), PLAY_API: origin });
    ok(r.code !== 0 && calls.length === 0, 'a bad key never reaches the edits API (' + r.code + ')');
    r = await run(['check'], { PLAY_SERVICE_ACCOUNT_JSON: '', PLAY_API: origin });
    ok(r.code === 2, 'no service account: exit 2 (' + r.code + ')');
    // listing from a small fastlane-style tree: en-US with icon, feature graphic and
    // two screenshots, fa with text and two screenshots
    const meta = path.join(tmp, 'meta');
    const png = Buffer.from('89504e470d0a1a0a', 'hex');
    for (const [lang, title, imgs] of [['en-US', 'Chogan', ['icon.png', 'featureGraphic.png', 'phoneScreenshots/1.png', 'phoneScreenshots/2.png']],
      ['fa', 'چوگان "بازی"', ['phoneScreenshots/1.png', 'phoneScreenshots/2.png']]]) {
      fs.mkdirSync(path.join(meta, lang, 'images', 'phoneScreenshots'), { recursive: true });
      fs.writeFileSync(path.join(meta, lang, 'title.txt'), title + '\n');
      fs.writeFileSync(path.join(meta, lang, 'short_description.txt'), 'Short\n');
      fs.writeFileSync(path.join(meta, lang, 'full_description.txt'), 'Line one\n* line two\n');
      for (const i of imgs) fs.writeFileSync(path.join(meta, lang, 'images', i), png);
    }
    r = await run(['listing', meta], env);
    const puts = calls.filter((c) => c.m === 'PUT' && /\/listings\//.test(c.u));
    const ups = calls.filter((c) => c.u.indexOf('/upload/') === 0);
    const fa = puts.find((c) => c.u.endsWith('/listings/fa'));
    ok(r.code === 0 && puts.length === 2, 'listing: one text update per language (' + r.code + ', ' + puts.length + ')');
    ok(!!fa && JSON.parse(fa.body).title === 'چوگان "بازی"' && JSON.parse(fa.body).fullDescription === 'Line one\n* line two', 'listing: Persian text, quotes and newlines arrive intact');
    ok(ups.length === 6 && ups.every((c) => c.len === 8), 'listing: every image uploaded (' + ups.length + ')');
    ok(calls.some((c) => c.m === 'DELETE' && c.u.endsWith('/listings/en-US/phoneScreenshots')) &&
      calls.findIndex((c) => c.m === 'DELETE' && c.u.endsWith('/listings/en-US/phoneScreenshots')) < calls.findIndex((c) => c.u.indexOf('/listings/en-US/phoneScreenshots?') > 0),
      'listing: old screenshots are cleared before the new ones go up');
    const det = calls.find((c) => c.m === 'PATCH');
    ok(!!det && JSON.parse(det.body).defaultLanguage === 'en-US', 'listing: default language set to en-US');
    ok(calls.some((c) => c.m === 'DELETE' && c.u.endsWith('/listings/en-GB')) && !calls.some((c) => c.m === 'DELETE' && /\/listings\/(en-US|fa)$/.test(c.u)),
      'listing: the stray en-GB listing is removed, ours are kept');
    ok(calls.length > 0 && calls[calls.length - 1].u.endsWith('/E1:commit'), 'listing: committed last');
    fs.writeFileSync(path.join(meta, 'fa', 'short_description.txt'), 'x'.repeat(81));
    r = await run(['listing', meta], env);
    ok(r.code !== 0 && !calls.some((c) => c.u.endsWith(':commit')), 'listing: text over Play\'s limit stops before commit');

    r = await run(['publish'], env);
    ok(r.code === 2, 'unknown mode: exit 2');
    r = await run(['upload', aab, 'internal', 'x'], env);
    ok(r.code === 2, 'non-numeric versionCode: exit 2');
  }).finally(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });
}

/* ------------------------------------------------ PEPK key export */
// Play App Signing gets a copy of our own key so Play, GitHub Releases and F-Droid
// builds share one signature (#157). This workflow feeds the private key to a jar
// downloaded from Google, so its shape is guarded here.
function testPepkExport() {
  head('PEPK key export');
  const f = path.join(ROOT, '.github/workflows/pepk-export.yml');
  ok(fs.existsSync(f), 'pepk-export.yml exists');
  if (!fs.existsSync(f)) return;
  const y = fs.readFileSync(f, 'utf8');
  const on = (y.match(/\non:\n([\s\S]*?)\n[a-z]/) || [])[1] || '';
  ok(/^\s+workflow_dispatch:/m.test(on) && !/\b(push|pull_request|schedule|release):/.test(on), 'manual dispatch only');
  ok(/PEPK_SHA256: [0-9a-f]{64}\n/.test(y) && /sha256sum -c -/.test(y), 'the PEPK jar is checked against a pinned SHA-256 before it runs');
  ok(y.indexOf('sha256sum -c -') < y.indexOf('java -jar "$RUNNER_TEMP/pepk.jar"'), 'the checksum runs before PEPK');
  const keyLines = y.split('\n').filter((l) => /inputs\.encryption_key/.test(l));
  ok(keyLines.length === 1 && /^\s+ENCRYPTION_KEY: \$\{\{ inputs\.encryption_key \}\}$/.test(keyLines[0]), 'the PEM input reaches the shell only through env');
  ok(/--rsa-aes-encryption/.test(y) && /--include-cert/.test(y), 'PEPK encrypts to Play\'s key and includes the certificate');
  ok(/c3f70a1af8a45558678d1d9b413415d1b0a4c3208835ce78c1f37c4a3a008839/.test(y), 'the exported key is checked against the permanent Chogan fingerprint');
  ok(/if: always\(\)\n\s+run: rm -f "\$RUNNER_TEMP\/release\.jks"/.test(y), 'the keystore is always removed');
  ok(/permissions:\n\s+contents: read/.test(y) && !/contents: write|gh release/.test(y), 'nothing is published');
  ok(/retention-days: 1/.test(y), 'the artifact lives one day');
}

/* ------------------------------------------------ Stray files */
// Two 4 MB Chrome traces and a screenshot from the Spider lag proofs were
// committed to the repository root (#472, #532) and sat there unnoticed (#575).
function testNoStrayFiles() {
  head('No stray files in the repository');
  const r = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' });
  const tracked = (r.stdout || '').split('\0').filter(Boolean);
  ok(r.status === 0 && tracked.length > 100, 'tracked files listed (' + tracked.length + ')');
  const big = tracked.filter((f) => { try { return fs.statSync(path.join(ROOT, f)).size > 1000000; } catch (e) { return false; } });
  ok(big.length === 0, 'no tracked file over 1 MB' + (big.length ? ': ' + big.join(', ') : ''));
  const ROOT_OK = /^(?:[A-Z_]+\.md|LICENSE|\.gitignore|capacitor\.config\.json)$/;
  const loose = tracked.filter((f) => !f.includes('/') && !ROOT_OK.test(f));
  ok(loose.length === 0, 'only docs and config at the root' + (loose.length ? ': ' + loose.join(', ') : ''));
}

/* ------------------------------------------------ Community health files */
// GitHub's community profile listed no code of conduct, security policy,
// issue or pull request template (#574); CONTRIBUTING still said five
// languages after Polish made six.
function testCommunityFiles() {
  head('Community health files');
  const read = (rel) => { try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch (e) { return ''; } };
  const files = ['CODE_OF_CONDUCT.md', 'SECURITY.md', 'ACCESSIBILITY.md', 'CONTRIBUTING.md', '.github/pull_request_template.md'];
  for (const rel of files) ok(read(rel).length > 200, rel + ' exists and is not a stub');
  const coc = read('CODE_OF_CONDUCT.md');
  ok(/Contributor Covenant/.test(coc) && /version 2\.1/.test(coc) && /choganhq@gmail\.com/.test(coc), 'code of conduct is Contributor Covenant 2.1 with our contact');
  const sec = read('SECURITY.md');
  ok(sec.includes('https://github.com/choganhq/chogan/security/advisories/new') && sec.includes('choganhq@gmail.com'), 'security policy names the private report form and the email');
  const tplDir = path.join(ROOT, '.github/ISSUE_TEMPLATE');
  const forms = fs.existsSync(tplDir) ? fs.readdirSync(tplDir).filter((f) => /\.ya?ml$/.test(f) && !/^config\./.test(f)) : [];
  ok(forms.length >= 2, 'issue templates found (' + forms.length + ')');
  for (const f of forms) {
    const y = read('.github/ISSUE_TEMPLATE/' + f);
    ok(/^name: \S/m.test(y) && /^description: \S/m.test(y) && /^body:/m.test(y) && /required: true/.test(y), f + ': a form with a name, a description and a required field');
  }
  // Reporters write in Persian, Chinese and more; a template that forbids it
  // or a closed blank issue would turn them away.
  ok(/^blank_issues_enabled: true$/m.test(read('.github/ISSUE_TEMPLATE/config.yml')), 'blank issues stay allowed');
  for (const rel of files.concat(forms.map((f) => '.github/ISSUE_TEMPLATE/' + f), ['.github/ISSUE_TEMPLATE/config.yml'])) {
    if (rel === 'CONTRIBUTING.md') continue;
    ok(!/[؀-ۿ]/.test(read(rel).replace(/«\?»/g, '')), rel + ': English only');
  }
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  ok(read('CONTRIBUTING.md').includes('all ' + words[LOCALE_CODES.length] + ' languages'), 'CONTRIBUTING names ' + LOCALE_CODES.length + ' languages');
}

/* ------------------------------------------------ CI and tools in English */
// The owner wants the working system in English: every name and message GitHub
// shows, and the scripts CI runs (#154). Only real UI values stay, such as the
// Persian launcher label the APK check compares against.
function testEnglishCi() {
  head('CI and tools in English');
  const files = [];
  for (const d of ['.github', '.github/workflows', 'tools']) {
    for (const f of fs.readdirSync(path.join(ROOT, d))) {
      const rel = d + '/' + f;
      if (/\.(ya?ml|sh)$/.test(f) || rel === 'tools/chess-puzzles.js') files.push(rel);
    }
  }
  ok(files.length >= 12, 'files in scope found (' + files.length + ')');
  const UI_VALUE = /\[ "\$FA" = "چوگان" \]|^  <h1>Chogan<span>چوگان<\/span><\/h1>$/;
  for (const rel of files) {
    const bad = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n')
      .filter((l) => /[؀-ۿ]/.test(l) && !UI_VALUE.test(l));
    ok(bad.length === 0, rel + ': English only' + (bad.length ? ' (' + bad.length + ' lines, first: ' + bad[0].trim().slice(0, 60) + ')' : ''));
  }
  const y = fs.readFileSync(path.join(ROOT, '.github/workflows/test.yml'), 'utf8');
  ok(/\n    name: Game engines and page loads\n/.test(y) && /\n    name: Android debug build\n/.test(y), 'required job names are the English ones the ruleset expects');
}

/* ------------------------------------------------- کاشی‌های خانه */
// هجده بازی یک‌ستونه روی گوشی ۳۹۰ پیکسلی ۲۲۶۰ پیکسل اسکرول بود (#149). پیش‌فرض
// کاشی دو ستونه است و یک‌ستونه فقط وقتی که کاربر خودش انتخاب کرده.
function testHomeGrid() {
  head('کاشی‌های خانه');
  const menu = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  ok(/var asList = C\.state\.settings\.gameView === 'list';/.test(menu), 'یک‌ستونه فقط با انتخاب صریح gameView === list');
  // #193 moved the class into gridCls, shared by the pinned and the all-games grid
  ok(/var gridCls = 'ch-games' \+ \(asList \? '' : ' ch-games--grid'\);/.test(menu) && /class: gridCls/.test(menu), 'the game list gets ch-games--grid by default');
  ok(/C\.store\.set\('settings', C\.state\.settings\)/.test(menu.slice(menu.indexOf('var asList'))), 'انتخاب نما در تنظیمات ذخیره می‌شود');
  // قاعده‌ی دو ستون باید بیرون از media query باشد تا روی گوشی هم اعمال شود
  const topLevel = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  ok(/\.ch-games--grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/.test(topLevel), 'دو ستون روی پهنای گوشی (بیرون از media query)');
  ok(/^\s+list: '/m.test(core), 'نماد list در هسته هست');
  for (const k of ['viewGrid', 'viewList']) {
    const n = (menu.match(new RegExp('\\b' + k + ': \'', 'g')) || []).length;
    ok(n === LOCALE_CODES.length, k + ' is in every menu language (' + n + ')');
  }
}

/* -------------------------------------------- کلیدهای ترجمه‌ی تعریف‌نشده */
// C.t کلید ناشناخته را خودِ کلید برمی‌گرداند، پس پایان مساوی شطرنج «draw» نشان می‌داد
// و هیچ آزمونی نمی‌دید (#143). هر کلید ثابتی که بازی می‌خواند باید جایی تعریف شده باشد.
function testStringKeys() {
  head('کلیدهای ترجمه');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  ok(games.length > 0, 'فهرست بازی‌ها خالی نیست');
  let total = 0;
  for (const g of games) {
    const html = fs.readFileSync(path.join(ROOT, 'www', g.path), 'utf8');
    const keys = [...new Set([...html.matchAll(/C\.t\('([A-Za-z0-9_]+)'\s*[,)]/g)].map((m) => m[1]))];
    total += keys.length;
    const has = (src, k) => new RegExp('[\\s{,]' + k + '\\s*:').test(src);
    const miss = keys.filter((k) => !has(html, k) && !has(core, k));
    ok(miss.length === 0, g.id + ': همه‌ی کلیدهای C.t تعریف شده‌اند' + (miss.length ? ' (نیست: ' + miss.join(', ') + ')' : ''));
  }
  ok(total > 300, 'کلیدهای خوانده‌شده: ' + total);
}

/* ---------------------------------------------- ادامه‌ی روزانه‌ی نیمه‌کاره */
// هسته برای هر روز خانه‌ی ذخیره‌ی جدا دارد، ولی سودوکو، نقطه‌بازی، مین‌روب و دفاع از
// برج روزانه را همیشه از نو می‌ساختند و پیشرفت همان روز با یک «بازگشت» گم می‌شد (#132).
// شاخه‌ی «اگر روزانه است» یا باید بعد از شاخه‌ای بیاید که ذخیره را می‌خواند، یا خودش بخواند.
function testDailyResume() {
  head('ادامه‌ی روزانه');
  const problem = (html) => {
    const at = html.lastIndexOf('ctx.loadSave()');
    if (at < 0) return 'ctx.loadSave() نیست';
    const tail = html.slice(at);
    const di = tail.indexOf('if (dailyDate) {');
    if (di < 0) return null;
    const SAVE = /\b(saved|sv|restore\w*|resume\w*)\b/;
    const conds = tail.slice(0, di).match(/if \(([^{]*)\) \{/g) || [];
    if (conds.some((c) => SAVE.test(c))) return null;
    let d = 0, j = tail.indexOf('{', di);
    for (let i = j; i < tail.length; i++) {
      if (tail[i] === '{') d++;
      else if (tail[i] === '}' && --d === 0) { j = i; break; }
    }
    return SAVE.test(tail.slice(di, j)) ? null : 'شاخه‌ی روزانه بدون نگاه به ذخیره بازی تازه می‌سازد';
  };
  ok(games.length > 0, 'فهرست بازی‌ها خالی نیست');
  // خودِ بررسی باید شکل خراب را بشناسد، وگرنه همیشه سبز بود
  ok(problem("var saved = ctx.loadSave();\n  if (dailyDate) {\n    newGame('x', dailyDate);\n  } else if (saved) { restore(saved); }") !== null, 'بررسی، روزانه‌ی بی‌ذخیره را می‌گیرد');
  for (const g of games) {
    const why = problem(fs.readFileSync(path.join(ROOT, 'www', g.path), 'utf8'));
    ok(!why, g.id + ': روزانه‌ی نیمه‌کاره‌ی همان روز ادامه می‌یابد' + (why ? ' (' + why + ')' : ''));
  }
}

function testKeyLayout() {
  head('Letter shortcuts on any keyboard layout (#341)');
  // With the Persian layout F types «ب», so `k === 'f'` never matched and every
  // letter shortcut was dead for the app's first language (reported on #332)
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const m = core.match(/  Chogan\.keyIs = (function \(e, letter\) \{[\s\S]*?\n  \});/);
  ok(!!m, 'the core has Chogan.keyIs');
  const keyIs = m ? vm.runInNewContext('(' + m[1] + ')', {}) : () => null;
  const K = (key, code) => ({ key, code });
  const cases = [
    [K('f', 'KeyF'), 'f', true, 'f'], [K('F', 'KeyF'), 'f', true, 'F with Shift or Caps Lock'],
    [K('ب', 'KeyF'), 'f', true, 'the F key on the Persian layout'],
    [K('ب', 'KeyF'), 'h', false, 'not another letter'],
    [K('q', 'KeyA'), 'a', false, 'AZERTY: the key in the A position types q and is not A'],
    [K('a', 'KeyQ'), 'a', true, 'AZERTY: the letter a wherever it is'],
    [K('ArrowLeft', 'ArrowLeft'), 'a', false, 'an arrow is no letter'],
    [K('1', 'Digit1'), 'a', false, 'a digit is no letter']
  ];
  for (const [e, l, want, name] of cases) ok(keyIs(e, l) === want, 'keyIs: ' + name);

  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  let lines = 0;
  for (const g of games) {
    const html = fs.readFileSync(path.join(ROOT, 'www', g.path), 'utf8');
    const bad = [];
    html.split('\n').forEach((line, i) => {
      if (/C\.keyIs\(e, '[a-z]'\)/.test(line)) lines++;
      for (const x of line.matchAll(/\b(?:k|e\.key) === '([a-zA-Z])'/g)) bad.push((i + 1) + ':' + x[1]);
    });
    ok(bad.length === 0 && !/e\.code === 'Key/.test(html), g.id + ': every letter shortcut goes through C.keyIs' + (bad.length ? ' (line:letter ' + bad.join(', ') + ')' : ''));
  }
  ok(lines >= 25, 'letter shortcuts were found to check (' + lines + ' lines)');
}

function testUndoKey() {
  head('کلید برگرداندن');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const m = core.match(/  Chogan\.undoKey = (function \(e\) \{[\s\S]*?\n  \});/);
  ok(!!m, 'هسته Chogan.undoKey دارد');
  const undoKey = m ? vm.runInNewContext('(' + m[1] + ')', {}) : () => null;
  const K = (key, code, mods) => Object.assign({ key, code, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }, mods || {});
  const cases = [
    [K('z', 'KeyZ', { ctrlKey: true }), true, 'Ctrl+Z'],
    [K('Z', 'KeyZ', { ctrlKey: true }), true, 'Ctrl+Z با Caps Lock'],
    [K('z', 'KeyZ', { metaKey: true }), true, 'Cmd+Z در مک'],
    [K('ظ', 'KeyZ', { ctrlKey: true }), true, 'Ctrl+Z با چیدمان فارسی'],
    [K('u', 'KeyU'), true, 'U'],
    [K('U', 'KeyU', { shiftKey: true }), true, 'Shift+U'],
    [K('ع', 'KeyU'), true, 'U با چیدمان فارسی'],
    [K('z', 'KeyZ', { ctrlKey: true, shiftKey: true }), false, 'Ctrl+Shift+Z (دوباره انجام بده) برنمی‌گرداند'],
    [K('z', 'KeyZ', { ctrlKey: true, altKey: true }), false, 'Ctrl+Alt+Z برنمی‌گرداند'],
    [K('z', 'KeyZ'), false, 'Z تنها برنمی‌گرداند'],
    [K('u', 'KeyU', { ctrlKey: true }), false, 'Ctrl+U مال مرورگر است'],
    [K('y', 'KeyZ', { ctrlKey: true }), false, 'چیدمان آلمانی: کلید فیزیکی Z که y می‌نویسد برنمی‌گرداند'],
    [K('z', 'KeyY', { ctrlKey: true }), true, 'چیدمان آلمانی: حرف z هر جا که باشد برمی‌گرداند'],
    [K('ArrowLeft', 'ArrowLeft'), false, 'جهت‌نما برنمی‌گرداند']
  ];
  for (const [e, want, name] of cases) ok(undoKey(e) === want, 'undoKey: ' + name);

  // هر بازی‌ای که دکمه‌ی برگرداندن دارد باید کیبوردش را از همین یک تابع بگذراند،
  // وگرنه Ctrl+Z در یکی کار می‌کند و در دیگری نه (#111)
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  const withUndo = games.filter((g) => /icon: 'undo'|C\.icon\('undo'|tool\('undo'/.test(fs.readFileSync(path.join(ROOT, 'www', g.path), 'utf8')));
  ok(withUndo.length >= 10, 'دست‌کم ده بازی دکمه‌ی برگرداندن دارند (' + withUndo.length + ' پیدا شد)');
  for (const g of withUndo) {
    const html = fs.readFileSync(path.join(ROOT, 'www', g.path), 'utf8');
    ok(/if \(C\.undoKey\(e\)\) \{ undo(Move)?\(\);/.test(html), g.id + ': کیبورد از C.undoKey می‌گذرد');
    ok(!/k === 'u'|k === 'z'/.test(html), g.id + ': مقایسه‌ی دستی کلید برگرداندن نمانده');
    ok(html.indexOf("'U / Ctrl+Z'") > 0, g.id + ': راهنمای کیبورد Ctrl+Z را نشان می‌دهد');
  }
}

function testShortcuts() {
  head('میان‌برهای اپ نصب‌شده');
  // میان‌برها از روی games.json ساخته می‌شوند (tools/shortcuts.sh). اگر بازی‌ای
  // اضافه شود و اسکریپت اجرا نشود، میان‌برش نیست یا اسم کهنه می‌ماند (#112).
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/manifest.webmanifest'), 'utf8'));
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  ok(games.length > 0, 'games.json بازی دارد');
  // کروم بیشتر از ده میان‌بر را نمی‌خواند و هشدار می‌دهد؛ ده بازی اول منو
  const firstTen = games.slice(0, 10);
  const sc = Array.isArray(man.shortcuts) ? man.shortcuts : [];
  ok(sc.length === firstTen.length, 'ده بازی اول منو میان‌بر دارند (' + sc.length + ' از ' + firstTen.length + ')');
  const want = firstTen.map((g) => ({
    name: g.name.en,
    name_localized: {
      fa: { value: g.name.fa, lang: 'fa', dir: 'rtl' },
      'zh-Hans': { value: g.name.zh, lang: 'zh-Hans', dir: 'ltr' },
      de: { value: g.name.de, lang: 'de', dir: 'ltr' },
      es: { value: g.name.es, lang: 'es', dir: 'ltr' }
    },
    url: g.path + '?from=shortcut',
    icons: [{ src: 'games/' + g.id + '/icon-192.png', sizes: '192x192', type: 'image/png' }]
  }));
  // آیکون بازی‌ای که میان‌بر ندارد فقط حجم APK را بالا می‌برد
  games.slice(10).forEach((g) => ok(!fs.existsSync(path.join(ROOT, 'www/games', g.id, 'icon-192.png')), g.id + ': بدون میان‌بر، آیکون PNG اضافه هم ندارد'));
  firstTen.forEach((g, i) => {
    ok(JSON.stringify(sc[i]) === JSON.stringify(want[i]), g.id + ': میان‌بر شماره‌ی ' + (i + 1) + ' با games.json می‌خواند (tools/shortcuts.sh را اجرا کن)');
    // آدرس نسبی و داخل scope، وگرنه مرورگر میان‌بر را نادیده می‌گیرد
    ok(sc[i] && !/^(\/|\.\.|[a-z]+:)/i.test(sc[i].url) && fs.existsSync(path.join(ROOT, 'www', sc[i].url.split('?')[0])), g.id + ': آدرس میان‌بر داخل اپ است و فایلش هست');
    const png = path.join(ROOT, 'www/games', g.id, 'icon-192.png');
    let w = 0, h = 0, sig = '';
    try {
      const b = fs.readFileSync(png);
      sig = b.slice(1, 4).toString('latin1'); w = b.readUInt32BE(16); h = b.readUInt32BE(20);
    } catch (e) { /* نبودن فایل پایین گزارش می‌شود */ }
    ok(sig === 'PNG' && w === 192 && h === 192, g.id + ': آیکون میان‌بر PNG ۱۹۲×۱۹۲ است (' + sig + ' ' + w + '×' + h + ')');
  });
  ok(Object.keys(man).pop() === 'shortcuts', 'shortcuts آخرین کلید منیفست است، همان جایی که اسکریپت بازنویسی می‌کند');
}

function testMenu() {
  head('منو');
  // ستون‌های تقویم روزانه به اندازه‌ی محتوایشان نیستند: با پانزده بازی ردیف نقطه‌ها
  // هر ستون را ۱۱۵ پیکسل می‌کرد و تقویم از صفحه‌ی گوشی بیرون می‌زد (#123)
  const css = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8');
  const rule = (sel) => ((css.match(new RegExp('\\n' + sel.replace('.', '\\.') + ' \\{([^}]*)\\}')) || [])[1] || '');
  ok(rule('.ch-cal').length > 0 && rule('.ch-day__dots').length > 0, 'قاعده‌های تقویم در chogan.css پیدا شد');
  ok(/grid-template-columns:\s*repeat\(7,\s*minmax\(0,\s*1fr\)\)/.test(rule('.ch-cal')), 'ستون‌های تقویم با محتوا پهن نمی‌شوند');
  ok(/display:\s*grid/.test(rule('.ch-day__dots')) && /repeat\(5,/.test(rule('.ch-day__dots')), 'نقطه‌های هر روز در پنج ستون می‌شکنند');
  const menu = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
  const at = menu.indexOf('function bestLine(g) {');
  ok(at > 0, 'تابع bestLine در منو هست');
  let depth = 0, end = at;
  for (let i = menu.indexOf('{', at); i < menu.length; i++) {
    if (menu[i] === '{') depth++;
    else if (menu[i] === '}' && --depth === 0) { end = i + 1; break; }
  }
  const byGame = {
    'new-game': { plays: 3, wins: 2 },
    'no-wins': { plays: 1, wins: 0 },
    dots: { plays: 4, wins: 3, best: { margin: 7 } }
  };
  const fakeC = {
    stats: { get: () => ({ byGame }) },
    // the label's parameters show too, so a count passed into a template is checked as well (#352)
    t: (k, p) => '<' + k + '>' + (p && p.n !== undefined ? '(' + p.n + ')' : ''), num: (n) => String(n), time: (n) => 't' + n
  };
  let bestLine = () => undefined;
  try { bestLine = vm.runInNewContext('(function (C) { ' + menu.slice(at, end) + ' return bestLine; })', {})(fakeC); }
  catch (e) { ok(false, 'bestLine اجرا نشد: ' + e.message); }
  ok(bestLine({ id: 'new-game' }) === '<winsN>(2)', 'بازی بدون خط مخصوص شمار بردهایش را نشان می‌دهد');
  ok(bestLine({ id: 'no-wins' }) === '<winsN>(0)', 'بازی بی‌برد هم مثل قبلِ نقطه‌بازی «۰ برد» نشان می‌دهد');
  ok(bestLine({ id: 'dots' }) === '<winsN>(3)', 'نقطه‌بازی همان خط قبلی را نشان می‌دهد');
  // «برد ۱۳» read backwards in Persian: the count now comes first where the language puts it (#352)
  ok(/winsN: '\{n\} برد', solvedN: '\{n\} حل‌شده', clearedN: '\{n\} پاک‌شده'/.test(menu) && /winsN: '\{n\} wins'/.test(menu), 'Persian says «۱۳ برد», «۱۳ حل‌شده», «۱۳ پاک‌شده», and English "13 wins"');
  ok((menu.match(/\bwinsN: '[^']*\{n\}[^']*'/g) || []).length === LOCALE_CODES.length && (menu.match(/\bsolvedN: '[^']*\{n\}/g) || []).length === LOCALE_CODES.length && (menu.match(/\bclearedN: '[^']*\{n\}/g) || []).length === LOCALE_CODES.length, 'every language has the three counts as templates');
  ok(!/C\.t\('(wins|solved|cleared)'\) \+ ' ' \+ C\.num/.test(menu), 'no label is glued to a number in front of it any more');
  ok(bestLine({ id: 'never-played' }) === null, 'بازی بازی‌نشده خطی ندارد');

  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const sampler = (core.match(/\{ id: 'sampler'[^\n]*\}/) || [''])[0];
  ok(sampler.length > 0, 'دستاورد sampler در جدول هست');
  ok(!/هر چهار|all four|四个游戏都/.test(sampler), 'متن sampler دیگر «هر چهار بازی» نمی‌گوید');
  ok(/>= 4\) achApi\.unlock\('sampler'\)/.test(core), 'شرط sampler همان چهار بازی مختلف است');

  // دکمه‌ی بازگشت نوار بازی در راست‌چین رو به راست (#107)، با همان قاعده‌ی منو
  const backLine = (core.match(/var backBtn = [^\n]*/) || [''])[0];
  ok(backLine.length > 0, 'دکمه‌ی بازگشت نوار بازی پیدا شد');
  ok(/Chogan\.icon\(Chogan\.isRtl\(\) \? 'forward' : 'back'/.test(backLine), 'نوار بازی پیکان بازگشت را با جهت متن انتخاب می‌کند');
  ok(/C\.icon\(C\.isRtl\(\) \? 'forward' : 'back'/.test(menu), 'منو هم همان قاعده را دارد');

  // دکمه‌ی تمام‌صفحه در اپ نصب‌شده (#108): تابع واقعی available با محیط ساختگی
  const fsAt = core.indexOf('available: function () {');
  ok(fsAt > 0, 'تابع fullscreen.available پیدا شد');
  let fd = 0, fsEnd = fsAt;
  for (let i = core.indexOf('{', fsAt); i < core.length; i++) {
    if (core[i] === '{') fd++;
    else if (core[i] === '}' && --fd === 0) { fsEnd = i + 1; break; }
  }
  const fsAvail = (mode, opts) => {
    const o = opts || {};
    const g = { matchMedia: (q) => ({ matches: q.split(',').some((part) => part.indexOf('display-mode: ' + mode) >= 0) }) };
    if (o.capacitor) g.Capacitor = {};
    const doc = { fullscreenEnabled: o.api !== false, documentElement: { requestFullscreen: o.api !== false ? () => 0 : undefined } };
    try {
      return vm.runInNewContext('(function (global, document) { return (function ' + core.slice(fsAt + 'available: function'.length, fsEnd) + ')(); })', {})(g, doc);
    } catch (e) { ok(false, 'available اجرا نشد: ' + e.message); return undefined; }
  };
  ok(fsAvail('browser') === true, 'مرورگر: دکمه‌ی تمام‌صفحه هست');
  ok(fsAvail('standalone') === true, 'اپ نصب‌شده (پنجره‌ی نواردار): دکمه‌ی تمام‌صفحه هست');
  ok(fsAvail('fullscreen') === false, 'از قبل تمام‌صفحه: دکمه نیست');
  ok(fsAvail('standalone', { capacitor: true }) === false, 'داخل اپ اندروید: دکمه نیست');
  ok(fsAvail('browser', { api: false }) === false, 'مرورگر بی Fullscreen API: دکمه نیست');
}

function testFullscreenCarry() {
  head('Fullscreen carries over to the next page (#370)');
  // Every page load leaves fullscreen, so opening a game from a fullscreen
  // menu dropped back to the browser window. The real core code runs here
  // against a fake browser: one tab's sessionStorage, shared by its pages.
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const from = core.indexOf('Chogan.fullscreen = {');
  const to = core.indexOf('/* ======================================================= playing cards */');
  ok(from > 0 && to > from, 'fullscreen section found in the core');
  const tab = new Map();
  const page = () => {
    const L = {};
    const calls = { req: 0 };
    const timers = [];
    const add = (t, f) => { (L[t] = L[t] || []).push(f); };
    const rm = (t, f) => { L[t] = (L[t] || []).filter((g) => g !== f); };
    const doc = {
      fullscreenEnabled: true, fullscreenElement: null,
      documentElement: { requestFullscreen: () => { calls.req++; return { then: (a) => { calls.ok = a; } }; } },
      exitFullscreen: () => ({ then() {} }),
      addEventListener: add, removeEventListener: rm,
    };
    const g = {
      matchMedia: () => ({ matches: false }),
      navigator: { userActivation: { isActive: true } },
      setTimeout: (f) => { timers.push(f); },
      sessionStorage: { getItem: (k) => (tab.has(k) ? tab.get(k) : null), setItem: (k, v) => tab.set(k, String(v)), removeItem: (k) => tab.delete(k) },
      addEventListener: add, removeEventListener: rm,
    };
    const fire = (t, e) => (L[t] || []).slice().forEach((f) => f(Object.assign({ type: t }, e || {})));
    try {
      vm.runInNewContext('(function (global, document, Chogan, el) { ' + core.slice(from, to) + ' })', {})(g, doc, {}, () => ({}));
    } catch (e) { ok(false, 'fullscreen section did not run: ' + e.message); }
    const setOn = (v) => { doc.fullscreenElement = v ? {} : null; fire('fullscreenchange'); };
    return { calls, fire, setOn, g, timers, listening: () => ['pointerup', 'keydown', 'click'].some((t) => (L[t] || []).length) };
  };
  const tap = { target: { closest: () => null } };

  const menu = page();
  ok(!menu.listening(), 'a fresh tab does not wait to enter fullscreen');
  menu.setOn(true);
  ok(tab.get('chogan.fullscreen') === '1', 'entering fullscreen is remembered for the tab');
  menu.fire('pagehide');
  menu.setOn(false);
  ok(tab.get('chogan.fullscreen') === '1', 'the exit caused by leaving the page does not forget it');

  const game = page();
  ok(game.listening(), 'the next page waits for a tap');
  game.fire('keydown', { key: 'Escape', target: tap.target });
  ok(game.calls.req === 0, 'Escape does not re-enter fullscreen');
  game.fire('pointerup', { target: { closest: (q) => (q === '[data-fs]' ? {} : null) } });
  ok(game.calls.req === 0, 'a tap on the fullscreen button is left to the button');
  game.g.navigator.userActivation.isActive = false;
  game.fire('pointerup', tap);
  ok(game.calls.req === 0, 'no request without a user activation');
  game.g.navigator.userActivation.isActive = true;
  game.fire('pointerup', tap);
  ok(game.calls.req === 1, 'the first real tap re-enters fullscreen');
  if (game.calls.ok) game.calls.ok();
  ok(!game.listening(), 'after that the page stops listening');
  game.setOn(true);
  game.setOn(false);
  ok(!tab.has('chogan.fullscreen'), 'leaving fullscreen on the page forgets it');
  ok(!page().listening(), 'so the page after that stays in the window');

  // Back to the menu from the back/forward cache: the page's script does not
  // run again, so only pageshow can make it wait for the restoring tap.
  tab.clear();
  const cached = page();
  cached.setOn(true);
  cached.fire('pagehide', { persisted: true });
  cached.setOn(false);
  cached.fire('pageshow', { persisted: true });
  cached.setOn(false);
  ok(tab.get('chogan.fullscreen') === '1', 'an exit arriving just after a cache restore does not forget fullscreen');
  ok(cached.listening(), 'a page restored from the cache waits for a tap');
  cached.fire('pointerup', tap);
  ok(cached.calls.req === 1, 'the first tap on a page restored from the cache re-enters fullscreen');
  if (cached.calls.ok) cached.calls.ok();
  cached.timers.forEach((f) => f());
  cached.setOn(true);
  cached.setOn(false);
  ok(!tab.has('chogan.fullscreen'), 'after the restore, turning fullscreen off is remembered again');
  ok(/btn\.setAttribute\('data-fs', ''\)/.test(core), 'the fullscreen button carries data-fs');
}

function testBuildShown() {
  head('Profile shows the deployed build under the version, both linked to GitHub (#387, #399)');
  // Fixes reach the web without a new version, so a screenshot of the profile
  // could not tell whether a fix was in it (#370).
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const line = ['commit', 'build'].map((k) => (core.match(new RegExp('^  Chogan\\.' + k + ' = .*$', 'm')) || [''])[0]).join('\n');
  ok(/Chogan\.commit = /.test(line) && /Chogan\.build = /.test(line), 'Chogan.commit and Chogan.build found in the core');
  const run = (commit) => {
    const C = {};
    try { vm.runInNewContext('(function (global, Chogan) { ' + line + ' })', {})({ APP_COMMIT: commit }, C); } catch (e) { return { build: 'threw ' + e.message }; }
    return C;
  };
  const build = (commit) => run(commit).build;
  ok(build('711e157de04557876683c451d9bcac9dc85122b3') === '711e157', 'a stamped commit shows as its 7-character short form');
  ok(run('711e157de04557876683c451d9bcac9dc85122b3').commit === '711e157de04557876683c451d9bcac9dc85122b3', 'the full commit is kept for its link');
  ok(build(undefined) === '' && run(undefined).commit === '', 'an unstamped build (dev, Android) shows nothing');
  ok(build("x'; alert(1)") === '' && run("x'; alert(1)").commit === '', 'anything that is not a commit shows nothing');
  const menu = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
  ok(/C\.t\('commitHash'\) \+ ' ', el\('a', \{ class: 'ch-version__hash', dir: 'ltr', href: 'https:\/\/github\.com\/choganhq\/chogan\/commit\/' \+ C\.commit, target: '_blank', rel: 'noopener', text: C\.build \}\)/.test(menu),
    'the profile names the commit, shows C.build left to right and links it to the commit on GitHub (#399)');
  ok(/\/\^\\d\+\\\.\\d\+\\\.\\d\+\$\/\.test\(C\.version\)\n\s+\? el\('a', \{ class: 'ch-badge ch-version__link', href: 'https:\/\/github\.com\/choganhq\/chogan\/releases\/tag\/v' \+ C\.version, target: '_blank', rel: 'noopener', text: C\.num\(C\.version\) \}\)/.test(menu),
    'the version links to its GitHub release, and only a real version number does (#399)');
  // the release tag the link names must be the one release.yml checks
  const rel = fs.readFileSync(path.join(ROOT, '.github/workflows/release.yml'), 'utf8');
  ok(/if \[ "v\$VERSION" != "\$\{GITHUB_REF_NAME\}" \]; then/.test(rel), 'release tags are v<APP_VERSION>, as the link assumes');
}

function testDarkInk() {
  head('Dark theme: text on a game accent picks its ink by contrast (#394)');
  // A fixed dark ink on primary buttons read at 2.4:1 on Bowling's blue in the
  // dark theme, and below 4.5:1 on 25 of 35 accents.
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8');
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  const fn = (core.match(/^  Chogan\.inkOn = function \(hex\) \{[\s\S]*?^  \};$/m) || [''])[0];
  ok(fn.length > 0, 'Chogan.inkOn found in the core');
  const C = {};
  try { vm.runInNewContext('(function (Chogan) { ' + fn + ' })', { Math, String, parseInt, isNaN })(C); } catch (e) { /* reported below */ }
  const ink = (h) => { try { return C.inkOn(h); } catch (e) { return 'threw'; } };
  const lum = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
  const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  ok(games.length >= 35, 'every game accent is checked (' + games.length + ')');
  const bad = [], mid = [];
  for (const g of games) {
    const got = ink(g.color), best = cr(g.color, '#FFFFFF') >= cr(g.color, '#201410') ? '#FFFFFF' : '#201410';
    if (got !== best) bad.push(g.id + ' ' + got);
    else if (cr(g.color, got) < 4.5) mid.push(g.id + ' ' + cr(g.color, got).toFixed(2));
  }
  ok(!bad.length, 'each accent gets the ink that contrasts more' + (bad.length ? ': ' + bad.join(', ') : ''));
  // measured: five mid-tones where neither ink reaches 4.5:1, all from 4.27:1
  ok(mid.every((m) => +m.split(' ')[1] >= 4.25) && mid.length <= 5, 'only mid-tones where neither ink reaches 4.5:1 stay under it, at 4.25:1 or more (' + (mid.join(', ') || 'none') + ')');
  ok(ink('#3C4F9A') === '#FFFFFF' && ink('#A47551') === '#201410' && ink('nonsense') === '#201410', 'Bowling\'s blue gets white, Backgammon\'s brown keeps the dark ink, and a bad colour falls back to it');
  ok((css.match(/--c-accent-ink: +var\(--game-ink-dark, #201410\);/g) || []).length === 2 && (css.match(/--c-accent-ink: +#FFFFFF;/g) || []).length === 1,
    'both dark theme blocks take the per-game ink; the light theme keeps white');
  ok(/r\.style\.setProperty\('--game-ink-dark', Chogan\.inkOn\(color\)\);/.test(core) && /r\.style\.removeProperty\('--game-ink-dark'\);/.test(core), 'setting a game accent sets its dark ink on the root, and clearing it removes it');
}

function testDarkAccentText() {
  head('Dark theme: text in a game colour reads at 4.5:1 (#396)');
  // A selected option in Bowling's blue read at 2.2:1 on the dark surface,
  // and 26 of 35 accents were under 4.5:1.
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8');
  const menu = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  const fn = (core.match(/^  Chogan\.textOnDark = function \(hex\) \{[\s\S]*?^  \};$/m) || [''])[0];
  ok(fn.length > 0, 'Chogan.textOnDark found in the core');
  const C = {};
  try { vm.runInNewContext('(function (Chogan) { ' + fn + ' })', { Math, String, parseInt, isNaN })(C); } catch (e) { /* reported below */ }
  const txt = (h) => { try { return C.textOnDark(h); } catch (e) { return 'threw'; } };
  const lum = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
  const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  ok(games.length >= 35, 'every game accent is checked (' + games.length + ')');
  const low = [], far = [], changed = [];
  for (const g of games) {
    const t = txt(g.color);
    if (!/^#[0-9A-F]{6}$/.test(t) || cr(t, '#342C22') < 4.5) { low.push(g.id + ' ' + t); continue; }
    // as close to the accent as reading allows: an accent already at 4.5:1 is kept
    if (cr(g.color, '#342C22') >= 4.5 ? t !== g.color.toUpperCase() : false) far.push(g.id + ' ' + t);
    if (t !== g.color.toUpperCase()) changed.push(g.id);
  }
  ok(!low.length, 'every accent\'s dark-theme text reads at 4.5:1 or more on the lightest dark surface' + (low.length ? ': ' + low.join(', ') : ''));
  // the range only proves txt() ran on the list; it grows with the games (31 at Crazy Eights, #416;
  // 41 at Air Hockey, #524)
  ok(!far.length && changed.length >= 20 && changed.length <= 50, 'accents that already read keep their colour; ' + changed.length + ' are lightened' + (far.length ? ' (changed needlessly: ' + far.join(', ') + ')' : ''));
  const bw = txt('#3C4F9A');
  ok(cr(bw, '#342C22') < 5.5 && lum(bw) > lum('#3C4F9A') && txt('nonsense') === '', 'Bowling\'s blue is lightened only as far as needed (' + bw + ', ' + cr(bw, '#342C22').toFixed(2) + ':1), and a bad colour gives nothing');
  const rules = ['.ch-game__pin--on', '.ch-badge--accent', '.ch-btn--soft', '.ch-iconbtn[aria-pressed="true"]', '.ch-seg button[aria-selected="true"]'];
  ok(rules.every((r) => css.indexOf(':root:not([data-theme="light"]) ' + r) > 0 && css.indexOf(':root[data-theme="dark"] ' + r) > 0) &&
    (css.match(/\{ color: var\(--game-text-dark, var\(--game, var\(--c-accent\)\)\); \}/g) || []).length === 2,
    'the dark theme gives the lightened text to the selected option, soft buttons, accent badges, pressed icon buttons and menu pins');
  ok(/r\.style\.setProperty\('--game-text-dark', Chogan\.textOnDark\(color\)\);/.test(core) && /r\.style\.removeProperty\('--game-text-dark'\);/.test(core), 'a game sets and clears it with its accent');
  // every place that gives an element a game's colour also gives it the dark-theme text
  // (counting a fixed four broke when #481 added the new-games row)
  const withColour = (menu.match(/'--game': g\.color/g) || []).length;
  ok(withColour >= 4 && (menu.match(/'--game': g\.color, '--game-soft': g\.soft, '--game-text-dark': C\.textOnDark\(g\.color\)/g) || []).length === withColour,
    'every menu element that carries a game colour carries its dark text too');
}

function testAnimations() {
  head('Shared motion helpers, Blackjack dealing and Minesweeper effects (#398)');
  // Blackjack's opening cards just appeared and a lost Minesweeper board showed
  // every mine in one frame; a friend of the owner found the games flat.
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8');
  const fly = (core.match(/^  ui\.fly = function \(node, from, opts\) \{[\s\S]*?^  \};$/m) || [''])[0];
  const burstAt = core.indexOf('  var fx = null;\n  ui.burst = function');
  const burstEnd = core.indexOf('\n  }\n', core.indexOf('  function fxFrame(t) {')) + 4;
  ok(fly.length > 0 && burstAt > 0 && burstEnd > burstAt, 'ui.fly and ui.burst found in the core');
  if (fly.length > 0 && burstAt > 0) coreMotion(core, css, fly, burstAt, burstEnd);
  gameMotion();
}

function coreMotion(core, css, fly, burstAt, burstEnd) {
  const make = (reduced) => {
    const env = { appended: [], frames: [], now: 1000, anims: [] };
    const mkEl = (tag, attrs) => ({ tag, attrs: attrs || {}, style: { setProperty(k, v) { this[k] = v; } }, kids: [], parentNode: null,
      appendChild(k) { this.kids.push(k); k.parentNode = this; env.appended.push(k); return k; },
      removeChild(k) { this.kids.splice(this.kids.indexOf(k), 1); k.parentNode = null; return k; },
      getContext: () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } }) });
    const body = mkEl('body');
    const ui = { reduceMotion: () => reduced };
    vm.runInNewContext(fly + '\n' + core.slice(burstAt, burstEnd), { ui, el: mkEl, global: { devicePixelRatio: 1 }, innerWidth: 400, innerHeight: 800,
      isFinite, Math, document: { body }, performance: { now: () => env.now }, requestAnimationFrame: (f) => env.frames.push(f) });
    Object.assign(env, { ui, body, el: mkEl });
    env.run = (ms) => { for (let t = 0; t <= ms && env.frames.length; t += 16) { env.now += 16; env.frames.splice(0).forEach((cb) => cb(env.now)); } };
    return env;
  };
  const cardAt = (env, left, top, w, h) => {
    const n = env.el('button');
    n.getBoundingClientRect = () => ({ left, top, width: w, height: h });
    n.animate = (frames, o) => { const a = { frames, o }; env.anims.push(a); return a; };
    return n;
  };
  let e = make(false);
  const card = cardAt(e, 100, 100, 50, 70);
  const shoe = { getBoundingClientRect: () => ({ left: 300, top: 20, width: 25, height: 35 }) };
  const a = e.ui.fly(card, shoe, { delay: 190 });
  ok(a && e.anims.length === 1 && a.frames[0].transform === 'translate(187.5px,-97.5px) scale(0.500)' && a.frames[1].transform === 'none',
    'fly starts the card at the shoe, half its size, and ends it in its own place (' + (a ? a.frames[0].transform : 'none') + ')');
  ok(a && a.o.delay === 190 && a.o.fill === 'backwards' && a.o.duration > 0, 'a delayed card waits at the shoe, not in its place');
  // #491: a start as wide as the table (Hokm's partner seat) began the card six times its size
  const seat = { getBoundingClientRect: () => ({ left: 0, top: 10, width: 360, height: 60 }) };
  const wide = e.ui.fly(card, seat, {});
  const ks = wide && /scale\(([\d.]+)\)/.exec(wide.frames[0].transform);
  ok(ks && +ks[1] <= 1.25 && +ks[1] >= 1, 'a card leaving a wide seat starts at most a little bigger than itself (scale ' + (ks ? ks[1] : '?') + ', the seat is 7.2× the card)');
  const f = e.ui.fly(card, card, { flip: true });
  const cover = card.kids.find((k) => /ch-turnback/.test(k.attrs.class || ''));
  ok(f && f.frames.length === 3 && /scaleX\(\.02\)/.test(f.frames[1].transform) && cover && /ch-pback/.test(cover.attrs.class),
    'a flip narrows the card to an edge halfway, under a copy of the chosen back');
  if (f) f.onfinish();
  ok(cover && !cover.parentNode, 'the back is taken off when the turn ends');
  ok(e.ui.burst({ x: 50, y: 60 }, { ring: 20 }) === true && e.ui.burst({ x: 10, y: 10 }) === true, 'two bursts at once are accepted');
  const layers = e.appended.filter((n) => n.tag === 'canvas');
  ok(layers.length === 1 && /ch-fx/.test(layers[0].attrs.class) && layers[0].parentNode === e.body, 'bursts share one layer on the page');
  e.run(2000);
  ok(layers.length === 1 && layers[0].parentNode === null && e.frames.length === 0, 'the layer leaves the page and its frame loop stops when the sparks are gone');
  ok(e.ui.burst({ x: 1, y: 1 }) === true && e.appended.filter((n) => n.tag === 'canvas').length === 2, 'a later burst builds the layer again');
  ok(e.ui.burst({ x: NaN, y: 1 }) === false, 'a burst with no place draws nothing');
  e = make(true);
  const still = cardAt(e, 0, 0, 50, 70);
  ok(e.ui.fly(still, shoe, { flip: true }) === null && e.anims.length === 0 && !still.kids.length && e.ui.burst({ x: 5, y: 5 }) === false && !e.appended.length,
    'with reduced motion nothing flies, turns or bursts');
  ok(/\.ch-fx \{ position: fixed; inset: 0; z-index: 50; pointer-events: none; \}/.test(css) && /\.ch-scrim \{[^}]*z-index: 60;/.test(css),
    'the spark layer never takes a tap and stays under dialogs');
}

function gameMotion() {
  // Blackjack: dealt from the shoe, opening cards in turn, hole card turned in place
  const bj = fs.readFileSync(path.join(ROOT, 'www/games/blackjack/index.html'), 'utf8');
  ok(!/bj-in/.test(bj) && /var shoe = C\.cards\.back\('bj-shoe'\);/.test(bj), 'Blackjack deals from a shoe instead of popping cards in');
  ok(/C\.ui\.fly\(b, shoe, \{ flip: true, delay: opening \? i \* 2 \* STEP : 0 \}\);/.test(bj) && /last = \(i < 2 \? i \* 2 \+ 1 : i \+ 2\) \* STEP;\n\s+C\.ui\.fly\(b, shoe, \{ flip: i < target, delay: last \}\);/.test(bj),
    'the opening deal alternates you and the dealer, and the hole card arrives face down');
  ok(/C\.ui\.fly\(b, k === 2 \? b : shoe, \{ flip: true \}\);/.test(bj), 'at the end the hole card turns where it lies and drawn cards come from the shoe');
  ok(/seenP = S\.H\.player\.length;\n\s+render\(false\);/.test(bj) && /shown = 0; seenP = 0;/.test(bj), 'a restored hand is drawn still; a new hand is dealt again');

  // Minesweeper: run blowUp and sweep on a small board
  const ms = fs.readFileSync(path.join(ROOT, 'www/games/minesweeper/index.html'), 'utf8');
  const fnOf = (name) => (ms.match(new RegExp('^  function ' + name + '\\(\\w*\\) \\{[\\s\\S]*?^  \\}$', 'm')) || [''])[0];
  ok(fnOf('blowUp').length > 0 && fnOf('sweep').length > 0, 'blowUp and sweep found in Minesweeper');
  if (!fnOf('blowUp') || !fnOf('sweep')) return;
  const board = (reduced, lastAt) => {
    // 4 x 4, mines at 0, 3, 5 and 15
    const cells = Array.from({ length: 16 }, () => ({ classList: { list: [], add(c) { this.list.push(c); } }, style: {} }));
    const bursts = [];
    const sb = { S: { spec: { cols: 4 }, mine: [1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], done: true }, cells, lastAt, Math,
      C: { ui: { reduceMotion: () => reduced, burst: (at) => { bursts.push(at); } } }, setTimeout: () => {} };
    vm.runInNewContext(fnOf('blowUp') + fnOf('sweep') + ';this.blowUp = blowUp; this.sweep = sweep;', sb);
    return { sb, cells, bursts };
  };
  let b = board(false, 10);
  const spent = b.sb.blowUp(5);
  const delay = (i) => parseInt(b.cells[i].style.animationDelay, 10);
  ok(b.bursts[0] === b.cells[5] && !b.cells[5].classList.list.length, 'the mine that was hit bursts first and is not shown again');
  ok([0, 3, 15].every((i) => b.cells[i].classList.list.indexOf('ms-blow') >= 0) && delay(0) < delay(3) && delay(3) < delay(15),
    'the other mines go off nearest first (' + [0, 3, 15].map(delay).join(', ') + ' ms)');
  ok(spent >= delay(15) && spent < 1200, 'the result waits for the last mine, and never long (' + spent + ' ms)');
  b = board(false, 10);
  const wave = b.sb.sweep();
  const w = (i) => parseInt(b.cells[i].style.animationDelay, 10);
  ok(w(10) === 0 && w(5) === 40 && w(0) === 80 && b.cells[0].classList.list[0] === 'ms-flagin' && b.cells[10].classList.list[0] === 'ms-wave',
    'a win sends a wave out from the last cell opened, mines turning to flags as it passes');
  ok(wave === 80 + 420, 'the result waits for the wave (' + wave + ' ms)');
  b = board(true, 10);
  ok(b.sb.blowUp(5) === 0 && b.sb.sweep() === 0 && b.cells.every((c) => !c.classList.list.length), 'with reduced motion the board just shows its end');
  ok(/if \(S\.flagged\[idx\] && cells\[idx\]\) cells\[idx\]\.classList\.add\('ms-flagin'\);/.test(ms) && /var spent = blowUp\(idx\);/.test(ms) &&
    /\}, 620 \+ Math\.max\(0, spent - 300\)\);/.test(ms) && /if \(wave\) setTimeout\(function \(\) \{ ctx\.finish\(result\); \}, wave\); else ctx\.finish\(result\);/.test(ms),
    'placing a flag drops it in, a loss runs the chain and a win the wave before the result');
}

function testAndroidBars() {
  head('Android: system bars follow the app theme, not the device (#402)');
  // The navigation bar stayed cream under the dark theme: Capacitor's SystemBars
  // follows the device's night mode, and the page never told Android its theme.
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8');
  const fn = (core.match(/^  Chogan\.applyTheme = function \(\) \{[\s\S]*?^  \};$/m) || [''])[0];
  ok(fn.length > 0, 'Chogan.applyTheme found in the core');
  const run = (theme, deviceDark, bridge) => {
    const calls = [];
    const root = { setAttribute() {}, removeAttribute() {} };
    const g = { matchMedia: () => ({ matches: deviceDark }) };
    if (bridge) g.ChoganBars = { setDark: (d) => calls.push(d) };
    const C = {};
    try {
      vm.runInNewContext('(function (Chogan, state, global, document) { ' + fn + ' Chogan.applyTheme(); })', {})(C, { settings: { theme } }, g,
        { documentElement: root, querySelector: () => null });
    } catch (e) { return 'threw ' + e.message; }
    return calls.join(',');
  };
  ok(run('dark', false, true) === 'true' && run('light', true, true) === 'false', 'a fixed theme tells the bars its own darkness, against the device');
  ok(run('auto', true, true) === 'true' && run('auto', false, true) === 'false', 'auto follows the device');
  ok(run('dark', false, false) === '', 'on the web, with no bridge, nothing is called and nothing throws');
  ok(/var onch = function \(\) \{ Chogan\.applyTheme\(\); \};/.test(core), 'a device theme change applies the theme again, fixed themes too');
  const java = (f) => { try { return fs.readFileSync(path.join(ROOT, 'android/app/src/main/java/io/github/choganhq/chogan', f), 'utf8'); } catch (e) { return ''; } };
  const bars = java('BarsBridge.java'), main = java('MainActivity.java');
  const bg = (block) => ((css.match(block) || [''])[0].match(/--c-bg: +#([0-9A-F]{6});/) || [])[1];
  const light = bg(/^:root \{[\s\S]*?^\}/m), dark = bg(/^:root\[data-theme="dark"\] \{[\s\S]*?^\}/m);
  ok(light && dark && bars.indexOf('BG_LIGHT = 0xFF' + light + ';') > 0 && bars.indexOf('BG_DARK = 0xFF' + dark + ';') > 0,
    'the bars take the page backgrounds (#' + light + ', #' + dark + ')');
  ok(/@JavascriptInterface\s+public void setDark\(boolean isDark\)/.test(bars) && /setNavigationBarContrastEnforced\(false\)/.test(bars) &&
    /setAppearanceLightNavigationBars\(!d\)/.test(bars) && /setAppearanceLightStatusBars\(!d\)/.test(bars) && /getDecorView\(\)\.setBackgroundColor\(bg\)/.test(bars),
    'the bridge sets the decor background, the bar colours, no scrim, and the icon appearance');
  ok(/addJavascriptInterface\(bars, "ChoganBars"\)/.test(main) && /super\.onConfigurationChanged\(newConfig\);\s+\/\/[^\n]*\n\s+if \(bars != null\) bars\.reapply\(\);/.test(main),
    'MainActivity registers the bridge and repaints after SystemBars on a configuration change');
}

function testDartsVisit() {
  head('Darts: the finished visit and every dart\'s score stay readable (#404)');
  // The state passes the turn as the third dart lands, and the cards showed only
  // the current player's darts, so the third dart and the bot's visit vanished;
  // a bull showed as a word with no score.
  const page = fs.readFileSync(path.join(ROOT, 'www/games/darts/index.html'), 'utf8');
  const fnOf = (name) => (page.match(new RegExp('^  function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?^  \\}$', 'm')) || [''])[0];
  ok(fnOf('scoreOf').length > 0 && fnOf('drawPlayers').length > 0, 'scoreOf and drawPlayers found in Darts');
  const mk = (tag, attrs, kids) => ({ tag, attrs: attrs || {}, kids: kids || [], classList: { add() {} }, appendChild(k) { this.kids.push(k); } });
  const text = (n) => (typeof n === 'string' ? n : (n.attrs.text || '') + n.kids.map(text).join(''));
  const show = (G) => {
    const row = mk('div');
    row.innerHTML = '';
    try {
      vm.runInNewContext(fnOf('scoreOf') + fnOf('drawPlayers') + 'drawPlayers();', {
        G, playersRow: row, el: mk, labelOf: (x) => x, pname: (k) => 'p' + k, isBot: (k) => k === 1,
        C: { num: String, t: (k) => k } });
    } catch (e) { return ['threw ' + e.message]; }
    return row.kids.map((b) => text(b.kids[2]));
  };
  // you have just thrown T20, the bull and a 5; the bot is up
  const after = show({ done: false, s: { turn: 1, rem: [386, 501], darts: [], last: { seat: 0, darts: ['T20', 'BULL', 'S5'], bust: false, total: 115 } } });
  ok(after[0] === '60505= 115' && after[1] === '···', 'after your third dart your card keeps all three as scores, with the total (' + after.join(' | ') + ')');
  const mid = show({ done: false, s: { turn: 1, rem: [386, 441], darts: ['T20'], last: { seat: 0, darts: ['T20', 'BULL', 'S5'], bust: false, total: 115 } } });
  ok(mid[0] === '60505= 115' && mid[1] === '60··', 'while the bot throws, both its darts so far and your last visit show');
  const bust = show({ done: false, s: { turn: 0, rem: [40, 32], darts: [], last: { seat: 1, darts: ['T20'], bust: true, total: 0 } } });
  ok(bust[1] === '60··bust' && bust[0] === '···', 'a bust visit shows as a bust on its player\'s card');
  ok(/G\.msg \+= ' — ' \+ C\.t\('bust'\);/.test(page) && /G\.msg \+= ' — ' \+ C\.t\('turnTotal'/.test(page), 'the last dart of a visit is named before its total, not replaced by it');
  ok(/var VISIT_MS = 1700, BOT_DART_MS = 1000;/.test(page) && /later\(botThrow, BOT_DART_MS\)/.test(page) && /\}, VISIT_MS\);/.test(page), 'the bot\'s darts and a finished visit stay up long enough to read');
  ok(/marks\.push\(\{ x: x, y: y, seat: who, score: h\.score \}\);/.test(page) && /if \(o\.scores\) \{[\s\S]{0,60}\(o\.marks \|\| \[\]\)\.forEach\(function \(m\) \{ if \(m\.score != null\) paintScore\(g, m\.x \* rb, m\.y \* rb, m\.score, col\.c\[m\.seat\] \|\| col\.c\[0\], rb, placed\);/.test(page) &&
    /paintBoard\(g, B\.w, \{ marks: marks, scores: true,/.test(page), 'each dart on the board carries a tag with its score, the bull\'s 50 too');
}

function testHokmMotion() {
  head('Hokm: dealt, played and swept cards move; core keeps a node\'s own transform (#407)');
  // Hokm's cards appeared and vanished in place; and a trick card centred with
  // translate(-50%) would jump at the end of a fly that ended on 'none'.
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const fly = (core.match(/^  ui\.fly = function \(node, from, opts\) \{[\s\S]*?^  \};$/m) || [''])[0];
  const send = (core.match(/^  ui\.sendTo = function \(node, to, opts\) \{[\s\S]*?^  \};$/m) || [''])[0];
  ok(fly.length > 0 && send.length > 0, 'ui.fly and ui.sendTo found in the core');
  if (fly && send) {
    const anims = [];
    const ui = { reduceMotion: () => false };
    const centred = 'matrix(1, 0, 0, 1, -25, 0)';
    vm.runInNewContext(fly + '\n' + send, { ui, el: () => ({ style: { setProperty() {} } }), global: { getComputedStyle: () => ({ transform: centred }) } });
    const node = { getBoundingClientRect: () => ({ left: 100, top: 100, width: 50, height: 70 }), animate: (f, o) => { const a = { f, o }; anims.push(a); return a; }, appendChild() {} };
    const a = ui.fly(node, { left: 100, top: 0, width: 50, height: 70 });
    ok(a && a.f[0].transform === 'translate(0.0px,-100.0px) ' + centred + ' scale(1.000)' && a.f[1].transform === centred, 'a centred card flies in and ends on its own centring, not on none');
    const b = ui.sendTo(node, { left: 300, top: 100, width: 20, height: 20 });
    ok(b && b.f[0].transform === centred && b.f[1].transform === 'translate(185.0px,-25.0px) ' + centred + ' scale(0.4)' && b.o.fill === 'forwards' && b.f[1].opacity < 1,
      'sendTo moves a node to the target\'s centre, shrinking and fading, and holds it there');
    ui.reduceMotion = () => true;
    ok(ui.sendTo(node, { left: 0, top: 0, width: 1, height: 1 }) === null, 'with reduced motion nothing is sent');
  }
  const hk = fs.readFileSync(path.join(ROOT, 'www/games/hokm/index.html'), 'utf8');
  ok(/var src = p === 0 \? handRow\.children\[S\.hands\[0\]\.indexOf\(c\)\] : seatOf\(p\);\n\s+var from = [^\n]+\n\s+var r = E\.play\(S, p, c\);/.test(hk),
    'a played card\'s start is read before the hand is redrawn');
  ok(/C\.ui\.fly\(trickBox\.querySelector\('\[data-p="' \+ p \+ '"\]'\), from, \{ flip: p !== 0, ms: 260 \}\);/.test(hk) && /b\.setAttribute\('data-p', t\.p\);/.test(hk),
    'it slides to the table, and the others\' cards turn face up on the way');
  ok(/aiTimer = setTimeout\(function \(\) \{ sweep\(function \(\) \{ holdTrick = null;/.test(hk) && /var go = function \(\) \{ if \(S === mine\) then\(\); \};/.test(hk) && /if \(!last\) \{ then\(\); return; \}/.test(hk),
    'after the hold the trick goes to its winner, and a new match started meanwhile is left alone');
  ok(/if \(fresh\.length > 1\) \{\n\s+fresh\.forEach\(function \(c, k\) \{ C\.ui\.fly\(handRow\.children\[mine\.indexOf\(c\)\], trickBox, \{ flip: true, ms: 280, delay: k \* 45 \}\); \}\);/.test(hk) &&
    /handSeen = S\.hands\[0\]\.slice\(\);/.test(hk), 'a deal brings only the new cards in, one by one; a restored hand is drawn still');
  const stepBody = hk.slice(hk.indexOf('  function step() {'), hk.indexOf('  function stopAi()'));
  ok(stepBody.length > 0 && !/paint\(\)/.test(stepBody) && /function askTrump\(\) \{ \}/.test(hk),
    'step() does not repaint on its own, so cards still flying in are not replaced');
}

function testSudokuAutoNotes() {
  head('Sudoku: auto notes is a switch that follows the board (#409)');
  // It was a one-off "apply" button in the help sheet: tapped, it filled every
  // cell's notes and there was nothing to turn off.
  const page = fs.readFileSync(path.join(ROOT, 'www/games/sudoku/index.html'), 'utf8');
  const fn = (page.match(/^  function notesOf\(c\) \{[\s\S]*?^  \}$/m) || [''])[0];
  ok(fn.length > 0, 'notesOf found in Sudoku');
  // a row with 1..8 placed leaves only 9 for cell 8; cell 9 (next row) has all but 1
  const grid = new Array(81).fill(0);
  for (let i = 0; i < 8; i++) grid[i] = i + 1;
  const cand = (g, i) => { let m = 0; for (let v = 1; v <= 9; v++) { const r = Math.floor(i / 9); let used = false; for (let k = 0; k < 9; k++) if (g[r * 9 + k] === v) used = true; if (!used) m |= 1 << v; } return m; };
  const run = (auto) => {
    const sb = { prefs: { autoNotes: auto }, S: { grid, notes: { 8: [2, 3], 3: [] } }, E: { candidates: cand } };
    try { vm.runInNewContext(fn + ';this.notesOf = notesOf;', sb); } catch (e) { return () => 'threw'; }
    return (c) => JSON.stringify(sb.notesOf(c));
  };
  const on = run(true), off = run(false);
  ok(on(8) === '[9]' && off(8) === '[2,3]', 'on, an empty cell shows its candidates; off, your own notes come back');
  ok(on(3) === '[]', 'a filled cell shows no notes either way');
  const before = on(17);
  grid[9] = 9;
  ok(before === '[1,2,3,4,5,6,7,8,9]' && on(17) === '[1,2,3,4,5,6,7,8]', 'the auto notes follow a digit placed, with no button to press');
  grid[9] = 0;
  ok(/settingRow\('autoNotes', 'autoNotes'\)/.test(page) && !/onclick: function \(\) \{ fillNotes\(\); \}/.test(page) && !/function fillNotes/.test(page),
    'the help sheet shows a switch, not an apply button');
  ok(/\} else if \(notesOf\(c\)\.length\) \{/.test(page), 'the board draws notes through notesOf');
  const help = page.slice(page.indexOf('  function showHelp() {'), page.indexOf('  function showSettings() {'));
  const sets = page.slice(page.indexOf('  function showSettings() {'), page.indexOf('  function kbRow('));
  ok(/tool\('gear', 'settings', function \(\) \{ showSettings\(\); \}\);/.test(page) && /\.sd-tools \{ display: grid; grid-template-columns: repeat\(5, 1fr\);/.test(page) && !/icon: 'gear'|C\.icon\('gear'/.test(page) && help.length > 0 && !/settingRow|hlSeg/.test(help) &&
    ['showErrors', 'autoNotes'].every((k) => sets.indexOf("settingRow('" + k + "', '" + k + "')") > 0) && /hlSeg\(\)/.test(sets),
    'the options have their own gear tool beside hint, out of the help sheet, the crowded game bar and a row of their own (#413)');
}

function testPasurMotion() {
  head('Pasur: dealt, played and captured cards move (#407)');
  // Pasur's cards appeared and vanished in place, apart from the shuffle and the
  // rival's drop-in; a capture just emptied the table.
  const ps = fs.readFileSync(path.join(ROOT, 'www/games/pasur/index.html'), 'utf8');
  const has = (re) => re.test(ps);
  ok(has(/var src = byHuman \? nodeOf\(handRow, card\) : nodeOf\(tableRow, card\);\n\s+var srcRect = [^\n]+\n\s+var info = E\.play\(S, card, set\);/), 'the played card\'s place is read before the state changes');
  ok(has(/\[src\]\.concat\(info\.take\.map\(function \(c\) \{ return nodeOf\(tableRow, c\); \}\)\)\.forEach\(function \(n, i\) \{\n\s+if \(n\) last = C\.ui\.sendTo\(n, to, \{ delay: i \* 40, ms: 340 \}\) \|\| last;/) &&
    has(/var to = info\.player === 0 \? youRow : rivalRow/), 'a capture slides the played card and the cards it takes to the taker');
  ok(has(/if \(info\.sur\) C\.ui\.burst\(to,/), 'a sur bursts over the taker');
  ok(has(/sweeping = true;\n\s+last\.onfinish = go;/) && has(/var go = function \(\) \{ if \(S !== mine\) return; sweeping = false;/) && has(/!dealing && !sweeping; \}/),
    'nothing can be tapped while a capture slides, and a new game started meanwhile is left alone');
  ok(has(/if \(c === fresh\) flights\.push\(\[b, rivalFrom, true, 0\]\);/) && has(/else if \(putFrom && putFrom\.c === c\) flights\.push\(\[b, putFrom\.r, false, 0\]\);/) && !has(/ps-card--in/),
    'the rival\'s card comes from its fan and turns over, yours from your hand');
  ok(has(/if \(dealt\.length > 1\) dealt\.forEach\(function \(c\) \{ flights\.push\(\[nodeOf\(handRow, c\), tableRow, true, 0\]\); \}\);/) &&
    has(/handSeen = S\.hands\[0\]\.slice\(\); rivalSeen = S\.hands\[1\]\.length; tableSeen = S\.table\.slice\(\);\n\s+render\(\);/), 'a deal brings new cards from the deck; a restored game is drawn still');
  const ai = ps.slice(ps.indexOf('  function maybeAi() {'), ps.indexOf('    aiTimer = setTimeout', ps.indexOf('  function maybeAi() {')));
  ok(ai.length > 0 && !/paint\(\)/.test(ai), 'maybeAi does not repaint over cards still in flight');
}

function testFreecellMotion() {
  head('FreeCell: a dealt deal, a bouncing win, and reduced motion (#407)');
  // The cards just appeared at the start, the win went straight to the result,
  // and the move tween ran even with reduced motion on.
  const fc = fs.readFileSync(path.join(ROOT, 'www/games/freecell/index.html'), 'utf8');
  const has = (re) => re.test(fc);
  ok(has(/function startAnim\(before\) \{\n\s+\/\/[^\n]*\n\s+if \(C\.ui\.reduceMotion\(\)\) \{ anim = null; draw\(\); return; \}/), 'moves snap into place with reduced motion');
  ok(has(/function dealAnim\(\) \{\n\s+if \(C\.ui\.reduceMotion\(\) \|\| !L \|\| !board\.clientWidth\) return;/) && has(/from\[c\] = deck; delay\[c\] = n\+\+ \* C\.cards\.pace\(16\); cards\.push\(c\);/) && has(/resetUi\(\);\n\s+dealAnim\(\);\n\s+\}/),
    'a new deal lays the cards out one by one from a pile; a restored game is drawn still');
  ok(has(/var pr = Math\.max\(0, Math\.min\(1, \(elapsed - \(anim\.delay \? anim\.delay\[mc\] : 0\)\) \/ anim\.ms\)\);/) && has(/if \(elapsed >= anim\.ms \+ \(anim\.span \|\| 0\)\) anim = null;/),
    'each card waits for its turn and the move ends with the last card');
  ok(has(/setTimeout\(function \(\) \{ cascade\(finish\); \}, C\.cards\.pace\(260\)\);/) && has(/function cascade\(done\) \{\n\s+if \(C\.ui\.reduceMotion\(\) \|\| !L \|\| !board\.clientWidth\) \{ done\(\); return; \}/) &&
    has(/cv\.addEventListener\('pointerdown', stop\);/) && has(/t - t0 > 5000\) \{ stop\(\); return; \}/),
    'a win bounces the cards before the result, a tap ends it, and it never runs past five seconds');
  // the cascade's physics settle: a card dropped from the top bounces lower each time
  let y = 2, vy = -3, floor = 300, peaks = [], up = false;
  for (let i = 0; i < 400; i++) { vy += 0.6; y += vy; if (y > floor) { y = floor; vy *= -0.72; } if (vy < 0) up = true; if (up && vy >= 0) { peaks.push(y); up = false; } }
  ok(peaks.length > 2 && peaks.every((p, i) => i === 0 || p > peaks[i - 1]), 'with gravity 0.6 and 0.72 rebound each bounce peaks lower');
}

function testChessMotion() {
  head('Chess: moves slide, captures fade, check pulses (#407)');
  // Pieces jumped between squares and a taken piece just vanished.
  const cs = fs.readFileSync(path.join(ROOT, 'www/games/chess/index.html'), 'utf8');
  const fn = (cs.match(/^  function slide\(\) \{[\s\S]*?^  \}$/m) || [''])[0];
  ok(fn.length > 0, 'slide found in Chess');
  // run slide over fake squares: one new ply slides once, a second paint does not
  const flies = [];
  const sq = (i) => ({ querySelector: () => ({ id: 'piece' + i }), getBoundingClientRect: () => ({ left: (i & 7) * 40, top: (i >> 3) * 40, width: 40, height: 40 }) });
  const squares = Array.from({ length: 64 }, (_, i) => sq(i));
  const sb = { G: { sans: [], lastMove: null }, S: { board: new Array(64).fill('') }, squares, taken: null, shownPly: -1, flipped: () => false,
    el: () => ({}), document: { body: { appendChild() {} } }, setTimeout() {}, pieceSvg: () => '', Math,
    C: { ui: { reduceMotion: () => false, fly: (n, from, o) => flies.push([n.id, from.left, from.top, o.ms]) } } };
  let run = () => {};
  try { vm.runInNewContext(fn + ';this.slide = slide;', sb); run = () => sb.slide(); } catch (e) { ok(false, 'slide did not run: ' + e.message); }
  run();
  ok(flies.length === 0, 'the first paint of a game slides nothing');
  sb.G.sans.push('e4'); sb.G.lastMove = { from: 52, to: 36 }; sb.S.board[36] = 'P';
  run(); run();
  ok(flies.length === 1 && flies[0][0] === 'piece36' && flies[0][1] === 4 * 40 + 2.4 && flies[0][3] === 200, 'a new move slides its piece once from the old square, in 200 ms, however often the board repaints');
  sb.G.sans.push('O-O'); sb.G.lastMove = { from: 4, to: 6 }; sb.S.board[6] = 'k'; sb.S.board[5] = 'r';
  run();
  ok(flies.length === 3 && flies[2][0] === 'piece5' && flies[2][1] === 7 * 40 + 2.4, 'castling slides the rook from its corner as well');
  sb.G.sans.pop(); sb.G.lastMove = { from: 52, to: 36 };
  run();
  ok(flies.length === 3, 'an undo is drawn still');
  ok((cs.match(/taken = S\.board\[m\.to\] \? \{ sq: m\.to, p: S\.board\[m\.to\] \} : null;\n\s+S = E\.make\(S, m\);/g) || []).length === 2 && /movesEl\.scrollTop = movesEl\.scrollHeight;\n\s+slide\(\);/.test(cs),
    'a capture is remembered before the move, in games and puzzles alike, and every paint ends with slide');
  ok(/\.cs-sq--check::before \{[^}]*animation: cs-check/.test(cs) && /if \(gone && !C\.ui\.reduceMotion\(\)\)/.test(cs), 'check pulses, and the taken piece fades unless motion is reduced');
}

function testStonesMotion() {
  head('Gomoku and Go: stones drop in, the five draw, captures fade (#407)');
  // Stones appeared at once, the winning line was there at once, and captured
  // Go stones vanished in the same frame as the move.
  const page = (g) => fs.readFileSync(path.join(ROOT, 'www/games', g, 'index.html'), 'utf8');
  const fnOf = (src) => { const a = src.indexOf('  var fx = {'), b = src.indexOf('\n  }\n', src.indexOf('  function motion(', a)) + 4; return a > 0 && b > a ? src.slice(a, b) : ''; };
  const gm = page('gomoku'), go = page('go');
  ok(fnOf(gm).length > 0 && fnOf(go).length > 0, 'motion found in Gomoku and Go');
  if (!fnOf(gm) || !fnOf(go)) return;
  let now = 1000;
  const sbFor = (src, S, reduced) => { const sb = { S, Math, C: { ui: { reduceMotion: () => reduced } }, performance: { now: () => now } }; vm.runInNewContext(fnOf(src) + ';this.motion = motion;', sb); return sb; };
  // Gomoku
  let S = { history: [] }, sb = sbFor(gm, S, false);
  let m = sb.motion(0, false);
  ok(m.drop === 1 && m.line === 1, 'Gomoku: the first draw is still');
  now = 2000; m = sb.motion(1, false);
  ok(m.drop === 0, 'Gomoku: a new stone starts its drop');
  now = 2090; m = sb.motion(1, false);
  ok(m.drop === 0.5, 'Gomoku: halfway through after 90 ms, and a repaint does not restart it');
  now = 3000; m = sb.motion(0, false);
  ok(m.drop === 1, 'Gomoku: an undo is drawn still');
  now = 4000; sb.motion(1, false); m = sb.motion(1, true);
  ok(m.line === 0, 'Gomoku: the winning line starts drawing when it appears');
  sb = sbFor(gm, { history: [] }, true); sb.motion(0, false); now = 5000; m = sb.motion(1, true);
  ok(m.drop === 1, 'Gomoku: nothing drops with reduced motion');
  // Go: a capture
  const before = new Array(81).fill(0), after = new Array(81).fill(0);
  before[1] = 2; before[0] = 0; after[0] = 1; after[10] = 1; after[2] = 1;
  S = { history: [], g: { board: before } }; now = 6000; sb = sbFor(go, S, false); sb.motion();
  S.history.push({ g: { board: before.slice() }, last: -1 }); S.g.board = after.slice(); S.g.board[1] = 0; now = 6100;
  m = sb.motion();
  ok(m.drop === 0 && m.gone.length === 1 && m.gone[0].i === 1 && m.gone[0].who === 2 && m.gone[0].k === 0, 'Go: the captured stone is found and starts to fade');
  now = 6500; m = sb.motion();
  ok(m.gone.length === 0 && m.drop === 1, 'Go: after the fade nothing is left over');
}

function testSudokuRipple() {
  head('Sudoku: a finished row, column or box ripples (#407)');
  // Finishing a unit had no moment of its own.
  const sd = fs.readFileSync(path.join(ROOT, 'www/games/sudoku/index.html'), 'utf8');
  const fn = (sd.match(/^  function ripple\(i\) \{[\s\S]*?^  \}$/m) || [''])[0];
  ok(fn.length > 0, 'ripple found in Sudoku');
  if (!fn) return;
  const sol = [];
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) sol.push(((r * 3 + Math.floor(r / 3) + c) % 9) + 1);
  const grid = new Array(81).fill(0);
  for (let c = 0; c < 9; c++) grid[c] = sol[c];          // row 0 complete
  const cells = Array.from({ length: 81 }, () => ({ classList: { list: [], add(x) { this.list.push(x); }, remove() {} }, style: {} }));
  const run = (reduced) => { const sb = { S: { grid, solution: sol }, cells, Math, Object, Number, setTimeout() {}, C: { ui: { reduceMotion: () => reduced } } }; vm.runInNewContext(fn + ';this.ripple = ripple;', sb); return sb.ripple; };
  let out = run(false)(4);
  ok(out.length === 9 && out.every((c) => c < 9) && cells[4].style.animationDelay === '0ms' && cells[0].style.animationDelay === '140ms', 'the finished row ripples out from the last digit, 35 ms a step');
  grid[9] = sol[9]; grid[18] = sol[18];
  for (let r = 3; r < 9; r++) grid[r * 9] = sol[r * 9];
  out = run(false)(0);
  ok(out.length === 17, 'a digit finishing a row and a column ripples both (' + out.length + ' cells)');
  grid[1] = 0;
  out = run(false)(0);
  ok(out.length === 9 && out.every((c) => c % 9 === 0), 'an unfinished row stays still');
  ok(run(true)(0).length === 0, 'nothing ripples with reduced motion');
  ok(/if \(v && !noteMode && v === S\.solution\[selected\]\) ripple\(selected\);/.test(sd), 'a correct digit placed triggers the ripple; notes and mistakes do not');
}

function testReversiMotion() {
  head('Reversi: the disc drops in, then the flips ripple out (#407)');
  // Every flip turned in the same 300 ms while the new disc grew, so a long
  // capture read as one blink rather than a chain.
  const src = fs.readFileSync(path.join(ROOT, 'www/games/reversi/index.html'), 'utf8');
  const a0 = src.indexOf('  var DROP_MS'), b0 = src.indexOf('\n  }\n', src.indexOf('  function animEnd(', a0)) + 4;
  ok(a0 > 0 && b0 > a0, 'animPhase found in Reversi');
  if (!(a0 > 0 && b0 > a0)) return;
  const sb = { Math };
  vm.runInNewContext(src.slice(a0, b0) + ';this.animPhase = animPhase; this.animEnd = animEnd;', sb);
  // placed on d4 (27); flips to the right on e4, f4 (28, 29) and far along the row to h4 (31)
  const a = { i: 27, flips: [28, 29, 30], t0: 1000 };
  ok(sb.animPhase(a, 27, 1075) === 0.5, 'the placed disc is halfway down after 75 ms');
  ok(sb.animPhase(a, 28, 1140) === 0, 'no flip starts before the disc has landed');
  const near = sb.animPhase(a, 28, 1300), far = sb.animPhase(a, 30, 1300);
  ok(near > far && near > 0, 'the nearest flip is ahead of the far one (' + near.toFixed(2) + ' vs ' + far.toFixed(2) + ')');
  ok(sb.animPhase(a, 30, 1000 + sb.animEnd(a)) === 1, 'every flip has finished at the end');
  const long = { i: 0, flips: [9, 18, 27, 36, 45, 54, 63], t0: 0 };
  ok(sb.animEnd(long) <= 1000, 'the longest ripple stays within a second (' + sb.animEnd(long) + ' ms)');
  ok(/if \(C\.ui\.reduceMotion\(\)\) \{ anim = null; draw\(\); return; \}/.test(src), 'reduced motion draws the move still');
}

// #391: Huevo Style, a third rule set designed by HuevosKicker, rule by rule as the
// gist states them (H1–H6, Q1–Q14)
function testCheckersHuevo() {
  head('Checkers: Huevo Style (#391)');
  const t0 = Date.now();
  const E = loadEngine('checkers', 'CheckersEngineFactory');
  const html = fs.readFileSync(path.join(ROOT, 'www/games/checkers/index.html'), 'utf8');
  const sq = (r, c) => r * 8 + c;
  const B = (rows) => { const map = { '.': 0, x: 1, o: 2, X: 3, O: 4, q: 5, Q: 6, e: 7, E: 8 }; const b = []; rows.forEach((r) => r.split('').forEach((ch) => b.push(map[ch]))); return b; };
  const st = (board, turn) => Object.assign(E.newState('2p', 'huevo'), { board, turn: turn || 1 });
  const ms = (b, p, S) => E.moves(b, p, 'huevo', true, S);
  const key = (m) => m.from + '>' + m.path.join('>');
  const S0 = E.newState('2p', 'huevo');
  ok(S0.board[53] === 5 && S0.board[10] === 6 && S0.free && S0.qt.join() === '0,15,15' && S0.board.filter((v) => v).length === 24, 'each side starts with a Queen in place of a man, on squares 53 and 10 (Q1), capture optional (H4)');
  // H1, H2: a king flies to its first victim and lands right behind it; the second hop is short
  let b = B(['........', '........', '........', '....o...', '........', '..o.....', '........', 'X.......']);
  let k = ms(b, 1).filter((m) => m.caps.length).map(key);
  const far = ms(B(['........', '........', '.....o..', '........', '........', '..o.....', '........', 'X.......']), 1).filter((m) => m.caps.length).map(key);
  ok(k.join() === '56>35,56>35>21' && far.join() === '56>35', 'a king flies on the first hop only and lands right behind each piece taken (H1, H2) (' + k.join(' ') + ' | ' + far.join(' ') + ')');
  // H3, H4: a chain may stop after any landing, and a quiet step stays legal beside a jump
  b = B(['........', '........', '........', '....o...', '........', '..o.....', '.x......', '........']);
  k = ms(b, 1).map(key);
  ok(k.indexOf('49>35') >= 0 && k.indexOf('49>35>21') >= 0 && k.indexOf('49>40') >= 0, 'a chain may stop after any landing and capturing is optional (H3, H4)');
  // Q3: the Queen steps one square any way and captures backwards like a man
  b = B(['........', '........', '........', '........', '...q....', '..o.....', '........', '........']);
  k = ms(b, 1).map(key);
  ok(k.sort().join() === ['35>26', '35>28', '35>44', '35>49'].sort().join(), 'the Queen steps one square any way and captures backwards (Q3)');
  // Q4, Q5: on the far row she becomes an Empress, who flies on every hop
  b = B(['........', '..q.....', '........', '........', '........', '........', '........', '.......o']);
  const promo = ms(b, 1).filter((m) => m.crown);
  const S1 = st(b.slice()); S1.board[sq(7, 7)] = 2; E.applyMove(S1, promo[0]);
  ok(promo.length === 2 && S1.board[promo[0].path[0]] === 7, 'a Queen on the far row becomes an Empress (Q4)');
  b = B(['........', '........', '.....o..', '........', '........', '..o.....', '........', 'e.......']);
  k = ms(b, 1).filter((m) => m.caps.length).map(key);
  ok(k.indexOf('56>35') >= 0 && k.indexOf('56>35>21') < 0, 'an Empress flies on every hop: from 35 she reaches the piece two squares away (Q5)');
  const fly2 = ms(B(['........', '........', '........', '....o...', '........', '..o.....', '........', 'e.......']), 1).filter((m) => m.caps.length).map(key);
  ok(fly2.indexOf('56>35>21') >= 0, 'and chains on, landing right behind each piece');
  // Q2: taking the Queen wins at once
  let S = st(B(['........', '........', '........', '...Q....', '..x.....', '........', '........', '......q.']), 1);
  E.applyMove(S, { from: sq(4, 2), path: [sq(2, 4)] });
  ok(S.winner === 1 && S.reason === 'queen', 'capturing the Queen wins the game (Q2)');
  // H5, Q8: stuck, or only the Queen can move: the count decides
  S = st(B(['........', '........', '........', 'o.o.....', '.o.o....', '..x.....', '........', 'q.....Q.']), 1);
  S.board[sq(6, 1)] = 0; S.board[sq(6, 3)] = 0;
  ms(S.board, 1, S).length;
  S.board[sq(3, 0)] = 2; S.board[sq(3, 4)] = 2;
  E.settle(S);
  ok(S.winner === 2 && S.reason === 'count', 'a side whose only moves are the Queen\'s is judged on the count of pieces (H5, Q8)');
  // Q6, Q7, Q11: the edge clock
  S = st(B(['.Q......', '......O.', '........', '....X...', '........', '........', '........', 'q.......']), 1);
  const clock = [];
  for (let t = 0; t < 40 && S.winner < 0; t++) {
    const m = ms(S.board, S.turn, S);
    if (S.turn === 1) clock.push(S.qt[1]);
    E.applyMove(S, m.find((x) => E.isKing(S.board[x.from]) && !x.caps.length) || m[0]);
  }
  ok(clock.slice(0, 17).join() === '15,14,13,12,11,10,9,8,7,6,5,4,3,2,1,0,15', 'a Queen on the edge has fifteen turns, then must step off, and the clock winds back (Q6, Q7) (' + clock.join(',') + ')');
  S = st(B(['.Q......', '......O.', '........', '....X...', '........', '..o.....', '.o......', 'q.......']), 1);
  S.qt[1] = 0; E.settle(S);
  ok(S.winner === 2 && S.reason === 'timer', 'a Queen who cannot step off when her clock runs out loses the game (Q7)');
  const SA = st(B(['........', '........', '........', '...q....', '....X...', '........', '......O.', '........']), 1);
  SA.board[sq(0, 1)] = 6;
  E.applyMove(SA, { from: sq(3, 3), path: [sq(2, 2)] });
  E.applyMove(SA, { from: sq(6, 6), path: [sq(7, 7)] });
  E.applyMove(SA, { from: sq(2, 2), path: [sq(1, 1)] });
  ok(SA.qt[1] === 15, 'arriving on an edge does not start the clock (Q11)');
  // Q9, Q10: the lone Queen's last move; two lone Queens draw
  S = st(B(['........', '........', '........', '........', '........', '..o.....', '...O....', 'q......Q']), 1);
  S.board[sq(6, 3)] = 0; S.board[sq(5, 2)] = 2;
  E.settle(S);
  const lone = S.lone === 1 && S.winner < 0;
  E.applyMove(S, ms(S.board, 1, S).find((m) => !m.caps.length));
  ok(lone && S.winner === 2 && S.reason === 'lone', 'a side left with only its Queen gets one last move, then loses (Q9)');
  S = st(B(['q.......', '........', '........', '........', '........', '........', '........', '......Q.']), 1);
  E.settle(S);
  ok(S.winner === 0 && S.reason === 'lone', 'two lone Queens draw (Q10)');
  // H6, Q12: sixty quiet plies draw, and a Queen's step is not progress
  S = st(B(['.O......', '........', '.....Q..', '..q.....', '........', '........', '........', '......X.']), 1);
  for (let i = 0; i < 70 && S.winner < 0; i++) { const m = ms(S.board, S.turn, S); E.applyMove(S, m.find((x) => !x.caps.length && !E.isRoyal(S.board[x.from])) || m.find((x) => !x.caps.length) || m[0]); }
  ok(S.winner === 0 && S.reason === 'quiet' && S.history.length === 60, 'sixty plies without a capture or a man moving draw (H6, Q12) (' + S.history.length + ')');
  // Undo brings back the clock
  const SU = st(B(['.Q......', '......O.', '........', '....X...', '........', '........', '........', 'q.......']), 1);
  // quiet king moves only: a capture here would leave Black a lone Queen and end the game
  const quietKing = (p) => ms(SU.board, p, SU).find((x) => E.isKing(SU.board[x.from]) && !x.caps.length);
  E.applyMove(SU, quietKing(1));
  E.applyMove(SU, quietKing(2));
  E.applyMove(SU, quietKing(1));
  const before = SU.qt[1]; SU.mode = '2p'; E.takeBack(SU);
  ok(before === 13 && SU.qt[1] === 14, 'undo winds the edge clock back (' + before + ' → ' + SU.qt[1] + ')');
  // The bots play it: medium beats easy from either side, hard beats medium, fast enough
  const rng = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
  const game = (a, c, seed) => { const G = E.newState('ai', 'huevo'); const r = rng(seed); let n = 0, slow = 0;
    while (G.winner < 0 && n < 300) { const t = Date.now(); const mv = E.aiMove(G.board, G.turn, G.turn === 1 ? a : c, r, 'huevo', true, G); slow = Math.max(slow, Date.now() - t); if (!mv) break; E.applyMove(G, mv); n++; }
    return { w: G.winner, slow }; };
  // a Huevo game can end in a draw on the count or the quiet rule, so the bar is wins
  // against losses over several games, from both sides
  const me = [0, 1, 2].map((i) => game('medium', 'easy', 100 + i)), em = [0, 1, 2].map((i) => game('easy', 'medium', 100 + i));
  const mWin = me.filter((g) => g.w === 1).length + em.filter((g) => g.w === 2).length, mLoss = me.filter((g) => g.w === 2).length + em.filter((g) => g.w === 1).length;
  ok(mWin >= 4 && mLoss === 0, 'medium beats easy from either side (' + mWin + ' wins, ' + mLoss + ' losses in 6)');
  const hm = [0, 1].map((i) => game('hard', 'medium', 100 + i)), mh = [0, 1].map((i) => game('medium', 'hard', 102 + i));
  const hWin = hm.filter((g) => g.w === 1).length + mh.filter((g) => g.w === 2).length, hLoss = hm.filter((g) => g.w === 2).length + mh.filter((g) => g.w === 1).length;
  const slow = Math.max(...me.concat(em, hm, mh).map((g) => g.slow));
  ok(hWin >= 3 && hWin > hLoss && slow < 1500, 'hard beats medium (' + hWin + ' wins, ' + hLoss + ' losses in 4), and no move takes 1.5 s (slowest ' + slow + ' ms)');
  // The page: a third choice, always optional, the daily stays classic, and the rules are explained
  ok(/\{ value: 'huevo', label: C\.t\('huevo'\) \}/.test(html) && /if \(S\.rules !== 'huevo'\) top\.appendChild/.test(html) && /var rules = daily \? 'classic' : prefRules\(\)/.test(html), 'the page offers Huevo, hides the capture choice for it, and keeps the daily game classic');
  ok(['huevo', 'huevoNote', 'qEdge', 'qMust', 'endQueen', 'endCount', 'endTimer', 'endLone'].every((k) => (html.match(new RegExp('\\b' + k + ': \'', 'g')) || []).length === LOCALE_CODES.length), 'its texts are in every language');
  ok(/HuevosKicker/.test(html), 'the rules text names its designer');
  const ms0 = Date.now() - t0;
  ok(ms0 < 15000, 'the group runs in ' + (ms0 / 1000).toFixed(1) + ' s (limit 15 s)');
}

function testCheckersMotion() {
  head('Checkers: taken pieces fade, the crown drops on (#407)');
  // A taken piece vanished the moment the mover landed beyond it, and a new
  // king simply had its crown.
  const src = fs.readFileSync(path.join(ROOT, 'www/games/checkers/index.html'), 'utf8');
  const a0 = src.indexOf('  var FADE_MS'), b0 = src.indexOf('\n  }\n', src.indexOf('  function bounce(', a0)) + 4;
  ok(a0 > 0 && b0 > a0, 'capFade and crownDrop found in Checkers');
  if (!(a0 > 0 && b0 > a0)) return;
  const sb = { Math, HOP_MS: 170 };
  vm.runInNewContext(src.slice(a0, b0) + ';this.capFade = capFade; this.crownDrop = crownDrop; this.trailEnd = trailEnd; this.bounce = bounce; this.FADE_MS = FADE_MS; this.CROWN_MS = CROWN_MS;', sb);
  ok(sb.capFade(169, 0) === 0 && sb.capFade(170 + sb.FADE_MS / 2, 0) === 0.5, 'the first taken piece stays until the mover lands, then is half faded');
  ok(sb.capFade(340, 1) === 0 && sb.capFade(340 + sb.FADE_MS, 1) === 1, 'the second waits for the second landing, then is gone');
  ok(sb.crownDrop(339, 2) === 0 && sb.crownDrop(340 + sb.CROWN_MS, 2) === 1, 'the crown drops only after the slide');
  ok(sb.bounce(0) === 0 && Math.abs(sb.bounce(1) - 1) < 1e-9 && sb.bounce(0.4) > 0.9, 'the crown lands early and bounces');
  const end = sb.trailEnd({ path: [1, 2], caps: [3, 4], crown: true });
  ok(end === 340 + Math.max(sb.FADE_MS, sb.CROWN_MS) && end <= 1000, 'a crowning double jump ends within a second (' + end + ' ms)');
  ok(sb.trailEnd({ path: [1], caps: [], crown: false }) === 170, 'a plain step adds nothing after the slide');
  ok(/if \(anim\) \{ trail = anim; anim = null; afterMove\(\); \}/.test(src), 'the fade and the crown never hold the next turn');
  ok(/function startAnim\(m, v, took\) \{\n    if \(C\.ui\.reduceMotion\(\)\) \{ anim = null; draw\(\); return; \}/.test(src), 'reduced motion draws the move still');
}

function testPegMotion() {
  head('Peg solitaire: the peg arcs over, the jumped peg shrinks out (#407)');
  // A tapped jump landed with only a small pop, and the jumped peg vanished
  // in the same frame.
  const src = fs.readFileSync(path.join(ROOT, 'www/games/peg/index.html'), 'utf8');
  const a0 = src.indexOf('  function hopFx('), b0 = src.indexOf('\n  }\n', a0) + 4;
  ok(a0 > 0 && b0 > a0, 'hopFx found in Peg solitaire');
  if (!(a0 > 0 && b0 > a0)) return;
  const sb = { E: { N: 7 }, CELL: 100 };
  vm.runInNewContext('function cx(cell) { return (cell % E.N) * CELL + CELL / 2; } function cy(cell) { return ((cell / E.N) | 0) * CELL + CELL / 2; }' + src.slice(a0, b0) + ';this.hopFx = hopFx;', sb);
  const f = sb.hopFx([10, 17, 24], false);
  ok(f.over === 17 && f.to === 24 && f.dx === 0 && f.dy === -200 && f.arc, 'a tapped jump down from d6 arcs from two holes up, over d5');
  const g = sb.hopFx([26, 25, 24], true);
  ok(g.dx === 200 && g.dy === 0 && !g.arc && g.over === 25, 'a dragged jump only pops, and the jumped peg still shrinks');
  ok(/@keyframes pg-hop \{\s*from \{ transform: translate\(var\(--dx\), var\(--dy\)\); \}/.test(src) && /@keyframes pg-gone \{ to \{ transform: scale\(0\); opacity: 0; \} \}/.test(src), 'the hop starts at the old hole and the jumped peg ends at nothing');
  const p0 = src.indexOf("class: 'pg-peg pg-gone'"), p1 = src.indexOf('above.forEach(function (n) { svg.appendChild(n); });');
  ok(p0 > 0 && p1 > p0, 'the hopping peg is drawn above the one it jumps');
  ok(/hop = C\.ui\.reduceMotion\(\) \? null : hopFx\(/.test(src) && /prefers-reduced-motion: reduce\) \{[^}]*\.pg-hop \{ animation: none/.test(src), 'reduced motion draws the jump still');
}

function testMorrisMotion() {
  head('Morris: pieces drop in and slide, a mill flashes, a taken piece fades (#407)');
  // Pieces appeared and vanished in one frame, and a new mill only showed as
  // the steady highlight.
  const src = fs.readFileSync(path.join(ROOT, 'www/games/morris/index.html'), 'utf8');
  const a0 = src.indexOf('  var MOVE_MS'), b0 = src.indexOf('\n  }\n', src.indexOf('  function fxTick(', a0)) + 4;
  ok(a0 > 0 && b0 > a0, 'the effects found in Morris');
  if (!(a0 > 0 && b0 > a0)) return;
  let now = 1000, reduced = false, frames = 0;
  const mills = [[0, 1, 2], [2, 3, 4]];
  const sb = { Math, E: { MILLS: mills }, C: { ui: { reduceMotion: () => reduced } }, performance: { now: () => now },
    requestAnimationFrame: () => ++frames, draw: () => {}, pulseRaf: 0 };
  vm.runInNewContext(src.slice(a0, b0) + ';this.fxStart = fxStart; this.fxView = fxView; this.millsAt = millsAt; this.reset = function () { fx = {}; fxRaf = 0; };', sb);
  sb.fxStart('move', { from: -1, to: 3 });
  let v = sb.fxView(1100);
  ok(v && v.move && v.move.k === 0.5 && v.move.from === -1 && frames === 1, 'a placed piece is halfway in after 100 ms, on one animation loop');
  now = 1150; sb.fxStart('gone', { q: 5, who: 2 });
  v = sb.fxView(1250);
  ok(v.move === undefined && v.gone && Math.abs(v.gone.k - 100 / 260) < 1e-9, 'the removal runs on its own clock after the move has ended');
  ok(sb.fxView(1500) === null, 'nothing is left over once every effect has ended');
  const b = [1, 1, 1, 0, 2, 0];
  ok(sb.millsAt(b, 1).length === 1 && sb.millsAt(b, 1)[0] === mills[0] && sb.millsAt(b, 4).length === 0, 'millsAt finds the mill the piece closed and no other');
  sb.reset(); reduced = true; now = 2000; sb.fxStart('flash', { mills: [mills[0]] });
  ok(sb.fxView(2010) === null, 'reduced motion starts nothing');
  ok(/if \(!shown\) \{\n      fxStart\('move'/.test(src), 'a mill picked by hand is not shown twice');
}

function testDotsChain() {
  head('Dots and boxes: a chain fills box by box, in place (#407)');
  // A box filled on its own, scaled from the board's top-left corner rather
  // than in place, and a long chain looked like unrelated pops.
  const src = fs.readFileSync(path.join(ROOT, 'www/games/dots/index.html'), 'utf8');
  const a0 = src.indexOf('  var STAGGER_MS'), b0 = src.indexOf('\n  }\n', src.indexOf('  function newBoxFx(', a0)) + 4;
  ok(a0 > 0 && b0 > a0, 'newBoxFx found in Dots and boxes');
  if (!(a0 > 0 && b0 > a0)) return;
  const sb = {};
  vm.runInNewContext(src.slice(a0, b0) + ';this.newBoxFx = newBoxFx;', sb);
  let f = sb.newBoxFx([4], 1, false);
  ok(f.length === 1 && f[0].d === 0 && !f[0].chain, 'the first box of a turn fills plainly');
  f = sb.newBoxFx([7], 3, false);
  ok(f[0].chain, 'the third box of a run flashes as part of the chain');
  f = sb.newBoxFx([2, 3], 2, false);
  ok(f[0].d === 0 && f[1].d > 0 && !f[0].chain && f[1].chain, 'two boxes closed by one line fill one after the other');
  ok(sb.newBoxFx([2, 3], 2, true)[1].d === 0, 'reduced motion adds no delay, so no box waits hidden');
  ok(/\.dt-box, \.dt-boxlabel--new \{ transform-box: fill-box; transform-origin: center; \}/.test(src), 'boxes grow in place');
}

function testBackgammonMotion() {
  head('Backgammon: checkers slide, a hit goes to the bar, dice tumble (#407)');
  // A checker jumped to its point in one frame, a hit checker was simply on
  // the bar, and new dice just appeared.
  const src = fs.readFileSync(path.join(ROOT, 'www/games/backgammon/index.html'), 'utf8');
  const a0 = src.indexOf('  var SLIDE_MS'), b0 = src.indexOf('\n  }\n', src.indexOf('  function fxTick(', a0)) + 4;
  ok(a0 > 0 && b0 > a0, 'the effects found in Backgammon');
  if (!(a0 > 0 && b0 > a0)) return;
  let now = 1000, reduced = false, frames = 0;
  const sb = { Math, C: { ui: { reduceMotion: () => reduced } }, performance: { now: () => now }, requestAnimationFrame: () => ++frames, paint: () => {} };
  vm.runInNewContext(src.slice(a0, b0) + ';this.stepFx = stepFx; this.fxStart = fxStart; this.fxNow = fxNow; this.reset = function () { bfx = {}; bfxRaf = 0; };', sb);
  const pts = new Array(24).fill(0); pts[23] = 2; pts[12] = 7; pts[7] = -1; pts[5] = 3;
  // player 1 moves from 13 (7 checkers, top shown at index 4) to 8, hitting a lone rival checker
  let f = sb.stepFx(13, 8, 1, pts, [0, 0, 1], true);
  ok(f.from.key === 13 && f.from.k === 4 && f.to.key === 8 && f.to.k === 0, 'the mover leaves the top of a tall stack and lands first on the hit point');
  ok(f.hit && f.hit.p === 2 && f.hit.to.key === 'bar' && f.hit.to.k === 1, 'the hit checker goes to the next place on the rival bar');
  f = sb.stepFx('bar', 6, 1, pts, [0, 1, 0], false);
  ok(f.from.key === 'bar' && f.from.k === 0 && f.to.k === 3 && !f.hit, 'entering from the bar onto own checkers lands on top of them');
  sb.fxStart('step', sb.stepFx(13, 8, 1, pts, [0, 0, 1], true));
  let v = sb.fxNow(1130);
  ok(v.step.k === 0.5 && v.step.kh === 0 && frames === 1, 'halfway after 130 ms; the hit checker waits for the mover');
  v = sb.fxNow(1270);
  ok(v.step.k === 1 && v.step.kh === 0.5, 'the hit checker is halfway to the bar after the mover lands');
  ok(sb.fxNow(1400) === null, 'nothing is left over at the end');
  now = 2000; sb.fxStart('roll', {});
  v = sb.fxNow(2240);
  ok(v && v.roll === 0.5 && !v.step, 'new dice are halfway through their tumble after 240 ms');
  sb.reset(); reduced = true; sb.fxStart('roll', {});
  ok(sb.fxNow(now) === null, 'reduced motion starts nothing');
  ok(/fxStart\('step', spec\);/.test(src) && /function afterRoll\(\) \{\n[^\n]*\n    bfx\.step = null;\n    fxStart\('roll', \{\}\);/.test(src), 'each step slides and each roll tumbles');
}

function testLudoMotion() {
  head('Ludo: a captured token flies home, reaching home bursts (#407)');
  // A captured token was back in its base in one frame, and reaching home was
  // only a message.
  const src = fs.readFileSync(path.join(ROOT, 'www/games/ludo/index.html'), 'utf8');
  const a0 = src.indexOf('  var FLY_MS'), b0 = src.indexOf('\n  }\n', src.indexOf('  function flyAt(', a0)) + 4;
  ok(a0 > 0 && b0 > a0, 'flyFx and flyAt found in Ludo');
  if (!(a0 > 0 && b0 > a0)) return;
  const sb = { Math };
  vm.runInNewContext(src.slice(a0, b0) + ';this.flyFx = flyFx; this.flyAt = flyAt;', sb);
  const fl = sb.flyFx([{ seat: 1, k: 0 }], (s, k) => [7.5, 2.5], (s, k) => [11.5, 2.5]);
  ok(fl.length === 1 && fl[0].seat === 1 && fl[0].from[0] === 7.5 && fl[0].to[0] === 11.5, 'the flight runs from where the token was taken to its base');
  const mid = sb.flyAt(fl[0], 0.5), end = sb.flyAt(fl[0], 1), start = sb.flyAt(fl[0], 0);
  ok(start[0] === 7.5 && start[1] === 2.5 && end[0] === 11.5 && Math.abs(end[1] - 2.5) < 1e-9, 'it starts on the cell and ends on the base spot');
  ok(mid[1] < 2.5 - 1.5 && mid[0] > 7.5 && mid[0] < 11.5, 'it arcs up on the way');
  ok(/if \(r\.captured\.length && !C\.ui\.reduceMotion\(\)\) \{\n        lfx = /.test(src), 'no flight with reduced motion');
  ok(/if \(r\.home\) \{\n[^\n]*\n        C\.ui\.burst\(/.test(src), 'reaching home bursts (the core skips it with reduced motion)');
}

function testNonogramMotion() {
  head('Nonogram: a fill pops in, a line that comes right flashes (#407)');
  // A filled cell appeared at full size, and a finished line only greyed its clue.
  const src = fs.readFileSync(path.join(ROOT, 'www/games/nonogram/index.html'), 'utf8');
  const a0 = src.indexOf('  var POP_MS'), b0 = src.indexOf('\n  }\n', src.indexOf('  function newlyDone(', a0)) + 4;
  ok(a0 > 0 && b0 > a0, 'popScale and newlyDone found in Nonogram');
  if (!(a0 > 0 && b0 > a0)) return;
  const sb = { Math, requestAnimationFrame: () => 0 };
  vm.runInNewContext(src.slice(a0, b0) + ';this.popScale = popScale; this.newlyDone = newlyDone;', sb);
  ok(sb.popScale(0) === 0.6 && Math.abs(sb.popScale(0.6) - 1.04) < 1e-9 && Math.abs(sb.popScale(1) - 1) < 1e-9, 'a fill grows from 60 %, overshoots a little and settles');
  const nd = sb.newlyDone({ rows: [true, false, false], cols: [false, false, true] }, { rows: [true, true, false], cols: [false, false, true] });
  ok(nd.length === 1 && nd[0].kind === 'r' && nd[0].i === 1, 'only the row that just came right flashes');
  ok(sb.newlyDone({ rows: [true], cols: [true] }, { rows: [false], cols: [true] }).length === 0, 'a line that stops being right does not flash');
  ok(/E\.applyStroke\(S, base, \[i\], drag\.from, drag\.to\);\n    notePops\(base\);/.test(src) && /function afterChange\(\) \{\n    noteLines\(\);/.test(src), 'every stroke notes its fills and every change its lines');
  ok(/function notePops\(before\) \{\n    if \(C\.ui\.reduceMotion\(\)\) return;/.test(src) && /if \(nfx\.seen && !C\.ui\.reduceMotion\(\)\)/.test(src), 'reduced motion starts neither');
}

function testBridgesWave() {
  head('Bridges: a wave runs over the islands on the win (#407)');
  // A solved puzzle went straight to the result window.
  const src = fs.readFileSync(path.join(ROOT, 'www/games/bridges/index.html'), 'utf8');
  const a0 = src.indexOf('  var WAVE_STEP'), b0 = src.indexOf('\n  }\n', src.indexOf('  function waveDelays(', a0)) + 4;
  ok(a0 > 0 && b0 > a0, 'waveDelays found in Bridges');
  if (!(a0 > 0 && b0 > a0)) return;
  const sb = { Math };
  vm.runInNewContext(src.slice(a0, b0) + ';this.waveDelays = waveDelays;', sb);
  const isl = [{ r: 0, c: 0 }, { r: 0, c: 2 }, { r: 2, c: 2 }, { r: 10, c: 10 }];
  const d = sb.waveDelays(isl, isl[1]);
  ok(d.length === 4 && d[1] === 0, 'the island of the last bridge pops first');
  ok(d[0] === d[2] && d[0] > 0 && d[3] > d[0], 'farther islands follow in order');
  ok(d[3] <= 520, 'the wave is capped (' + d[3] + ' ms)');
  ok(/if \(wait\) setTimeout\(function \(\) \{ ctx\.finish\(result\); \}, wait\); else ctx\.finish\(result\);/.test(src), 'the result waits for the wave');
  ok(/if \(C\.ui\.reduceMotion\(\)\) paint\(true\);/.test(src), 'reduced motion shows the result at once');
}

function testMastermindReveal() {
  head('Mastermind: the code turns over peg by peg (#407)');
  // The code was simply shown at the end, under the result window.
  const src = fs.readFileSync(path.join(ROOT, 'www/games/mastermind/index.html'), 'utf8');
  const a0 = src.indexOf('  var REVEAL_AT'), b0 = src.indexOf('\n', src.indexOf('  function revealWait(', a0)) + 1;
  ok(a0 > 0 && b0 > a0, 'revealDelays found in Mastermind');
  if (!(a0 > 0 && b0 > a0)) return;
  const sb = {};
  vm.runInNewContext(src.slice(a0, b0) + ';this.revealDelays = revealDelays; this.revealWait = revealWait;', sb);
  const d = sb.revealDelays(5);
  ok(d.length === 5 && d[0] >= 180 && d.every((x, i) => i === 0 || x > d[i - 1]), 'each peg turns after the one before, once the last pins have popped');
  ok(sb.revealWait(5) === d[4] + 300 && sb.revealWait(5) <= 1100, 'the result waits until the last peg has turned (' + sb.revealWait(5) + ' ms)');
  ok(/reveal = S\.done && !C\.ui\.reduceMotion\(\);\n    render\(\);/.test(src), 'only the move that ends the game reveals, and not with reduced motion');
  ok(/if \(C\.ui\.reduceMotion\(\)\) ctx\.finish\(result\);\n    else setTimeout\(function \(\) \{ ctx\.finish\(result\); \}, revealWait\(Lv\.pegs\)\);/.test(src), 'the result waits for the reveal');
}

function testSlidingShimmer() {
  head('Sliding puzzle: a shimmer sweeps the solved tray (#407)');
  // The solved tray only gained a ring before the result.
  const src = fs.readFileSync(path.join(ROOT, 'www/games/sliding/index.html'), 'utf8');
  const a0 = src.indexOf('  var SHINE_MS'), b0 = src.indexOf('\n  }\n', src.indexOf('  function shineDelays(', a0)) + 4;
  ok(a0 > 0 && b0 > a0, 'shineDelays found in Sliding');
  if (!(a0 > 0 && b0 > a0)) return;
  const sb = { Math, WIN_MS: 700 };
  vm.runInNewContext(src.slice(a0, b0) + ';this.shineDelays = shineDelays; this.SHINE_MS = SHINE_MS;', sb);
  for (const n of [3, 5]) {
    const d = sb.shineDelays(n);
    ok(d[1] === 0 && d[n * n - 1] + sb.SHINE_MS <= 700 && d[n] > d[1] && d[2] === d[n + 1], n + '×' + n + ': from the top-left tile to the last, along the diagonals, inside the pause before the result');
  }
  ok(/if \(!C\.ui\.reduceMotion\(\)\) \{\n      var sd = shineDelays\(S\.n\);/.test(src), 'no shimmer with reduced motion');
  ok(/board\.classList\.remove\('sp-shine'\);/.test(src), 'a new tray starts without it');
}

function testJigsawTrayKeys() {
  head('Jigsaw: arrow keys in the loose pieces move like in the frame (#556)');
  const html = fs.readFileSync(path.join(ROOT, 'www/games/jigsaw/index.html'), 'utf8');
  const fn = (/^  function trayStep\(at, n, cols, dx, dy\) \{[\s\S]*?^  \}$/m.exec(html) || [''])[0];
  ok(!!fn, 'trayStep found in Jigsaw');
  if (!fn) return;
  const sb = {};
  vm.runInNewContext(fn + ';this.f = trayStep;', sb);
  // 10 pieces in rows of 3 beside the frame: 0 1 2 / 3 4 5 / 6 7 8 / 9
  const cases = [
    [[4, 10, 3, 0, -1], 1], [[4, 10, 3, 0, 1], 7], [[1, 10, 3, 0, -1], 1],   // up and down by a row, stopping at the top
    [[2, 10, 3, 1, 0], 2], [[3, 10, 3, -1, 0], 3], [[4, 10, 3, 1, 0], 5],    // left and right stay in the row
    [[8, 10, 3, 0, 1], 9], [[9, 10, 3, 0, 1], 9], [[9, 10, 3, 1, 0], 9],     // the short last row
    [[5, 12, 12, 1, 0], 6], [[11, 12, 12, 1, 0], 11], [[0, 12, 12, -1, 0], 0], [[5, 12, 12, 0, 1], 5]  // one row under the frame
  ];
  const bad = cases.filter(([a, want]) => sb.f(...a) !== want).map(([a, want]) => a.join(',') + ' → ' + sb.f(...a) + ' (want ' + want + ')');
  ok(!bad.length, 'up/down change the row, left/right only the column (' + cases.length + ' presses)' + (bad.length ? ': ' + bad.join('; ') : ''));
  ok(/at = at < 0 \? 0 : trayStep\(at, S\.tray\.length, trayCols\(\), d\[0\], d\[1\]\);/.test(html) && !/if \(!d\[0\]\) return;/.test(html), 'the key handler uses it for all four arrows');
}

function testJigsawGlide() {
  head('Jigsaw: a placed piece glides into its slot (#407)');
  // A piece let go near its spot jumped the last bit into place.
  const src = fs.readFileSync(path.join(ROOT, 'www/games/jigsaw/index.html'), 'utf8');
  const a0 = src.indexOf('  function landed('), b0 = src.indexOf('\n  }\n', a0) + 4;
  ok(a0 > 0 && b0 > a0 && /GLIDE_MS = 200/.test(src), 'landed found in Jigsaw');
  if (!(a0 > 0 && b0 > a0)) return;
  const flights = [];
  const mk = () => {
    const slotCanvas = { getBoundingClientRect: () => ({ left: 10, top: 500, width: 30, height: 30 }) };
    const sb = { S: { done: false }, E: { place: () => {} }, slots: { 3: { firstChild: slotCanvas, remove() { this.gone = true; } } }, placedNodes: {},
      putInFrame: (i) => { sb.placedNodes[i] = { piece: i }; }, C: { feedback: () => {}, ui: { fly: (n, r, o) => flights.push({ n, r, o }) } },
      render: () => {}, save: () => {}, won: () => {}, GLIDE_MS: 200 };
    vm.runInNewContext(src.slice(a0, b0) + ';this.landed = landed;', sb);
    return sb;
  };
  let sb = mk();
  sb.landed(3, { left: 100, top: 120, width: 60, height: 60 });
  ok(flights.length === 1 && flights[0].n === sb.placedNodes[3] && flights[0].r.left === 100 && flights[0].o.ms === 200, 'a dropped piece glides from where it was let go to its placed node');
  sb = mk();
  sb.landed(3);
  ok(flights.length === 2 && flights[1].r.top === 500 && sb.slots[3] === undefined, 'a piece placed by keyboard glides from its spot in the row');
  ok(/var at = d\.node\.getBoundingClientRect\(\);\n    d\.node\.remove\(\);/.test(src) && /landed\(d\.piece, at\)/.test(src), 'the drop point is read before the floating piece is removed');
}

function testBreakoutMotion() {
  head('Breakout: brick shards, paddle squash, reduced motion (#407)');
  // A broken brick only faded, the fade ran even with reduced motion, and the
  // ball met the paddle with no give.
  const src = fs.readFileSync(path.join(ROOT, 'www/games/breakout/index.html'), 'utf8');
  const a0 = src.indexOf('  var SQUASH_MS'), b0 = src.indexOf('\n  }\n', src.indexOf('  function brickOnPage(', a0)) + 4;
  ok(a0 > 0 && b0 > a0, 'squash and brickOnPage found in Breakout');
  if (!(a0 > 0 && b0 > a0)) return;
  const sb = { Math, E: { W: 360 }, canvas: { getBoundingClientRect: () => ({ left: 20, top: 100, width: 720, height: 1000 }) } };
  vm.runInNewContext(src.slice(a0, b0) + ';this.squash = squash; this.brickOnPage = brickOnPage;', sb);
  const mid = sb.squash(70);
  ok(mid[0] > 1.1 && mid[1] < 0.75 && sb.squash(-5)[0] === 1 && sb.squash(140)[1] === 1, 'the paddle is widest and flattest mid-squash, and plain outside it');
  const at = sb.brickOnPage({ x: 30, y: 40, w: 40, h: 16 });
  ok(at.x === 20 + 50 * 2 && at.y === 100 + 48 * 2, 'shards start at the brick\'s centre on the page, at the board\'s scale');
  ok(/if \(!C\.ui\.reduceMotion\(\)\) \{\n            flashes\.push\([^\n]*\n            C\.ui\.burst\(brickOnPage\(e\)/.test(src), 'the fade and the shards both stop with reduced motion');
  ok(/if \(!C\.ui\.reduceMotion\(\)\) squashAt = performance\.now\(\);/.test(src) && /var sq = withText \? squash\(now - squashAt\) : \[1, 1\]/.test(src), 'the squash stops with reduced motion and never shows on the result card');
}

function testBlockdropMotion() {
  head('Block Drop: cleared rows flash, the rows above fall in, a hard drop thuds (#407)');
  // Cleared rows only flashed while the rows above were already down, and the
  // flash ran even with reduced motion.
  const src = fs.readFileSync(path.join(ROOT, 'www/games/blockdrop/index.html'), 'utf8');
  const a0 = src.indexOf('  var COLLAPSE_AT'), b0 = src.indexOf('\n  }\n', src.indexOf('  function collapseLeft(', a0)) + 4;
  ok(a0 > 0 && b0 > a0, 'dropOf and collapseLeft found in Block Drop');
  if (!(a0 > 0 && b0 > a0)) return;
  const sb = { Math };
  vm.runInNewContext(src.slice(a0, b0) + ';this.dropOf = dropOf; this.collapseLeft = collapseLeft;', sb);
  // a 6-row grid with rows 3 and 5 cleared: pre-rows 0,1,2 fall 2, pre-row 4 falls 1
  const d = sb.dropOf([3, 5], 6);
  ok(d.join(',') === '0,0,2,2,2,1', 'each row falls by the cleared rows that were below it (' + d.join(',') + ')');
  // check it against the engine: clear rows and compare where each marked row went
  const grid = [0, 1, 2, 3, 4, 5].map((r) => r), rows = [3, 5], after = grid.slice();
  rows.forEach((r) => { after.splice(r, 1); after.unshift(-1); });
  ok(after.every((v, y) => v < 0 || v + d[y] === y), 'the falls match the engine\'s splice-and-unshift clear');
  ok(sb.collapseLeft(50) === 1 && sb.collapseLeft(110 + 85) > 0 && sb.collapseLeft(110 + 85) < 1 && sb.collapseLeft(400) === 0, 'rows hold through the flash, then fall into place');
  ok(/if \(!C\.ui\.reduceMotion\(\)\) flashes\.push\(/.test(src) && /ev\.dropped > 0 && !C\.ui\.reduceMotion\(\)\) \{ canvas\.classList\.remove\('bd-thud'\)/.test(src), 'reduced motion: no flash, no fall, no thud');
}

function testTowerDefenceKills() {
  head('Tower defence: a kill pops and its coins float up (#407)');
  // An enemy vanished in one frame and its bounty only changed the number at the top.
  const E = loadEngine('tower-defence', 'TdEngineFactory');
  const rng = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
  const S = E.createGame({ path: E.genPath(rng(4242), { minTurns: 5 }) });
  let built = 0;
  // towers right beside the path, so the first wave has kills to show
  for (const q of S.path) for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) if (built < 6 && E.canBuild(S, q.r + dr, q.c + dc) && E.build(S, q.r + dr, q.c + dc, 'archer')) built++;
  ok(built > 0, 'towers stand beside the path (' + built + ')');
  E.startWave(S, rng(7));
  let kill = null, paid = 0, steps = 0;
  while (!kill && steps++ < 4000 && !S.over) {
    const m0 = S.money, k0 = S.kills, active = S.waveActive;
    E.step(S, 0.05, rng(steps));
    const ks = S.effects.filter((f) => f.kind === 'kill');
    if (S.kills > k0 && S.waveActive && active) { kill = ks; paid = S.money - m0; }
  }
  ok(!!kill && kill.length >= 1, 'a kill shows up among the step\'s effects (' + (kill ? kill.length : 0) + ')');
  if (!kill) return;
  ok(kill.reduce((a, f) => a + f.gain, 0) === paid, 'the floating coins add up to what the kills paid (' + paid + ')');
  ok(kill.every((f) => isFinite(f.x) && isFinite(f.y) && f.r > 0 && /^#/.test(f.color)), 'each kill says where it fell and how big it was');
  const src = fs.readFileSync(path.join(ROOT, 'www/games/tower-defence/index.html'), 'utf8');
  const a0 = src.indexOf('  var POP_MS'), b0 = src.indexOf('\n  }\n', src.indexOf('  function deathAt(', a0)) + 4;
  const sb = { Math };
  if (a0 > 0 && b0 > a0) vm.runInNewContext(src.slice(a0, b0) + ';this.deathAt = deathAt;', sb);
  ok(typeof sb.deathAt === 'function' && sb.deathAt(0).popAlpha === 1 && sb.deathAt(260).popAlpha === 0 && sb.deathAt(375).rise > 0.5 && sb.deathAt(750).coinAlpha === 0, 'the pop is gone in 260 ms and the coin has risen and faded by 750 ms');
  ok(/if \(f\.kind === 'kill'\) \{ if \(!C\.ui\.reduceMotion\(\) && deaths\.length < 60\)/.test(src) && !/kind === 'kill'[^\n]*shotsLive\.push/.test(src), 'kills are never drawn as shots, and not at all with reduced motion');
}

function testBattleshipFx() {
  head('Battleship: a miss splashes, a hit bursts, a sinking shakes (#407)');
  // A shot only left its mark.
  const src = fs.readFileSync(path.join(ROOT, 'www/games/battleship/index.html'), 'utf8');
  // #477: on a phone on its side the page was 84 px taller than the screen and could not
  // scroll, so the bottom of the buttons was out of reach
  ok(/C\.game\(\{[\s\S]{0,500}?scroll: true,/.test(src), 'Battleship\'s game area scrolls when it is taller than the screen');
  const a0 = src.indexOf('  var SPLASH_MS'), b0 = src.indexOf('\n  }\n', src.indexOf('  function splashRings(', a0)) + 4;
  ok(a0 > 0 && b0 > a0, 'cellOnPage and splashRings found in Battleship');
  if (!(a0 > 0 && b0 > a0)) return;
  const sb = { Math, N: 10 };
  vm.runInNewContext(src.slice(a0, b0) + ';this.cellOnPage = cellOnPage; this.splashRings = splashRings;', sb);
  const at = sb.cellOnPage({ left: 10, top: 200, width: 300 }, 23);
  ok(at.x === 10 + 3.5 * 30 && at.y === 200 + 2.5 * 30, 'a hit bursts at the centre of its cell on the page');
  ok(sb.splashRings(0.1).length === 1 && sb.splashRings(0.5).length === 2 && sb.splashRings(0.5)[0].r > sb.splashRings(0.5)[1].r, 'a miss sends out a ring, then a second behind it');
  ok(sb.splashRings(0.99).every((r) => r.a < 0.05), 'the rings have faded by the end');
  ok(/after\(\);\n    shotFx\(cvFoe, idx, res\.result\);/.test(src) && /after\(\);\n      shotFx\(cvMe, res\.i, res\.result\);/.test(src), 'both your shots and the rival\'s show their effect, after the state is saved');
  ok(/if \(result === 'miss'\) \{\n      if \(C\.ui\.reduceMotion\(\)\) return;/.test(src) && /if \(sunk\) C\.ui\.shake\(cv\.parentNode\);/.test(src), 'no splash with reduced motion; a sinking shakes that sea through the core (which also checks it)');
}

function testCueSink() {
  head('Pool and snooker: a potted ball sinks into the pocket (#407)');
  // A potted ball vanished at the pocket's mouth in one frame.
  delete require.cache[require.resolve(path.join(ROOT, 'www/lib/cue.js'))];
  const Cue = require(path.join(ROOT, 'www/lib/cue.js'));
  ok(typeof Cue.sinksOf === 'function' && typeof Cue.sinkAt === 'function' && Cue.SINK_MS > 0 && Cue.SINK_MS <= 300, 'the shared sink helpers exist in cue.js');
  if (typeof Cue.sinksOf !== 'function') return;
  const T = Cue.table({});
  // the white rolls straight into the top-left corner pocket
  const balls = [{ id: 0, x: T.r * 6, y: T.r * 6, vx: 0, vy: 0, inPlay: true }];
  const run = Cue.start(T, balls, { angle: Math.PI * 1.25, power: 0.5 }, 0);
  let sinks = [];
  for (let i = 0; i < Cue.MAX_TICKS && run.moving && !sinks.length; i++) { Cue.tick(run); if (run.pots.length) sinks = Cue.sinksOf(run, 1000); }
  ok(sinks.length === 1 && sinks[0].id === 0 && sinks[0].pocket === 0 && sinks[0].t0 === 1000, 'the pot is read with its ball, pocket and time');
  if (!sinks.length) return;
  const pk = T.pockets[0], a = Cue.sinkAt(T, sinks[0], 0), b = Cue.sinkAt(T, sinks[0], 1);
  ok(a.x === sinks[0].x && a.y === sinks[0].y && a.k === 1 && a.a === 1, 'it starts where the ball dropped, full size');
  ok(Math.abs(b.x - pk.x) < 1e-9 && Math.abs(b.y - pk.y) < 1e-9 && b.k < 0.2 && b.a === 0, 'it ends in the pocket\'s centre, small and gone');
  for (const g of ['eightball', 'snooker']) {
    const html = fs.readFileSync(path.join(ROOT, 'www/games', g, 'index.html'), 'utf8');
    ok(/if \(!C\.ui\.reduceMotion\(\)\) sinks = sinks\.concat\(Cue\.sinksOf\(run, t\)\);/.test(html) && /inHand: still && F\.inHand && humanTurn\(\)[^\n]*\);\n    drawSinks\(g\);/.test(html), g + ': pots sink on the live table only, and not with reduced motion');
  }
}

function testBowlingBanner() {
  head('Bowling: strike and spare pop, no replay with reduced motion (#407)');
  // A strike was a plain line of status text, and reduced motion replayed the
  // roll six times faster, which is still motion.
  const src = fs.readFileSync(path.join(ROOT, 'www/games/bowling/index.html'), 'utf8');
  ok(/\.bw-status--big \{[^}]*animation: bw-pop 420ms/.test(src) && /@keyframes bw-pop \{ 0% \{ transform: scale\(\.6\); opacity: 0; \}/.test(src), 'the strike and spare call pops in');
  ok(/G\.big = !!\(r\.strike \|\| r\.spare\);/.test(src) && /var big = !!\(G\.big && G\.msg\);/.test(src), 'only a strike or a spare is called out big');
  ok(/G\.phase = isBot\(G\.s\.turn\) \? 'busy' : 'aim';\n    G\.big = false;/.test(src), 'the next turn\'s messages are plain again');
  ok(!/speed: C\.ui\.reduceMotion\(\) \? 6/.test(src) && /if \(C\.ui\.reduceMotion\(\)\) \{ settle\(\); draw\(\); return; \}/.test(src), 'reduced motion shows where the pins fell, with no replay');
  // the settle path is the same one the animation ends with
  const a0 = src.indexOf('  function settle() {'), b0 = src.indexOf('\n  }\n', a0) + 4;
  ok(a0 > 0 && /anim = null;\n    var r = E\.roll\(G\.s, res\.down\);/.test(src.slice(a0, b0)), 'the instant path scores the roll exactly as the animated one does');
}

function testKlondike() {
  head('Klondike (#415)');
  const t0 = Date.now();
  const E = loadEngine('klondike', 'KlondikeEngineFactory');
  const html = fs.readFileSync(path.join(ROOT, 'www/games/klondike/index.html'), 'utf8');
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  const rng = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
  const card = (r, s) => r * 4 + s;            // ranks 0..12 (A..K), suits ♣ ♦ ♥ ♠
  const empty = () => ({ tab: [[], [], [], [], [], [], []], down: [0, 0, 0, 0, 0, 0, 0], stock: [], waste: [], found: [0, 0, 0, 0], draw: 1, hist: [], undos: 0, passes: 0 });

  // The deal: 1 to 7 cards a column with only the top one up, 24 in the stock
  const D = E.deal(rng(7), 1);
  ok(D.tab.map((c) => c.length).join() === '1,2,3,4,5,6,7' && D.down.join() === '0,1,2,3,4,5,6' && D.stock.length === 24 && E.validState(D), 'a deal lays out 1 to 7 cards a column, only the top one face up, and 24 in the stock');

  // Columns: one rank lower, the other colour; only a king into an empty column
  const S = empty();
  S.tab[0] = [card(7, 3)];                      // 8♠
  ok(E.canTab(S, card(6, 2), 0) && E.canTab(S, card(6, 1), 0), 'a red 7 goes on the black 8');
  ok(!E.canTab(S, card(6, 0), 0) && !E.canTab(S, card(6, 3), 0), 'a black 7 does not go on the black 8');
  ok(!E.canTab(S, card(5, 2), 0) && !E.canTab(S, card(7, 2), 0), 'only exactly one rank lower');
  ok(E.canTab(S, card(12, 0), 1) && !E.canTab(S, card(11, 0), 1), 'an empty column takes a king and nothing else');
  // Foundations: ace first, then up by one in the same suit
  ok(E.canFound(S, card(0, 2)) && !E.canFound(S, card(1, 2)), 'a foundation starts with the ace');
  S.found[2] = 4;
  ok(E.canFound(S, card(4, 2)) && !E.canFound(S, card(4, 1)) && !E.canFound(S, card(5, 2)), 'then the next rank of the same suit only');

  // A move turns over the card it uncovers, and undo turns it back
  const M = empty();
  M.tab[0] = [card(3, 0), card(9, 2)]; M.down[0] = 1;        // 4♣ face down, 10♥ on it
  M.tab[1] = [card(10, 3)];                                  // J♠
  const h = E.move(M, { k: 'tab', col: 0, i: 1 }, { k: 'tab', col: 1 });
  ok(h && M.tab[1].length === 2 && M.down[0] === 0 && h.flip, 'moving the 10♥ onto the J♠ turns the 4♣ over');
  ok(E.move(M, { k: 'tab', col: 1, i: 0 }, { k: 'tab', col: 0 }) === null, 'a move against the rules is refused and changes nothing');
  E.undo(M);
  ok(M.tab[0].length === 2 && M.down[0] === 1 && M.tab[1].length === 1 && M.undos === 1, 'undo puts the 10♥ back and the 4♣ face down again');
  // The stock: one or three cards a tap, then the waste turns back into the stock
  const T = E.deal(rng(11), 3);
  const st0 = T.stock.slice();
  E.drawStock(T);
  ok(T.waste.length === 3 && T.waste[2] === st0[st0.length - 3] && T.stock.length === 21, 'drawing three turns three over, the third from the top ending on top');
  for (let i = 0; i < 7; i++) E.drawStock(T);
  ok(T.stock.length === 0 && T.waste.length === 24, 'eight taps empty a stock of 24');
  E.drawStock(T);
  ok(T.stock.join() === st0.join() && T.waste.length === 0 && T.passes === 1, 'one more tap turns the waste back into the same stock');
  E.undo(T); E.undo(T);
  ok(T.waste.length === 21 && T.stock.length === 3 && T.passes === 0, 'and undo walks that back exactly');

  // A tap: home first, else a column with cards, an empty column only for a king that is not already at the bottom
  const A = empty();
  A.waste = [card(0, 1)]; A.tab[2] = [card(1, 3)];
  ok(JSON.stringify(E.autoTarget(A, { k: 'waste' })) === '{"k":"found"}', 'a tapped ace goes home');
  A.waste = [card(12, 1)];
  ok(JSON.stringify(E.autoTarget(A, { k: 'waste' })) === '{"k":"tab","col":0}', 'a tapped king goes to the first empty column');
  A.tab[3] = [card(12, 0)];
  ok(E.autoTarget(A, { k: 'tab', col: 3, i: 0 }) === null, 'a king already at the bottom of a column stays put');

  // Everything face up with the stock and waste empty: the rest goes home by itself
  const F = empty();
  for (let s = 0; s < 4; s++) F.found[s] = 12;
  F.tab[0] = [card(12, 0), card(12, 1)]; F.tab[1] = [card(12, 2)]; F.tab[2] = [card(12, 3)];
  ok(E.canFinish(F), 'all face up and nothing in the stock: the rest can go home alone');
  let guard = 0;
  while (!E.won(F) && guard++ < 10) { const src = E.nextHome(F); if (!src) break; E.move(F, src, { k: 'found' }); }
  ok(E.won(F) && guard === 4, 'the last four kings go home one by one, and the game is won');

  // The daily deal is one the solver has won; its winning line replays to a win in the game's own rules
  const dates = ['2026-10-22', '2026-10-23', '2026-11-01'];
  const ts = Date.now();
  const days = dates.map((d) => { const r = (() => { let x = 0; for (const ch of d) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return rng(x); })(); return E.dailyDeal(r); });
  const dt = Date.now() - ts;
  ok(days.every((Dd) => Dd.draw === 1 && E.validState(Dd)), 'the daily deal draws one card and is a full deck');
  let replayed = 0;
  for (const Dd of days) {
    const sol = E.solve(Dd, E.SOLVE_LIMIT);
    if (!sol.solved) continue;
    const R = E.clone(Dd);
    let fine = true;
    for (const m of sol.path) { if (m) { if (!E.move(R, m.src, m.dst)) { fine = false; break; } } else E.drawStock(R); }
    if (fine && E.won(R)) replayed++;
  }
  ok(replayed === days.length, 'each daily deal has a winning line, and it replays to a win (' + replayed + '/' + days.length + ')');
  ok(dt < 3000, 'finding three daily deals takes under 3 s here (' + dt + ' ms)');
  ok(/E\.dailyDeal\(C\.daily\('klondike', daily\)\.rng\)/.test(html), 'the page takes the daily deal from the day\'s seed');
  // the same seed gives the same deal for everyone
  const a1 = E.dailyDeal(rng(99)), a2 = E.dailyDeal(rng(99));
  ok(JSON.stringify(a1.tab) === JSON.stringify(a2.tab) && a1.stock.join() === a2.stock.join(), 'one seed, one deal');

  // Page: cards from the shared deck, the deal through the shared fly helper, options behind a gear
  ok(/C\.cards\.el\(c\), C\.cards\.back\(\)/.test(html) && /C\.ui\.fly\(nodes\[c\], from, \{ ms: 220, delay: n\+\+ \* 28, flip: row === S\.down\[col\] \}\)/.test(html), 'the cards are Chogan.cards and the deal uses Chogan.ui.fly');
  ok(/class: 'ch-iconbtn kl-gear'/.test(html) && /function showSettings\(\)/.test(html) && !/drawRule[^\n]*showHelp/.test(html), 'draw one or three is chosen behind a gear, not in help');
  ok(/if \(C\.ui\.reduceMotion\(\) \|\| !L\) \{ done\(\); return; \}/.test(html) && /if \(C\.ui\.reduceMotion\(\) \|\| !L\) return;/.test(html), 'no deal animation and no win cascade with reduced motion');
  ok(/\.kl-board \{ direction: ltr;/.test(html), 'the table is not mirrored in Persian');

  // Identity
  const gm = games.find((g) => g.id === 'klondike');
  ok(!!gm && gm.cat === 'cards' && gm.daily !== false, 'games.json lists it under card games, with a daily deal');
  ok(!!gm && /accent: '([^']+)'/.test(html) && html.match(/accent: '([^']+)'/)[1] === gm.color, 'games.json and the page share the accent');
  const icon = fs.readFileSync(path.join(ROOT, 'www/games/klondike/icon.svg'), 'utf8');
  ok(!!gm && new RegExp('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon), 'the icon starts on the soft tint of games.json');
  const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
  const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const lab = (x) => {
    const [R, G, Bl] = rgb(x).map(lin), f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    const X = (R * 0.4124 + G * 0.3576 + Bl * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + Bl * 0.0722, Z = (R * 0.0193 + G * 0.1192 + Bl * 0.9505) / 1.08883;
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  };
  const dE = (a, b) => { const P = lab(a), Q = lab(b); return Math.hypot(P[0] - Q[0], P[1] - Q[1], P[2] - Q[2]); };
  const lum = (x) => rgb(x).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
  const near = games.filter((g) => g.id !== 'klondike').map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0];
  ok(near[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5, 'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + ') and keeps white text at 4.5:1');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  ok(['kl-win', 'kl-three', 'kl-fast'].every((id) => new RegExp("\\{ id: '" + id + "',[^\\n]*dde: '[^\\n]*des: '").test(core) && html.indexOf("unlock('" + id + "')") > 0), 'the three Klondike awards exist in every language and are unlocked');
  ok(Date.now() - t0 < 15000, 'the Klondike tests finish in under 15 s (' + (Date.now() - t0) + ' ms)');
}

function testCrazyEights() {
  head('Crazy Eights (#416)');
  const t0 = Date.now();
  const E = loadEngine('crazyeights', 'CrazyEightsEngineFactory');
  const html = fs.readFileSync(path.join(ROOT, 'www/games/crazyeights/index.html'), 'utf8');
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  const rng = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
  const card = (r, s) => r * 4 + s;            // ranks 0..12 (A..K), suits ♣ ♦ ♥ ♠; the eight is rank 7

  // The deal: seven each for two, five each for three or four; the starter is never an eight
  const R2 = E.newRound(rng(3), 2), R4 = E.newRound(rng(4), 4);
  ok(R2.hands.every((h) => h.length === 7) && R4.hands.every((h) => h.length === 5) && E.validRound(R2) && E.validRound(R4), 'seven cards each for two players, five for three or four, one full deck');
  let eightStarter = 0;
  for (let i = 0; i < 300; i++) if (E.rank(E.top(E.newRound(rng(i), 3))) === 7) eightStarter++;
  ok(eightStarter === 0, 'the starter is never an eight (300 deals)');

  // Matching: the suit in play or the top card's rank; an eight on anything
  const R = { n: 2, hands: [[], []], stock: [card(1, 1)], discard: [card(4, 2)], suit: 2, turn: 0, drawn: -1, passes: 0, winner: -1 };   // 5♥ on top
  ok(E.canPlay(R, card(10, 2)) && E.canPlay(R, card(4, 3)), 'a heart or another five goes on the 5♥');
  ok(!E.canPlay(R, card(5, 3)) && !E.canPlay(R, card(9, 0)), 'a 6♠ or a 10♣ does not');
  ok(E.canPlay(R, card(7, 0)) && E.canPlay(R, card(7, 3)), 'an eight goes on anything');
  R.hands[0] = [card(7, 0), card(2, 1)];
  ok(E.play(R, card(7, 0), 3) && R.suit === 3 && E.top(R) === card(7, 0) && R.turn === 1, 'an eight names the next suit, and the turn passes');
  R.hands[1] = [card(2, 1), card(12, 3)];
  ok(E.legal(R, 1).length === 1 && E.legal(R, 1)[0] === card(12, 3), 'after an eight that named spades, only a spade or an eight follows');
  ok(!E.play(R, card(2, 1), -1) && R.hands[1].length === 2, 'a card that does not fit is refused and stays in the hand');

  // Drawing: only when stuck, one card a turn, and only that card may then be played
  const D = E.newRound(rng(9), 2);
  D.hands[0] = [card(9, 0)]; D.discard = [card(4, 2)]; D.suit = 2;
  D.stock = D.stock.filter((c) => c !== card(9, 0) && c !== card(4, 2));
  const fit = card(11, 2);
  D.stock = D.stock.filter((c) => c !== fit).concat([fit]);
  ok(E.draw(D) === fit && D.hands[0].length === 2 && D.drawn === fit, 'stuck, you draw one card');
  ok(E.draw(D) === -1, 'and only one card a turn');
  ok(E.legal(D, 0).length === 1 && E.legal(D, 0)[0] === fit && E.canPass(D), 'the drawn card may be played, or you pass');
  const Dfit = E.newRound(rng(10), 2);
  Dfit.hands[0] = [card(4, 0)]; Dfit.discard = [card(4, 2)]; Dfit.suit = 2;
  ok(E.draw(Dfit) === -1 && !E.canPass(Dfit), 'with a card that fits you may neither draw nor pass');
  // An empty stock is made again from the discards under the top card
  const S = { n: 2, hands: [[card(0, 0)], [card(0, 1)]], stock: [], discard: [card(3, 3), card(5, 3), card(6, 3)], suit: 3, turn: 0, drawn: -1, passes: 0, winner: -1 };
  const got = E.draw(S, rng(1));
  ok(got >= 0 && S.discard.length === 1 && S.discard[0] === card(6, 3) && S.stock.length === 1, 'the stock is rebuilt from the discards, the top card staying put');
  // Nothing to draw and nothing to play, round the table: the lowest hand wins
  const B = { n: 2, hands: [[card(1, 0)], [card(12, 1)]], stock: [], discard: [card(4, 2)], suit: 2, turn: 0, drawn: -1, passes: 0, winner: -1 };
  ok(E.canPass(B) && E.pass(B) && B.winner === -1 && E.pass(B) && B.blocked && B.winner === 0, 'when everyone has to pass, the round is blocked and the lowest hand (2 against 10) wins');
  // A pass after drawing does not count toward a block (a first draft blocked 45 % of rounds that way)
  const P = E.newRound(rng(12), 2);
  P.drawn = P.hands[0][0]; P.passes = 1;
  E.pass(P);
  ok(P.passes === 0 && P.winner === -1, 'a pass after a draw does not count toward a blocked round');

  // Scoring: the winner takes the others' cards, eights 50, court cards 10, aces 1
  ok(E.cardPoints(card(7, 0)) === 50 && E.cardPoints(card(11, 1)) === 10 && E.cardPoints(card(0, 2)) === 1 && E.cardPoints(card(5, 3)) === 6, 'eight 50, a court card 10, an ace 1, the rest their number');
  const W = { n: 3, hands: [[], [card(7, 0), card(0, 1)], [card(12, 2)]], winner: 0 };
  ok(E.roundPoints(W) === 61, 'the round\'s winner scores 61 from an eight, an ace and a king');

  // Bots: every move legal, rounds always end, and the stronger levels win more
  const round = (levels, seed) => {
    const r = rng(seed), RR = E.newRound(r, levels.length, seed % levels.length);
    for (let i = 0; i < 3000 && RR.winner < 0; i++) {
      const m = E.botMove(RR, levels[RR.turn], r);
      if (m.play !== undefined) { if (!E.play(RR, m.play, m.suit)) return -9; }
      else if (m.draw) { const s = RR.suit, p = RR.turn; if (E.draw(RR, r) < 0) { if (!E.pass(RR)) return -9; } else E.noteShort(RR, p, s); }
      else if (!E.pass(RR)) return -9;
    }
    return RR.winner;
  };
  const pit = (a, b, n) => { let w = 0; for (let i = 0; i < n; i++) { const lv = i % 2 ? [a, b] : [b, a]; const g = round(lv, 500 + i); if (g === -9) return -1; if (g === (i % 2 ? 0 : 1)) w++; } return w; };
  const he = pit('hard', 'easy', 200), me = pit('medium', 'easy', 200);
  ok(he >= 0 && me >= 0, 'every bot move is legal and every round ends');
  ok(he >= 115 && me >= 115, 'medium and hard beat easy in at least 115 of 200 rounds (' + me + ', ' + he + ')');
  const four = [1, 2, 3].map((k) => round(['hard', 'medium', 'easy', 'hard'], 900 + k));
  ok(four.every((w) => w >= 0 && w < 4), 'four-player rounds end with a winner');

  // Page: shared cards and fly, options behind a gear, the daily round seeded
  ok(/C\.cards\.el\(c,/.test(html) && /C\.ui\.fly\(hand\.children\[i\], from, \{ ms: 220, delay: i \* DEAL_MS, flip: true \}\)/.test(html), 'the cards are Chogan.cards and the deal uses Chogan.ui.fly');
  ok(/'aria-label': C\.t\('settings'\)/.test(html) && /function showSettings\(\)/.test(html), 'rivals and level are chosen behind a gear');
  ok(/C\.daily\('crazyeights', M\.daily\)\.rng/.test(html) && /C\.daily\('crazyeights', M\.daily \+ '\|bots'\)\.rng/.test(html), 'the daily round deals and plays the bots from the day\'s seed');
  ok(/\.ce-table \{ direction: ltr;/.test(html) && /\.ce-hand \{ direction: ltr;/.test(html), 'the table and the hand are not mirrored in Persian');

  // Identity
  const gm = games.find((g) => g.id === 'crazyeights');
  ok(!!gm && gm.cat === 'cards' && gm.daily !== false && gm.name.fa === 'هفت خبیث', 'games.json lists it under card games with the owner\'s Persian name');
  ok(!!gm && /accent: '([^']+)'/.test(html) && html.match(/accent: '([^']+)'/)[1] === gm.color, 'games.json and the page share the accent');
  const icon = fs.readFileSync(path.join(ROOT, 'www/games/crazyeights/icon.svg'), 'utf8');
  ok(!!gm && new RegExp('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon), 'the icon starts on the soft tint of games.json');
  const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
  const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const lab = (x) => {
    const [Rr, G, Bl] = rgb(x).map(lin), f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    const X = (Rr * 0.4124 + G * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + G * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + G * 0.1192 + Bl * 0.9505) / 1.08883;
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  };
  const dE = (a, b) => { const A = lab(a), Q = lab(b); return Math.hypot(A[0] - Q[0], A[1] - Q[1], A[2] - Q[2]); };
  const lum = (x) => rgb(x).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
  const near = games.filter((g) => g.id !== 'crazyeights').map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0];
  ok(near[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5, 'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + ') and keeps white text at 4.5:1');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  ok(['ce-win', 'ce-hard', 'ce-eight'].every((id) => new RegExp("\\{ id: '" + id + "',[^\\n]*dde: '[^\\n]*des: '").test(core) && html.indexOf("unlock('" + id + "')") > 0), 'the three Crazy Eights awards exist in every language and are unlocked');
  ok(Date.now() - t0 < 10000, 'the Crazy Eights tests finish in under 10 s (' + (Date.now() - t0) + ' ms)');
}

function testCrazyEightsIran() {
  head('Haft Khabis: the Iranian rules by default (#449)');
  // #416 shipped international Crazy Eights under the Persian name «هفت خبیث», whose
  // players expect the jack wild, sevens that stack, eights again, tens reverse, aces skip.
  const t0 = Date.now();
  const E = loadEngine('crazyeights', 'CrazyEightsEngineFactory');
  const html = fs.readFileSync(path.join(ROOT, 'www/games/crazyeights/index.html'), 'utf8');
  const rng = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
  const card = (r, s) => r * 4 + s;            // ranks 0..12 (A..K): ace 0, seven 6, eight 7, ten 9, jack 10
  const R4 = E.newRound(rng(4), 4, 0, 'iran');
  ok(R4.rules === 'iran' && R4.hands.every((h) => h.length === 7) && E.validRound(R4), 'Iranian rules: seven cards each, also for four players');
  let specialStarter = 0;
  for (let i = 0; i < 300; i++) { const r = E.rank(E.newRound(rng(100 + i), 3, 0, 'iran').discard[0]); if ([0, 6, 7, 9, 10].indexOf(r) >= 0) specialStarter++; }
  ok(specialStarter === 0, 'the starter is never a special card (300 deals)');
  // a fixed table: three players, top card 4♥, suit hearts, player 0 to move
  const T = (hands, top) => ({ n: hands.length, hands, stock: [card(1, 0), card(2, 0), card(3, 0), card(4, 0), card(5, 0)], discard: [top || card(3, 2)], suit: E.suit(top || card(3, 2)), turn: 0, drawn: -1, passes: 0, winner: -1, blocked: false, rules: 'iran', dir: 1, pending: 0 });
  // jack: wild, names the suit
  let R = T([[card(10, 0), card(12, 1)], [card(11, 3)], [card(12, 3)]]);
  ok(E.canPlay(R, card(10, 0)) && E.play(R, card(10, 0), 3) && R.suit === 3 && R.turn === 1, 'a jack goes on anything and names the next suit');
  ok(!E.canPlay(T([[card(7, 0)]]), card(7, 0)), 'an eight is no longer wild');
  // seven: the next draws two, sevens stack
  R = T([[card(6, 2), card(12, 1)], [card(6, 0), card(11, 3)], [card(12, 3), card(1, 1)]]);
  ok(E.play(R, card(6, 2), -1) && R.pending === 2 && R.turn === 1, 'a seven puts two cards on the next player');
  ok(E.legal(R, 1).length === 1 && E.legal(R, 1)[0] === card(6, 0) && E.draw(R) === -1 && !E.canPass(R), 'with a seven pending, only a seven may be played, and there is no ordinary draw or pass');
  ok(E.play(R, card(6, 0), -1) && R.pending === 4 && R.turn === 2, 'a second seven stacks: four for the next');
  ok(typeof E.takePenalty === 'function', 'the engine lets a player take a pending penalty');
  if (typeof E.takePenalty !== 'function') return;
  const got = E.takePenalty(R, rng(1));
  ok(got.length === 4 && R.hands[2].length === 6 && R.pending === 0 && R.turn === 0, 'with no seven, the player takes all four and the turn ends');
  // eight: play again
  R = T([[card(7, 2), card(1, 2), card(12, 1)], [card(11, 3)], [card(12, 3)]]);
  ok(E.play(R, card(7, 2), -1) && R.turn === 0 && E.play(R, card(1, 2), -1) && R.turn === 1, 'an eight lets the same player play one more card');
  // ten: reverses with three players
  R = T([[card(9, 2), card(12, 1)], [card(11, 3)], [card(12, 3)]]);
  ok(E.play(R, card(9, 2), -1) && R.dir === -1 && R.turn === 2, 'a ten reverses: with three players the turn goes to the one on the other side');
  // ace: skips the next
  R = T([[card(0, 2), card(12, 1)], [card(11, 3)], [card(12, 3)]]);
  ok(E.play(R, card(0, 2), -1) && R.turn === 2, 'an ace skips the next player');
  R = T([[card(0, 2), card(12, 1)], [card(11, 3)]]);
  ok(E.play(R, card(0, 2), -1) && R.turn === 0, 'with two players an ace means you play again');
  ok(E.cardPoints(card(10, 0), 'iran') === 50 && E.cardPoints(card(6, 0), 'iran') === 20 && E.cardPoints(card(7, 0), 'iran') === 20 && E.cardPoints(card(12, 0), 'iran') === 10 && E.cardPoints(card(4, 0), 'iran') === 5 && E.cardPoints(card(7, 0)) === 50,
    'scoring: jack 50, the other special cards 20; the international eight stays 50');
  // a round saved before #449 has no rules and keeps the international game
  const old = E.newRound(rng(7), 3, 0);
  ok(old.rules === undefined && E.validRound(old) && E.perHand(3) === 5, 'a round without rules plays the international game');
  // bots under the Iranian rules: every move legal, every round ends, levels still differ
  const round = (levels, seed) => {
    const r = rng(seed), RR = E.newRound(r, levels.length, seed % levels.length, 'iran');
    for (let i = 0; i < 4000 && RR.winner < 0; i++) {
      const m = E.botMove(RR, levels[RR.turn], r);
      if (m.take) { E.takePenalty(RR, r); continue; }
      if (m.play !== undefined) { if (!E.play(RR, m.play, m.suit)) return -9; }
      else if (m.draw) { const s = RR.suit, p = RR.turn; if (E.draw(RR, r) < 0) { if (!E.pass(RR)) return -9; } else E.noteShort(RR, p, s); }
      else if (!E.pass(RR)) return -9;
      if (!E.validRound(RR)) return -8;
    }
    return RR.winner;
  };
  const games3 = [];
  for (let i = 0; i < 150; i++) games3.push(round(['medium', 'easy', 'hard'].slice(0, 2 + (i % 3 ? 1 : 0)), 700 + i));
  ok(games3.length === 150 && games3.every((w) => w >= 0), 'every bot move is legal and all 150 bot rounds end with a winner, two and three players');
  // the special cards make this a game of luck: measured over 1000 rounds medium wins
  // about 57 %, so the check uses 600 rounds to stay clear of noise
  let mw = 0;
  for (let i = 0; i < 600; i++) { const lv = i % 2 ? ['medium', 'easy'] : ['easy', 'medium']; if (round(lv, 2000 + i) === (i % 2 ? 0 : 1)) mw++; }
  ok(mw >= 320, 'medium beats easy in at least 320 of 600 Iranian rounds (' + mw + ')');
  // page: the default, the switch, and the daily
  ok(/if \(prefs\.rules !== 'intl'\) prefs\.rules = 'iran';/.test(html) && /rules: daily \? 'iran' : prefs\.rules/.test(html), 'the Iranian rules are the default, and the daily always plays them');
  ok(/C\.t\('rulesSet'\) \}\), seg3\]/.test(html) && /C\.t\(iranNow\(\) \? 'rulesIranText' : 'rules'\)/.test(html), 'the rules are chosen behind the gear, and the help describes the set in play');
  ok(['rulesSet', 'rulesIran', 'rulesIntl', 'rulesIranText', 'takeN', 'tookN', 'youTook', 'eightAgain', 'skippedN', 'reversed', 'tutTitle2i', 'tutText2i'].every((k) => (html.match(new RegExp('\\b' + k + ": '", 'g')) || []).length === LOCALE_CODES.length), 'every new string is in every language');
  ok(Date.now() - t0 < 10000, 'the Haft Khabis tests finish in under 10 s (' + (Date.now() - t0) + ' ms)');
}

function testGinRummy() {
  head('Gin Rummy (#417)');
  const t0 = Date.now();
  const E = loadEngine('ginrummy', 'GinRummyEngineFactory');
  const html = fs.readFileSync(path.join(ROOT, 'www/games/ginrummy/index.html'), 'utf8');
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  const rng = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
  const c = (r, s) => r * 4 + s;               // ranks 0..12 (A..K), suits ♣ ♦ ♥ ♠
  const st = (h0, h1, discard) => {
    const used = new Set([...h0, ...h1, ...discard]), stock = [];
    for (let x = 0; x < 52; x++) if (!used.has(x)) stock.push(x);
    return { hands: [h0, h1], stock, discard, turn: 0, phase: 'draw', took: -1, result: null, dealer: 1, seen: [[], []] };
  };

  // The deal
  const H0 = E.newHand(rng(5), 1);
  ok(H0.hands[0].length === 10 && H0.hands[1].length === 10 && H0.discard.length === 1 && H0.stock.length === 31 && H0.turn === 0 && E.validHand(H0), 'ten cards each, one upcard, 31 in the stock, the non-dealer first');

  // Melds and deadwood
  ok(E.value(c(0, 0)) === 1 && E.value(c(8, 0)) === 9 && E.value(c(9, 1)) === 10 && E.value(c(12, 2)) === 10, 'aces 1, numbers their value, court cards 10');
  const hm = [c(6, 0), c(7, 0), c(8, 0), c(12, 0), c(12, 1), c(12, 2), c(0, 1), c(1, 1), c(2, 1), c(4, 3)];
  const bm = E.best(hm);
  ok(bm.points === 5 && bm.melds.length === 3 && bm.dead.length === 1 && bm.dead[0] === c(4, 3), 'a run, a set of kings and A-2-3 leave only the 5♠ (deadwood 5)');
  ok(E.deadwood([c(11, 3), c(12, 3), c(0, 3)]) === 21, 'Q-K-A does not wrap round: no run');
  // the 7♦ fits a set of sevens or a run of diamonds; the best arrangement uses it where it saves most
  // (a first version of this check gave six cards that make both a set and a run, deadwood 0)
  const over = [c(6, 0), c(6, 2), c(6, 1), c(7, 1), c(8, 1)];
  ok(E.deadwood(over) === 14, 'a card in both a set and a run goes where it leaves least deadwood (7-8-9♦ run, two sevens left: 14, not 17)');
  ok(E.deadwood([c(4, 0), c(4, 1), c(4, 2), c(4, 3)]) === 0, 'four of a kind is one meld');

  // Turns: draw one, discard one; the card just taken from the pile can't go straight back
  const T = st([c(0, 0), c(1, 0), c(2, 0), c(5, 1), c(5, 2), c(5, 3), c(9, 0), c(10, 1), c(11, 2), c(12, 3)], H0.hands[1].filter(() => false).concat([c(3, 1), c(3, 2), c(3, 3), c(7, 0), c(7, 1), c(7, 2), c(8, 0), c(8, 1), c(8, 2), c(8, 3)]), [c(9, 3)]);
  ok(E.draw(T, 'discard') === c(9, 3) && T.phase === 'discard' && !E.canDiscard(T, c(9, 3)), 'the upcard can be taken, but not thrown straight back');
  ok(E.draw(T, 'stock') === -1, 'and only one card is drawn a turn');
  ok(!E.canKnock(T, c(12, 3)), 'with 39 deadwood left there is no knock');
  ok(E.discard(T, c(12, 3), false) && T.turn === 1 && T.phase === 'draw' && E.top(T) === c(12, 3), 'a discard passes the turn');
  const Lo = st([], [], [c(0, 0)]);
  Lo.stock = Lo.stock.slice(0, 2);
  ok(E.draw(Lo, 'stock') === -1 && E.stockDead(Lo), 'with two cards left in the stock nobody draws from it');

  // The showdown: a knock scores the difference after lay-offs
  const K = st([c(0, 0), c(1, 0), c(2, 0), c(5, 1), c(5, 2), c(5, 3), c(8, 2), c(9, 2), c(10, 2), c(3, 3), c(1, 3)],
               [c(3, 0), c(12, 1), c(12, 2), c(12, 3), c(6, 0), c(6, 1), c(4, 3), c(4, 2), c(9, 0), c(11, 2)], [c(10, 0)]);
  K.phase = 'discard';
  // you: A-2-3♣, three sixes, 9-10-J♥ and the 4♠ + 2♠ (6 deadwood) — throw the 2♠ and knock with 4
  ok(E.canKnock(K, c(1, 3)) && E.discard(K, c(1, 3), true), 'with 4 deadwood after the discard you may knock');
  const R = K.result;
  // the bot: three kings; 4♣ lays off on A-2-3♣, Q♥ on 9-10-J♥; left 7♣ 7♦ 5♠ 5♥ 10♣ = 7+7+5+5+10 = 34
  ok(R.knocker === 0 && R.off.length === 2 && R.off.indexOf(c(3, 0)) >= 0 && R.off.indexOf(c(11, 2)) >= 0, 'the defender lays off the 4♣ and the Q♥ on the knocker\'s runs');
  ok(R.dPts === 34 && R.kPts === 4 && R.winner === 0 && R.points === 30 && !R.undercut && !R.gin, 'the knocker scores 34 − 4 = 30');
  // An undercut: the defender with as much or less deadwood takes the difference plus 25
  const U = st([c(0, 0), c(1, 0), c(2, 0), c(5, 1), c(5, 2), c(5, 3), c(8, 2), c(9, 2), c(10, 2), c(6, 3), c(12, 3)],
               [c(3, 1), c(3, 2), c(3, 3), c(7, 0), c(7, 1), c(7, 2), c(10, 0), c(10, 1), c(10, 3), c(1, 1)], [c(4, 0)]);
  U.phase = 'discard';
  E.discard(U, c(12, 3), true);            // you knock with the 7♠ (7); the bot holds only a 2♦ (2)
  ok(U.result.winner === 1 && U.result.undercut && U.result.points === 7 - 2 + 25, 'a defender with less deadwood undercuts and scores 5 + 25');
  const Q = st([c(0, 0), c(1, 0), c(2, 0), c(5, 1), c(5, 2), c(5, 3), c(8, 2), c(9, 2), c(10, 2), c(2, 3), c(12, 3)],
               [c(3, 1), c(3, 2), c(3, 3), c(7, 0), c(7, 1), c(7, 2), c(10, 0), c(10, 1), c(10, 3), c(2, 1)], [c(4, 0)]);
  Q.phase = 'discard';
  E.discard(Q, c(12, 3), true);            // you knock with the 3♠ (3); the bot holds a 3♦ (3)
  ok(Q.result.winner === 1 && Q.result.undercut && Q.result.points === 25, 'equal deadwood is an undercut too: 0 + 25');
  // Gin: 25 plus the defender's deadwood, and no laying off
  const G = st([c(0, 0), c(1, 0), c(2, 0), c(5, 1), c(5, 2), c(5, 3), c(8, 2), c(9, 2), c(10, 2), c(11, 2), c(12, 3)],
               [c(3, 0), c(12, 1), c(12, 2), c(12, 0), c(6, 0), c(6, 1), c(4, 3), c(4, 2), c(9, 0), c(7, 3)], [c(10, 0)]);
  G.phase = 'discard';
  E.discard(G, c(12, 3), true);
  ok(G.result.gin && G.result.off.length === 0 && G.result.points === 25 + G.result.dPts && G.result.dPts === 4 + 7 + 7 + 5 + 5 + 10 + 8, 'gin scores 25 plus all the defender\'s deadwood (46), with nothing laid off');

  // Bots: every move legal, every hand ends, and the levels differ
  const play = (levels, seed) => {
    const r = rng(seed), HH = E.newHand(r, Math.floor(seed / 2) % 2);
    for (let i = 0; i < 400 && HH.phase !== 'over'; i++) {
      if (HH.phase === 'draw') { if (E.draw(HH, E.botDraw(HH, levels[HH.turn])) < 0) { HH.phase = 'over'; HH.result = { draw: true }; } }
      else { const m = E.botDiscard(HH, levels[HH.turn], r); if (!E.discard(HH, m.c, m.knock)) return null; }
    }
    return HH.phase === 'over' ? HH.result : null;
  };
  const pit = (a, b, n) => { const pts = [0, 0]; for (let i = 0; i < n; i++) { const lv = i % 2 ? [a, b] : [b, a]; const res = play(lv, i + 3); if (!res) return null; if (res.draw) continue; pts[res.winner === (i % 2 ? 0 : 1) ? 0 : 1] += res.points; } return pts[0] / (pts[0] + pts[1]); };
  const me = pit('medium', 'easy', 200), he = pit('hard', 'easy', 200), hm2 = pit('hard', 'medium', 200);
  ok(me !== null && he !== null && hm2 !== null, 'every bot move is legal and every hand ends');
  ok(me >= 0.7 && he >= 0.7, 'medium and hard take at least 70 % of the points against easy (' + (me * 100).toFixed(0) + ' %, ' + (he * 100).toFixed(0) + ' %)');
  ok(hm2 >= 0.42, 'hard is no weaker than medium (' + (hm2 * 100).toFixed(0) + ' % of the points)');

  // Page wiring
  ok(/C\.cards\.el\(c, cls\.trim\(\)\)/.test(html) && /C\.ui\.fly\(hand\.children\[i\], from, \{ ms: 220, delay: i \* 40, flip: true \}\)/.test(html), 'the cards are Chogan.cards and the deal uses Chogan.ui.fly');
  ok(/function arranged\(h\)/.test(html) && /hand\.addEventListener\('pointermove'/.test(html) && /M\.order = order;/.test(html), 'an Arrange button, and dragging a card reorders the hand');
  ok(/'aria-label': C\.t\('settings'\)/.test(html) && /function showSettings\(\)/.test(html), 'the bot\'s level is chosen behind a gear');
  ok(/C\.daily\('ginrummy', M\.daily\)\.rng/.test(html) && /if \(M\.H\.scored\) newHand\(\); else \{ render\(\); showdown\(\); \}/.test(html), 'the daily hand is seeded, and a hand closed after a knock is scored on return');
  ok(/\.gr-hand \.ch-pcard__s, \.gr-hand \.ch-pcard__mini \{/.test(html), 'every card in the hand shows its suit in the visible corner');

  // Identity
  const gm = games.find((g) => g.id === 'ginrummy');
  ok(!!gm && gm.cat === 'cards' && gm.daily !== false, 'games.json lists it under card games, with a daily hand');
  ok(!!gm && /accent: '([^']+)'/.test(html) && html.match(/accent: '([^']+)'/)[1] === gm.color, 'games.json and the page share the accent');
  const icon = fs.readFileSync(path.join(ROOT, 'www/games/ginrummy/icon.svg'), 'utf8');
  ok(!!gm && new RegExp('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon), 'the icon starts on the soft tint of games.json');
  const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
  const lin = (v) => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  const lab = (x) => {
    const [Rr, Gg, Bl] = rgb(x).map(lin), f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    const X = (Rr * 0.4124 + Gg * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gg * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gg * 0.1192 + Bl * 0.9505) / 1.08883;
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  };
  const dE = (a, b) => { const A = lab(a), B = lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
  const lum = (x) => rgb(x).map((v) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const near = games.filter((g) => g.id !== 'ginrummy').map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0];
  ok(near[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5, 'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + ') and keeps white text at 4.5:1');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  ok(['gr-win', 'gr-gin', 'gr-under'].every((id) => new RegExp("\\{ id: '" + id + "',[^\\n]*dde: '[^\\n]*des: '").test(core) && html.indexOf("unlock('" + id + "')") > 0), 'the three Gin Rummy awards exist in every language and are unlocked');
  ok(Date.now() - t0 < 12000, 'the Gin Rummy tests finish in under 12 s (' + (Date.now() - t0) + ' ms)');
}

function testSudokuClearNotes() {
  head('Sudoku: clear all notes, with undo (#424)');
  // Notes filled by the old one-off auto-notes button stayed in saves and could
  // only be erased one cell at a time.
  const src = fs.readFileSync(path.join(ROOT, 'www/games/sudoku/index.html'), 'utf8');
  const grab = (name) => { const a = src.indexOf('  function ' + name + '('); return a < 0 ? '' : src.slice(a, src.indexOf('\n  }\n', a) + 4); };
  const code = ['pushUndo', 'undo', 'hasNotes', 'clearNotes'].map(grab);
  ok(code.every((x) => x.length > 0), 'clearNotes found in Sudoku');
  if (!code.every((x) => x.length > 0)) return;
  const S = { done: false, grid: new Array(81).fill(0), hinted: [], mistakes: 0, undo: [], notes: [] };
  for (let i = 0; i < 81; i++) S.notes.push(i % 3 ? [1, 4, 7] : []);
  let saved = 0, painted = 0;
  const sb = { S, C: { feedback: () => {} }, paint: () => painted++, save: () => saved++, JSON };
  vm.runInNewContext(code.join('\n') + ';this.clearNotes = clearNotes; this.undo = undo;', sb);
  ok(sb.clearNotes() === true && S.notes.every((n) => n.length === 0) && saved === 1 && painted === 1, 'every note on the board is cleared, painted and saved');
  ok(sb.clearNotes() === false && S.undo.length === 1, 'with nothing left to clear it does nothing and adds no undo step');
  sb.undo();
  ok(S.notes.filter((n) => n.length === 3).length === 54, 'one undo brings all 54 cells of notes back');
  ok(/settingRow\('autoNotes', 'autoNotes'\),\n        clearRow\(\)/.test(src), 'the action sits in the settings sheet, under auto notes');
}

function testCardSpeed() {
  head('Card games: one speed setting, Slow, Normal, Fast (#425)');
  // A friend found the card games' pace wrong, too fast for some and too slow
  // for others; there was no way to change it.
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const a0 = core.indexOf('    var SPEEDS'), b0 = core.indexOf('\n    }\n', core.indexOf('    function setSpeed(', a0)) + 6;
  ok(a0 > 0 && b0 > a0, 'the card speed is in the core');
  if (!(a0 > 0 && b0 > a0)) return;
  const state = { settings: { cardSpeed: 'normal' } };
  let savedN = 0;
  const sb = { Math, state, saveSettings: () => savedN++ };
  vm.runInNewContext(core.slice(a0, b0) + ';this.pace = pace; this.setSpeed = setSpeed;', sb);
  const base = [600, 650, 700, 750, 950, 1100];
  ok(base.every((ms) => sb.pace(ms) === ms), 'Normal keeps every timing exactly as it was');
  sb.setSpeed('slow'); const slow = base.map(sb.pace);
  sb.setSpeed('fast'); const fast = base.map(sb.pace);
  ok(base.every((ms, i) => slow[i] > ms && ms > fast[i]), 'Slow is slower and Fast faster than Normal for every timing (' + slow[0] + ' > 600 > ' + fast[0] + ')');
  ok(!sb.setSpeed('ludicrous') && state.settings.cardSpeed === 'fast' && savedN === 2, 'only the three speeds are taken, and each choice is saved');
  ok(/cardSpeed: 'normal', \/\/ slow \| normal \| fast/.test(core) && /if \(cfg\.cardSpeed\) Chogan\.cards\.paced = true;/.test(core), 'Normal is the default, and a card game opts in');
  ok(/var pk = typeof Chogan !== 'undefined' && Chogan\.cards && Chogan\.cards\.paced \? Chogan\.cards\.speed\(\) : 1;\n    var ms = Math\.round\(\(opts\.ms \|\| 300\) \* pk\), delay = Math\.round\(\(opts\.delay \|\| 0\) \* pk\);/.test(core) && /duration: Math\.round\(\(opts\.ms \|\| 320\) \* pk\), delay: Math\.round\(\(opts\.delay \|\| 0\) \* pk\)/.test(core), 'card flights and sweeps follow the pace');
  const flyBody = core.slice(core.indexOf('  ui.fly = function'), core.indexOf('\n  };\n', core.indexOf('  ui.fly = function')));
  ok((flyBody.match(/var k = /g) || []).length === 1 && /'scale\(' \+ k\.toFixed\(3\)/.test(flyBody), 'the pace never replaces the flight\'s start scale');
  ok(/ui\.fly = function \(node, from, opts\) \{\n    if \(!node \|\| !from \|\| !node\.animate \|\| ui\.reduceMotion\(\)\) return null;/.test(core), 'reduced motion still means no flight at any pace');
  ok((core.match(/backTermeh: '[^']+', cardSpeed: '[^']+', speedSlow: '[^']+', speedNormal: '[^']+', speedFast: '[^']+',/g) || []).length === LOCALE_CODES.length, 'the speed is named in every language');
  // every card game opts in, shows the speed behind its gear and paces its bots
  const paced = {
    hokm: ['C.cards.pace(700)', 'C.cards.pace(holdTrick ? 950 : 600)', 'C.cards.pace(950)'],
    pasur: ['C.cards.pace(900 + 8 * 35)', 'C.cards.pace(1100)', 'C.cards.pace(650)'],
    blackjack: ['C.cards.pace(ms)', 'C.cards.pace(DEAL_MS)', 'C.cards.pace(DEAL_MS / 2)'],
    freecell: ['ms: C.cards.pace(170)', 'ms: C.cards.pace(240)', 'C.cards.pace(260)'],
    klondike: ["C.cards.pace(180) + 'ms'", 'C.cards.pace(220)', 'C.cards.pace(70)'],
    crazyeights: ['C.cards.pace(C.ui.reduceMotion() ? 300 : BOT_MS)', 'C.cards.pace(450)', 'C.cards.pace(900)', 'C.cards.pace(700)'],
    ginrummy: ['C.cards.pace(C.ui.reduceMotion() ? 300 : BOT_MS)', 'C.cards.pace(700)'],
    spider: ["C.cards.pace(180) + 'ms'", 'C.cards.pace(order[k] * 40)', 'C.cards.pace(400)']
  };
  for (const g of Object.keys(paced)) {
    const html = fs.readFileSync(path.join(ROOT, 'www/games', g, 'index.html'), 'utf8');
    ok(/cardSpeed: true,/.test(html) && /C\.cards\.speed(Row|Gear)\(\)/.test(html) && paced[g].every((x) => html.indexOf(x) >= 0), g + ': opts in, shows the speed behind its gear, and paces its bots and holds');
  }
}

// #485: in the dark theme a card's edge was the dark line colour on a dark face (1.08:1),
// and stacked cards ran together; the edge is now light in both dark-theme rules, and the
// resulting contrast is computed here from the core's own colours
function testCardEdgeDark() {
  head('Cards: a light edge in the dark theme (#485)');
  const css = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8');
  const auto = /@media \(prefers-color-scheme: dark\) \{ :root:not\(\[data-theme="light"\]\) \.ch-pcard \{ border-color: rgba\(255, 255, 255, (\.\d+)\); \} \}/.exec(css);
  const forced = /:root\[data-theme="dark"\] \.ch-pcard \{ border-color: rgba\(255, 255, 255, (\.\d+)\); \}/.exec(css);
  ok(!!auto && !!forced && auto[1] === forced[1], 'the light edge is set for both the automatic and the chosen dark theme');
  if (!auto) return;
  // the darkest card face the games use in the dark theme is --c-surface-3
  const dark = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'));
  const face = (/--c-surface-3:\s*(#[0-9A-Fa-f]{6})/.exec(dark) || [])[1];
  ok(!!face, 'the dark theme\'s card face colour found (' + face + ')');
  if (!face) return;
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = +auto[1], f = rgb(face), e = f.map((v) => 255 * a + v * (1 - a));
  const L = (c) => c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const cr = (L(e) + 0.05) / (L(f) + 0.05);
  ok(cr >= 3, 'a card edge stands out from its face at ' + cr.toFixed(2) + ':1 (3:1 is the bar for the edge of a control)');
}

// #488: the web app had long-press shortcuts to single games; the Android app had none
function testAndroidShortcuts() {
  head('Android: launcher shortcuts to games (#488)');
  const A = (f) => fs.readFileSync(path.join(ROOT, 'android/app/src/main', f), 'utf8');
  const xml = A('res/xml/shortcuts.xml'), man = A('AndroidManifest.xml'), act = A('java/io/github/choganhq/chogan/MainActivity.java');
  const en = A('res/values/strings.xml'), fa = A('res/values-fa/strings.xml');
  const ids = [...xml.matchAll(/android:shortcutId="([a-z0-9-]+)"/g)].map((m) => m[1]);
  const pwa = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/manifest.webmanifest'), 'utf8')).shortcuts.map((x) => /games\/([a-z0-9-]+)\//.exec(x.url)[1]);
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  ok(ids.length >= 1 && ids.length <= 4 && ids.join() === pwa.slice(0, ids.length).join(), 'the shortcuts are the first four of the web app\'s (' + ids.join(', ') + ')');
  const each = ids.filter((id) => {
    const r = id.replace(/-/g, '_'), g = games.find((x) => x.id === id);
    return g && new RegExp('android:data="chogan://game/' + id + '"').test(xml) && fs.existsSync(path.join(ROOT, 'android/app/src/main/res/drawable-nodpi/shortcut_' + r + '.png')) &&
      en.indexOf('<string name="shortcut_' + r + '">' + g.name.en.replace(/\u00ad/g, '') + '</string>') > 0 && fa.indexOf('<string name="shortcut_' + r + '">' + g.name.fa + '</string>') > 0;
  });
  ok(each.length === ids.length, 'each opens its game by id, with its own icon and its name in English and Persian (' + each.length + '/' + ids.length + ')');
  ok(/<meta-data android:name="android\.app\.shortcuts" android:resource="@xml\/shortcuts" \/>/.test(man) && (man.match(/<uses-permission /g) || []).length === 1, 'the launcher activity declares them, and still only one permission');
  ok(/openShortcut\(getIntent\(\)\);/.test(act) && /protected void onNewIntent\(Intent intent\) \{[\s\S]*?openShortcut\(intent\);/.test(act), 'a shortcut opens its game whether the app was closed or already open');
  ok(/if \(id == null \|\| !id\.matches\("\[a-z0-9-\]\{1,32\}"\)\) return;/.test(act) && /getBridge\(\)\.getLocalUrl\(\) \+ "\/games\/" \+ id \+ "\/index\.html\?from=shortcut"/.test(act), 'only a plain game id is accepted, and only a page of the app itself is loaded');
}

// #519: Sudoku's box lines were only a wider gap in --c-line, which in the dark theme is
// almost the cells' own colour, so a player could not find the 3x3 boxes; the lines and
// the frame now have their own colour in the dark theme, checked here against the core's
// cell colours; the light theme keeps the frame's colour, as the owner wanted (#526)
function testSudokuBoxLines() {
  head('Sudoku: the 3x3 boxes stand out in the dark theme (#519, #526)');
  const sd = fs.readFileSync(path.join(ROOT, 'www/games/sudoku/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8');
  const light = /:root \{ --sd-box: var\(--c-line\); \}/.test(sd);
  const auto = (/@media \(prefers-color-scheme: dark\) \{ :root:not\(\[data-theme="light"\]\) \{ --sd-box: (#[0-9A-Fa-f]{6}); \} \}/.exec(sd) || [])[1];
  const forced = (/:root\[data-theme="dark"\] \{ --sd-box: (#[0-9A-Fa-f]{6}); \}/.exec(sd) || [])[1];
  ok(light && !!auto && auto === forced, 'the light theme keeps the frame colour, the automatic and the chosen dark theme get their own (' + [auto, forced].join(', ') + ')');
  ok(/\.sd-board \{[^}]*border: 3px solid var\(--sd-box\);/.test(sd) && /\.sd-sep \{ background: var\(--sd-box\);/.test(sd), 'the frame and the box lines are drawn in it');
  const seps = (/\[4, 8\]\.forEach\(function \(t\) \{([\s\S]*?)\}\);/.exec(sd) || [])[1] || '';
  ok(/sd-sep--col[\s\S]*'grid-column': String\(t\)/.test(seps) && /sd-sep--row[\s\S]*'grid-row': String\(t\)/.test(seps), 'a line sits in each of the four spacer tracks (columns and rows 4 and 8)');
  if (!light || !auto) return;
  const darkCss = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'));
  const pick = (src, k) => (new RegExp('--c-' + k + ':\\s*(#[0-9A-Fa-f]{6})').exec(src) || [])[1];
  const L = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const cr = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const rows = [];
  for (const [theme, box, src] of [['dark', auto, darkCss]]) {
    for (const k of ['surface', 'surface-2', 'surface-3']) {
      const c = pick(src, k);
      rows.push(c ? [theme + ' ' + k, cr(box, c)] : [theme + ' ' + k + ' missing', 0]);
    }
  }
  ok(rows.length === 3, 'three dark cell colours compared');
  const low = rows.filter((r) => !(r[1] >= 3));
  ok(!low.length, 'the box lines stand out from every cell colour at 3:1 or more (lowest ' + Math.min(...rows.map((r) => r[1])).toFixed(2) + ':1)' + (low.length ? ': ' + low.map((r) => r[0] + ' ' + r[1].toFixed(2)).join(', ') : ''));
}

// #521: with 46 games a player who knew a name still had to look through a category;
// the menu searches every language's name, folding what phone keyboards type differently
function testMenuSearch() {
  head('Menu: search games by name (#521)');
  const html = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
  const fold = (/^  function fold\(s\) \{[\s\S]*?^  \}$/m.exec(html) || [''])[0];
  const match = (/^  function gameMatches\(g, q\) \{[\s\S]*?^  \}$/m.exec(html) || [''])[0];
  ok(!!fold && !!match, 'the matcher found in the menu');
  if (!fold || !match) return;
  const sb = {};
  vm.runInNewContext(fold + match + ';this.m = gameMatches;', sb);
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  ok(games.length > 0, 'games listed (' + games.length + ')');
  const find = (q) => games.filter((g) => sb.m(g, q)).map((g) => g.id);
  const cases = [
    ['شطرنج', ['chess', 'xiangqi']], ['chess', ['chess', 'xiangqi']], ['CHESS', ['chess', 'xiangqi']],
    ['مین‌روب', ['minesweeper']], ['مین روب', ['minesweeper']], ['مينروب', ['minesweeper']],   // space, Arabic ي
    ['turmverteidigung', ['tower-defence']],                                                  // German soft hyphen
    ['数独', ['sudoku']], ['象棋', ['chess', 'xiangqi']], ['ajedrez', ['chess', 'xiangqi']], ['sudoku', ['sudoku']], ['qqqzz', []]
  ];
  const bad = cases.filter(([q, want]) => {
    const got = find(q);
    return want === null ? got.length === 0 : got.join() !== want.slice().sort((a, b) => games.findIndex((g) => g.id === a) - games.findIndex((g) => g.id === b)).join();
  }).map(([q]) => q + ' → ' + find(q).join(','));
  ok(!bad.length, 'names match in any language and keyboard (' + cases.length + ' queries)' + (bad.length ? ': ' + bad.join('; ') : ''));
  ok(games.every((g) => sb.m(g, '') && sb.m(g, '  ') && Object.values(g.name).every((n) => sb.m(g, n))), 'an empty query keeps every game, and every game finds itself by each of its names');
  ok(/C\.icon\('search', 18\)/.test(html) && /search: 'M/.test(fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8')), 'the search icon exists in the core');
}

// #532: a player could pull back only by starting on the white ball, and Spider lagged
// while dragging cards on their phone (a Chrome trace: ~110 ms of raster work a move)
function testDragAndStick() {
  head('Pool and Snooker: pull the cue stick; dragged cards on their own layer (#532)');
  const { Cue } = loadEightBall();
  ok(typeof Cue.onStick === 'function', 'cue.js has onStick');
  if (typeof Cue.onStick !== 'function') return;
  // aim to the right (angle 0) from a ball at (100, 50): the stick lies to its left
  const on = (px, py) => Cue.onStick(0, 100, 50, px, py, 9, 100, 10);
  ok(on(60, 50) && on(60, 58) && on(5, 45), 'a press on the stick behind the ball grabs it');
  ok(!on(140, 50) && !on(60, 70) && !on(96, 50) && !on(-20, 50), 'in front of the ball, beside the stick, on the ball itself or past its end does not');
  const turned = Cue.onStick(Math.PI / 2, 100, 50, 100, 10, 9, 100, 10) && !Cue.onStick(Math.PI / 2, 100, 50, 100, 90, 9, 100, 10);
  ok(turned, 'the stick turns with the aim (aiming down, it lies above the ball)');
  for (const g of ['eightball', 'snooker']) {
    const h = fs.readFileSync(path.join(ROOT, 'www/games/' + g + '/index.html'), 'utf8');
    ok(/else if \(dc < grab \|\| Cue\.onStick\(aimA, c\.x, c\.y, p\.x, p\.y, [^\n]*?\)\) drag = \{ id: e\.pointerId, mode: 'sling'/.test(h), g + ': a press on the stick starts a pull, like one on the white ball');
  }
  const layered = [['spider', /\.sp-card--drag \{ will-change: transform; \}/], ['klondike', /\.kl-card--drag \{ will-change: transform; \}/], ['ginrummy', /\.gr-hand \.gr-drag \{[^}]*will-change: transform;/]]
    .filter(([g, re]) => re.test(fs.readFileSync(path.join(ROOT, 'www/games/' + g + '/index.html'), 'utf8'))).map(([g]) => g);
  ok(layered.length === 3, 'dragged cards get their own layer in Spider, Klondike and Gin Rummy (' + layered.join(', ') + ')');
}

// #492: aiming pointed the cue at the finger, and pulling back from the white ball shot,
// which a player found hard to control; a second control turns the cue a little a pixel
// and leaves shooting to the power bar, as in Miniclip's pool
function testCueTurnControl() {
  head('Pool and Snooker: a fine "turn" aiming control (#492)');
  // #506: sliding left of where the finger went down on the power bar built power, so
  // backing out of a shot shot instead; only a pull to the right adds power now
  const bp = require(path.join(ROOT, 'www/lib/cue.js')).barPower;
  ok(typeof bp === 'function' && bp(-120, 300) === 0 && bp(-1, 300) === 0 && bp(0, 300) === 0,
    'a pull left of the start, or no pull, leaves the power at 0');
  ok(typeof bp === 'function' && Math.abs(bp(120, 300) - 0.5) < 1e-9 && bp(240, 300) === 1 && bp(900, 300) === 1 && bp(50, 0) === 0,
    'a pull to the right adds power, full at 80% of the bar, and never past it');
  for (const g of ['eightball', 'snooker']) {
    const html = fs.readFileSync(path.join(ROOT, 'www/games', g, 'index.html'), 'utf8');
    ok(/power = Cue\.barPower\(e\.clientX - pdrag\.x0, pdrag\.w\);/.test(html) && !/Math\.abs\(e\.clientX - pdrag\.x0\)/.test(html), g + ': the power bar uses it');
  }
  // #505: a finger moving round the white ball must turn the cue the same way and by the
  // same angle as Point mode would, whichever way the cue points and wherever the finger
  // is; a finger crossing the ball must not spin it
  const Cue = require(path.join(ROOT, 'www/lib/cue.js')), ts = Cue.turnStep;
  ok(typeof ts === 'function', 'cue.js has turnStep');
  if (typeof ts === 'function') {
    let n = 0, wrong = 0, worst = 0;
    for (let k = 0; k < 16; k++) for (const r of [80, 150, 300]) for (const dir of [1, -1]) {
      const a = k * Math.PI / 8, b = a + dir * 0.02, px = r * Math.cos(a), py = r * Math.sin(a), qx = r * Math.cos(b), qy = r * Math.sin(b);
      const got = ts(0, 0, px, py, qx, qy, 60), want = Math.atan2(qy, qx) - Math.atan2(py, px);
      const d = Math.atan2(Math.sin(want), Math.cos(want));
      n++;
      if (Math.sign(got) !== Math.sign(d)) wrong++;
      worst = Math.max(worst, Math.abs(got - d) / Math.abs(d));
    }
    ok(n === 96 && wrong === 0 && worst < 0.01, 'round the ball, from 16 directions, 3 distances and both ways, the cue turns as Point mode would (' + n + ' moves, ' + wrong + ' backwards, worst ' + (worst * 100).toFixed(2) + '% off)');
    ok(Math.abs(ts(0, 0, 200, 0, 260, 0, 60)) < 1e-12 && ts(0, 0, 0, 0, 5, 5, 60) === 0, 'a move straight towards or away from the ball, or from its centre, does not turn the cue');
    ok(Math.abs(ts(0, 0, 5, -10, 5, 10, 60)) <= 20 / 60 + 1e-9 && Math.abs(ts(0, 0, 2, -1, 2, 1, 60)) <= 2 / 60 + 1e-9, 'a finger crossing right by the ball turns the cue no more than at 60 px from it');
  }
  for (const g of ['eightball', 'snooker']) {
    const html = fs.readFileSync(path.join(ROOT, 'www/games', g, 'index.html'), 'utf8');
    ok(/if \(prefs\.aim !== 'turn'\) prefs\.aim = 'point';/.test(html) && /\[\{ value: 'point', label: C\.t\('ctlPoint'\) \}, \{ value: 'turn', label: C\.t\('ctlTurn'\) \}\]/.test(html) && /addEventListener\('click', showSettings\)/.test(html),
      g + ': point (the default) and turn are offered behind a gear');
    ok(/else if \(prefs\.aim === 'turn'\) drag = \{ id: e\.pointerId, mode: 'turn'/.test(html) && /drag\.mode = prefs\.aim !== 'turn' && Cue\.pullsBack\(/.test(html),
      g + ': in turn mode a drag never becomes a pull-back shot, even from the white ball');
    // #505: the turn followed a fixed axis, so it ran backwards for some cue directions
    ok(/aimA \+= Cue\.turnStep\(c\.x, c\.y, drag\.last\.x, drag\.last\.y, p\.x, p\.y, TURN_NEAR \/ G\.s\);\n      drag\.last = p;/.test(html) && /mode: 'turn', a0: aimA, last: p \}/.test(html) && !/TURN_RATE/.test(html),
      g + ': each move of a turn drag turns the cue round the white ball, from where the last move left it');
    ok(LOCALE_CODES.every((l) => { const sec = html.slice(html.indexOf('      ' + l + ': {')); return /aimCtl: '[^']+', ctlPoint: '[^']+', ctlTurn: '[^']+', ctlNote: '[^']+'/.test(sec.slice(0, sec.indexOf('\n      }'))); }), g + ': the control is named in every language');
  }
}

function testPersianCardIndex() {
  head('Cards: Persian corner indices in Persian (#428)');
  // The corners read A, J, Q, K and Western digits in every language; a Persian player
  // asked for تـ، سـ، بـ، شـ and Persian digits, as on Persian decks.
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const a0 = core.indexOf('    var RANKS = '), b0 = core.indexOf('\n', core.indexOf('    function rankText(', a0 > 0 ? a0 : 0));
  ok(a0 > 0 && core.indexOf('    function rankText(') > a0, 'the corner index is chosen in the core');
  if (!(a0 > 0 && core.indexOf('    function rankText(') > a0)) return;
  const state = { settings: { lang: 'fa' } };
  const sb = { state };
  vm.runInNewContext(core.slice(a0, b0) + ';this.rankText = rankText;', sb);
  const fa = [...Array(13).keys()].map(sb.rankText);
  ok(fa.join(' ') === 'تـ ۲ ۳ ۴ ۵ ۶ ۷ ۸ ۹ ۱۰ سـ بـ شـ', 'Persian: تـ, Persian digits, سـ بـ شـ (' + fa.join(' ') + ')');
  for (const l of ['en', 'zh', 'de', 'es', 'pl']) {
    state.settings.lang = l;
    ok([...Array(13).keys()].map(sb.rankText).join('') === 'A2345678910JQK', l + ': A, 2–10, J, Q, K as before');
  }
  ok(/text: rankText\(r\) \}\)\];/.test(core) && /function label\(c\) \{ return rankText\(rank\(c\)\) \+ GLYPH\[suit\(c\)\]; \}/.test(core), 'every card face and its label use it');
  // games that draw or write a rank themselves use it too
  const uses = { klondike: 1, freecell: 2, pasur: 2, spider: 1 };
  for (const g of Object.keys(uses)) {
    const html = fs.readFileSync(path.join(ROOT, 'www/games', g, 'index.html'), 'utf8');
    ok((html.match(/C\.cards\.rankText\(/g) || []).length === uses[g] && !/RANK_TXT|C\.cards\.RANKS\[/.test(html), g + ': its drawn or written ranks follow the language');
  }
}

function testSpider() {
  head('Spider (#460)');
  const t0 = Date.now();
  const E = loadEngine('spider', 'SpiderEngineFactory');
  const html = fs.readFileSync(path.join(ROOT, 'www/games/spider/index.html'), 'utf8');
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  const rng = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
  // a card of rank r (0..12, A..K) from set k (0..7); with one suit every set is spades
  const card = (r, k) => k * 13 + r;
  const empty = (suits) => ({ suits: suits || 1, tab: [[], [], [], [], [], [], [], [], [], []], down: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], stock: [], found: [], hist: [], undos: 0 });

  // The deal: 6, 6, 6, 6 then 5 a column with only the top one up, 50 in the stock
  const D = E.deal(rng(7), 1);
  ok(D.tab.map((c) => c.length).join() === '6,6,6,6,5,5,5,5,5,5' && D.down.join() === '5,5,5,5,4,4,4,4,4,4' && D.stock.length === 50 && E.validState(D), 'a deal lays out 54 cards in ten columns, only the top ones face up, and 50 in the stock');
  // Suits: one suit is all spades; two suits hearts and spades; four suits all, each 26 cards
  const suitCount = (n) => { const S = E.deal(rng(1), n), c = [0, 0, 0, 0]; for (let i = 0; i < 104; i++) c[E.suitOf(n, i)]++; return c.join(); };
  ok(suitCount(1) === '0,0,0,104' && suitCount(2) === '0,0,52,52' && suitCount(4) === '26,26,26,26', 'one suit is 104 spades, two suits 52 hearts and 52 spades, four suits 26 of each');
  ok(E.face(E.deal(rng(1), 1), card(12, 3)) === 12 * 4 + 3, 'a card is drawn with Chogan.cards as rank * 4 + suit');

  // Columns: any suit one rank higher takes a card, an empty column takes anything,
  // but only a run of one suit moves together
  const S = empty(2);
  S.tab[0] = [card(7, 1)];                                   // 8♠ (set 1 is spades with two suits)
  ok(E.canTab(S, card(6, 0), 0) && E.canTab(S, card(6, 1), 0), 'a 7 of either suit goes on the 8');
  ok(!E.canTab(S, card(5, 0), 0) && !E.canTab(S, card(7, 0), 0), 'only exactly one rank lower');
  ok(E.canTab(S, card(3, 0), 1) && E.canTab(S, card(11, 0), 1), 'an empty column takes any card');
  S.tab[2] = [card(9, 1), card(8, 1), card(7, 0), card(6, 0)];   // 10♠ 9♠ 8♥ 7♥
  ok(E.runStart(S, 2) === 2 && E.movable(S, 2, 2) && !E.movable(S, 2, 1), 'the 8♥ 7♥ move together; the 9♠ under them is held by the suit change');
  ok(!E.legal(S, { col: 2, i: 1 }, 1), 'so the 9♠ with the hearts on it cannot move');

  // A move turns over the card it uncovers, and undo turns it back
  const M = empty(1);
  M.tab[0] = [card(3, 0), card(9, 0)]; M.down[0] = 1;
  M.tab[1] = [card(10, 1)];
  const h = E.move(M, { col: 0, i: 1 }, 1);
  ok(h && M.tab[1].length === 2 && M.down[0] === 0 && h.flip, 'moving the 10 onto the J turns the card under it over');
  E.undo(M);
  ok(M.tab[0].length === 2 && M.down[0] === 1 && M.tab[1].length === 1 && M.undos === 1, 'undo puts the 10 back and the card face down again');

  // A full run king to ace in one suit leaves by itself, the card under it turns over, and undo brings it back
  const R = empty(1);
  R.tab[0] = [card(4, 2)];
  for (let r = 12; r >= 1; r--) R.tab[0].push(card(r, 0));
  R.down[0] = 1;
  R.tab[1] = [card(0, 0)];                                   // the ace
  E.move(R, { col: 1, i: 0 }, 0);
  ok(R.found.length === 1 && R.tab[0].length === 1 && R.down[0] === 0 && R.found[0][0] === card(12, 0), 'the ace finishes king to ace: the run leaves, king first, and the card under it turns over');
  E.undo(R);
  ok(R.found.length === 0 && R.tab[0].length === 13 && R.down[0] === 1 && R.tab[1].length === 1, 'undo puts the run and the ace back exactly');
  const R2 = empty(2);
  for (let r = 12; r >= 1; r--) R2.tab[0].push(card(r, r === 6 ? 0 : 1));   // one heart in the middle
  R2.tab[1] = [card(0, 1)];
  E.move(R2, { col: 1, i: 0 }, 0);
  ok(R2.found.length === 0 && R2.tab[0].length === 13, 'a king-to-ace run with a card of another suit does not leave');

  // The stock: a card on every column, not while one is empty; undo takes the row back
  const T = E.deal(rng(11), 1);
  const st0 = T.stock.slice();
  ok(E.dealRow(T) === 'deal' && T.stock.length === 40 && T.tab.every((c, i) => c[c.length - 1] === st0[st0.length - 1 - i]), 'a tap on the stock lays the next ten cards on the ten columns');
  E.undo(T);
  ok(T.stock.join() === st0.join() && T.tab.map((c) => c.length).join() === '6,6,6,6,5,5,5,5,5,5', 'undo takes the row back into the stock in order');
  const T2 = E.clone(T); T2.stock = T2.stock.concat(T2.tab[9]); T2.tab[9] = []; T2.down[9] = 0;
  ok(E.dealRow(T2) === 'empty' && T2.hist.length === 0, 'no row is dealt while a column is empty');
  // #487: near the end, with fewer cards on the table than columns, no move can fill every
  // column, and the rule left the game stuck; then a row may be dealt anyway
  const few = empty(1);
  for (let k = 0; k < 6; k++) few.found.push(Array.from({ length: 13 }, (_, r) => k * 13 + 12 - r));
  few.tab[0] = [card(5, 6)]; few.tab[3] = [card(9, 6), card(8, 6)]; few.tab[7] = [card(2, 6)];
  for (let r = 0; r < 13; r++) if (![5, 9, 8, 2].includes(r)) few.stock.push(card(r, 6));
  for (let r = 0; r < 13; r++) few.stock.push(card(r, 7));
  few.stock = few.stock.slice(0, 20);
  const before = JSON.stringify([few.tab, few.stock]);
  ok(E.canDeal(few) && E.dealRow(few) === 'deal' && few.tab.every((c) => c.length > 0), 'with four cards on the table and ten columns, a row is dealt into the empty ones');
  E.undo(few);
  ok(JSON.stringify([few.tab, few.stock]) === before, 'and undo takes it back exactly');
  const enough = empty(1);
  for (let c2 = 0; c2 < 9; c2++) enough.tab[c2] = [card(c2 % 13, 0), card((c2 + 3) % 13, 1)];
  enough.stock = Array.from({ length: 10 }, (_, i) => card(i, 2));
  ok(!E.canDeal(enough) && E.dealRow(enough) === 'empty', 'with eighteen cards and one empty column, the empty column must still be filled first');

  // A tap: same suit first, then any suit, then an empty column; a whole column never moves to another empty one
  const A = empty(2);
  A.tab[0] = [card(5, 1)];                                   // 6♠
  A.tab[1] = [card(5, 0)];                                   // 6♥
  A.tab[3] = [card(9, 1), card(4, 0)];                       // 10♠, 5♥
  ok(E.autoTarget(A, { col: 3, i: 1 }) === 1, 'a tapped 5♥ goes on the 6♥ before the 6♠');
  A.tab[1] = [card(2, 0)];
  ok(E.autoTarget(A, { col: 3, i: 1 }) === 0, 'else on the 6♠');
  A.tab[0] = [card(2, 1)];
  ok(E.autoTarget(A, { col: 3, i: 1 }) === 2, 'else into the first empty column');
  A.tab[3] = [card(4, 0)];
  ok(E.autoTarget(A, { col: 3, i: 0 }) === null, 'a card alone in its column is not moved to another empty one');

  // Hints: every hinted move is legal, and following them never goes round in circles
  let hinted = 0, illegal = 0, endless = 0, valid = 0, games0 = 0;
  for (const n of [1, 2, 4]) {
    for (let g = 0; g < 12; g++) {
      const H = E.deal(rng(100 + g), n);
      let steps = 0;
      games0++;
      while (!E.won(H) && steps < 400) {
        const x = E.hint(H);
        if (!x) break;
        if (x.deal) { if (E.dealRow(H) !== 'deal') { illegal++; break; } } else if (!E.move(H, x.src, x.dst)) { illegal++; break; }
        steps++; hinted++;
      }
      if (steps >= 400) endless++;
      if (E.validState(H)) valid++;
      // and undo walks a whole game back to its deal
      const back = E.deal(rng(100 + g), n);
      while (E.undo(H));
      if (JSON.stringify([H.tab, H.down, H.stock, H.found]) !== JSON.stringify([back.tab, back.down, back.stock, back.found])) illegal++;
    }
  }
  ok(games0 === 36 && hinted > 300, 'hints were followed through 36 games (' + hinted + ' moves)');
  ok(illegal === 0 && endless === 0 && valid === 36, 'every hint was legal, none went round in circles, every state stayed a full deck, and undo walked each game back to its deal');

  // the same seed gives the same deal for everyone
  const a1 = E.deal(rng(99), 1), a2 = E.deal(rng(99), 1);
  ok(JSON.stringify(a1.tab) === JSON.stringify(a2.tab) && a1.stock.join() === a2.stock.join(), 'one seed, one deal');
  ok(/E\.deal\(daily \? C\.daily\('spider', daily\)\.rng : Math\.random, daily \? 1 : prefs\.suits\)/.test(html), 'the daily deal comes from the day\'s seed and is always one suit');
  ok(!E.validState(Object.assign(E.clone(D), { suits: 3 })) && !E.validState(Object.assign(E.clone(D), { stock: D.stock.slice(1) })), 'a damaged save is refused');

  // Page: cards from the shared deck, the deal through the shared fly helper, options behind a gear
  ok(/C\.cards\.el\(E\.face\(S, c\)\), C\.cards\.back\(\)/.test(html) && /C\.ui\.fly\(nodes\[c\], from, \{ ms: 200, delay: n\+\+ \* 18, flip: row === S\.down\[col\] \}\)/.test(html), 'the cards are Chogan.cards and the deal uses Chogan.ui.fly');
  ok(/class: 'ch-iconbtn sp-gear', type: 'button', 'aria-label': C\.t\('settings'\)/.test(html) && /function showSettings\(\)/.test(html) && !/suitsRule[^\n]*showHelp/.test(html), 'the number of suits is chosen behind a gear, not in help');
  ok(/if \(C\.ui\.reduceMotion\(\) \|\| !L\) \{ done\(\); return; \}/.test(html) && /if \(C\.ui\.reduceMotion\(\) \|\| !L\) return;/.test(html), 'no deal animation and no win cascade with reduced motion');
  ok(/\.sp-board \{ direction: ltr;/.test(html), 'the table is not mirrored in Persian');
  // #486: the hint shook two cards and did not say which way the move went
  const hintFn = (html.match(/  function showHint\(\) \{[\s\S]*?\n  \}\n/) || [''])[0];
  ok(/ring\(first\.x, first\.y, last\.y - first\.y \+ L\.ch\);/.test(hintFn) && /ring\(to\.x, to\.y, L\.ch\);/.test(hintFn) && /if \(C\.ui\.reduceMotion\(\)\) return;/.test(hintFn) && /nodes\[c\]\.cloneNode\(true\)/.test(hintFn) && /g\.animate\(/.test(hintFn) && !/C\.ui\.shake/.test(hintFn),
    'the hint rings both ends of its move and glides a copy of the cards there (rings only with reduced motion)');
  // #472: on a phone on its side the row above the table left the cards 30 px wide; a short,
  // wide window now puts the badges, the stock and the finished runs beside the columns,
  // and the corner rank is larger on Spider's narrow cards
  ok(/function sideWanted\(\) \{ return wrap\.clientWidth > wrap\.clientHeight \* 1\.9; \}/.test(html) && /function tabX\(col\) \{ return colX\(col \+ L\.off\); \}/.test(html) && /cy: side \? gap : gap \* 3 \+ ch/.test(html) && /\.sp-wrap--side \{ flex-direction: row;/.test(html) && /\.sp-card \.ch-pcard__r \{ font-size: calc\(var\(--pw\) \* \.4\); \}/.test(html), 'a short, wide window puts the stock, the runs and the badges beside the columns, and the corner rank is larger');
  // #504: beside the table the stock and the runs stood at the top and read as two more
  // columns; they now sit at the bottom, as in Windows. Run the page's own placing code.
  {
    const grab = (name) => (html.match(new RegExp('  function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}\\n|  function ' + name + '\\([^)]*\\) \\{[^\\n]*\\}\\n')) || [''])[0];
    const src = ['colX', 'bottomY', 'stockSpot', 'stockPos', 'foundPos'].map(grab);
    ok(src.slice(0, 1).concat(src.slice(3)).every(Boolean), 'found the page\'s placing functions');
    const place = (side) => new Function('L', 'E', src.join('') + 'return { spot: typeof stockSpot === "function" ? stockSpot() : null, s0: stockPos(0), s4: stockPos(4), f0: foundPos(0), f7: foundPos(7) };')(
      { side, W: 1600, H: 800, gap: 12, cw: 96, ch: 134, x0: 50, ty: 12, cy: side ? 12 : 170, off: side ? 1 : 0 }, { COLS: 10 });
    const sd = place(true), floor = 800 - 12 - 134, row = place(false);
    ok(sd.s0.y === floor && sd.f0.y === floor && sd.s4.y < floor && sd.s4.y > 400 && sd.f7.y < floor && sd.f7.y > 0 && sd.spot && sd.spot.y === floor,
      'beside the table the stock and the runs stand on the bottom and pile upwards (stock ' + sd.s0.y + ', runs ' + sd.f0.y + ', floor ' + floor + ')');
    ok(row.s0.y === 12 && row.f0.y === 12 && row.s4.y === 12 && row.spot && row.spot.y === 12, 'in the row above the table nothing moved');
  }

  // Identity
  const gm = games.find((g) => g.id === 'spider');
  ok(!!gm && gm.cat === 'cards' && gm.daily !== false, 'games.json lists it under card games, with a daily deal');
  ok(!!gm && /accent: '([^']+)'/.test(html) && html.match(/accent: '([^']+)'/)[1] === gm.color, 'games.json and the page share the accent');
  const icon = fs.readFileSync(path.join(ROOT, 'www/games/spider/icon.svg'), 'utf8');
  ok(!!gm && new RegExp('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon), 'the icon starts on the soft tint of games.json');
  const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
  const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const lab = (x) => {
    const [R0, G, Bl] = rgb(x).map(lin), f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    const X = (R0 * 0.4124 + G * 0.3576 + Bl * 0.1805) / 0.95047, Y = R0 * 0.2126 + G * 0.7152 + Bl * 0.0722, Z = (R0 * 0.0193 + G * 0.1192 + Bl * 0.9505) / 1.08883;
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  };
  const dE = (a, b) => { const P = lab(a), Q = lab(b); return Math.hypot(P[0] - Q[0], P[1] - Q[1], P[2] - Q[2]); };
  const lum = (x) => rgb(x).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
  const near = games.filter((g) => g.id !== 'spider').map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0];
  ok(near[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5, 'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + ') and keeps white text at 4.5:1');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  ok(['spi-win', 'spi-two', 'spi-four'].every((id) => new RegExp("\\{ id: '" + id + "',[^\\n]*dde: '[^\\n]*des: '").test(core) && html.indexOf("unlock('" + id + "')") > 0), 'the three Spider awards exist in every language and are unlocked');
  ok(Date.now() - t0 < 15000, 'the Spider tests finish in under 15 s (' + (Date.now() - t0) + ' ms)');
}

function testPairs() {
  head('Pairs (#461)');
  const t0 = Date.now();
  const E = loadEngine('pairs', 'PairsEngineFactory');
  const html = fs.readFileSync(path.join(ROOT, 'www/games/pairs/index.html'), 'utf8');
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  const rng = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };

  // The deal: every size the owner chose, each picture exactly twice
  let dealsOk = 0;
  for (const n of E.ORDER) {
    const S = E.make(n, rng(n));
    const count = {};
    S.cards.forEach((c) => { count[c] = (count[c] || 0) + 1; });
    if (S.cards.length === n && S.cols * S.rows === n && Object.keys(count).length === n / 2 && Object.values(count).every((v) => v === 2)) dealsOk++;
  }
  ok(E.ORDER.join() === '16,24,36' && dealsOk === 3, 'three tables, 4×4, 4×6 and 6×6, with every picture exactly twice');
  ok(E.SYMBOLS === 18, 'eighteen pictures, enough for the 6×6 table without repeating one');

  // Turning cards over: a match stays up, a miss stays up until the next tap
  const S = E.make(16, rng(3));
  const a = 0, mate = S.cards.indexOf(S.cards[0], 1), other = S.cards.findIndex((c, i) => i !== 0 && c !== S.cards[0]);
  ok(E.flip(S, a) === 'first' && E.flip(S, a) === null && S.moves === 0, 'the first card turns over; tapping it again does nothing');
  ok(E.flip(S, other) === 'miss' && S.moves === 1 && S.open.length === 2, 'two different pictures are a miss: one move, both stay up for now');
  ok(E.flip(S, mate) === 'first' && S.open.length === 1 && S.open[0] === mate, 'the next tap turns the miss back and starts a new pair');
  ok(E.flip(S, a) === 'match' && S.found[a] && S.found[mate] && S.open.length === 0 && S.moves === 2, 'a matching picture is a pair: both found, one more move');
  ok(E.flip(S, a) === null, 'a found card cannot be turned again');
  // A slip: missing a pair whose second card had already been seen
  const M = E.make(16, rng(5));
  const x = 0, xm = M.cards.indexOf(M.cards[0], 1), y = M.cards.findIndex((c, i) => i !== 0 && i !== xm && c !== M.cards[0]);
  E.flip(M, xm); E.flip(M, y);                  // xm is now seen
  E.flip(M, x); const yy = M.cards.findIndex((c, i) => i !== x && i !== xm && i !== y && c !== M.cards[x]);
  ok(E.flip(M, yy) === 'miss' && M.misses === 1, 'missing a pair whose partner was already seen counts as a slip');
  const N = E.make(16, rng(6));
  const n2 = N.cards.findIndex((c, i) => i > 0 && c !== N.cards[0]);
  E.flip(N, 0); E.flip(N, n2);
  ok(N.misses === 0, 'a first look at two unknown cards is no slip');

  // A whole game with a perfect memory ends won; its moves bound the sharp award
  let perfectMoves = 0, played = 0, wonAll = 0;
  for (const n of E.ORDER) {
    for (let g = 0; g < 200; g++) {
      const P = E.make(n, rng(1000 + g)); const known = {}; let next = 0, guard = 0;
      while (!P.done && guard++ < 200) {
        let pair = null;
        for (const k in known) if (known[k].length === 2) { pair = known[k]; delete known[k]; break; }
        if (pair) { E.flip(P, pair[0]); E.flip(P, pair[1]); continue; }
        while (P.seen[next]) next++;
        const f = next++; E.flip(P, f);
        const k1 = P.cards[f];
        if (known[k1] && known[k1].length === 1) { E.flip(P, known[k1][0]); delete known[k1]; continue; }
        while (P.seen[next]) next++;
        const s2 = next++;
        if (E.flip(P, s2) === 'miss') { (known[k1] = known[k1] || []).push(f); (known[P.cards[s2]] = known[P.cards[s2]] || []).push(s2); }
      }
      played++;
      if (P.done && P.misses === 0) wonAll++;
      perfectMoves += P.moves / (n / 2);
    }
  }
  const avg = perfectMoves / played;
  ok(played === 600 && wonAll === 600, 'a perfect memory wins all 600 games without a slip');
  ok(avg > 1.5 && avg < 1.65 && E.perfect(16) === 12 && E.perfect(36) === 27, 'a perfect memory needs ' + avg.toFixed(2) + ' moves a pair, so the sharp award at 1.5 needs a good memory and a little luck');

  // Saves: a good one comes back, a damaged one is refused
  const R = E.make(24, rng(9));
  E.flip(R, 0); E.flip(R, R.cards.indexOf(R.cards[0], 1));
  const back = E.restore(JSON.parse(JSON.stringify({ n: R.n, cards: R.cards, found: R.found, seen: R.seen, moves: R.moves, misses: R.misses })));
  ok(!!back && back.found.filter(Boolean).length === 2 && back.moves === 1 && back.cols === 4 && back.rows === 6, 'a saved table comes back as it was');
  const bad1 = { n: 24, cards: R.cards.slice(), found: R.found.slice(), moves: 1 }; bad1.cards[5] = bad1.cards[6];
  const bad2 = { n: 24, cards: R.cards.slice(), found: R.found.map((f, i) => i === 0 ? false : f), moves: 1 };
  ok(!E.restore(bad1) && !E.restore(bad2) && !E.restore({ n: 20 }) && !E.restore(null), 'a save with a picture three times, half a pair found, or a wrong size is refused');
  // one seed, one table
  ok(E.make(24, rng(99)).cards.join() === E.make(24, rng(99)).cards.join(), 'one seed, one table');
  ok(/E\.make\(n, daily \? C\.daily\('pairs', daily\)\.rng : Math\.random\)/.test(html) && /newGame\(E\.DAILY_SIZE, dailyDate\)/.test(html) && E.DAILY_SIZE === 24, 'the daily table is 4×6 from the day\'s seed');

  // Page: pictures differ in shape and colour, the table is not mirrored, no clock
  const art = html.slice(html.indexOf('  var ART = ['), html.indexOf('  ];', html.indexOf('  var ART = [')));
  const cols = (art.match(/\['(#[0-9A-F]{6})', '/g) || []).map((c) => c.slice(2, 9));
  ok(cols.length === 18 && new Set(cols).size === 18, 'eighteen pictures, each its own colour (' + cols.length + ')');
  ok(LOCALE_CODES.every((l) => { const sec = html.slice(html.indexOf('      ' + l + ': {')); return [...Array(18).keys()].every((k) => new RegExp('s' + k + ": '[^']+'").test(sec)); }), 'every picture has a name in every language, for screen readers');
  ok(/\.pr-board \{\n    direction: ltr;/.test(html), 'the table is not mirrored in Persian');
  ok(!/setInterval|timer: true/.test(html), 'there is no clock to race');
  // #490: the browser's focus ring stayed on a clicked card while the keyboard cursor
  // started again at the first, so two cards were ringed
  ok(/\.pr-card:focus, \.pr-card:focus-visible \{ outline: none; \}/.test(html) && /board\.addEventListener\('mousedown', function \(e\) \{ if \(e\.target\.closest && e\.target\.closest\('\.pr-card'\)\) e\.preventDefault\(\); \}\);/.test(html) && /if \(cur < 0\) cur = lastTapped >= 0 \? lastTapped : 0;/.test(html), 'only the keyboard cursor rings a card, and it goes on from the card last clicked');

  // Identity
  const gm = games.find((g) => g.id === 'pairs');
  ok(!!gm && gm.cat === 'puzzle' && gm.daily !== false, 'games.json lists it under puzzles, with a daily table');
  ok(!!gm && html.match(/accent: '([^']+)'/)[1] === gm.color, 'games.json and the page share the accent');
  const icon = fs.readFileSync(path.join(ROOT, 'www/games/pairs/icon.svg'), 'utf8');
  ok(!!gm && new RegExp('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon), 'the icon starts on the soft tint of games.json');
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const lab = (h) => {
    const [R0, G, Bl] = rgb(h).map(lin), f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    const X = (R0 * 0.4124 + G * 0.3576 + Bl * 0.1805) / 0.95047, Y = R0 * 0.2126 + G * 0.7152 + Bl * 0.0722, Z = (R0 * 0.0193 + G * 0.1192 + Bl * 0.9505) / 1.08883;
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  };
  const dE = (p, q) => { const P = lab(p), Q = lab(q); return Math.hypot(P[0] - Q[0], P[1] - Q[1], P[2] - Q[2]); };
  const lum = (h) => rgb(h).map(lin).reduce((acc, c, i) => acc + c * [0.2126, 0.7152, 0.0722][i], 0);
  const near = games.filter((g) => g.id !== 'pairs').map((g) => [g.id, dE(g.color, gm.color)]).sort((p, q) => p[1] - q[1])[0];
  ok(near[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5, 'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + ') and keeps white text at 4.5:1');
  // the pictures sit on an ivory face in both themes: each keeps 3:1 against it
  const face = lum('#EFE6D6');
  const weak = cols.filter((c) => (face + 0.05) / (lum(c) + 0.05) < 3);
  ok(!weak.length, 'every picture keeps 3:1 against the card face in both themes' + (weak.length ? ' (weak: ' + weak.join(', ') + ')' : ''));
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  ok(['pr-win', 'pr-big', 'pr-sharp'].every((id) => new RegExp("\\{ id: '" + id + "',[^\\n]*dde: '[^\\n]*des: '").test(core) && html.indexOf("unlock('" + id + "')") > 0), 'the three Pairs awards exist in every language and are unlocked');
  ok(Date.now() - t0 < 10000, 'the Pairs tests finish in under 10 s (' + (Date.now() - t0) + ' ms)');
}

// #511: a player could not aim Gorillas by touch and asked for a joystick; it is a third
// control behind the gear, pushed the way the banana should go
function testGorillasStick() {
  head('Gorillas: a joystick control (#511)');
  const html = fs.readFileSync(path.join(ROOT, 'www/games/gorillas/index.html'), 'utf8');
  const fn = (/^  function stickAim\(dx, dy, r, dir\) \{[\s\S]*?^  \}$/m.exec(html) || [''])[0];
  ok(!!fn, 'stickAim found in Gorillas');
  if (!fn) return;
  const sb = {};
  vm.runInNewContext(fn + ';this.f = stickAim;', sb);
  const a = (dx, dy, dir) => { const v = sb.f(dx, dy, 50, dir); return v.angle + '/' + v.power; };
  const cases = [
    [[50, 0, 1], '0/100'], [[0, -50, 1], '90/100'], [[25, -25, 1], '45/71'],   // left gorilla: right, up, up-right half way
    [[-25, -25, -1], '45/71'], [[25, -25, -1], '90/71'],                        // right gorilla throws left; a push away from it is clamped
    [[200, 0, 1], '0/100'], [[3, 0, 1], '0/6'], [[30, 30, 1], '0/85']           // beyond the rim is full power; downwards is flat
  ];
  const bad = cases.filter(([args, want]) => a(...args) !== want).map(([args, want]) => args.join(',') + ' → ' + a(...args) + ' (want ' + want + ')');
  ok(!bad.length, 'a push sets angle and power the way the banana goes (' + cases.length + ' pushes)' + (bad.length ? ': ' + bad.join('; ') : ''));
  ok(/prefs\.control !== 'nums' && prefs\.control !== 'stick'/.test(html) && /\{ value: 'stick', label: C\.t\('ctlStick'\) \}/.test(html), 'the gear offers it and a saved choice of it is kept');
  ok(/if \(cancel \|\| !a \|\| a\.power < 6 \|\| !canAim\(\)\) \{ draw\(\); return; \}/.test(html), 'a push let go near the middle is taken back, not thrown');
  const langs = ['ctlStick', 'aimStick', 'stick'].every((k) => (html.match(new RegExp('\\b' + k + ': \'', 'g')) || []).length === LOCALE_CODES.length);
  ok(langs, 'its strings are in every language');
}

function testPeopleFilter() {
  head('Menu: filter by how many people play on one phone (#561)');
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  const html = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
  ok(games.length > 40 && games.every((g) => Number.isInteger(g.people) && g.people >= 1 && g.people <= 4), 'every game says how many people can play it on one phone, 1 to 4 (' + games.length + ' games)');
  const by = Object.fromEntries(games.map((g) => [g.id, g.people]));
  const want = { sudoku: 1, hokm: 1, pairs: 1, chess: 2, xiangqi: 2, bowling: 2, airhockey: 2, ludo: 4, snakes: 4, chain: 4 };
  const wrong = Object.keys(want).filter((id) => by[id] !== want[id]);
  ok(!wrong.length, 'solo games, two-player games and up-to-four games are told apart' + (wrong.length ? ': ' + wrong.map((id) => id + '=' + by[id]).join(', ') : ''));
  const fn = (/^  function peopleFit\(g, p\) \{[\s\S]*?^  \}$/m.exec(html) || [''])[0];
  ok(!!fn, 'peopleFit found in the menu');
  if (!fn) return;
  const sb = {};
  vm.runInNewContext(fn + ';this.f = peopleFit;', sb);
  const n = (p) => games.filter((g) => sb.f(g, p)).length;
  ok(n('all') === games.length && n('1') + n('2') === games.length && n('3') > 0 && n('3') < n('2'), 'one player lists the solo games, two the rest, three and four a few of those (' + ['all', '1', '2', '3'].map(n).join(', ') + ')');
  ok(/g\.cat === c && peopleFit\(g, people\)/.test(html) && /C\.state\.settings\.gamePeople = v;/.test(html) && /if \(!any\) box\.appendChild/.test(html), 'the filter works with the category chips, is remembered, and says so when nothing fits');
}

function testInstallBar() {
  head('Web menu: an install bar the cross hides for good (#557)');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const from = core.indexOf('Chogan.installOffer = function');
  const to = core.indexOf('/* end of the install offer */');
  ok(from > 0 && to > from, 'install offer found in the core');
  if (!(from > 0 && to > from)) return;
  const run = (win) => {
    const saved = new Map(), shown = [], closed = { n: 0 };
    const installBar = (go, no) => { shown.push({ go, no }); };
    installBar.close = () => { closed.n++; };
    const Chogan = { store: { get: (k, d) => (saved.has(k) ? saved.get(k) : d), set: (k, v) => saved.set(k, v) }, ui: { installBar } };
    vm.runInNewContext('(function (Chogan) { ' + core.slice(from, to) + ' })', {})(Chogan);
    Chogan.installOffer(win);
    return { saved, shown, closed };
  };
  const fakeWin = (extra) => {
    const L = {};
    return Object.assign({ L, addEventListener: (t, f) => { (L[t] = L[t] || []).push(f); }, fire: (t, e) => (L[t] || []).forEach((f) => f(e)) }, extra || {});
  };
  const app = fakeWin({ Capacitor: {} });
  run(app);
  ok(!Object.keys(app.L).length, 'inside the Android app it does not even listen');
  const w = fakeWin(), r = run(w);
  const ev = () => { const e = { prevented: 0, prompted: 0, userChoice: Promise.resolve({ outcome: 'accepted' }) }; e.preventDefault = () => { e.prevented++; }; e.prompt = () => { e.prompted++; }; return e; };
  const e1 = ev();
  w.fire('beforeinstallprompt', e1);
  ok(r.shown.length === 1 && e1.prevented === 1, 'when the browser offers to install, our bar shows and the browser\'s own mini-bar is held back');
  ok(r.shown[0].go() === e1.userChoice && e1.prompted === 1, 'its button opens the browser\'s install question');
  r.shown[0].no();
  ok(r.saved.get('installNo') === true, 'the cross is remembered');
  const e2 = ev();
  w.fire('beforeinstallprompt', e2);
  ok(r.shown.length === 1 && e2.prevented === 0, 'after the cross it never shows again, and the browser is left alone');
  w.fire('appinstalled', {});
  ok(r.closed.n === 1, 'once installed the bar goes away');
  ok(/var existing = document\.querySelector\('\.ch-update:not\(\.ch-install\)'\);[\s\S]{0,200}ui\.installBar\.close\(\);/.test(core) && /ui\.installBar = function \(onGo, onNo\) \{\n    if \(document\.querySelector\('\.ch-update'\)\) return null;/.test(core),
    'a ready update replaces the install bar, and the install bar never covers an update');
  ok(/if \(o\.sw\) Chogan\.installOffer\(global\);/.test(core), 'only the menu (the page that registers the service worker) offers it');
}

function testFloatingNav() {
  head('Menu: a floating, rounded bottom bar (#559)');
  const css = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8');
  const base = (/^\.ch-nav \{[\s\S]*?^\}/m.exec(css) || [''])[0];
  ok(/left: 50%;/.test(base) && /transform: translateX\(-50%\);/.test(base) && /width: min\(calc\(100% - 24px[^;]*\), 480px\);/.test(base) && /border-radius: 24px;/.test(base) && /bottom: calc\(12px \+ var\(--safe-b\)\);/.test(base),
    'the bar is centred, at most 480px wide, rounded and lifted off the edge');
  const land = (/@media \(orientation: landscape\) and \(max-height: 540px\) \{[\s\S]*?\n  \.ch-nav \{([\s\S]*?)\n  \}/.exec(css) || [])[1] || '';
  ok(/left: auto;/.test(land) && /transform: none;/.test(land) && /border-radius: 0;/.test(land) && /bottom: 0;/.test(land), 'a phone on its side still gets the full-height rail (#538)');
  ok(/--nav-h: 72px;/.test(css), 'the page keeps room for the lifted bar');
}

function testGorillasNewCity() {
  head('Gorillas: a new match draws its own city (#552)');
  const html = fs.readFileSync(path.join(ROOT, 'www/games/gorillas/index.html'), 'utf8');
  const fn = (/^  function cityCanvas\(scale, P\) \{[\s\S]*?^  \}$/m.exec(html) || [''])[0];
  ok(!!fn, 'cityCanvas found in Gorillas');
  if (!fn) return;
  // a fake canvas that records where it was asked to fill a building
  const fills = [];
  const g2d = { setTransform() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {}, fillRect(x, y, w, h) { if (h > 20) fills.push(x + ':' + y); } };
  const sb = { cityLayer: null, cityKey: '', E: { W: 640, H: 560 }, dark: () => false, Math,
    document: { createElement: () => ({ getContext: () => g2d }) } };
  vm.runInNewContext(fn + ';this.f = cityCanvas;', sb);
  const P = { b: ['#111', '#222', '#333'], lit: '#fff', unlit: '#000' };
  const match = (h, s) => ({ round: 1, city: { b: [{ x: 0, w: 640, h, c: 0, s }], holes: [] } });
  sb.G = { M: match(200, 11) }; sb.f(1, P);
  const first = fills.slice(); fills.length = 0;
  sb.G = { M: match(300, 99) }; sb.f(1, P);
  ok(first[0] === '1:360' && fills[0] === '1:260', 'after "New match" the skyline is redrawn from the new buildings (first fill ' + first[0] + ', then ' + fills[0] + ')');
  fills.length = 0; sb.f(1, P);
  ok(fills.length === 0, 'the same city is still drawn only once (cached)');
}

function testGorillas() {
  head('Gorillas (#466)');
  const t0 = Date.now();
  const E = loadEngine('gorillas', 'GorillasEngineFactory');
  const html = fs.readFileSync(path.join(ROOT, 'www/games/gorillas/index.html'), 'utf8');
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  const rng = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
  // a flat city for physics: every building 60 high, gorillas on the second from each edge
  const flat = (wind) => { const b = []; for (let x = 0; x < E.W; x += 64) b.push({ x, w: 64, h: 60, c: 0, s: 1 }); return { b, g: [{ x: 96, y: E.H - 60 }, { x: E.W - 96 + 32 - 32, y: E.H - 60 }], wind: wind || 0, holes: [] }; };

  // Cities: buildings fill the width, a gorilla on the second roof from each edge, wind in range
  let shape = 0;
  for (let i = 0; i < 30; i++) {
    const c = E.city(rng(i + 1)), n = c.b.length;
    const fills = c.b.reduce((x, b) => (b.x === x ? x + b.w : -1), 0) === E.W;
    const onRoofs = c.g[0].x === c.b[1].x + c.b[1].w / 2 && c.g[0].y === E.H - c.b[1].h && c.g[1].y === E.H - c.b[n - 2].h;
    if (fills && onRoofs && Math.abs(c.wind) <= E.WIND) shape++;
  }
  ok(shape === 30, 'every city fills the width, puts each gorilla on the second roof from its edge, and keeps the wind in range (' + shape + '/30)');
  // Every city dealt can be won from both sides: the first draft had 17 in 60 where a
  // building beside a gorilla blocked every throw
  let fair = 0;
  for (let i = 0; i < 20; i++) { const c = E.fairCity(rng(300 + i)); if (E.best(c, 0).hit && E.best(c, 1).hit) fair++; }
  ok(fair === 20, 'every city dealt has a throw that hits for each gorilla (' + fair + '/20)');
  let raw = 0;
  for (let i = 0; i < 20; i++) if (E.best(E.city(rng(i + 1)), 0).hit) raw++;
  ok(raw === 20, 'and the skyline itself no longer blocks a gorilla behind a tall neighbour (' + raw + '/20)');

  // Physics: the same throw lands in the same place; wind pushes it; straight up comes back down
  const A = E.shoot(flat(0), 0, 45, 50), B = E.shoot(flat(0), 0, 45, 50);
  ok(JSON.stringify(A.path) === JSON.stringify(B.path) && A.path.length > 10, 'the same throw flies the same path every time');
  // the wind is a steady push: over a flight of t seconds it moves the banana by wind·t²/2,
  // so a wind of +40 against -40 should part the two landings by about 40·t²
  const left = E.shoot(flat(-40), 0, 45, 45), right = E.shoot(flat(40), 0, 45, 45);
  const tf = (left.path.length + right.path.length) / 2 / 60, apart = right.end.x - left.end.x;
  ok(apart > 0 && Math.abs(apart - 40 * tf * tf) < 0.2 * 40 * tf * tf, 'a wind to the right carries the banana further than a wind to the left, by wind·t² (' + Math.round(apart) + ' units, expected ' + Math.round(40 * tf * tf) + ')');
  const up = E.shoot(flat(0), 0, 90, 40);
  ok(up.end.kind === 'gorilla' && up.end.who === 0, 'a throw straight up comes down on the thrower');
  const mirror = E.shoot(flat(0), 1, 45, 50);
  ok(Math.abs((E.W - mirror.end.x) - A.end.x) < 1.5, 'the right gorilla throws the mirror image of the left one');
  // Holes: a hit eats into the city, and the next banana goes through the hole
  const H = flat(0);
  const s1 = E.shoot(H, 0, 30, 30);
  E.apply(H, s1.end);
  ok(s1.end.kind === 'building' && H.holes.length === 1 && H.holes[0].r === 22 && !E.solid(H, s1.end.x, s1.end.y), 'a banana that hits a building takes a round bite out of it');
  const s2 = E.shoot(H, 0, 30, 30);
  ok(s2.end.y > s1.end.y + 5 || Math.abs(s2.end.x - s1.end.x) > 5, 'the same throw then flies on through the hole');

  // A match: misses pass the turn, a hit takes the round, hitting yourself gives it away, three rounds win
  const M = E.match(rng(5));
  const miss = { end: { kind: 'out', x: -100, y: 0 } };
  ok(E.record(M, 0, miss, 40, 50) === 'next' && M.turn === 1 && M.misses[0] === 1 && M.last[0].angle === 40, 'a miss passes the turn and keeps the aim for next time');
  ok(E.record(M, 1, { end: { kind: 'gorilla', who: 1, x: 0, y: 0 } }, 80, 20) === 'round' && M.score.join() === '1,0' && M.roundWinner === 0, 'hitting yourself gives the round to the other');
  E.nextRound(M, rng(6));
  ok(M.round === 2 && M.turn === 1 && M.misses.join() === '0,0', 'the next round opens with the other player and a new city');
  E.record(M, 1, { end: { kind: 'gorilla', who: 0, x: 0, y: 0 } }, 45, 50); E.nextRound(M, rng(7));
  E.record(M, 0, { end: { kind: 'gorilla', who: 1, x: 0, y: 0 } }, 45, 50); E.nextRound(M, rng(8));
  ok(E.record(M, 0, { end: { kind: 'gorilla', who: 1, x: 0, y: 0 } }, 45, 50) === 'match' && M.winner === 0 && M.score.join() === '3,1', 'three rounds win the match');
  ok(E.validMatch(E.match(rng(9))) && !E.validMatch(M) && !E.validMatch(Object.assign(E.match(rng(9)), { turn: 2 })), 'a saved match is checked: a finished or damaged one is refused');

  // The bot: harder levels hit sooner, and hard beats easy
  const firstHits = { easy: 0, medium: 0, hard: 0 };
  for (const lv of ['easy', 'medium', 'hard']) {
    for (let i = 0; i < 24; i++) {
      const c = E.fairCity(rng(700 + i)), a = E.botAim(c, 0, lv, 0, rng(800 + i)), sh = E.shoot(c, 0, a.angle, a.power);
      if (sh.end.kind === 'gorilla' && sh.end.who === 1) firstHits[lv]++;
    }
  }
  ok(firstHits.easy < firstHits.medium && firstHits.medium < firstHits.hard && firstHits.hard <= 18, 'first throws hit more often level by level, and hard is not a sure thing (easy ' + firstHits.easy + ', medium ' + firstHits.medium + ', hard ' + firstHits.hard + ' of 24)');
  let hardWins = 0;
  for (let g = 0; g < 6; g++) {
    const r = rng(77 + g), MM = E.match(r), lv = ['hard', 'easy'];
    let guard = 0;
    while (MM.winner < 0 && guard++ < 300) {
      const who = MM.turn, a = E.botAim(MM.city, who, lv[who], MM.misses[who], r), sh = E.shoot(MM.city, who, a.angle, a.power);
      if (E.record(MM, who, sh, a.angle, a.power) === 'round') E.nextRound(MM, r);
    }
    if (MM.winner === 0) hardWins++;
  }
  ok(hardWins >= 5, 'the hard bot beats the easy one (' + hardWins + '/6 matches)');

  // Page: both controls behind the gear, no predicted path, the daily is seeded
  ok(/class: 'ch-iconbtn gz-gear'/.test(html) && /\[\{ value: 'drag', label: C\.t\('ctlDrag'\) \}, \{ value: 'nums', label: C\.t\('ctlNums'\) \}[,\]]/.test(html) && /function showSettings\(\)/.test(html), 'drag and numbers are both offered, switched behind the gear');
  const page = html.slice(html.indexOf('/* ==== ENGINE END ==== */'));
  ok((page.match(/E\.shoot\(/g) || []).length === 1 && /var shot = E\.shoot\(M\.city, who, angle, power\);/.test(page), 'the page simulates a throw only when it is thrown, so the aim never shows the path');
  ok(/function rngFor\(tag\) \{ return G\.daily \? C\.daily\('gorillas', G\.daily \+ '\|' \+ tag\)\.rng : Math\.random; \}/.test(html) && /mode: daily \? 'bot' : o\.mode, level: daily \? 'medium' : o\.level/.test(html), 'the daily match is against the medium bot, with cities and bot throws from the day\'s seed');
  ok(/\.gz-canvas \{[^}]*direction: ltr;/.test(html), 'the city is not mirrored in Persian');

  // Identity
  const gm = games.find((g) => g.id === 'gorillas');
  ok(!!gm && gm.cat === 'skill' && gm.daily !== false, 'games.json lists it under skill games, with a daily match');
  ok(!!gm && html.match(/accent: '([^']+)'/)[1] === gm.color, 'games.json and the page share the accent');
  const icon = fs.readFileSync(path.join(ROOT, 'www/games/gorillas/icon.svg'), 'utf8');
  ok(!!gm && new RegExp('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon), 'the icon starts on the soft tint of games.json');
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const lab = (h) => {
    const [R0, G, Bl] = rgb(h).map(lin), f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    const X = (R0 * 0.4124 + G * 0.3576 + Bl * 0.1805) / 0.95047, Y = R0 * 0.2126 + G * 0.7152 + Bl * 0.0722, Z = (R0 * 0.0193 + G * 0.1192 + Bl * 0.9505) / 1.08883;
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  };
  const dE = (p, q) => { const P = lab(p), Q = lab(q); return Math.hypot(P[0] - Q[0], P[1] - Q[1], P[2] - Q[2]); };
  const lum = (h) => rgb(h).map(lin).reduce((acc, c, i) => acc + c * [0.2126, 0.7152, 0.0722][i], 0);
  const near = games.filter((g) => g.id !== 'gorillas').map((g) => [g.id, dE(g.color, gm.color)]).sort((p, q) => p[1] - q[1])[0];
  ok(near[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5, 'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + ') and keeps white text at 4.5:1');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  ok(['gor-win', 'gor-hard', 'gor-sharp'].every((id) => new RegExp("\\{ id: '" + id + "',[^\\n]*dde: '[^\\n]*des: '").test(core) && html.indexOf("unlock('" + id + "')") > 0), 'the three Gorillas awards exist in every language and are unlocked');
  ok(Date.now() - t0 < 15000, 'the Gorillas tests finish in under 15 s (' + (Date.now() - t0) + ' ms)');
}

function testHop() {
  head('Hop (#467)');
  const t0 = Date.now();
  const E = loadEngine('hop', 'HopEngineFactory');
  const html = fs.readFileSync(path.join(ROOT, 'www/games/hop/index.html'), 'utf8');
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  const rng = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
  // a hand-made world: the player on a platform at height 0, nothing else unless added
  const bare = (plats) => { const S = E.newGame(rng(1), 0); S.plats = plats; S.top = 1e9; S.y = 0; S.vy = 0; S.x = 180; S.cam = -200; S.best = 0; return S; };

  // A jump: from a platform the player rises v²/2g, and a spring sends it 1.6² as high
  const J = bare([{ x: 180, y: 0, w: 360, kind: 'normal', vx: 0 }]);
  J.vy = -1; let top = 0;
  for (let i = 0; i < 200; i++) { E.step(J, 0); top = Math.max(top, J.y); }
  ok(Math.abs(top - E.REACH) / E.REACH < 0.03, 'a jump from a platform rises to its reach (' + Math.round(top) + ' of ' + Math.round(E.REACH) + ')');
  const SP = bare([{ x: 180, y: 0, w: 64, kind: 'spring', vx: 0 }]);
  SP.vy = -1; let topS = 0;
  for (let i = 0; i < 300; i++) { E.step(SP, 0); topS = Math.max(topS, SP.y); }
  ok(Math.abs(topS / top - 2.56) < 0.12, 'a spring sends it about 2.6 times as high (' + (topS / top).toFixed(2) + ')');
  // A crumbling platform breaks under you and does not bounce
  const CR = bare([{ x: 180, y: 0, w: 64, kind: 'crumble', vx: 0 }]);
  CR.y = 30; CR.vy = 0;
  let ev = [];
  for (let i = 0; i < 40; i++) ev = ev.concat(E.step(CR, 0));
  ok(ev.includes('crumble') && !ev.includes('jump') && CR.plats[0].broken && CR.y < 0, 'a crumbling platform breaks under the player, who falls on through');
  // Jumps go up through platforms; only a fall lands
  const UP = bare([{ x: 180, y: 0, w: 360, kind: 'normal', vx: 0 }, { x: 180, y: 60, w: 64, kind: 'normal', vx: 0 }]);
  UP.vy = 820; ev = [];
  for (let i = 0; i < 6; i++) ev = ev.concat(E.step(UP, 0));
  ok(!ev.length && UP.y > 60, 'a rising jump passes up through a platform');
  // The sides wrap; moving platforms turn at the walls
  const WR = bare([{ x: 180, y: -500, w: 360, kind: 'normal', vx: 0 }, { x: 330, y: 300, w: 64, kind: 'moving', vx: 120 }]);
  WR.x = 355; WR.vx = 300; WR.vy = 400;
  E.step(WR, 1);
  ok(WR.x < 10, 'leaving the right side brings the player back on the left (x ' + WR.x.toFixed(1) + ')');
  for (let i = 0; i < 30; i++) E.step(WR, 0);
  ok(WR.plats[1].vx < 0 && WR.plats[1].x <= 360 - 32, 'a moving platform turns back at the wall');
  // Falling out of view ends the run
  const FL = bare([]); FL.cam = 0; FL.y = 10; FL.vy = -400;
  ev = [];
  for (let i = 0; i < 30 && !FL.over; i++) ev = ev.concat(E.step(FL, 0));
  ok(FL.over && ev.includes('fall'), 'falling out of the bottom of the view ends the run');

  // Courses: every gap between platforms you can stand on stays within a jump, at every height
  ok([0, 5000, 15000, 1e6].every((h) => E.gapRange(h)[1] <= E.REACH * 0.85 + 1e-9), 'the widest gap at any height is under 85 % of a jump');
  let worst = 0, courses = 0;
  for (let g = 0; g < 12; g++) {
    const S = E.newGame(rng(100 + g), 0); E.grow(S, 30000); courses++;
    const ys = S.plats.filter((p) => p.kind !== 'crumble').map((p) => p.y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) worst = Math.max(worst, ys[i] - ys[i - 1]);
  }
  ok(courses === 12 && worst > 100 && worst <= E.REACH * 0.85, 'over 12 courses to 3,000 m the largest gap between standable platforms is ' + worst.toFixed(0) + ', within a jump of ' + Math.round(E.REACH));
  const c1 = E.newGame(rng(77), 20000), c2 = E.newGame(rng(77), 20000);
  E.grow(c1, 5000); E.grow(c2, 5000);
  ok(JSON.stringify(c1.plats) === JSON.stringify(c2.plats), 'one seed, one course');
  // The daily climb: the summit is reachable, never shadowed by a plain platform, and stays in view
  let climbs = 0, summits = 0, shadow = 0, secs = [];
  for (let g = 0; g < 30; g++) {
    const S = E.newGame(rng(g + 1), 20000); let n = 0;
    while (!S.over && !S.won && n++ < 60 * 400) E.step(S, E.botSteer(S));
    climbs++; if (S.won) { summits++; secs.push(S.t); }
    const sm = S.plats.find((p) => p.kind === 'summit');
    if (!sm || S.plats.some((p) => p.kind !== 'summit' && p.kind !== 'crumble' && p.y > 20000 - 60 && p.y <= 20000)) shadow++;
    if (S.cam > 20000 - 80 + 1e-9) shadow++;
  }
  secs.sort((a, b) => a - b);
  ok(climbs === 30 && summits === 30, 'a steady climber reaches the 2,000 m summit on every one of 30 daily courses (' + summits + '/30)');
  ok(shadow === 0, 'no plain platform sits level with the summit, and the view never rises past it');
  ok(secs[15] > 90 && secs[15] < 240, 'a daily climb takes a couple of minutes (median ' + Math.round(secs[15]) + ' s)');
  let far = 0;
  for (let g = 0; g < 6; g++) {
    const S = E.newGame(rng(500 + g), 0); let n = 0;
    while (!S.over && S.y < 40000 && n++ < 60 * 600) E.step(S, E.botSteer(S));
    if (S.y >= 40000) far++;
  }
  ok(far === 6, 'endless courses stay climbable past 4,000 m, at full difficulty (' + far + '/6)');

  // Page: both controls behind the gear; tilt asks only where the browser makes it ask, on a tap
  ok(/class: 'ch-iconbtn hp-gear'/.test(html) && /\[\{ value: 'touch', label: C\.t\('ctlTouch'\) \}, \{ value: 'tilt', label: C\.t\('ctlTilt'\) \}\]/.test(html), 'touch and tilt are both offered, switched behind the gear');
  ok(/window\.addEventListener\('deviceorientation', onTilt\)/.test(html) && /if \(prefs\.control === 'tilt'\) startTilt\(true\);/.test(html) && /startTilt\(false\);/.test(html) && !/Accelerometer|Gyroscope|navigator\.permissions/.test(html), 'tilt uses deviceorientation (no Android permission), and asks for iOS permission only from the settings tap');
  ok(/C\.ui\.toast\(\{ icon: 'info', title: C\.t\('noTilt'\) \}\)/.test(html) && /if \(prefs\.control === 'tilt' && tiltSeen\) k \+= tilt;/.test(html), 'without tilt events touch keeps working, and the player is told');
  ok(/C\.daily\('hop', dailyDate\)\.rng/.test(html) && /var SUMMIT = 20000;/.test(html), 'the daily climb comes from the day\'s seed, to a summit at 2,000 m');
  ok(/\.hp-canvas \{[^}]*direction: ltr;/.test(html), 'left is left in Persian too');
  ok(/wrap\.addEventListener\('pointerdown', function \(e\) \{\n    if \(!S \|\| \(e\.target\.closest && e\.target\.closest\('button'\)\)\) return;/.test(html) && !/h = Math\.max\(320, h\)/.test(html), 'the whole game area steers and the sky never has a floor size, so a phone on its side plays and fits');

  // Identity
  const gm = games.find((g) => g.id === 'hop');
  ok(!!gm && gm.cat === 'skill' && gm.daily !== false, 'games.json lists it under skill games, with a daily climb');
  ok(!!gm && html.match(/accent: '([^']+)'/)[1] === gm.color, 'games.json and the page share the accent');
  const icon = fs.readFileSync(path.join(ROOT, 'www/games/hop/icon.svg'), 'utf8');
  ok(!!gm && new RegExp('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon), 'the icon starts on the soft tint of games.json');
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const lab = (h) => {
    const [R0, G, Bl] = rgb(h).map(lin), f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    const X = (R0 * 0.4124 + G * 0.3576 + Bl * 0.1805) / 0.95047, Y = R0 * 0.2126 + G * 0.7152 + Bl * 0.0722, Z = (R0 * 0.0193 + G * 0.1192 + Bl * 0.9505) / 1.08883;
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  };
  const dE = (p, q) => { const P = lab(p), Q = lab(q); return Math.hypot(P[0] - Q[0], P[1] - Q[1], P[2] - Q[2]); };
  const lum = (h) => rgb(h).map(lin).reduce((acc, c, i) => acc + c * [0.2126, 0.7152, 0.0722][i], 0);
  const near = games.filter((g) => g.id !== 'hop').map((g) => [g.id, dE(g.color, gm.color)]).sort((p, q) => p[1] - q[1])[0];
  ok(near[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5, 'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + ') and keeps white text at 4.5:1');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  ok(['hop-500', 'hop-2k', 'hop-summit'].every((id) => new RegExp("\\{ id: '" + id + "',[^\\n]*dde: '[^\\n]*des: '").test(core) && html.indexOf("unlock('" + id + "')") > 0), 'the three Hop awards exist in every language and are unlocked');
  ok(Date.now() - t0 < 10000, 'the Hop tests finish in under 10 s (' + (Date.now() - t0) + ' ms)');
}

// #553: the owner asked for a wall-and-path game from a board game's booklet (its name
// and Quoridor are trademarks, so Corridor / راهرو); one pawn each, plus a flag mode
function testCorridor() {
  head('Corridor (#553)');
  const t0 = Date.now();
  const E = loadEngine('corridor', 'CorridorEngineFactory');
  const html = fs.readFileSync(path.join(ROOT, 'www/games/corridor/index.html'), 'utf8');
  const rng = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
  const cells = (list) => list.map((i) => E.rc(i).join(',')).sort().join(' ');
  const S0 = E.newGame('none');
  ok(E.dist(S0, 0) === 8 && E.dist(S0, 1) === 8 && S0.left.join() === '10,10' && cells(E.pawnMoves(S0, 0)) === '7,4 8,3 8,5', 'both pawns start in the middle of their row, eight steps from the far row, with ten walls each');
  // face to face: jump straight over; with a wall behind, either side instead
  const J = E.newGame('none'); J.pos = [E.at(4, 4), E.at(3, 4)];
  ok(cells(E.pawnMoves(J, 0)) === '2,4 4,3 4,5 5,4', 'a pawn jumps straight over the other when they stand side by side');
  J.walls.push({ o: 'h', r: 2, c: 4 });
  ok(cells(E.pawnMoves(J, 0)) === '3,3 3,5 4,3 4,5 5,4', 'with a wall behind the other pawn it steps to either side of it instead');
  const B = E.newGame('none'); B.walls.push({ o: 'h', r: 7, c: 4 });
  ok(cells(E.pawnMoves(B, 0)) === '8,3 8,5' && E.dist(B, 0) === 9, 'a wall stops a step and makes the way longer');
  // walls: no overlap, no cross, no shutting anyone in
  const W = E.newGame('none');
  W.walls.push({ o: 'h', r: 3, c: 3 }); W.left[0] = 9;
  ok(!E.wallOk(W, { o: 'h', r: 3, c: 4 }) && !E.wallOk(W, { o: 'h', r: 3, c: 2 }) && !E.wallOk(W, { o: 'v', r: 3, c: 3 }) && !E.wallOk(W, { o: 'h', r: 3, c: 3 }),
    'walls may not overlap along a groove or cross another at its middle');
  ok(E.wallOk(W, { o: 'h', r: 3, c: 5 }) && E.wallOk(W, { o: 'v', r: 3, c: 4 }) && E.wallOk(W, { o: 'v', r: 2, c: 3 }), 'walls that only touch end to end or at a corner are fine');
  ok(!E.wallOk(W, { o: 'h', r: 8, c: 0 }) && !E.wallOk(W, { o: 'v', r: 0, c: -1 }), 'a wall must lie inside the board');
  const T = E.newGame('none');
  ok(E.play(T, { t: 'w', o: 'h', r: 7, c: 3 }) && E.play(T, { t: 'm', to: E.at(1, 4) }) && E.play(T, { t: 'w', o: 'v', r: 7, c: 2 }) && E.play(T, { t: 'm', to: E.at(2, 4) }),
    'walls are placed and pawns move in turn');
  ok(!E.wallOk(T, { o: 'v', r: 7, c: 4 }) && !E.play(T, { t: 'w', o: 'v', r: 7, c: 4 }) && T.walls.length === 2 && T.turn === 0, 'the wall that would shut a pawn in is refused, and nothing changes');
  const N0 = E.newGame('none'); N0.left[0] = 0;
  ok(!E.wallOk(N0, { o: 'h', r: 3, c: 3 }), 'without walls left, no wall');
  const Wn = E.newGame('none'); Wn.pos = [E.at(1, 0), E.at(5, 5)];
  ok(E.play(Wn, { t: 'm', to: E.at(0, 0) }) && Wn.winner === 0 && !E.play(Wn, { t: 'm', to: E.at(6, 5) }), 'reaching the far row wins and ends the game');
  // the flag game
  const F = E.newGame('centre'); F.pos = [E.at(6, 4), E.at(0, 0)];
  ok(E.dist(F, 0) === 1 && !E.pawnMoves(F, 0).includes(E.at(4, 4)), 'flag cell setup: one step from a cell beside the flag, never onto it');
  // #579: in the flag game the far row is an ordinary row; only the flags win
  const Ff = E.newGame('both'); Ff.pos = [E.at(1, 8), E.at(7, 8)];
  ok(!E.isGoal(Ff, 0, E.at(0, 8), E.blockedSet(Ff.walls)) && !E.isGoal(Ff, 1, E.at(8, 8), E.blockedSet(Ff.walls)), 'in the flag game neither far row is a goal');
  ok(E.play(Ff, { t: 'm', to: E.at(0, 8) }) && Ff.winner === -1 && Ff.turn === 1, 'stepping onto the far row in the flag game does not end it');
  const ffEnd = (E.path(Ff, 1) || []).slice(-1)[0];
  ok([E.at(3, 4), E.at(5, 4), E.at(4, 3), E.at(4, 5), E.at(3, 0), E.at(5, 0), E.at(4, 1)].includes(ffEnd), 'the path in the flag game leads beside a flag, not to the far row (' + ffEnd + ')');
  ok(E.isGoal(F, 0, E.at(5, 4), E.blockedSet(F.walls)) && E.isGoal(F, 1, E.at(4, 3), E.blockedSet(F.walls)) && !E.isGoal(F, 0, E.at(5, 5), E.blockedSet(F.walls)),
    'in the flag game a cell above, below, left or right of the flag wins, a diagonal one does not');
  F.walls.push({ o: 'h', r: 4, c: 4 });
  ok(!E.isGoal(F, 0, E.at(5, 4), E.blockedSet(F.walls)), 'a wall between the cell and the flag does not count');
  const F2 = E.newGame('edge'); F2.pos = [E.at(5, 0), E.at(0, 0)];
  ok(!E.pawnMoves(F2, 0).includes(E.at(4, 0)) && E.isGoal(F2, 0, E.at(5, 0), E.blockedSet(F2.walls)) && E.newGame('both').flags.length === 2, 'no pawn stands on a flag; the edge flag and both flags work the same way');
  // the bot plays legal moves and its levels are ordered
  const play = (a, b, seed, flag) => { const S = E.newGame(flag), r = rng(seed); let bad = 0; while (S.winner < 0) { const m = E.think(S, S.turn === 0 ? a : b, r); if (!m || !E.play(S, m)) { bad++; break; } } return { w: S.winner, bad, plies: S.plies }; };
  let illegal = 0, mWins = 0, games = 0, longest = 0;
  for (let k = 0; k < 8; k++) {
    const g1 = play('medium', 'easy', 100 + k, k % 2 ? 'none' : 'both'), g2 = play('easy', 'medium', 200 + k, k % 2 ? 'centre' : 'none');
    illegal += g1.bad + g2.bad; games += 2;
    mWins += (g1.w === 0 ? 1 : 0) + (g2.w === 1 ? 1 : 0);
    longest = Math.max(longest, g1.plies, g2.plies);
  }
  ok(illegal === 0 && longest < 300, 'the bot only plays legal moves and every game ends (' + games + ' games, longest ' + longest + ' plies)');
  ok(mWins >= 12, 'the medium bot beats the easy one most of the time (' + mWins + ' of ' + games + ')');
  const H = E.newGame('none'), th = Date.now(); E.think(H, 'hard', rng(5));
  ok(Date.now() - th < 400, 'the hard bot answers in well under a second (' + (Date.now() - th) + ' ms)');
  // saves
  const V = E.newGame('both'); E.play(V, { t: 'w', o: 'h', r: 3, c: 3 });
  const bad = E.clone(V); bad.walls.push({ o: 'h', r: 3, c: 4 });
  ok(E.valid(V) && !E.valid(bad) && !E.valid(Object.assign(E.clone(V), { pos: [4, 4] })), 'a save is checked before it is restored');
  ok(/C\.daily\('corridor', G\.daily \+ '\|' \+ G\.S\.plies\)\.rng/.test(html) && ['cor-win', 'cor-hard', 'cor-flag'].every((id) => html.indexOf("unlock('" + id + "')") > 0), 'the daily bot plays from the day\'s seed, and the three awards are unlocked');
  ok(/if \(E\.wallOk\(G\.S, w\)\) \{ act\(/.test(html) && /tools\.classList\.toggle\('cr-tools--off', !preview/.test(html) && /\.cr-tools--off \{ visibility: hidden; \}/.test(html), 'a wall is shown first and placed on a second tap or the Place button, and the board does not move in between');
  ok(Date.now() - t0 < 12000, 'the Corridor tests finish in under 12 s (' + (Date.now() - t0) + ' ms)');
}

// #554: xmha97 asked for Lights Out (named Lights Off: "Lights Out" is a trademark)
function testLights() {
  head('Lights Off (#554)');
  const t0 = Date.now();
  const E = loadEngine('lights', 'LightsEngineFactory');
  const html = fs.readFileSync(path.join(ROOT, 'www/games/lights/index.html'), 'utf8');
  const rng = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
  const zero = (n) => new Array(n * n).fill(0);
  ok(E.lit(E.press(zero(3), 3, 4)) === 5 && E.lit(E.press(zero(3), 3, 0)) === 3 && E.lit(E.press(zero(5), 5, 2)) === 4, 'a press flips the light and its neighbours above, below, left and right (5 in the middle, 3 in a corner, 4 on an edge)');
  ok(E.lit(E.press(E.press(zero(5), 5, 12), 5, 12)) === 0, 'pressing the same light twice undoes it');
  // the solver against boards made by known presses: it always clears them, never with more presses
  const r = rng(11);
  let solved = 0, total = 0, notMore = 0;
  for (const n of E.SIZES) for (let k = 0; k < 40; k++) {
    const L = zero(n), set = new Set();
    for (let j = 0; j < 1 + Math.floor(r() * n * n); j++) { const i = Math.floor(r() * n * n); E.press(L, n, i); set.has(i) ? set.delete(i) : set.add(i); }
    const x = E.solve(L, n), B = L.slice();
    total++;
    if (x) { x.forEach((v, i) => { if (v) E.press(B, n, i); }); if (!E.lit(B)) solved++; if (E.lit(x) <= set.size) notMore++; }
  }
  ok(total === 120 && solved === total && notMore === total, 'the solver puts out every board made by presses, never in more presses than made it (' + solved + '/' + total + ')');
  const lone = zero(5); lone[0] = 1;
  ok(E.solve(lone, 5) === null, 'a 5×5 board that cannot be put out is known as such (a lone corner light)');
  // 5×5 has four solutions per board: the smallest one is the minimum
  const P = zero(5); [0, 6, 12, 18, 24].forEach((i) => E.press(P, 5, i));
  ok(E.lit(E.solve(P, 5)) <= 5, 'on 5×5 the smallest of the solutions is taken');
  // generated puzzles: solvable, in the size's band, the same for the same seed (the daily)
  let inBand = 0, gen = 0;
  for (const n of E.SIZES) for (let k = 0; k < 30; k++) {
    const G = E.generate(n, r), x = E.solve(G.start, n);
    gen++;
    if (x && E.lit(x) === G.min && G.min >= E.BAND[n][0] && G.min <= E.BAND[n][1] && E.lit(G.start) > 0) inBand++;
  }
  ok(gen === 90 && inBand === gen, 'every generated puzzle can be put out, and its fewest moves fall in the size\'s band (' + inBand + '/' + gen + ')');
  const a = E.generate(5, rng(4)), b = E.generate(5, rng(4));
  ok(a.start.join() === b.start.join() && a.min === b.min, 'the same seed gives the same puzzle, so the daily is the same for everyone');
  ok(E.stars(9, 9) === 3 && E.stars(14, 9) === 2 && E.stars(15, 9) === 1 && E.stars(99, 9) === 1, 'three stars for the fewest moves, two within half again, and extra moves never lose');
  ok(E.valid({ n: 5, start: zero(5), cur: zero(5), moves: 0, min: 7 }) && !E.valid({ n: 4, start: zero(4), cur: zero(4), moves: 0, min: 7 }) && !E.valid({ n: 5, start: zero(5), cur: zero(3), moves: 0, min: 7 }), 'a save is checked before it is restored');
  ok(/C\.daily\('lights', dailyDate\)\.rng/.test(html) && ['lit-perfect', 'lit-big', 'lit-daily'].every((id) => html.indexOf("unlock('" + id + "')") > 0), 'the daily puzzle is seeded by the day, and the three awards are unlocked');
  ok(/\.lt-board \{[^}]*direction: ltr;/.test(html) && /board\.addEventListener\('keydown'/.test(html), 'the board is left to right in every language, so the arrows are geometric');
  ok(Date.now() - t0 < 8000, 'the Lights Off tests finish in under 8 s (' + (Date.now() - t0) + ' ms)');
}

// #544: a player asked for Simon (named Echo in English: "Simon" is a trademark)
function testSimon() {
  head('Echo / Simon (#544)');
  const E = loadEngine('simon', 'SimonEngineFactory');
  const html = fs.readFileSync(path.join(ROOT, 'www/games/simon/index.html'), 'utf8');
  const rng = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
  const a = E.sequence(rng(7)), b = E.sequence(rng(7)), c = E.sequence(rng(8));
  ok(a.length >= 100 && a.join() === b.join() && a.join() !== c.join() && a.every((x) => x >= 0 && x < 4), 'a sequence is long, the same for the same seed (the daily), and uses the four pads');
  const counts = [0, 1, 2, 3].map((k) => a.filter((x) => x === k).length);
  ok(counts.every((n) => n > a.length / 8), 'every pad comes up (' + counts.join(', ') + ')');
  // play a game right for five rounds: each round adds exactly one, keeping the start
  const S = E.game(rng(3), 1);
  const first = S.seq.slice(0, 5).join();
  let okRounds = 0;
  for (let r = 1; r <= 5; r++) {
    const want = S.seq.slice(0, S.len);
    let res = '';
    for (const k of want) res = E.press(S, k);
    if (res === 'round' && S.len === r + 1 && S.best === r && S.pos === 0) okRounds++;
  }
  ok(okRounds === 5 && S.seq.slice(0, 5).join() === first, 'each round repeated right adds one note to the same sequence');
  const due = S.seq[0], wrong = (due + 1) % 4;
  ok(E.press(S, wrong) === 'wrong' && S.over && S.best === 5 && E.press(S, due) === 'over', 'the first mistake ends the game and keeps the rounds completed');
  const G = E.game(rng(9), 7);
  ok(G.len === 7 && G.best === 6 && G.pos === 0, 'a saved game comes back at its round');
  ok(E.noteMs(1) > E.noteMs(10) && E.noteMs(10) > E.noteMs(40) - 1 && E.noteMs(100) >= 260 && E.gapMs(1) > 0, 'playback quickens with the length but never below 260 ms a note');
  ok(/C\.daily\('simon', dailyDate\)\.rng/.test(html) && ['smn-10', 'smn-20', 'smn-daily'].every((id) => html.indexOf("unlock('" + id + "')") > 0), 'the daily sequence is seeded by the day, and the three awards are unlocked');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  ok([0, 1, 2, 3].every((i) => new RegExp('simon' + i + ': function').test(core)) && /simonWrong: function/.test(core), 'each pad has its own note in the core, and a mistake its own sound');
  ok((html.match(/<svg viewBox="0 0 24 24" fill="#fff">' \+ SHAPES\[i\]/g) || []).length === 1 && /var SHAPES = \[/.test(html), 'each pad carries its own shape, so the four tell apart without colour');
}

// #524: the owner asked for air hockey like Neon Hockey; physics, goals and halves are
// tested on the engine, and a test player that plays by touch shows the levels are ordered
function testAirHockey() {
  head('Air Hockey (#524)');
  const t0 = Date.now();
  const E = loadEngine('airhockey', 'AirHockeyEngineFactory');
  const html = fs.readFileSync(path.join(ROOT, 'www/games/airhockey/index.html'), 'utf8');
  const rng = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
  const half = () => 0.5;
  const fresh = () => { const S = E.match(); S.wait = 0; S.mal[0] = { x: 40, y: E.H - 40, vx: 0, vy: 0 }; S.mal[1] = { x: 40, y: 40, vx: 0, vy: 0 }; return S; };
  const hold = (S) => [{ x: S.mal[0].x, y: S.mal[0].y }, { x: S.mal[1].x, y: S.mal[1].y }];

  // A mallet stays in its own half and inside the boards
  const c0 = E.clampMallet(0, -50, 100), c1 = E.clampMallet(1, 999, 900);
  ok(c0.x === E.RM && c0.y === E.H / 2 + E.RM && c1.x === E.W - E.RM && c1.y === E.H / 2 - E.RM, 'a mallet cannot leave its half or the table');

  // Goals: through the mouth is a goal, beside it the puck bounces off the end board
  const shoot = (x, vy) => { const S = fresh(); S.puck = { x, y: vy < 0 ? 30 : E.H - 30, vx: 0, vy }; let ev = []; for (let i = 0; i < 60 && !ev.length; i++) ev = E.step(S, hold(S), half).filter((e) => e !== 'hit'); return { S, ev }; };
  const g0 = shoot(E.W / 2, -600), g1 = shoot(E.W / 2 + 40, 600), post = shoot(E.W / 2 + E.GOAL / 2 + 20, -600);
  ok(g0.ev.includes('goal0') && g0.S.score.join() === '1,0' && g1.ev.includes('goal1') && g1.S.score.join() === '0,1', 'a puck through the top mouth is a goal for the bottom player, and the other way round');
  ok(post.ev.includes('wall') && !post.ev.some((e) => e.startsWith('goal')) && post.S.puck.vy > 0, 'beside the mouth the puck bounces off the end board');
  ok(g0.S.puck.y < E.H / 2 && g1.S.puck.y > E.H / 2 && g0.S.puck.vx === 0 && g0.S.puck.vy === 0 && g0.S.wait > 0, 'after a goal the puck waits, still, in the half that let it in');
  const side = fresh(); side.puck = { x: 20, y: 300, vx: -500, vy: 0 }; E.step(side, hold(side), half); E.step(side, hold(side), half);
  ok(side.puck.vx > 0 && side.puck.vx < 500, 'the side boards return the puck a little slower');

  // A moving mallet gives the puck its speed; the puck never passes the top speed
  const hit = (mvy) => { const S = fresh(); S.puck = { x: 180, y: 400, vx: 0, vy: 0 }; S.mal[0] = { x: 180, y: 400 + E.RP + E.RM + 2, vx: 0, vy: 0 }; let v = 0;
    for (let i = 0; i < 20; i++) { E.step(S, [{ x: 180, y: S.mal[0].y + mvy * E.DT }, hold(S)[1]], half); v = Math.hypot(S.puck.vx, S.puck.vy); } return { v, vy: S.puck.vy }; };
  const slow = hit(-300), fast = hit(-2400);
  ok(slow.vy < 0 && fast.vy < 0 && fast.v > slow.v * 1.6 && fast.v <= E.VMAX + 1, 'a faster hit sends the puck faster, up to ' + E.VMAX + ' (' + slow.v.toFixed(0) + ' and ' + fast.v.toFixed(0) + ')');

  // A test player that plays by touch: from behind the puck it drives through it at the goal,
  // otherwise it waits in front of its goal under the puck. Easy and medium lose to it, hard beats it.
  const person = (S, r, st) => {
    st.t -= E.DT;
    if (st.t <= 0) {
      st.t = 0.15;
      const P = S.puck, M = S.mal[0], e = (r() * 2 - 1) * 16;
      if (P.y > E.H / 2 && M.y < P.y + 10) st.tg = { x: P.x + (M.x < P.x ? -50 : 50), y: P.y + 60 };
      else if (P.y > E.H / 2) { const dx = E.W / 2 - P.x, dy = -P.y, l = Math.hypot(dx, dy); st.tg = { x: P.x + dx / l * 90 + e, y: P.y + dy / l * 90 }; }
      else st.tg = { x: P.x + e, y: E.H - 90 };
    }
    return st.tg;
  };
  const vs = (lv, n) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const S = E.match(); E.setBot(S, 1, lv); const r = rng(700 + i), st = { t: 0, tg: null }; let k = 0;
      while (S.winner < 0 && k < 120 * 60 * 10) { E.step(S, [person(S, r, st), null], r); k++; }
      out.push({ w: S.winner, min: k / 7200 });
    }
    return out;
  };
  const ve = vs('easy', 4), vm2 = vs('medium', 4), vh = vs('hard', 4);
  const won = (a) => a.filter((x) => x.w === 0).length;
  ok(won(ve) === 4 && won(vm2) >= 2 && won(vh) <= 1, 'the test player beats easy, mostly beats medium and loses to hard (' + won(ve) + '/4, ' + won(vm2) + '/4, ' + won(vh) + '/4)');
  const all = ve.concat(vm2, vh);
  ok(all.length === 12 && all.every((x) => x.w >= 0 && x.min < 10), 'every match ends within 10 game minutes (longest ' + Math.max(...all.map((x) => x.min)).toFixed(1) + ')');
  // and the levels in order against each other
  let mw = 0;
  for (let i = 0; i < 4; i++) { const S = E.match(); E.setBot(S, 0, 'medium'); E.setBot(S, 1, 'easy'); const r = rng(40 + i); let k = 0; while (S.winner < 0 && k < 120 * 60 * 10) { E.step(S, null, r); k++; } if (S.winner === 0) mw++; }
  ok(mw >= 3, 'medium beats easy (' + mw + '/4)');

  // Saves between goals
  const R = E.restore(E.snapshot(Object.assign(E.match(), { score: [4, 6] })));
  ok(!!R && R.score.join() === '4,6' && R.wait > 0 && R.puck.x === E.W / 2, 'a saved score comes back with the puck in the middle, waiting');
  ok(!E.restore({ score: [7, 2] }) && !E.restore({ score: [1] }) && !E.restore(null) && !E.restore({ score: [1.5, 0] }), 'a finished, short or broken save is refused');

  ok(/level: daily \? 'medium' : o\.level/.test(html) && /C\.daily\('airhockey', G\.daily \+ '\|g'/.test(html), 'the daily match is against the medium bot, seeded by the day');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  ok(['air-win', 'air-hard', 'air-shut'].every((id) => html.indexOf("unlock('" + id + "')") > 0 && core.indexOf("id: '" + id + "'") > 0), 'its three awards are defined in the core and unlocked by the game');
  const ms = Date.now() - t0;
  ok(ms < 12000, 'the group runs in ' + (ms / 1000).toFixed(1) + ' s (limit 12 s)');
}

// #512: a player asked for Ping Pong; the engine is tested on its own, with the bots
// playing whole matches against each other and a test player that tracks the ball
function testPingPong() {
  head('Ping Pong (#512)');
  const t0 = Date.now();
  const E = loadEngine('pingpong', 'PingPongEngineFactory');
  const html = fs.readFileSync(path.join(ROOT, 'www/games/pingpong/index.html'), 'utf8');
  const rng = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
  const half = () => 0.5;

  // Serves: two each, one each from ten all; first to 11, by two
  const S = E.match(false);
  const order = [];
  for (const sc of [[0, 0], [1, 0], [1, 1], [2, 1], [5, 4], [10, 10], [11, 10], [11, 11]]) { S.score = sc; order.push(E.server(S)); }
  ok(order.join('') === '00110010', 'serves go two each, then one each from ten all (' + order.join('') + ')');
  const scoreTo = (a, b, who) => { const M = E.match(false); M.score = [a, b]; M.phase = 'play'; M.ball.y = who === 0 ? -50 : E.H + 50; M.ball.vy = who === 0 ? -1 : 1; E.step(M, null, half); return M; };
  ok(scoreTo(10, 9, 0).winner === 0 && scoreTo(10, 10, 0).winner === -1 && scoreTo(11, 10, 0).winner === 0 && scoreTo(10, 11, 0).winner === -1 && scoreTo(9, 10, 1).winner === 1,
    '11 wins at 11–9 and 12–10, never 11–10');
  ok(scoreTo(3, 3, 0).score.join() === '4,3' && scoreTo(3, 3, 1).score.join() === '3,4', 'a ball past the top paddle is a point for the bottom, and the other way round');

  // A paddle hit: the middle sends it straight, the edge at the steep angle, a little faster each time
  const hit = (dx) => {
    const M = E.match(false); M.phase = 'play'; M.pad[0].x = 180;
    M.ball.x = 180 + dx; M.ball.y = E.faceY(0) - E.R - 1; M.ball.vx = 0; M.ball.vy = 300; M.ball.speed = 300;
    const ev = E.step(M, [180, null], half);
    return { ev, deg: Math.atan2(M.ball.vx, -M.ball.vy) * 180 / Math.PI, speed: Math.hypot(M.ball.vx, M.ball.vy) };
  };
  const mid = hit(0), edge = hit(E.PW / 2), miss = hit(E.PW / 2 + E.R + 4);
  ok(mid.ev.includes('hit') && Math.abs(mid.deg) < 1 && edge.ev.includes('hit') && edge.deg > 45 && edge.deg <= 62.1 && Math.abs(mid.speed - 316) < 1,
    'the middle returns straight, the edge at ' + edge.deg.toFixed(0) + '°, and each hit is 16 faster (' + mid.speed.toFixed(0) + ')');
  ok(!miss.ev.includes('hit'), 'a ball beside the paddle goes past it');
  const W2 = E.match(false); W2.phase = 'play'; W2.ball.x = 8; W2.ball.y = 300; W2.ball.vx = -400; W2.ball.vy = 10;
  E.step(W2, null, half);
  ok(W2.ball.vx > 0 && W2.ball.x >= E.R, 'the ball bounces off the side of the table');

  // predictX agrees with the flight itself, side bounces included
  let agree = 0, tried = 0;
  for (let i = 0; i < 20; i++) {
    const r = rng(i + 7), M = E.match(false); M.phase = 'play';
    M.ball.x = 30 + r() * 300; M.ball.y = 320; const a = (r() * 2 - 1) * 1.1; M.ball.vx = Math.sin(a) * 500; M.ball.vy = Math.cos(a) * 500; M.ball.speed = 500;
    M.pad[0].x = 9999; // keep the paddle out of the way: it clamps to the edge, so park it by the wall the ball won't reach
    const p = E.predictX(M, 0);
    M.pad[0].x = p < 180 ? E.W - E.PW / 2 : E.PW / 2;
    let x = null;
    for (let k = 0; k < 400 && x == null; k++) { const prevY = M.ball.y; E.step(M, null, half); if (prevY < E.faceY(0) - E.R && M.ball.y >= E.faceY(0) - E.R) x = M.ball.x; }
    tried++; if (x != null && Math.abs(x - p) < 6) agree++;
  }
  ok(tried === 20 && agree === 20, 'where a bot expects the ball is where it arrives (' + agree + '/' + tried + ')');

  // Whole matches: each level beats the one below, matches end, rallies are not endless
  const play = (a, b, seed) => {
    const M = E.match(false); E.setBot(M, 0, a); E.setBot(M, 1, b);
    const r = rng(seed); let n = 0;
    while (M.winner < 0 && n < 120 * 60 * 20) { E.step(M, null, r); n++; }
    return { w: M.winner, min: n / 7200, longest: M.longest };
  };
  const series = (a, b, n) => { const out = []; for (let i = 0; i < n; i++) out.push(play(a, b, 31 + i)); return out; };
  const me = series('medium', 'easy', 8), em = series('easy', 'medium', 4);
  const meWins = me.filter((x) => x.w === 0).length + em.filter((x) => x.w === 1).length;
  ok(meWins >= 10, 'medium beats easy, from either end (' + meWins + '/12)');
  const hm = series('hard', 'medium', 4);
  ok(hm.filter((x) => x.w === 0).length >= 3, 'hard beats medium (' + hm.filter((x) => x.w === 0).length + '/4)');
  const all = me.concat(em, hm);
  ok(all.length === 16 && all.every((x) => x.w >= 0 && x.min < 15 && x.longest < 120), 'every match ends within 15 game minutes, no rally runs past 120 hits (longest ' + Math.max(...all.map((x) => x.longest)) + ')');

  // A test player that keeps its paddle where the ball is going, with a finger's speed
  // and a little error, beats the easy bot: the game can be won by touch alone
  let tpWins = 0;
  for (let i = 0; i < 4; i++) {
    const M = E.match(false); E.setBot(M, 1, 'easy');
    const r = rng(90 + i), err = () => (r() * 2 - 1) * 14;
    let aim = 180, n = 0;
    while (M.winner < 0 && n < 120 * 60 * 20) {
      if (M.phase === 'serve' && E.server(M) === 0) M.go = true;
      const p = E.predictX(M, 0);
      if (p != null && n % 24 === 0) aim = p + err();
      E.step(M, [p == null ? 180 : aim, null], r); n++;
    }
    if (M.winner === 0) tpWins++;
  }
  ok(tpWins >= 3, 'a test player tracking the ball by touch beats the easy bot (' + tpWins + '/4)');

  // Saves between points: the score comes back, a finished or broken save does not
  const R = E.restore(E.snapshot(Object.assign(E.match(true), { score: [7, 5], longest: 9 })));
  ok(!!R && R.score.join() === '7,5' && R.first === 1 && R.longest === 9 && R.phase === 'serve', 'a saved score comes back, waiting to serve');
  ok(!E.restore({ score: [11, 5], first: 0 }) && !E.restore({ score: [3] }) && !E.restore(null) && !E.restore({ score: [-1, 2] }), 'a finished, short or broken save is refused');

  // Page: a daily against the medium bot, both modes, the awards it unlocks exist
  ok(/level: daily \? 'medium' : o\.level/.test(html) && /C\.daily\('pingpong', G\.daily \+ '\|' \+ tag\)/.test(html), 'the daily match is against the medium bot, with serves seeded by the day');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  ok(['pp-win', 'pp-hard', 'pp-rally'].every((id) => html.indexOf("unlock('" + id + "')") > 0 && core.indexOf("id: '" + id + "'") > 0), 'its three awards are defined in the core and unlocked by the game');
  const ms = Date.now() - t0;
  ok(ms < 12000, 'the group runs in ' + (ms / 1000).toFixed(1) + ' s (limit 12 s)');
}

function testTanks() {
  head('Tanks (#476)');
  const t0 = Date.now();
  const E = loadEngine('tanks', 'TanksEngineFactory');
  const html = fs.readFileSync(path.join(ROOT, 'www/games/tanks/index.html'), 'utf8');
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  const rng = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
  const flat = (hgt) => { const M = E.match(rng(1)); M.h = M.h.map(() => hgt); M.wind = 0; return M; };

  // The field and the match
  const M0 = E.match(rng(5));
  ok(M0.h.length === E.W + 1 && M0.h.every((v) => v >= 40 && v <= E.H - 120) && M0.tanks[0].x < 160 && M0.tanks[1].x > E.W - 160, 'the ground covers the width within its bounds, a tank near each end');
  ok(M0.shots.join() === '10,10' && M0.moves.join() === '4,4' && M0.ammo[0].heavy === 2 && M0.ammo[0].triple === 2 && M0.ammo[0].roller === 2 && M0.ammo[0].dirt === 1 && Math.abs(M0.wind) <= E.WIND, 'ten shots and four moves each, two heavy, two triple, two rollers and one dirt, the wind in range');
  ok(JSON.stringify(E.match(rng(9))) === JSON.stringify(E.match(rng(9))), 'one seed, one field');

  // A shot is worked out without touching the match; firing applies it
  const S = flat(150), before = JSON.stringify(S);
  const sim = E.simulate(S, 0, 'shell', 45, 60);
  ok(JSON.stringify(S) === before && sim.paths.length === 1 && sim.blasts.length === 1, 'simulating a shot changes nothing in the match');
  const A = E.simulate(flat(150), 0, 'shell', 45, 60), B = E.simulate(flat(150), 0, 'shell', 45, 60);
  ok(JSON.stringify(A.paths) === JSON.stringify(B.paths), 'the same shot flies the same path every time');
  // Craters: each column loses the part inside the circle, and never goes below zero
  const h = new Array(E.W + 1).fill(150), cx = 320, cy = E.H - 150, r = 30;
  E.dig(h, cx, cy, r);
  const lost = h.reduce((a, v) => a + (150 - v), 0);
  ok(h[cx] === 150 - 30 && h[cx + 40] === 150 && Math.abs(lost - Math.PI * r * r / 2) < 60, 'a blast on the surface digs a half-round crater (' + lost + ' of ~' + Math.round(Math.PI * r * r / 2) + ' units)');
  const hu = new Array(E.W + 1).fill(150);
  E.dig(hu, 320, E.H - 100, 20);
  ok(hu[320] === 150 - 40 && hu[340] === 150, 'a blast underground takes its circle out and the earth above falls in');
  const hd = new Array(E.W + 1).fill(150);
  E.build(hd, 320, E.H - 150, 30);
  ok(hd[320] === 180 && hd[300] > 150 && hd[351] === 150, 'dirt builds a round mound where it lands');
  // Damage falls off from the centre; damage to yourself scores for the other
  const D = flat(150);
  D.tanks[1].x = 400;
  const near = E.simulate(D, 0, 'heavy', 45, 60).blasts[0];
  ok(near.dmg[0] === 0 && near.r === 44, 'the blast is where the shell lands');
  const M = flat(150); M.tanks[1].x = 400;
  // hit the other tank: the bot's own search finds a direct hit on flat ground
  const t = E.aim(M, 0, 'shell');
  const res = E.fire(M, 0, 'shell', t.angle, t.power, null, rng(2));
  ok(res && res.dealt >= 25 && M.score[0] === res.dealt && M.shots[0] === 9 && M.turn === 1 && Math.abs(M.wind) <= E.WIND, 'a hit scores its damage for the shooter (' + res.dealt + '), uses a shot and passes the turn with a new wind');
  const self = flat(150);
  const up = E.fire(self, 0, 'shell', 90, 30, null, rng(3));
  ok(up && self.score[1] > 0 && self.score[0] === 0, 'a shot straight up comes down on the shooter and scores for the other (' + self.score[1] + ')');
  const tri = E.simulate(flat(150), 0, 'triple', 45, 60);
  ok(tri.paths.length === 3 && tri.blasts.length === 3, 'the triple fires three shells');
  const hill = E.match(rng(1)); hill.wind = 0;
  hill.h = hill.h.map((_, x) => Math.round(260 - x * 0.25));
  const rl = E.simulate(hill, 0, 'roller', 30, 30), sh = E.simulate(hill, 0, 'shell', 30, 30);
  ok(rl.blasts.length === 1 && sh.blasts.length === 1 && rl.blasts[0].x > sh.blasts[0].x + 20, 'a roller runs on downhill before it goes off (' + Math.round(rl.blasts[0].x - sh.blasts[0].x) + ' units further)');
  const used = flat(150);
  ['heavy', 'heavy'].forEach(() => E.fire(used, 0, 'heavy', 45, 60, null, rng(4)) && (used.turn = 0));
  ok(E.left(used, 0, 'heavy') === 0 && E.fire(used, 0, 'heavy', 45, 60, null, rng(4)) === null, 'two heavy shells, then no more');
  // Moves: four a match, a step at a time, never past the other tank
  const mv = flat(150); mv.tanks[0].x = 100; mv.tanks[1].x = 140;
  ok(!E.move(mv, 0, 1) && E.move(mv, 0, -1) && mv.tanks[0].x === 76 && mv.moves[0] === 3, 'a step never runs into the other tank, and one away from it works');
  E.move(mv, 0, -1); E.move(mv, 0, -1); E.move(mv, 0, -1);
  ok(mv.moves[0] === 0 && !E.move(mv, 0, 1), 'four moves a match');
  // Twenty shots end the match; the higher score wins
  const end = flat(150); end.shots = [0, 0]; end.score = [40, 12];
  ok(E.over(end) && E.winner(end) === 0 && !E.validMatch(end), 'after twenty shots the match is over and the higher score wins');

  // The bot: harder levels do more damage a shot
  const avg = {};
  for (const lv of ['easy', 'medium', 'hard']) {
    let dmg = 0, n = 0;
    for (let g = 0; g < 6; g++) {
      const BM = E.match(rng(100 + g)), r2 = rng(200 + g);
      for (let k = 0; k < 2; k++) { BM.turn = 1; const pl = E.botPlan(BM, 1, lv, r2); dmg += E.fire(BM, 1, pl.arm, pl.angle, pl.power, null, r2).dealt; n++; }
    }
    avg[lv] = dmg / n;
  }
  ok(avg.easy < avg.medium && avg.medium < avg.hard && avg.hard > 12, 'the bot does more damage a shot level by level (easy ' + avg.easy.toFixed(1) + ', medium ' + avg.medium.toFixed(1) + ', hard ' + avg.hard.toFixed(1) + ')');

  // Page
  ok(/class: 'ch-iconbtn tk-gear'/.test(html) && /\[\{ value: 'drag', label: C\.t\('ctlDrag'\) \}, \{ value: 'nums', label: C\.t\('ctlNums'\) \}\]/.test(html), 'drag and numbers are both offered, switched behind the gear');
  const page = html.slice(html.indexOf('/* ==== ENGINE END ==== */'));
  ok((page.match(/E\.simulate\(/g) || []).length === 1 && /var sim = E\.simulate\(M, who, a, angle, power\);/.test(page), 'the page works out a shot only when it is fired, so the aim never shows the path');
  ok(/function rngFor\(tag\) \{ return G\.daily \? C\.daily\('tanks', G\.daily \+ '\|' \+ tag\)\.rng : Math\.random; \}/.test(html) && /mode: daily \? 'bot' : o\.mode, level: daily \? 'medium' : o\.level/.test(html), 'the daily match is against the medium bot, from the day\'s seed');
  ok(/\.tk-canvas \{[^}]*direction: ltr;/.test(html), 'the field is not mirrored in Persian');

  // Identity
  const gm = games.find((g) => g.id === 'tanks');
  ok(!!gm && gm.cat === 'skill' && gm.daily !== false, 'games.json lists it under skill games, with a daily match');
  ok(!!gm && html.match(/accent: '([^']+)'/)[1] === gm.color, 'games.json and the page share the accent');
  const icon = fs.readFileSync(path.join(ROOT, 'www/games/tanks/icon.svg'), 'utf8');
  ok(!!gm && new RegExp('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon), 'the icon starts on the soft tint of games.json');
  const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
  const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const lab = (x) => {
    const [R0, G, Bl] = rgb(x).map(lin), f = (q) => q > 0.008856 ? Math.cbrt(q) : 7.787 * q + 16 / 116;
    const X = (R0 * 0.4124 + G * 0.3576 + Bl * 0.1805) / 0.95047, Y = R0 * 0.2126 + G * 0.7152 + Bl * 0.0722, Z = (R0 * 0.0193 + G * 0.1192 + Bl * 0.9505) / 1.08883;
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  };
  const dE = (p, q) => { const P = lab(p), Q = lab(q); return Math.hypot(P[0] - Q[0], P[1] - Q[1], P[2] - Q[2]); };
  const lum = (x) => rgb(x).map(lin).reduce((acc, c, i) => acc + c * [0.2126, 0.7152, 0.0722][i], 0);
  const nearest = games.filter((g) => g.id !== 'tanks').map((g) => [g.id, dE(g.color, gm.color)]).sort((p, q) => p[1] - q[1])[0];
  ok(nearest[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5, 'the accent differs from every other game by ΔE ≥ 15 (nearest ' + nearest[0] + ', ' + nearest[1].toFixed(1) + ') and keeps white text at 4.5:1');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  ok(['tnk-win', 'tnk-hard', 'tnk-big'].every((id) => new RegExp("\\{ id: '" + id + "',[^\\n]*dde: '[^\\n]*des: '").test(core) && html.indexOf("unlock('" + id + "')") > 0), 'the three Tanks awards exist in every language and are unlocked');
  // #510: the field is drawn left to right in every language, so the step buttons must not follow RTL
  ok(/el\('span', \{ class: 'tk-steps', dir: 'ltr' \}, \[stepBtn\(-1, 'moveL', '◀'\), stepBtn\(1, 'moveR', '▶'\)\]\)/.test(html), 'the step buttons sit in a left-to-right group, ◀ (left) first, in every language');
  ok(Date.now() - t0 < 15000, 'the Tanks tests finish in under 15 s (' + (Date.now() - t0) + ' ms)');
}

function testXiangqi() {
  head('Chinese chess');
  const t0 = Date.now();
  const E = loadEngine('xiangqi', 'XiangqiEngineFactory');
  const html = fs.readFileSync(path.join(ROOT, 'www/games/xiangqi/index.html'), 'utf8');
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  const at = (r, f) => r * 9 + f;
  const blank = () => {
    const S = { board: new Array(90).fill('.'), u: new Array(90).fill(''), turn: 'r', hist: [], keys: {}, moves: 0, undos: 0, human: 'r', level: 2, mode: 'two', daily: null };
    S.keys[E.key(S)] = 1;
    return S;
  };
  const put = (S, r, f, p) => { const i = at(r, f); S.board[i] = p; S.u[i] = p + i; return i; };

  // The opening: nine files, ten ranks, Red at the bottom, generals facing
  const D = E.deal({ level: 2 });
  ok(E.START.length === 90 && D.board.join('') === E.START && D.turn === 'r', 'the board is nine files by ten ranks, Red to move');
  ok(E.validState(D) && E.kingOf(D, 'r') === at(9, 4) && E.kingOf(D, 'b') === at(0, 4), 'both generals stand in the middle of their palaces');
  const ids = D.u.filter(Boolean);
  ok(ids.length === 32 && new Set(ids).size === 32, 'all thirty-two pieces have their own id');
  ok(E.legal(D).length === 44, 'Red has forty-four opening moves');

  function perft(S, d) { if (!d) return 1; let n = 0; for (const m of E.legal(S)) { E.make(S, m); n += perft(S, d - 1); E.undo(S); } return n; }
  const pt = Date.now();
  const p2 = perft(D, 2), p3 = perft(D, 3);
  ok(p2 === 1920 && p3 === 79666, 'perft two and three match xiangqi (1920 and 79666)');
  ok(Date.now() - pt < 12000 && D.board.join('') === E.START && D.hist.length === 0, 'perft leaves the position exactly as it was');

  // The chariot slides, stops at its own piece and never jumps
  let S = blank(); put(S, 9, 4, 'K'); put(S, 0, 3, 'k');
  const R = put(S, 4, 4, 'R'); put(S, 3, 4, 'P'); put(S, 2, 4, 'p');
  let ms = E.movesFrom(S, R);
  ok(ms.length === 12 && ms.includes(at(5, 4)) && ms.includes(at(4, 0)), 'a chariot roams the open lines');
  ok(!ms.includes(at(3, 4)) && !ms.includes(at(2, 4)), 'a chariot stops at its own piece and does not take the one behind');

  // The cannon needs exactly one screen to take
  S = blank(); put(S, 9, 4, 'K'); put(S, 0, 3, 'k');
  const C = put(S, 4, 4, 'C'); put(S, 3, 4, 'P'); put(S, 2, 4, 'p'); put(S, 1, 4, 'p');
  ms = E.movesFrom(S, C);
  ok(ms.includes(at(2, 4)) && !ms.includes(at(1, 4)), 'a cannon takes only the piece just beyond its screen');
  S.board[at(3, 4)] = '.'; S.u[at(3, 4)] = '';
  ms = E.movesFrom(S, C);
  ok(!ms.includes(at(2, 4)), 'with no screen the cannon cannot take the first piece in its path');

  // The horse is blocked by the piece beside its leg
  S = blank(); put(S, 9, 4, 'K'); put(S, 0, 3, 'k'); put(S, 5, 0, 'N');
  ms = E.movesFrom(S, at(5, 0));
  ok(ms.length === 4 && ms.includes(at(6, 2)) && ms.includes(at(7, 1)) && ms.includes(at(4, 2)) && ms.includes(at(3, 1)), 'a horse in the corner has four moves');
  put(S, 5, 1, 'P');
  ms = E.movesFrom(S, at(5, 0));
  ok(ms.length === 2 && !ms.includes(at(6, 2)) && !ms.includes(at(4, 2)), 'a piece beside the horse blocks both moves over that leg');
  S.board[at(5, 1)] = '.'; S.u[at(5, 1)] = ''; put(S, 4, 0, 'P');
  ms = E.movesFrom(S, at(5, 0));
  ok(ms.length === 3 && !ms.includes(at(3, 1)), 'a piece below the horse blocks that leg alone');

  // The elephant never crosses the river and is stopped by a piece in its eye
  S = blank(); put(S, 9, 4, 'K'); put(S, 0, 3, 'k'); put(S, 5, 4, 'B');
  ms = E.movesFrom(S, at(5, 4));
  ok(ms.length === 2 && ms.every((i) => E.rank(i) >= 5), 'an elephant on the river bank has two moves and neither crosses');
  put(S, 6, 3, 'P');
  ms = E.movesFrom(S, at(5, 4));
  ok(ms.length === 1 && !ms.includes(at(7, 2)), 'a piece in the elephant eye blocks that diagonal');

  // Palace pieces stay inside it
  S = blank(); put(S, 9, 4, 'K'); put(S, 0, 3, 'k');
  ms = E.movesFrom(S, at(9, 4));
  ok(ms.length === 3 && ms.every((i) => E.file(i) >= 3 && E.file(i) <= 5), 'the general has three steps from the back of the palace and stays inside');
  S = blank(); put(S, 9, 4, 'K'); put(S, 0, 3, 'k'); put(S, 8, 4, 'A');
  ms = E.movesFrom(S, at(8, 4));
  ok(ms.length === 4 && ms.every((i) => E.rank(i) >= 7 && E.rank(i) <= 9), 'the adviser walks the palace diagonals');

  // Soldiers: forward only at home, sideways after the river
  S = blank(); put(S, 9, 4, 'K'); put(S, 0, 3, 'k'); put(S, 6, 4, 'P');
  ms = E.movesFrom(S, at(6, 4));
  ok(ms.length === 1 && ms[0] === at(5, 4), 'at home a soldier only steps forward');
  S = blank(); put(S, 9, 4, 'K'); put(S, 0, 3, 'k'); put(S, 4, 4, 'P');
  ms = E.movesFrom(S, at(4, 4));
  ok(ms.length === 3 && ms.includes(at(3, 4)) && ms.includes(at(4, 3)) && ms.includes(at(4, 5)), 'across the river a soldier steps sideways too');
  S = blank(); put(S, 9, 4, 'K'); put(S, 0, 3, 'k'); put(S, 5, 4, 'p');
  ms = E.movesFrom(S, at(5, 4));
  ok(ms.length === 3 && ms.includes(at(6, 4)) && ms.includes(at(5, 3)) && ms.includes(at(5, 5)), 'the black soldier crosses the other way');

  // The flying generals: an open file between them is check, and the screen may not step aside
  S = blank(); put(S, 9, 4, 'K'); put(S, 0, 4, 'k');
  ok(E.inCheck(S, 'r') && E.inCheck(S, 'b'), 'two generals facing down an open file leave both in check');
  put(S, 6, 4, 'B');
  ok(!E.inCheck(S, 'r') && !E.inCheck(S, 'b'), 'one piece between the generals is enough');
  ok(E.legal(S).filter((m) => m.from === at(6, 4)).length === 0, 'the screen cannot step off the file and expose its general');

  // Mate, and the stalemate that also loses in xiangqi
  S = blank(); put(S, 9, 4, 'K'); put(S, 0, 3, 'k'); put(S, 1, 3, 'R'); put(S, 1, 4, 'R'); S.turn = 'b';
  let st = E.status(S);
  ok(st.over && st.winner === 'r' && st.reason === 'mate', 'checkmate ends the game for Black');
  S = blank(); put(S, 9, 4, 'K'); put(S, 0, 4, 'k'); put(S, 3, 3, 'R'); put(S, 3, 5, 'R'); put(S, 2, 4, 'P'); S.turn = 'b';
  ok(!E.inCheck(S, 'b'), 'the cornered general is not in check');
  st = E.status(S);
  ok(st.over && st.winner === 'r', 'with no legal move at all Black loses even without check');

  // Threefold repetition is a draw
  S = blank(); put(S, 9, 4, 'K'); put(S, 0, 3, 'k'); put(S, 4, 5, 'R'); put(S, 4, 2, 'r');
  S.keys = {}; S.keys[E.key(S)] = 1;
  const seq = [[at(4, 5), at(5, 5)], [at(4, 2), at(5, 2)], [at(5, 5), at(4, 5)], [at(5, 2), at(4, 2)]];
  for (let i = 0; i < 8; i++) {
    const m = E.legal(S).find((x) => x.from === seq[i % 4][0] && x.to === seq[i % 4][1]);
    if (!m) { ok(false, 'the repetition line is legal'); break; }
    E.make(S, m);
  }
  st = E.status(S);
  ok(st.over && st.winner === null && st.reason === 'repetition', 'the third time the same position appears the game is drawn');

  // Undo walks back to the opening exactly
  S = E.deal({});
  const b0 = S.board.join(''), turn0 = S.turn;
  for (let i = 0; i < 30; i++) {
    const ms = E.legal(S);
    if (!ms.length) break;
    E.make(S, ms[(i * 7 + 3) % ms.length]);
  }
  ok(S.hist.length === 30 && S.moves === 30, 'thirty moves are recorded');
  while (S.hist.length) E.undo(S);
  ok(S.board.join('') === b0 && S.turn === turn0 && S.moves === 0 && S.undos === 30 && E.validState(S), 'undo takes all thirty moves back to the opening');

  // The AI is deterministic and only makes legal moves
  const A1 = E.ai(E.clone(D), 1), A2 = E.ai(E.clone(D), 1);
  ok(A1 && A1.from === A2.from && A1.to === A2.to && E.legal(D).some((m) => m.from === A1.from && m.to === A1.to), 'the easy AI is deterministic and plays a legal move');
  const H1 = E.ai(E.clone(D), 3), H2 = E.ai(E.clone(D), 3);
  ok(H1 && H1.from === H2.from && H1.to === H2.to, 'the hard AI is deterministic too');

  // A corrupt save is refused
  const V1 = E.clone(D); V1.u[85] = '';
  ok(!E.validState(V1), 'a piece without its id is refused');
  const V2 = E.clone(D); V2.board[85] = '.'; V2.u[85] = '';
  ok(!E.validState(V2), 'a board without a general is refused');
  const V3 = E.clone(D); V3.board[45] = 'R'; V3.u[45] = 'R45';
  ok(!E.validState(V3), 'a seventeenth red piece is refused');

  // Page and identity
  const gm = games.find((g) => g.id === 'xiangqi');
  ok(!!gm && gm.cat === 'board' && gm.daily !== false, 'games.json lists it under board games, with a daily game');
  ok(!!gm && html.indexOf("accent: '#7C2D12'") > 0 && gm.color === '#7C2D12', 'games.json and the page share the accent');
  const icon = fs.readFileSync(path.join(ROOT, 'www/games/xiangqi/icon.svg'), 'utf8');
  ok(!!gm && new RegExp('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon), 'the icon starts on the soft tint of games.json');
  const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
  const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const lab = (x) => {
    const [R, G, Bl] = rgb(x).map(lin), f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    const X = (R * 0.4124 + G * 0.3576 + Bl * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + Bl * 0.0722, Z = (R * 0.0193 + G * 0.1192 + Bl * 0.9505) / 1.08883;
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  };
  const dE = (a, b) => { const P = lab(a), Q = lab(b); return Math.hypot(P[0] - Q[0], P[1] - Q[1], P[2] - Q[2]); };
  const lum = (x) => rgb(x).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
  const near = games.filter((g) => g.id !== 'xiangqi').map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0];
  ok(near[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5, 'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + ') and keeps white text at 4.5:1');
  ok(/name: \{ fa: 'شطرنج چینی', en: 'Chinese chess', zh: '中国象棋', de: 'Chinesisches Schach', es: 'Ajedrez chino', pl: 'Szachy chińskie' \}/.test(html), 'the names match games.json in every language');
  ok(/newGame\(\{ daily: dailyDate, level: 2, mode: 'ai' \}\)/.test(html) && /C\.stats\.daily\('xiangqi', S\.daily/.test(html), 'the daily game uses the same deterministic AI for everyone');
  ok(/kb\('U \/ Ctrl\+Z'/.test(html) && /if \(C\.undoKey\(e\)\) \{ undo\(\);/.test(html), 'the undo key is labelled and handled');
  ok(/E\.validState\(saved\.s\)/.test(html) && /ctx\.autosave\(function/.test(html), 'the game saves and restores a checked state');
  ok(/class: 'xq-board'/.test(html) && /xq-dot--cap/.test(html) && /xq-piece--sel/.test(html), 'the board is tappable and shows selection, target and capture marks');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  ok(['xq-win', 'xq-fast', 'xq-clean'].every((id) => new RegExp("\\{ id: '" + id + "',[^\\n]*dde: '[^\\n]*des: '").test(core) && html.indexOf("unlock('" + id + "')") > 0), 'the three Chinese chess awards exist in every language and are unlocked');
  ok(Date.now() - t0 < 15000, 'the Chinese chess tests finish in under 15 s (' + (Date.now() - t0) + ' ms)');
}

function testShelem() {
  head('Shelem (#418)');
  const t0 = Date.now();
  const E = loadEngine('shelem', 'ShelemEngineFactory');
  const html = fs.readFileSync(path.join(ROOT, 'www/games/shelem/index.html'), 'utf8');
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  const rng = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
  const card = (r, s) => r * 4 + s;            // ranks 0..12 (A..K), suits ♣ ♦ ♥ ♠
  const all = (S) => S.hands.flat().concat(S.widow, S.buried, S.played).sort((a, b) => a - b).join(',');
  const deck = [...Array(52).keys()].join(',');

  // The deal: twelve each and a widow of four; 165 points in the deck and its tricks
  const S0 = E.newMatch(rng(1), 505, 0);
  ok(S0.hands.every((h) => h.length === 12) && S0.widow.length === 4 && all(S0) === deck, 'twelve cards each and a widow of four, one full deck');
  ok(E.sumPoints([...Array(52).keys()]) === 100 && E.cardPoints(card(0, 1)) === 10 && E.cardPoints(card(9, 2)) === 10 && E.cardPoints(card(4, 3)) === 5 && E.cardPoints(card(12, 0)) === 0, 'aces and tens 10, fives 5, nothing else: 100 in the cards');
  ok(S0.phase === 'bid' && S0.turn === 1 && S0.target === 505 && E.newMatch(rng(1), 1165, 0).target === 1165 && E.newMatch(rng(1), 999, 0).target === 505, 'bidding starts left of the dealer; the match runs to 505 or 1165');

  // Bidding: from 100 in fives up to 165, a pass is final, the last bidder declares
  let S = E.newMatch(rng(2), 505, 0);
  ok(!E.bid(S, 1, 95) && !E.bid(S, 1, 102) && !E.bid(S, 2, 100) && E.bid(S, 1, 100) && S.turn === 2, 'the first bid is at least 100, in fives, in turn');
  ok(!E.bid(S, 2, 100) && E.bid(S, 2, 110) && E.pass(S, 3) && E.pass(S, 0) && S.turn === 1, 'a bid must top the last one; passing players are skipped');
  ok(E.pass(S, 1) && S.phase === 'widow' && S.declarer === 2 && S.high === 110 && S.hands[2].length === 16 && S.widow.length === 0, 'when the others have passed, the highest bidder takes the widow');
  ok(!E.bid(S, 3, 115) && !E.pass(S, 3), 'a pass is final');
  S = E.newMatch(rng(3), 505, 0);
  ok(E.bid(S, 1, 165) && S.phase === 'widow' && S.declarer === 1, 'a bid of 165 ends the auction at once');
  S = E.newMatch(rng(4), 505, 0);
  E.pass(S, 1); E.pass(S, 2); E.pass(S, 3);
  ok(S.phase === 'bid' && S.turn === 0 && E.pass(S, 0) && S.phase === 'redeal' && S.dealer === 1, 'when all four pass, the next dealer deals again');
  E.newHand(S, rng(5), true);
  ok(S.handNo === 1 && S.phase === 'bid' && all(S) === deck, 'a redeal keeps the hand number');

  // The widow: four cards back, counted as the declarer's first trick
  S = E.newMatch(rng(6), 505, 3);
  E.bid(S, 0, 100); E.pass(S, 1); E.pass(S, 2); E.pass(S, 3);
  const h16 = S.hands[0].slice(), back = [h16[0], h16[1], h16[2], h16[3]];
  ok(!E.bury(S, [h16[0], h16[0], h16[1], h16[2]]) && !E.bury(S, back.slice(0, 3)) && !E.bury(S, [card(0, 0), card(0, 1), card(0, 2), S.hands[1][0]]), 'exactly four different cards of the declarer\'s own');
  ok(E.bury(S, back) && S.hands[0].length === 12 && S.taken[0] === 5 + E.sumPoints(back) && S.phase === 'trump', 'the four put back score 5 and their points for the declarer\'s team');
  ok(!E.chooseTrump(S, 4) && E.chooseTrump(S, 2) && S.trump === 2 && S.turn === 0 && S.phase === 'play', 'the declarer names trump and leads');

  // Tricks: follow suit, the highest trump wins, else the highest of the suit led, aces high
  ok(E.trickBest([{ p: 0, c: card(12, 0) }, { p: 1, c: card(0, 0) }, { p: 2, c: card(1, 2) }, { p: 3, c: card(5, 1) }], 2).p === 2, 'a trump beats an ace of the suit led');
  ok(E.trickBest([{ p: 0, c: card(12, 0) }, { p: 1, c: card(0, 0) }, { p: 2, c: card(1, 1) }, { p: 3, c: card(5, 0) }], 2).p === 1, 'without trump, the ace of the suit led wins');
  const F = { phase: 'play', turn: 1, trick: [{ p: 0, c: card(3, 0) }], hands: [[], [card(5, 0), card(2, 2)], [], []] };
  ok(E.legal(F, 1).length === 1 && E.legal(F, 1)[0] === card(5, 0), 'you must follow suit');

  // Scoring, on fixed outcomes
  const sc = (bid, made, tricks12) => { const T = { declarer: 1, high: bid, taken: [165 - made, made], tricks: [12 - tricks12, tricks12], score: [0, 0], target: 505, dealer: 0 }; E.score(T); return T.lastHand.delta; };
  ok(sc(120, 125, 9).join() === '40,125', 'made: the declarer\'s team scores all it took (125), the others theirs (40)');
  ok(sc(120, 90, 7).join() === '75,-120', 'down but ahead of the others: minus the bid');
  ok(sc(120, 70, 5).join() === '95,-240', 'down and behind the others: minus twice the bid');
  ok(sc(165, 165, 12).join() === '0,330', 'a shelem, every trick: 330');
  const End = { declarer: 0, high: 100, taken: [120, 45], tricks: [8, 4], score: [400, 300], target: 505, dealer: 0 }; E.score(End);
  const Tie = { declarer: 0, high: 100, taken: [110, 55], tricks: [8, 4], score: [400, 455], target: 505, dealer: 0 }; E.score(Tie);
  ok(End.done && End.winner === 0 && !Tie.done && Tie.phase === 'handover', 'a team past the target wins; level scores past it play on');

  // Bots play whole matches: legal, every hand's points add up to 165, and the levels differ
  const match = (levels, seed, target) => {
    const r = rng(seed), M = E.newMatch(r, target || 505, seed % 4); let hands = 0, made = 0, bad = 0;
    for (let g = 0; g < 400 && !M.done; g++) {
      if (M.phase === 'redeal') { E.newHand(M, r, true); continue; }
      if (M.phase === 'handover') { E.newHand(M, r); continue; }
      if (M.phase === 'bid') { while (M.phase === 'bid') { const p = M.turn, m = E.aiBid(M, p, levels[E.team(p)], r); if (m.bid ? !E.bid(M, p, m.bid) : !E.pass(M, p)) return null; } continue; }
      if (M.phase === 'widow') { const d = M.declarer, tr = E.aiTrump(M.hands[d]); if (!E.bury(M, E.aiBury(M.hands[d], tr)) || !E.chooseTrump(M, tr)) return null; continue; }
      let res = null;
      while (!res) { const p = M.turn, o = E.play(M, p, E.aiPlay(M, p, levels[E.team(p)], r)); if (!o) return null; res = o.hand; }
      if (res.made + res.other !== 165) bad++;
      hands++; if (!res.set) made++;
    }
    return { winner: M.winner, hands, made, bad, done: M.done };
  };
  const mm = [];
  for (let i = 0; i < 40; i++) mm.push(match(['medium', 'medium'], 100 + i));
  ok(mm.length === 40 && mm.every((m) => m && m.done && m.bad === 0), 'every bot move is legal, every hand\'s points add up to 165 and all 40 matches end');
  const hn = mm.reduce((a, m) => a + m.hands, 0), mk = mm.reduce((a, m) => a + m.made, 0);
  ok(hn / 40 >= 4 && hn / 40 <= 10 && mk / hn >= 0.6, 'a match to 505 takes 4 to 10 hands (' + (hn / 40).toFixed(1) + ') and bots make most contracts (' + Math.round(mk / hn * 100) + ' %)');
  let he = 0;
  for (let i = 0; i < 60; i++) { const sw = i % 2, m = match(sw ? ['easy', 'hard'] : ['hard', 'easy'], 3000 + i); if (m && m.winner === (sw ? 1 : 0)) he++; }
  ok(he >= 42, 'hard beats easy in at least 42 of 60 matches (' + he + '; 182 of 200 when measured)');

  // Page: shared cards, options behind a gear, the daily seeded, the table not mirrored
  ok(/C\.cards\.el\(c, cls\)/.test(html) && /C\.ui\.fly\(/.test(html) && /C\.ui\.sendTo\(/.test(html), 'the cards are Chogan.cards and they move with the shared motion helpers');
  ok(/function showSettings\(\)/.test(html) && /C\.t\('matchLen'\) \}\), seg2\]/.test(html) && /C\.cards\.speedRow\(\)/.test(html), 'level, match length and speed are behind the gear');
  ok(/C\.daily\('shelem', daily\)\.rng/.test(html) && /newMatch\('hard', 505, dailyDate\)/.test(html), 'the daily hand is dealt from the day\'s seed against the hard bots');
  ok(/\.sh-table \{ direction: ltr;/.test(html) && /\.sh-hand \{ direction: ltr;/.test(html), 'the table and the hand are not mirrored in Persian');

  // Identity
  const gm = games.find((g) => g.id === 'shelem');
  ok(!!gm && gm.cat === 'cards' && gm.daily !== false && gm.name.fa === 'شلم', 'games.json lists it under card games');
  ok(!!gm && html.match(/accent: '([^']+)'/)[1] === gm.color, 'games.json and the page share the accent');
  const icon = fs.readFileSync(path.join(ROOT, 'www/games/shelem/icon.svg'), 'utf8');
  ok(!!gm && new RegExp('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon), 'the icon starts on the soft tint of games.json');
  const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
  const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const lab = (x) => {
    const [Rr, G, Bl] = rgb(x).map(lin), f = (q) => q > 0.008856 ? Math.cbrt(q) : 7.787 * q + 16 / 116;
    const X = (Rr * 0.4124 + G * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + G * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + G * 0.1192 + Bl * 0.9505) / 1.08883;
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  };
  const dE = (a, b) => { const A = lab(a), Q = lab(b); return Math.hypot(A[0] - Q[0], A[1] - Q[1], A[2] - Q[2]); };
  const lum = (x) => rgb(x).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
  const near = games.filter((g) => g.id !== 'shelem').map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0];
  ok(near[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5, 'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + ') and keeps white text at 4.5:1');
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  ok(['sh-win', 'sh-hard', 'sh-shelem'].every((id) => new RegExp("\\{ id: '" + id + "',[^\\n]*dde: '[^\\n]*des: '").test(core) && html.indexOf("unlock('" + id + "')") > 0), 'the three Shelem awards exist in every language and are unlocked');
  ok(Date.now() - t0 < 12000, 'the Shelem tests finish in under 12 s (' + (Date.now() - t0) + ' ms)');
}

function testHokmFit() {
  head('Hokm: the cards leave room for the rest of the page (#427)');
  // The card size reserved 340px for everything but the trick; the rest is about
  // 350px, so a 1280x688 window (1920x1080 at 150 %) overflowed by 5px and showed a
  // scrollbar. Measured with Playwright in the play phase, from 600 to 1000px tall.
  const html = fs.readFileSync(path.join(ROOT, 'www/games/hokm/index.html'), 'utf8');
  const m = html.match(/\.hk-wrap \{ --cw: clamp\(40px, min\(12\.8cqw, \(100cqh - (\d+)px\) \/ 6\), 110px\);/);
  ok(!!m, 'Hokm sizes its cards from the game area\'s height');
  ok(!!m && +m[1] >= 360, 'the height reserved beside the trick is at least 360px (' + (m && m[1]) + ')');
  const sh = fs.readFileSync(path.join(ROOT, 'www/games/shelem/index.html'), 'utf8');
  ok(/\.sh-wrap \{ --cw: clamp\(40px, min\(12\.8cqw, \(100cqh - 360px\) \/ 6\), 104px\);/.test(sh), 'Shelem, on the same table, reserves the same');
}

function testMahjongStacked() {
  head('Mahjong: a shuffle frees two last tiles stacked on each other (#452)');
  // With the last pair stacked, only the top tile was free; the shuffle re-dealt the faces
  // over the same two places, found no solvable deal and did nothing, so the game could
  // not be finished.
  const E = loadEngine('mahjong', 'MahjongEngineFactory');
  const rng = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
  let cases = 0, freed = 0, finished = 0, undone = 0;
  for (const layout of ['small', 'medium', 'turtle']) {
    const pos = E.LAYOUTS[layout];
    // every place on the first floor with a ground place right under it
    const stacks = [];
    pos.forEach((p, j) => { if (p[2] !== 1) return; const i = pos.findIndex((q) => q[2] === 0 && q[0] === p[0] && q[1] === p[1]); if (i >= 0) stacks.push([i, j]); });
    for (const [i, j] of stacks.slice(0, 6)) {
      const S = E.deal(layout, rng(7 + i));
      S.gone = pos.map((_, k) => k !== i && k !== j);
      S.faces[i] = 5; S.faces[j] = 5;
      cases++;
      if (E.freePairs(S).length) continue;
      const before = JSON.stringify({ g: S.gone, f: S.faces });
      const order = E.reshuffle(S, rng(99 + j));
      if (!order) continue;
      if (E.freePairs(S).length && E.left(S) === 2) freed++;
      const U = JSON.parse(JSON.stringify(S)); E.undo(U);
      if (JSON.stringify({ g: U.gone, f: U.faces }) === before && U.shuffles === 0) undone++;
      for (const [a, b] of order) E.remove(S, a, b);
      if (S.done) finished++;
    }
  }
  ok(cases >= 10, 'stacked last pairs were set up in all three layouts (' + cases + ')');
  ok(freed === cases, 'the shuffle leaves a free pair every time (' + freed + ' of ' + cases + ')');
  ok(finished === cases, 'and the game can then be finished (' + finished + ' of ' + cases + ')');
  ok(undone === cases, 'undo puts the tiles back where they were (' + undone + ' of ' + cases + ')');
}

function testKeyboardNav() {
  head('Keyboard: menu cards and the way back (#206)');
  // The menu's game cards were divs with only a click handler, so a keyboard
  // could not reach them, and a game had no key back to the menu.
  const menu = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
  const cardLine = (menu.match(/class: 'ch-card ch-game [^\n]*/) || [''])[0];
  ok(cardLine.length > 0, 'game card class line found in the menu');
  ok(/tabindex: '0'/.test(cardLine) && /ch-kbnav/.test(cardLine), 'game cards take keyboard focus and join arrow navigation');

  const at = menu.indexOf('function kbStep(from, key) {');
  ok(at > 0, 'kbStep found in the menu');
  let depth = 0, end = at;
  for (let i = menu.indexOf('{', at); at > 0 && i < menu.length; i++) {
    if (menu[i] === '{') depth++;
    else if (menu[i] === '}' && --depth === 0) { end = i + 1; break; }
  }
  // A two-column grid of 100x80 cards, plus a wide hero above it
  const box = (name, left, top, w, h) => ({ name, getBoundingClientRect: () => ({ left, top, width: w, height: h }) });
  const hero = box('hero', 0, 0, 210, 60);
  const a = box('a', 0, 100, 100, 80), b = box('b', 110, 100, 100, 80);
  const c = box('c', 0, 190, 100, 80), d = box('d', 110, 190, 100, 80);
  const all = [hero, a, b, c, d];
  const app = { querySelectorAll: () => all };
  let kbStep = () => undefined;
  try { if (at > 0) kbStep = vm.runInNewContext('(function (app) { ' + menu.slice(at, end) + ' return kbStep; })', {})(app); }
  catch (e) { ok(false, 'kbStep did not run: ' + e.message); }
  const name = (n) => (n ? n.name : 'none');
  ok(name(kbStep(a, 'ArrowRight')) === 'b', 'right from the first card is its row neighbour');
  ok(name(kbStep(b, 'ArrowLeft')) === 'a', 'left goes back along the row');
  ok(name(kbStep(a, 'ArrowDown')) === 'c', 'down stays in the same column');
  ok(name(kbStep(d, 'ArrowUp')) === 'b', 'up stays in the same column');
  ok(name(kbStep(a, 'ArrowUp')) === 'hero', 'up from the top row reaches the daily card');
  ok(name(kbStep(c, 'ArrowDown')) === 'none', 'down from the last row stays put');

  // Escape and Backspace leave a game only if no game listener used the key
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const backAt = core.indexOf("if (e.key !== 'Escape' && e.key !== 'Backspace') return;");
  ok(backAt >= 0, 'the game bar listens for Escape and Backspace');
  const back = backAt >= 0 ? core.slice(backAt) : '';
  ok(/if \(!e\.defaultPrevented && !document\.querySelector\('\.ch-scrim'\)\) backBtn\.click\(\);/.test(back.slice(0, 900)),
    'it goes back only when the key was not consumed and no dialog is open');
  // Every game that gives Escape or Backspace a meaning must consume it, or the
  // same press would also leave the game
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  ok(games.length > 0, 'games.json lists games');
  let uses = 0;
  games.forEach((g) => {
    const html = fs.readFileSync(path.join(ROOT, 'www/games', g.id, 'index.html'), 'utf8');
    const re = /k === '(Escape|Backspace)'/g;
    let m;
    while ((m = re.exec(html))) {
      uses++;
      ok(/preventDefault\(\)/.test(html.slice(m.index, m.index + 220)), g.id + ': its ' + m[1] + ' handler consumes the key');
    }
  });
  ok(uses >= 9, 'found the games that handle Escape or Backspace (' + uses + ')');
}

function testMenuSelect() {
  head('Menu text is not selectable (#208)');
  // In the installed app, Ctrl+A or a drag painted the menu titles and the
  // bottom bar selection-blue
  const menu = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8');
  ok(/<body class="ch-menu">/.test(menu), 'the menu page body carries ch-menu');
  ok(/\nbody\.ch-menu \{[^}]*\buser-select: none;/.test(css), 'body.ch-menu turns text selection off');
  ok(/body\.ch-menu input, body\.ch-menu textarea[^{]*\{[^}]*\buser-select: text;/.test(css), 'fields inside the menu stay selectable');
}

/* ------------------------------------------------ Telegram release post (#258) */
// English-speaking players had no way to hear about a release.
function testTelegramPost() {
  head('Releases are posted to the Telegram channel (#258, #263)');
  // Release notes are sections with bullets (owner's wish, #265): one source for F-Droid, Play, GitHub and Telegram
  const clDir = path.join(ROOT, 'fastlane/metadata/android/en-US/changelogs');
  const cls = fs.readdirSync(clDir).filter((f) => /^\d+\.txt$/.test(f));
  ok(cls.length >= 25, 'English changelogs found (' + cls.length + ')');
  const badCl = cls.filter((f) => spawnSync('python3', [path.join(ROOT, 'tools/release-notes.py'), '--check', path.join(clDir, f)], { encoding: 'utf8' }).status !== 0);
  ok(!badCl.length, 'every English changelog is New games / Bug fixes / Improvements with bullets, under 500 characters' + (badCl.length ? ' (' + badCl.join(', ') + ')' : ''));
  const md = spawnSync('python3', [path.join(ROOT, 'tools/release-notes.py'), '--md', path.join(clDir, '24.txt')], { encoding: 'utf8' }).stdout;
  ok(/^- \*\*New games\*\*\n  - Way Out/.test(md) && /\n- \*\*Improvements\*\*\n  - /.test(md), 'GitHub notes are nested bullets under bold sections');
  const bad = path.join(os.tmpdir(), 'chogan-cl-' + process.pid + '.txt');
  fs.writeFileSync(bad, 'Improvements:\n- a\nNew games:\n- b\n');
  ok(spawnSync('python3', [path.join(ROOT, 'tools/release-notes.py'), '--check', bad], { encoding: 'utf8' }).status === 1, 'a changelog with sections out of order is refused');
  fs.unlinkSync(bad);
  const relYml = fs.readFileSync(path.join(ROOT, '.github/workflows/release.yml'), 'utf8');
  ok(/python3 tools\/release-notes\.py --md "fastlane\/metadata\/android\/en-US\/changelogs\/\$\{VERSION_CODE\}\.txt"/.test(relYml), 'release.yml writes the GitHub notes through the formatter');
  const script = path.join(ROOT, 'tools/telegram-post.sh');
  ok(fs.existsSync(script) && fs.existsSync(path.join(ROOT, 'tools/game-shots.sh')), 'tools/telegram-post.sh and tools/game-shots.sh exist');
  if (!fs.existsSync(script)) return;
  const tags = (spawnSync('git', ['tag', '-l', 'v*', '--sort=v:refname'], { cwd: ROOT, encoding: 'utf8' }).stdout || '').split('\n').filter((t) => t && !/-test$/.test(t));
  ok(tags.length >= 25, 'release tags are present (' + tags.length + '; CI must check out with fetch-depth: 0)');
  if (!tags.length) return;
  const env = Object.assign({}, process.env, { DRY_RUN: '1', TELEGRAM_BOT_TOKEN: '' });
  const run = (args, extra) => spawnSync('bash', [script].concat(args), { cwd: ROOT, env: Object.assign({}, env, extra || {}), encoding: 'utf8' });
  // The history is the channel's changelog: every release once, oldest first
  const hist = run(['--history']);
  ok(hist.status === 0, 'a dry run of the history exits 0 (' + hist.status + ')');
  const posted = ((hist.stdout || '').match(/^=== (v\S+)/gm) || []).map((l) => l.slice(4));
  ok(posted.join() === tags.join(), 'the history posts every release once, oldest first (' + posted.length + ' of ' + tags.length + ')');
  const block = (t) => ((hist.stdout || '').split(/^(?==== )/m).find((b) => b.indexOf('=== ' + t + ' ') === 0) || '');
  // A release that added games shows a picture of each: the git diff of games.json decides which
  ok(/with pictures: tower-defence sudoku minesweeper dots\n/.test(block('v0.1.0')), 'the first release shows its four games');
  ok(/with pictures: backgammon battleship breakout bridges freecell mancala mastermind morris nonogram peg reversi\n/.test(block('v0.3.0')), '0.3.0 shows its eleven new games (two albums)');
  ok(/with pictures: blackjack wayout\n/.test(block('v0.5.1')) && /<b>New games<\/b>\n• Way Out[^\n]*\n• Blackjack/.test(block('v0.5.1')), '0.5.1 shows Blackjack and Way Out and lists them under New games');
  ok(!/with pictures/.test(block('v0.5.2')) && !/New games/.test(block('v0.5.2')), 'a release without new games has no pictures and no New games section');
  ok(/^<b>Chogan 0\.5\.1<\/b> · 17 October 2026$/m.test(block('v0.5.1')), 'each post names its version and real release date');
  // The post is the sectioned changelog from the working tree, as HTML (#265)
  const html = spawnSync('python3', [path.join(ROOT, 'tools/release-notes.py'), '--html', path.join(ROOT, 'fastlane/metadata/android/en-US/changelogs/24.txt')], { encoding: 'utf8' }).stdout.trim();
  ok(html.length > 0 && block('v0.5.1').indexOf(html) > 0, 'the post carries the release\'s sectioned changelog');
  // The links are buttons (owner's wish), so they must parse as Telegram's inline keyboard
  const btnLine = (block('v0.5.1').match(/^\[buttons\] (.*)$/m) || [])[1] || '';
  let kb = null; try { kb = JSON.parse(btnLine); } catch (e) { kb = null; }
  const urls = kb && Array.isArray(kb.inline_keyboard) ? [].concat(...kb.inline_keyboard).map((b) => b.text && b.url) : [];
  ok(urls.join() === ['https://choganhq.github.io/chogan/', 'https://github.com/choganhq/chogan/releases/tag/v0.5.1', 'https://f-droid.org/packages/io.github.choganhq.chogan/'].join(), 'the post has buttons for the web, this release and F-Droid');
  ok(!/https?:\/\//.test(block('v0.5.1').replace(/^\[(buttons|cover)\].*$/gm, '').replace(/<a href="https:\/\/github\.com\/[A-Za-z0-9-]+">@[A-Za-z0-9-]+<\/a>/g, '')), 'no bare links in the text; they are buttons (only a contributor\'s name links to their profile)');
  // A contributor is credited on the line of their change, linked to their profile (owner's wish, #530, #533)
  ok(/\n• Chinese chess, thanks to <a href="https:\/\/github\.com\/lanlan3292">@lanlan3292<\/a>\n/.test(block('v0.18.0')) && /• Way Out: [^\n]*, thanks to <a href="https:\/\/github\.com\/ggYasin">@ggYasin<\/a>\n/.test(block('v0.5.1')) && !/<b>Thanks to<\/b>/.test(hist.stdout || '') && !/@margani/.test(hist.stdout || ''),
    'the credit sits on the change\'s own line, linked, never as a line of its own at the end, and never the owner');
  const cl39 = path.join(clDir, '39.txt');
  const mdT = spawnSync('python3', [path.join(ROOT, 'tools/release-notes.py'), '--md', cl39], { encoding: 'utf8' }).stdout;
  ok(/\n  - Chinese chess, thanks to \[@lanlan3292\]\(https:\/\/github\.com\/lanlan3292\)\n/.test(mdT), 'the GitHub notes link the name on the same line');
  const tricky = path.join(os.tmpdir(), 'chogan-cl-at-' + process.pid + '.txt');
  fs.writeFileSync(tricky, 'Improvements:\n- mail a@b.c and @x"><b and @ok-name\n');
  const tH = spawnSync('python3', [path.join(ROOT, 'tools/release-notes.py'), '--html', tricky], { encoding: 'utf8' }).stdout;
  fs.unlinkSync(tricky);
  ok(/a@b\.c/.test(tH) && /<a href="https:\/\/github\.com\/x">@x<\/a>&quot;&gt;&lt;b/.test(tH) && /<a href="https:\/\/github\.com\/ok-name">@ok-name<\/a>/.test(tH) && !/"><b/.test(tH.replace(/<a href="[^"]*">/g, '')),
    'only a login after @ becomes a link; an email stays text and nothing can break out of the link');
  // Every contributor git can name is credited in the changelog of the release that carries their work
  const missing = [];
  for (const t of tags) {
    const r = spawnSync('bash', [path.join(ROOT, 'tools/contributors.sh'), t], { cwd: ROOT, env: Object.assign({}, process.env, { CONTRIBUTORS_OFFLINE: '1' }), encoding: 'utf8' });
    const who = (r.stdout || '').split('\n').filter(Boolean);
    if (!who.length) continue;
    const code = (spawnSync('git', ['show', t + ':www/version.js'], { cwd: ROOT, encoding: 'utf8' }).stdout.match(/APP_VERSION_CODE = (\d+)/) || [])[1];
    const f = path.join(clDir, code + '.txt'), text = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
    who.filter((w) => text.indexOf('@' + w) < 0).forEach((w) => missing.push(t + ' ' + w));
  }
  const contrib = spawnSync('bash', [path.join(ROOT, 'tools/contributors.sh'), 'v0.18.0'], { cwd: ROOT, env: Object.assign({}, process.env, { CONTRIBUTORS_OFFLINE: '1' }), encoding: 'utf8' });
  ok(contrib.status === 0 && contrib.stdout === 'lanlan3292\n' && !missing.length, 'tools/contributors.sh names a release\'s contributors, and each is credited in its changelog' + (missing.length ? ' (missing: ' + missing.join(', ') + ')' : ''));
  // Older posts are rewritten in place, so the channel keeps its order and nobody gets a new notification (#533)
  const ed = run(['--edit', '90', 'v0.18.0']);
  const edText = (ed.stdout || '').replace(/^=== .*\n/, '');
  ok(ed.status === 0 && /^=== edit message 90 to v0\.18\.0\n/.test(ed.stdout || '') && edText.trim() === block('v0.18.0').replace(/^=== .*\n/, '').trim(),
    'an edit dry run rewrites the given message with exactly the release\'s post');
  ok(run(['--edit', '90']).status === 2 && run(['--edit', '90', 'v9.9.9']).status === 2, 'an edit without a message or with an unknown tag cannot run');
  const tgYml = fs.readFileSync(path.join(ROOT, '.github/workflows/telegram.yml'), 'utf8');
  ok(/options: \[release, history, edit, delete, photo, bot-photo\]/.test(tgYml) && /edit\)\s+tools\/telegram-post\.sh --edit "\$MESSAGE_ID" "\$TAG"/.test(tgYml), 'telegram.yml offers the edit');
  let cover = null; try { cover = JSON.parse((block('v0.5.1').match(/^\[cover\] (.*)$/m) || [])[1]); } catch (e) { cover = null; }
  ok(!!cover && cover.url === 'https://github.com/choganhq/chogan/releases/tag/v0.5.1' && cover.prefer_large_media === true && cover.show_above_text === true, 'the cover is the release\'s GitHub card, large, above the text');
  const long = tags.filter((t) => block(t).replace(/^(===|\[buttons\]|\[cover\]).*$/gm, '').trim().length > 4096);
  ok(!long.length, 'every post fits Telegram\'s 4096-character message' + (long.length ? ' (' + long.join(', ') + ')' : ''));
  // Telegram takes 2 to 10 pictures an album; eleven new games once went out as 10 + 1
  const sizeExpr = ((fs.readFileSync(script, 'utf8').match(/size=\$\(\( (.*) \)\)/) || [])[1] || '');
  const splits = [];
  for (let n = 2; n <= 40; n++) {
    const size = Number(spawnSync('bash', ['-c', 'n=' + n + '; echo $(( ' + sizeExpr + ' ))'], { encoding: 'utf8' }).stdout);
    const groups = []; for (let i = 0; i < n; i += size) groups.push(Math.min(size, n - i));
    if (!(size > 0) || groups.some((g) => g < 2 || g > 10)) splits.push(n + ':' + groups.join('+'));
  }
  ok(sizeExpr.length > 0 && !splits.length, 'every album has 2 to 10 pictures, for 2 to 40 new games' + (splits.length ? ' (' + splits.join(', ') + ')' : ''));
  // The fake curl above could not see curl's own parsing: -F "chat_id=@chogan_games"
  // made the real curl read a file named chogan_games and fail (#267). The real curl
  // talks to a local server here, and the fields must arrive as sent.
  const reqLog = path.join(os.tmpdir(), 'chogan-tg-' + process.pid + '.log'), portFile = reqLog + '.port';
  const srvCode = "import http.server,sys\nclass H(http.server.BaseHTTPRequestHandler):\n  def do_POST(s):\n    b=s.rfile.read(int(s.headers.get('Content-Length') or 0))\n    open(sys.argv[1],'ab').write(s.path.encode()+b'\\n'+b+b'\\n----\\n')\n    s.send_response(200);s.send_header('Content-Type','application/json');s.end_headers();s.wfile.write(b'{\"ok\":true,\"result\":{\"message_id\":1}}')\n  def log_message(s,*a): pass\nv=http.server.HTTPServer(('127.0.0.1',0),H)\nopen(sys.argv[2],'w').write(str(v.server_port))\nv.serve_forever()\n";
  const srv = spawn('python3', ['-c', srvCode, reqLog, portFile], { stdio: 'ignore' });
  for (let i = 0; i < 50 && !fs.existsSync(portFile); i++) spawnSync('sleep', ['0.1']);
  const port = fs.existsSync(portFile) ? fs.readFileSync(portFile, 'utf8').trim() : '';
  ok(/^\d+$/.test(port), 'a local stand-in for Telegram is listening (' + port + ')');
  if (port) {
    const live = { DRY_RUN: '0', TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_API: 'http://127.0.0.1:' + port };
    const ph = run(['--set-photo'], live), msg = run(['v0.5.2'], live), bp = run(['--bot-photo'], live);
    const got = fs.existsSync(reqLog) ? fs.readFileSync(reqLog, 'latin1') : '';
    ok(ph.status === 0 && /\/botT\/setChatPhoto/.test(got) && /name="chat_id"\r\n\r\n@chogan_games\r\n/.test(got) && /filename="icon-512\.png"/.test(got), 'the channel photo request carries @chogan_games as text and the icon as a file (' + ph.status + ' ' + (ph.stderr || '').trim() + ')');
    // setMyProfilePhoto takes a static JPG named in a JSON field (#269)
    ok(bp.status === 0 && /\/botT\/setMyProfilePhoto/.test(got) && /name="photo"\r\n\r\n\{"type":"static","photo":"attach:\/\/pic"\}\r\n/.test(got) && /name="pic"; filename="telegram-bot-photo\.jpg"\r\nContent-Type: image\/jpeg/.test(got), 'the bot photo request sends the icon as a static JPG (' + bp.status + ' ' + (bp.stderr || '').trim() + ')');
    ok(msg.status === 0 && /\/botT\/sendMessage/.test(got) && /chat_id=%40chogan_games/.test(got) && /parse_mode=HTML/.test(got) && /reply_markup=/.test(got), 'the release post reaches Telegram with the channel, HTML and the buttons');
  }
  srv.kill();
  for (const f of [reqLog, portFile]) if (fs.existsSync(f)) fs.unlinkSync(f);
  const wrong = run(['v0.0.0']);
  ok(wrong.status === 2 && /No release tag/.test(wrong.stderr), 'an unknown tag cannot be posted (exit 2)');
  const noTok = run(['v0.5.2'], { DRY_RUN: '0' });
  ok(noTok.status === 2 && /TELEGRAM_BOT_TOKEN is not set/.test(noTok.stderr), 'without the token it says so and exits 2 instead of passing');
  const src = fs.readFileSync(script, 'utf8');
  ok(!/(echo|printf)[^\n]*TELEGRAM_BOT_TOKEN\}/.test(src) && !/set -[a-z]*x/.test(src), 'the token is never printed');
  const rel = fs.readFileSync(path.join(ROOT, '.github/workflows/release.yml'), 'utf8');
  const job = rel.slice(rel.indexOf('\n  announce:'));
  ok(job.length > 20 && /needs: apk/.test(job) && /!endsWith\(github\.ref_name, '-test'\)/.test(job), 'release.yml posts after the APK is published, never for -test tags');
  ok(/fetch-depth: 0/.test(job) && /TELEGRAM_BOT_TOKEN: \$\{\{ secrets\.TELEGRAM_BOT_TOKEN \}\}/.test(job) && /tools\/telegram-post\.sh "\$GITHUB_REF_NAME"/.test(job), 'the announce job has the tags, the secret and the tag name');
  const man = fs.readFileSync(path.join(ROOT, '.github/workflows/telegram.yml'), 'utf8');
  ok(/options: \[release, history, edit, delete, photo, bot-photo\]/.test(man) && /dry_run:[\s\S]*?default: true/.test(man), 'the manual workflow offers release, history, edit, delete and photo, dry run by default');
}

function testModalFocus() {
  head('Dialogs focus their primary action (#210)');
  // The game-over dialog focused Share, its first button, so Enter shared
  // instead of playing again
  const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
  const line = (core.match(/var focusable = [^;]*;/) || [''])[0];
  ok(line.length > 0, 'the dialog focus line was found');
  ok(line.indexOf("o.focusPrimary && box.querySelector('.ch-modal__actions .ch-btn--primary')") >= 0 &&
    line.indexOf('focusPrimary') < line.indexOf("'.ch-modal__actions button'"),
    'a dialog that asks for it focuses its primary action first');
  ok(/label: o\.againLabel \|\| Chogan\.t\('again'\), kind: 'primary'/.test(core), 'Again (or the game\'s own label for it) is the primary action of the game-over dialog');
  ok(/actions: actions,\s*focusPrimary: true,\s*dismissable: false,\s*closeButton: true,\s*onClose: function \(via\) \{ if \(via !== 'action'\) \{ showResultBtn\(\); showAfterBar\(o\); \} \}/.test(core),
    'the game-over dialog asks for it');
  // #306: closing the result with X left Way Out on an empty board with no way on
  const bar = (core.match(/function showAfterBar\(o\) \{[\s\S]*?\n    \}\n/) || [''])[0];
  ok(/o\.againLabel \|\| Chogan\.t\('again'\), fn: o\.onAgain/.test(bar) && /Chogan\.t\('menu'\)/.test(bar) && /reopenResult\(\)/.test(bar) && /document\.body\.appendChild\(afterBar\)/.test(bar),
    'after X, a bar offers the result again and the next round (or the menu)');
  // #315: the X that shows the finished board went unnoticed, so the window names it
  const fin = (core.match(/finish: function \(o\) \{[\s\S]*?\n      \},\n/) || [''])[0];
  ok(fin.length > 0, 'the finish function was found');
  ok(/el\('button', \{ class: 'ch-btn ch-btn--ghost ch-seeboard'[\s\S]*?shown\.close\('board'\)[\s\S]*?Chogan\.t\('seeBoard'\)/.test(fin) && /body\.push\(el\('button'/.test(fin) && /return \(shown = ui\.modal\(/.test(fin),
    'the result window has a See the board button that closes it like X, not like an action');
  const locales = [...core.matchAll(/result: '[^']+', seeBoard: '([^']+)'/g)].map((m) => m[1]);
  ok(locales.length === LOCALE_CODES.length && new Set(locales).size === LOCALE_CODES.length, 'See the board is translated in every language (' + locales.length + ')');
  ok(/\n    eye: 'M/.test(core), 'the eye icon exists');
  ok(/function hideResultBtn\(\) \{\n[^\n]*resultBtn\.hidden = true;\n[^\n]*afterBar\.remove\(\)/.test(core), 'the bar goes away when a new round starts');
  const relabel = games.filter((g) => /ch-modal__actions \.ch-btn--primary/.test(fs.readFileSync(path.join(ROOT, 'www', g.path), 'utf8'))).map((g) => g.id);
  ok(relabel.length === 0, 'no game rewrites the result button text after the fact; they pass againLabel (' + relabel.join(',') + ')');
  const confirmAt = core.indexOf('ui.confirm = function');
  ok(confirmAt > 0 && core.slice(confirmAt, core.indexOf('ui.reduceMotion')).indexOf('focusPrimary') < 0,
    'confirms keep focus on Cancel, so Enter cannot start over by accident');
  // #335: Tab walked out of an open dialog onto the buttons of the page behind it
  const modal = core.slice(core.indexOf('ui.modal = function'), confirmAt);
  const onKey = (modal.match(/function onKey\(e\) \{[\s\S]*?\n    \}\n/) || [''])[0];
  ok(/e\.key === 'Tab'/.test(onKey) && /open\[open\.length - 1\] !== scrim/.test(onKey), 'Tab is handled by the topmost dialog only');
  ok(/e\.shiftKey && \(at === first \|\| !inside\)\) \{ e\.preventDefault\(\); last\.focus\(\); \}/.test(onKey) &&
    /!e\.shiftKey && \(at === last \|\| !inside\)\) \{ e\.preventDefault\(\); first\.focus\(\); \}/.test(onKey),
    'Tab and Shift+Tab wrap around inside the dialog');
}

// A worker started by cueFrames() plays its share of AI frames and stops here (#297)
if (!isMainThread && workerData && workerData.cueGame) {
  const d = workerData;
  for (let i = d.from; i < d.jobs.length; i += d.step) {
    const r = cueFrameJob(d.cueGame, d.jobs[i]);
    d.out[1 + 3 * i] = r.winner; d.out[2 + 3 * i] = r.shots; d.out[3 + 3 * i] = r.bad;
    Atomics.add(d.out, 0, 1);
    Atomics.notify(d.out, 0);
  }
  return;
}

// #569: Minesweeper's and Sudoku's tutorial pictures typed ۱ ۲ and ۱۰ into their SVG, so
// every language saw Persian digits there; digits drawn in a picture go through C.num
function testTutorialDigits() {
  head('Tutorial pictures draw digits in the app language (#569)');
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  ok(games.length > 0, 'the game list is not empty');
  const texts = [], bad = [];
  for (const g of games) {
    const src = fs.readFileSync(path.join(ROOT, 'www', g.path), 'utf8');
    for (const m of src.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)) {
      texts.push(g.id);
      if (/[۰-۹]/.test(m[1])) bad.push(g.id + ' «' + m[1] + '»');
    }
  }
  ok(texts.length > 0, 'SVG text in the games was found (' + texts.length + ')');
  ok(!bad.length, 'no SVG text in a game is a Persian digit literal' + (bad.length ? ' (' + bad.join(', ') + ')' : ''));
  const ms = fs.readFileSync(path.join(ROOT, 'www/games/minesweeper/index.html'), 'utf8');
  const sd = fs.readFileSync(path.join(ROOT, 'www/games/sudoku/index.html'), 'utf8');
  ok(/>' \+ C\.num\(1\) \+ '<\/text>/.test(ms) && />' \+ C\.num\(2\) \+ '<\/text>/.test(ms) && />' \+ C\.num\(10\) \+ '<\/text>/.test(sd), 'the Minesweeper and Sudoku tutorials draw their numbers with C.num');
}

// Every group runs: the runner finds each `function testX()` in this file and calls it in
// the order written, waiting for the ones that return a promise. A new group needs no line
// in a shared list, so two pull requests that each add a game no longer conflict here
// (#493), and a group can't be left out by a missing call. A group that runs no check at
// all fails the run.
const GROUPS = [...fs.readFileSync(__filename, 'utf8').matchAll(/^(?:async )?function (test[A-Za-z0-9]+)\(\) \{/gm)].map((m) => m[1]);
(async function () {
  const idle = [];
  for (const name of GROUPS) {
    const before = checks;
    // a direct eval reaches the group by its name in this module's scope
    await eval(name)();
    if (checks === before) idle.push(name);
  }
  head('کامل بودن اجرا');
  ok(GROUPS.length >= 137, 'every test group was found and run (' + GROUPS.length + ')');
  ok(!idle.length, 'every test group ran at least one check' + (idle.length ? ' (none in: ' + idle.join(', ') + ')' : ''));
  ok(checks >= MIN_CHECKS, 'دست‌کم ' + MIN_CHECKS + ' بررسی اجرا شد (' + checks + ' اجرا شد)');
  console.log('\n' + (failures ? ('✗ ' + failures + ' خطا از ' + checks + ' بررسی') : ('همه‌ی ' + checks + ' بررسی سبز')));
  process.exit(failures ? 1 : 0);
})().catch(function (e) {
  // a group that throws must not look like a finished run
  console.log('\n✗ اجرای تست‌ها نیمه‌کاره ماند: ' + ((e && e.stack) || e));
  process.exit(1);
});
