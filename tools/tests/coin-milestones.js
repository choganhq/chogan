'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT } = T;
  // #809 / #812: the shared rule that pays an endless game's coins. The core's own function
  // runs here on fixed numbers, each answer compared with a count worked out by hand.
  function testCoinMilestones() {
    head('Endless games: coins for new distance (#809, #812)');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const a = core.indexOf('  var MILESTONE_COINS'), b = core.indexOf('  var statsApi = {', a);
    ok(a > 0 && b > a, 'the core has the milestone rule');
    if (!(a > 0 && b > a)) return;
    const sb = {};
    vm.createContext(sb);
    vm.runInContext(core.slice(a, b) + '\nthis.m = milestoneCoins; this.per = MILESTONE_COINS;', sb);
    const m = sb.m;
    ok(sb.per === 5, 'a milestone is worth 5 coins');
    ok(m(0, 999, 1000) === 0, 'a first ride under 1000 m earns no milestone');
    ok(m(0, 1000, 1000) === 5 && m(0, 2500, 1000) === 10, 'a first ride pays 5 per full 1000 m (1000 m: 5, 2500 m: 10)');
    ok(m(1500, 2400, 1000) === 5, 'a record from 1500 m to 2400 m pays only the 2000 m mark it newly reaches');
    ok(m(900, 1100, 1000) === 5 && m(2100, 2900, 1000) === 0, 'crossing a mark pays, a record inside the same thousand pays nothing');
    ok(m(3000, 3000, 1000) === 0 && m(3000, 1200, 1000) === 0, 'replaying a distance already reached, or doing worse, pays nothing');
    ok(m(0, 4500, 0) === 0 && m(undefined, NaN, 1000) === 0 && m(-5, 2000, 1000) === 10, 'a missing step or number pays nothing and a negative best counts as none');
    // a record can never pay more than its distance allows, whatever the base cap is
    let total = 0, best = 0;
    for (const d of [800, 1200, 1100, 2600, 2600, 3100, 900]) { total += m(best, d, 1000); best = Math.max(best, d); }
    ok(total === 15, 'a whole series of rides pays 5 per mark once (3 marks = 15, got ' + total + ')');
    ok(/milestoneCoins: milestoneCoins/.test(core), 'the games reach it as Chogan.stats.milestoneCoins');
    const hr = fs.readFileSync(path.join(ROOT, 'www/games/hillrider/index.html'), 'utf8');
    const mr = fs.readFileSync(path.join(ROOT, 'www/games/motorush/index.html'), 'utf8');
    ok(/Math\.min\(40, 2 \+ Math\.floor\(m \/ 150\)/.test(hr) && /C\.stats\.milestoneCoins\(prevBest, m, 1000\)/.test(hr),
      'Hillrider keeps its 40-coin cap and adds the milestones on top, not inside it');
    ok(/getBest\('hillrider', 'metres'\) \|\| 0;\s+if \(C\.stats\.best\('hillrider'/.test(hr), 'Hillrider reads the old best before the new one is written');
    ok(/Math\.min\(30, 1 \+ Math\.floor\(S\.d \/ 400\)\)/.test(mr) && /C\.stats\.milestoneCoins\(prevDist, metres, 1000\)/.test(mr),
      'Moto Rush keeps its 30-coin cap and adds the milestones on top');
    ok(/getBest\('motorush', 'dist' \+ diffTag\(\)\) \|\| 0[^;]*;\s+C\.stats\.best\('motorush', 'dist'/.test(mr), 'Moto Rush keeps a best distance per difficulty and reads it before writing');
  }
  return { testCoinMilestones };
};
