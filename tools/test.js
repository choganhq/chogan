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
const LOCALE_CODES = ['fa', 'en', 'zh'];
let failures = 0;
let checks = 0;
// حداقل تعداد بررسی‌ای که یک اجرای کامل باید داشته باشد. قبلاً اگر یک گروه کامل
// اجرا نمی‌شد — مثلاً با حذف یک خط testSudoku(); نود و نه بررسی از بین رفت — فقط
// مجموع کمتر چاپ می‌شد و باز سبز بود. با اضافه کردن بررسی این عدد را بالا ببر؛
// پایین آوردنش یعنی بررسی‌ای عمداً حذف شده و باید در PR گفته شود.
const MIN_CHECKS = 513;

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
  ok(r.status === 2 && /کروم/.test(r.stderr || ''),
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
    ['en-GB', 'en'], ['de-DE', 'en'], ['', 'en']
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

  // منیفست وب: نام برند لاتین می‌ماند، توضیح چینی اضافه شده
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/manifest.webmanifest'), 'utf8'));
  const dloc = man.description_localized || {};
  const nloc = man.name_localized || {};
  ok(!!dloc['zh-Hans'], 'منیفست توضیح چینی ساده‌شده دارد');
  ok((dloc['zh-Hans'] || {}).dir === 'ltr', 'توضیح چینی چپ‌به‌راست است');
  ok(!nloc['zh-Hans'], 'نام برند برای چینی ترجمه نشده و لاتین می‌ماند');
}

testFiles();
testSudoku();
testMines();
testDots();
testTd();
testVersionStamp();
testDeployGate();
testWebChanged();
testBrowserCheckExits();
testDevScript();
testLocales();

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
