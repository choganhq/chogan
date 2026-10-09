#!/usr/bin/env node
/* معماهای شطرنج را از پایگاه معماهای Lichess برمی‌گزیند و www/games/chess/puzzles.js را می‌نویسد.
   پایگاه با مجوز CC0 منتشر شده است: https://database.lichess.org/#puzzles

   curl -sL https://database.lichess.org/lichess_db_puzzle.csv.zst | zstd -dc | node tools/chess-puzzles.js > www/games/chess/puzzles.js

   گزینش قطعی است: فقط معماهای محبوب و پرتکرار با رتبه‌ی مطمئن، در هر سطح به ده بازه‌ی رتبه
   تقسیم و از هر بازه با ترتیب هش شناسه برداشته می‌شوند. پایگاه Lichess با گذر زمان رتبه‌ها را به‌روز
   می‌کند، پس اجرای دوباره در آینده ممکن است فهرست کمی متفاوتی بدهد؛ خروجی در مخزن ثبت است. */
'use strict';
const crypto = require('crypto');
const readline = require('readline');

const PER_TIER = 200, BINS = 10;
const TIERS = { easy: [800, 1300], medium: [1300, 1700], hard: [1700, 2300] };
const pick = { easy: [], medium: [], hard: [] };
for (const t in TIERS) for (let b = 0; b < BINS; b++) pick[t].push([]);

let header = null, rows = 0;
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  if (!header) { header = line.split(','); return; }
  rows++;
  const x = line.split(',');
  const id = x[0], fen = x[1], moves = x[2].split(' ');
  const rating = +x[3], rd = +x[4], pop = +x[5], plays = +x[6], themes = (x[7] || '').split(' ');
  // معمای کوتاه (حداکثر چهار حرکت بازیکن)، محبوب، با رتبه‌ی جاافتاده
  if (!(pop >= 90 && plays >= 3000 && rd <= 80 && moves.length >= 2 && moves.length <= 8)) return;
  for (const t in TIERS) {
    const [lo, hi] = TIERS[t];
    if (rating < lo || rating >= hi) continue;
    const bin = Math.floor((rating - lo) / (hi - lo) * BINS);
    const mate = themes.find((th) => /^mateIn[1-5]$/.test(th));
    const key = crypto.createHash('sha1').update(id).digest('hex');
    pick[t][bin].push({ key, row: [id, fen.split(' ').slice(0, 4).join(' '), moves.join(' '), rating, mate ? 'm' + mate.slice(6) : ''] });
  }
});
rl.on('close', () => {
  if (!header || header[0] !== 'PuzzleId' || header[1] !== 'FEN' || header[2] !== 'Moves') {
    console.error('سرستون CSV آن چیزی نیست که انتظار می‌رفت: ' + (header || []).slice(0, 4).join(','));
    process.exit(2);
  }
  const out = {};
  for (const t in TIERS) {
    const per = PER_TIER / BINS, list = [];
    for (const bin of pick[t]) {
      if (bin.length < per) { console.error(t + ': بازه‌ای فقط ' + bin.length + ' معما دارد'); process.exit(2); }
      bin.sort((a, b) => (a.key < b.key ? -1 : 1));
      for (let k = 0; k < per; k++) list.push(bin[k].row);
    }
    list.sort((a, b) => a[3] - b[3] || (a[0] < b[0] ? -1 : 1));
    out[t] = list;
  }
  const lines = [];
  lines.push('/* معماهای شطرنج از پایگاه معماهای Lichess (CC0، https://database.lichess.org/#puzzles).');
  lines.push('   ساخته‌شده با tools/chess-puzzles.js از ' + rows + ' معما؛ دستی ویرایش نکن.');
  lines.push('   هر معما: [شناسه‌ی Lichess، FEN پیش از حرکت حریف، حرکت‌ها به UCI، رتبه، مات در n یا خالی].');
  lines.push('   حرکت اول مال حریف است؛ از حرکت دوم، یکی‌درمیان، نوبت بازیکن. */');
  lines.push('var CHESS_PUZZLES = {');
  const tiers = Object.keys(out);
  tiers.forEach((t, ti) => {
    lines.push('  ' + t + ': [');
    out[t].forEach((r, i) => lines.push('    ' + JSON.stringify(r).replace(/"/g, "'") + (i < out[t].length - 1 ? ',' : '')));
    lines.push('  ]' + (ti < tiers.length - 1 ? ',' : ''));
  });
  lines.push('};');
  process.stdout.write(lines.join('\n') + '\n');
});
