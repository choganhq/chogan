'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT } = T;
  // This week and last week on the profile (#664). The core's own day log and week sums
  // run here on fixed dates, and each answer is compared with a total worked out by hand.
  function testWeeklyStats() {
    head('Profile: this week and last week (#664)');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const cut = (from, to) => { const a = core.indexOf(from), b = core.indexOf(to, a); return a >= 0 && b > a ? core.slice(a, b) : ''; };
    const pad = (core.match(/^  function pad2\(n\).*$/m) || [''])[0];
    const dates = cut('  function dateKey(d) {', '  Chogan.dateKey = ');
    const week = cut('  var KEEP_DAYS = ', '  var statsApi = {');
    ok(!!pad && !!dates && !!week, 'the day log and the week sums are in the core');
    if (!(pad && dates && week)) return;
    const sb = {};
    vm.createContext(sb);
    vm.runInContext(pad + dates + week + '\nthis.dayAdd = dayAdd; this.weekOf = weekOf;', sb);
    const at = (d, h) => new Date(2026, 10, d, h || 12); // November 2026: the 6th is a Friday
    ok(at(6).getDay() === 5 && at(7).getDay() === 6 && at(9).getDay() === 1, 'the calendar the cases use: Fri 6, Sat 7, Mon 9 November 2026');
    // Rounds on known days, oldest first, as record() would write them
    let days = {};
    const play = (d, o) => { days = sb.dayAdd(days, Object.assign({ gameId: 'sudoku', timeMs: 60e3 }, o), at(d)); };
    play(1);                                     // Sun 1
    play(2, { won: true });                      // Mon 2
    play(5, { gameId: 'chess', timeMs: 120e3 }); // Thu 5
    play(6, { won: true });                      // Fri 6
    play(7);                                     // Sat 7
    play(8, { gameId: 'go' });                   // Sun 8
    play(8, { gameId: 'go', continued: true, timeMs: 30e3 });
    play(9, { won: true, gameId: 'chess' });     // Mon 9 = "today"
    const now = at(9, 20);
    const w = (lang, ago) => { const r = sb.weekOf(days, lang, ago, now); return [r.from, r.plays, r.timeMs / 60e3, r.wins, r.days, r.games].join(' '); };
    // English: Monday 9 to Sunday 15, last week Monday 2 to Sunday 8
    ok(w('en', 0) === '2026-11-09 1 1 1 1 1', 'English this week starts on Monday and holds only Monday (' + w('en', 0) + ')');
    ok(w('en', 1) === '2026-11-02 5 6.5 2 5 3', 'English last week is Monday 2 to Sunday 8, a continued round adds time but no game (' + w('en', 1) + ')');
    // Persian: Saturday 7 to Friday 13, last week Saturday 31 October to Friday 6
    ok(w('fa', 0) === '2026-11-07 3 3.5 1 3 3', 'Persian this week starts on Saturday (' + w('fa', 0) + ')');
    ok(w('fa', 1) === '2026-10-31 4 5 2 4 2', 'Persian last week is Saturday 31 to Friday 6 (' + w('fa', 1) + ')');
    // Every other language follows the Monday week
    ok(['de', 'es', 'pl', 'zh'].every((l) => w(l, 0) === w('en', 0)), 'German, Spanish, Polish and Chinese weeks start on Monday too');
    // On the first day of a week, that day alone is this week
    const upTo7 = Object.fromEntries(Object.entries(days).filter(([k]) => k <= '2026-11-07'));
    const sat = sb.weekOf(upTo7, 'fa', 0, at(7, 9));
    ok(sat.from === '2026-11-07' && sat.plays === 1, 'on a Saturday the Persian week is that day (' + sat.from + ', ' + sat.plays + ')');
    const sun = sb.weekOf(Object.fromEntries(Object.entries(days).filter(([k]) => k <= '2026-11-08')), 'en', 0, at(8, 9));
    ok(sun.from === '2026-11-02' && sun.plays === 5, 'on a Sunday the English week is still the one from Monday (' + sun.from + ')');
    // Only 14 days are kept; the start of last week is never further back than 13
    days = sb.dayAdd(days, { gameId: 'go', timeMs: 1 }, at(16));
    days = sb.dayAdd(days, { gameId: 'go', timeMs: 1 }, at(30));
    const keys = Object.keys(days).sort().join(',');
    ok(keys === '2026-11-16,2026-11-30', 'a round on 30 November keeps the 16th, 14 days back, and drops every day before it (' + keys + ')');
    // An old profile has no day log: both weeks are zero, not an error
    const empty = sb.weekOf({}, 'en', 1, now);
    ok(empty.plays === 0 && empty.timeMs === 0 && empty.days === 0, 'with no day log both weeks read zero');
    // record() writes the log, and the profile shows both weeks with every string in six languages
    ok(/state\.stats\.days = dayAdd\(state\.stats\.days \|\| \{\}, o, new Date\(\)\);/.test(core), 'every finished round is written to the day log');
    const page = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
    ok(/C\.stats\.week\(0\)/.test(page) && /C\.stats\.week\(1\)/.test(page) && /weekTable\(\)/.test(page), 'the profile shows this week and last week under the totals');
    // The four totals above the weeks wrapped 3 + 1 on a phone (owner's screenshot): two by two, or one row
    const css = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8');
    ok(/class: 'ch-stats ch-stats--4' \}/.test(page) && /\.ch-stats--4 \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/.test(css) && /\.ch-stats--4 \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\); \}/.test(css),
      'the four profile totals sit two by two on a phone and in one row when wide');
    // The week table's play time: the unit is in the label and the cells are bare minutes,
    // even past an hour (the owner's screenshot read «۵۹ دقیقه» beside «۰ دقیقه»)
    const rowsSrc = (page.match(/    var rows = \[\n[\s\S]*?\n    \];/) || [''])[0];
    ok(rowsSrc.length > 0, 'the week table has its rows');
    if (rowsSrc) {
      const sb = { C: { num: (n) => String(n), duration: (ms) => Math.round(ms / 60000) + ' minutes', stats: {} }, a: { plays: 1, timeMs: 125 * 60000, wins: 0, days: 1, games: 1 }, b: { plays: 0, timeMs: 59 * 60000, wins: 0, days: 0, games: 0 } };
      vm.runInNewContext(rowsSrc + ';this.rows = rows;', sb);
      const t = sb.rows.find((r) => /[Tt]ime|Minutes/.test(r[0])) || [];
      ok(t[0] === 'weekMinutes' && t[1] === '125' && t[2] === '59', 'the week table shows play time as bare minutes under a label with the unit (' + t.join(' | ') + ')');
    }
    for (const k of ['thisWeek', 'lastWeek', 'weekMinutes', 'weekWins', 'weekDays', 'weekGames']) {
      const n = (core.match(new RegExp('\\b' + k + ": '[^']+'", 'g')) || []).length;
      ok(n === T.LOCALE_CODES.length, k + ' is in all ' + T.LOCALE_CODES.length + ' languages (' + n + ')');
    }
  }
  return { testWeeklyStats };
};
