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

const ROOT = path.join(__dirname, '..');
let failures = 0;
let checks = 0;

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
function testFiles() {
  head('فایل‌ها و فهرست');
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
  ok(games.length >= 4, 'games.json حداقل چهار بازی دارد');
  for (const g of games) {
    ok(fs.existsSync(path.join(ROOT, 'www', g.path)), g.id + ': فایل بازی هست');
    ok(fs.existsSync(path.join(ROOT, 'www', g.icon)), g.id + ': آیکون هست');
    ok(g.name.fa && g.name.en && g.summary.fa && g.summary.en, g.id + ': نام و توضیح دوزبانه دارد');
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
  const manifest = fs.readFileSync(path.join(ROOT, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  const perms = manifest.match(/uses-permission android:name="([^"]+)"/g) || [];
  ok(perms.length === 1 && perms[0].indexOf('VIBRATE') > 0, 'منیفست فقط مجوز لرزش دارد');
  ok(manifest.indexOf('INTERNET') < 0, 'مجوز اینترنت در منیفست نیست');
}

testFiles();
testSudoku();
testMines();
testDots();
testTd();

console.log('\n' + (failures ? ('✗ ' + failures + ' خطا از ' + checks + ' بررسی') : ('همه‌ی ' + checks + ' بررسی سبز')));
process.exit(failures ? 1 : 0);
