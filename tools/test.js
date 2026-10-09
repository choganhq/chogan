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
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
// زبان‌های اپ، به همان ترتیب جدول LOCALES در هسته
const LOCALE_CODES = ['fa', 'en', 'zh', 'de'];
let failures = 0;
let checks = 0;
// حداقل تعداد بررسی‌ای که یک اجرای کامل باید داشته باشد. قبلاً اگر یک گروه کامل
// اجرا نمی‌شد — مثلاً با حذف یک خط testSudoku(); نود و نه بررسی از بین رفت — فقط
// مجموع کمتر چاپ می‌شد و باز سبز بود. با اضافه کردن بررسی این عدد را بالا ببر؛
// پایین آوردنش یعنی بررسی‌ای عمداً حذف شده و باید در PR گفته شود.
const MIN_CHECKS = 2217;

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
  ok(/grid-template-rows:\s*repeat\(9,\s*minmax\(0,\s*1fr\)\)/.test(board), 'ردیف‌های تخته‌ی سودوکو هم‌اندازه‌اند، نه به اندازه‌ی محتوا');
  ok(/grid-template-columns:\s*repeat\(9,\s*minmax\(0,\s*1fr\)\)/.test(board), 'ستون‌های تخته‌ی سودوکو هم‌اندازه‌اند، نه به اندازه‌ی محتوا');
  let emptyRow = 0;
  for (let i = 0; i < 40 && !emptyRow; i++) {
    const q = E.makePuzzle(rng(9000 + i), 'expert').puzzle;
    for (let r = 0; r < 9; r++) if (q.slice(r * 9, r * 9 + 9).every((v) => !v)) emptyRow++;
  }
  ok(emptyRow > 0, 'مولد جدولی با ردیف کاملاً خالی هم می‌سازد، پس این حالت واقعی است');

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
  ok(/E\.bestTarget\(S, src, n\)/.test(ui), 'لمس مقصد را از E.bestTarget می‌گیرد');
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
  ok(JSON.stringify(str('', 'youStart')) === JSON.stringify(['تو شروع می‌کنی', 'You start', '你先走', 'Du fängst an']), 'متن youStart در هر چهار زبان درست است');
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
  function autoPlay(seed, order, cap) {
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
        if (!cap) {
          for (let t = 0; t < S.towers.length && !spent; t++) {
            const tw = S.towers[t];
            if (tw.level < 2 && S.money > E.upgradeCost(tw.kind, tw.level) + 140 && E.upgrade(S, tw)) spent = true;
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
  ok(man.name_localized.fa.value === 'چوگان', 'نام فارسی در منیفست درست است');
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
  const sandbox = {
    console,
    skipWaitingCalls: 0,
    importScripts: function () {
      vm.runInContext(verSrc, sandbox);
      if (build) sandbox.self.APP_BUILD = build;
    },
    caches: {
      keys: () => Promise.resolve([]),
      open: (name) => { opened.push(name); return Promise.resolve({ addAll: () => Promise.resolve() }); },
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
  return { sandbox, listeners, opened, deleted, fire };
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
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const en = dictOf(src, 'en') || {}, de = dictOf(src, 'de');
    ok(!!de, f + ': دیکشنری آلمانی دارد');
    if (!de) continue;
    const miss = Object.keys(en).filter((k) => !(k in de));
    ok(Object.keys(en).length > 0 && miss.length === 0, f + ' · de: همه‌ی کلیدهای انگلیسی ترجمه شده' + (miss.length ? ' (' + miss.join(',') + ')' : ''));
    const badHoles = Object.keys(en).filter((k) => k in de && holes(en[k]) !== holes(de[k]));
    ok(badHoles.length === 0, f + ' · de: جای‌نگهدارها با انگلیسی یکی‌اند' + (badHoles.length ? ' (' + badHoles.join(',') + ')' : ''));
  }
  const achLines = core.split('\n').filter((l) => /^\s*\{ id: '[^']+',.*den: '/.test(l));
  ok(achLines.length >= 60, 'فهرست دستاوردها خوانده شد (' + achLines.length + ')');
  const achNoDe = achLines.filter((l) => !/ de: '[^']+', dde: '[^']+'/.test(l)).map((l) => l.match(/id: '([^']+)'/)[1]);
  ok(achNoDe.length === 0, 'همه‌ی دستاوردها عنوان و توضیح آلمانی دارند' + (achNoDe.length ? ' (' + achNoDe.join(',') + ')' : ''));
  // «Du» با فعل سوم‌شخص نمی‌خواند («Du gewinnt»)؛ متنی که نام بازیکن می‌گیرد بی‌فعل صرف‌شده نوشته می‌شود
  const thirdPerson = /\{[an]\} (ist|gewinnt|würfelt|kann|hat|passt|zieht)\b/;
  for (const g of games) {
    const de = dictOf(fs.readFileSync(path.join(ROOT, 'www', g.path), 'utf8'), 'de') || {};
    const bad = Object.keys(de).filter((k) => thirdPerson.test(de[k]));
    ok(bad.length === 0, g.id + ' · de: نام بازیکن با فعل سوم‌شخص نیامده' + (bad.length ? ' (' + bad.join(',') + ')' : ''));
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
  ok(maps.length === 3, 'سه نقشه‌ی ثابت دفاع از برج خوانده شد (' + maps.length + ')');
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
/* ------------------------------------------------------------- پاسور */
function testPasur() {
  head('پاسور');
  const E = loadEngine('pasur', 'PasurEngineFactory');
  const P = (str) => str.split(' ').map(E.parse);
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
  const UI_VALUE = /\[ "\$FA" = "چوگان" \]/;
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
  ok(/class: 'ch-games' \+ \(asList \? '' : ' ch-games--grid'\)/.test(menu), 'فهرست بازی‌ها در حالت پیش‌فرض کلاس ch-games--grid دارد');
  ok(/C\.store\.set\('settings', C\.state\.settings\)/.test(menu.slice(menu.indexOf('var asList'))), 'انتخاب نما در تنظیمات ذخیره می‌شود');
  // قاعده‌ی دو ستون باید بیرون از media query باشد تا روی گوشی هم اعمال شود
  const topLevel = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  ok(/\.ch-games--grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/.test(topLevel), 'دو ستون روی پهنای گوشی (بیرون از media query)');
  ok(/^\s+list: '/m.test(core), 'نماد list در هسته هست');
  for (const k of ['viewGrid', 'viewList']) {
    const n = (menu.match(new RegExp('\\b' + k + ': \'', 'g')) || []).length;
    ok(n === 4, k + ' در هر چهار زبان منو هست (' + n + ')');
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
      de: { value: g.name.de, lang: 'de', dir: 'ltr' }
    },
    url: g.path,
    icons: [{ src: 'games/' + g.id + '/icon-192.png', sizes: '192x192', type: 'image/png' }]
  }));
  // آیکون بازی‌ای که میان‌بر ندارد فقط حجم APK را بالا می‌برد
  games.slice(10).forEach((g) => ok(!fs.existsSync(path.join(ROOT, 'www/games', g.id, 'icon-192.png')), g.id + ': بدون میان‌بر، آیکون PNG اضافه هم ندارد'));
  firstTen.forEach((g, i) => {
    ok(JSON.stringify(sc[i]) === JSON.stringify(want[i]), g.id + ': میان‌بر شماره‌ی ' + (i + 1) + ' با games.json می‌خواند (tools/shortcuts.sh را اجرا کن)');
    // آدرس نسبی و داخل scope، وگرنه مرورگر میان‌بر را نادیده می‌گیرد
    ok(sc[i] && !/^(\/|\.\.|[a-z]+:)/i.test(sc[i].url) && fs.existsSync(path.join(ROOT, 'www', sc[i].url)), g.id + ': آدرس میان‌بر داخل اپ است و فایلش هست');
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
    t: (k) => '<' + k + '>', num: (n) => String(n), time: (n) => 't' + n
  };
  let bestLine = () => undefined;
  try { bestLine = vm.runInNewContext('(function (C) { ' + menu.slice(at, end) + ' return bestLine; })', {})(fakeC); }
  catch (e) { ok(false, 'bestLine اجرا نشد: ' + e.message); }
  ok(bestLine({ id: 'new-game' }) === '<wins> 2', 'بازی بدون خط مخصوص شمار بردهایش را نشان می‌دهد');
  ok(bestLine({ id: 'no-wins' }) === '<wins> 0', 'بازی بی‌برد هم مثل قبلِ نقطه‌بازی «برد ۰» نشان می‌دهد');
  ok(bestLine({ id: 'dots' }) === '<wins> 3', 'نقطه‌بازی همان خط قبلی را نشان می‌دهد');
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

testFiles();
testSudoku();
testMines();
testDots();
testNonogram();
testMancala();
testFreecell();
testPeg();
testReversi();
testBackgammon();
testMorris();
testBattleship();
testBridges();
testCodebreaker();
testBreakout();
testPasur();
testMahjong();
testChess();
testChessBot();
testChessPuzzles();
testStringKeys();
testHomeGrid();
testAdiProof();
testEnglishCi();
testPepkExport();
testTd();
testVersionStamp();
testDeployGate();
testWebChanged();
testBrowserCheckExits();
testDevScript();
testLocales();
testDailyResume();
testUndoKey();
testShortcuts();
testMenu();

testSw().then(testVerifyDeploy).then(function () {
  head('کامل بودن اجرا');
  ok(checks >= MIN_CHECKS, 'دست‌کم ' + MIN_CHECKS + ' بررسی اجرا شد (' + checks + ' اجرا شد)');
  console.log('\n' + (failures ? ('✗ ' + failures + ' خطا از ' + checks + ' بررسی') : ('همه‌ی ' + checks + ' بررسی سبز')));
  process.exit(failures ? 1 : 0);
}).catch(function (e) {
  // یک گروه ناهمگام که خطا بدهد نباید مثل اجرای تمام‌شده دیده شود
  console.log('\n✗ اجرای تست‌ها نیمه‌کاره ماند: ' + ((e && e.stack) || e));
  process.exit(1);
});
