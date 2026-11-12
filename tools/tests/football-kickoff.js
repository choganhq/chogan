'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT } = T;
  // A friend's report: from the kick-off line-up one flick at a good angle is a goal almost
  // every time, so a match ended after five flicks without a duel. The kick-off flick's goal
  // is now disallowed and the other team kicks off.
  function testFootballKickoff() {
    head('Button Football: a goal from the kick-off flick does not count');
    const sandbox = { self: {}, module: { exports: {} }, console };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'www/lib/cue.js'), 'utf8'), sandbox, { filename: 'cue.js' });
    const html = fs.readFileSync(path.join(ROOT, 'www/games/football/index.html'), 'utf8');
    const m = html.match(/\/\* ==== ENGINE START ==== \*\/([\s\S]*?)\/\* ==== ENGINE END ==== \*\//);
    ok(!!m, 'the football page has an engine block');
    if (!m) return;
    vm.runInContext(m[1], sandbox, { filename: 'football-engine.js' });
    const E = sandbox.FootballEngineFactory(sandbox.self.ChoganCue);
    // every disc, a sweep of angles, full power: find the kick-off flicks that score
    const scoring = [];
    for (let id = 1; id <= 5; id++) for (let a = -Math.PI; a < Math.PI; a += 0.02) {
      const M = E.match(), s = E.run(E.flick(M, id, a, 1));
      if (s.goal === 0) scoring.push({ id, a });
    }
    ok(scoring.length > 0, 'the old rules had kick-off flicks that scored (' + scoring.length + ' of the sweep)');
    for (const c of scoring.slice(0, 5)) {
      const M = E.match(), ev = E.resolve(M, E.run(E.flick(M, c.id, c.a, 1)));
      ok(ev.goal === -1 && ev.disallowed === true && M.score[0] === 0 && M.score[1] === 0 && M.winner === -1, 'disc ' + c.id + ' at ' + c.a.toFixed(2) + ': no goal, no score, match goes on');
      ok(M.turn === 1 && M.kick === true && Math.abs(M.b[0].x - 50) < 1e-9 && M.b.length === 11 && M.b.every((d) => d.vx === 0 && d.vy === 0), 'the other team kicks off from a fresh line-up, the ball back at the centre');
    }
    // an ordinary flick that scores after the kick-off still counts
    const M2 = E.match(); M2.kick = false;
    const sc = scoring[0], s2 = E.run(E.flick(M2, sc.id, sc.a, 1));
    ok(s2.goal === 0 && E.resolve(M2, s2).goal === 0 && M2.score[0] === 1, 'the same flick later in the match is a goal');
    // a flick that does not score ends the kick-off
    const M3 = E.match(); E.resolve(M3, E.run(E.flick(M3, 1, Math.PI / 2, 0.2)));
    ok(M3.kick === false && M3.turn === 1, 'the first flick of any kind ends the kick-off');
    // after a real goal the next kick-off is protected too, and a save keeps the flag
    const M4 = E.match(); M4.kick = false; E.resolve(M4, E.run(E.flick(M4, sc.id, sc.a, 1)));
    ok(M4.kick === true && M4.turn === 1, 'after a goal the next kick-off is a kick-off again');
    ok(E.restore(E.snapshot(M4)).kick === true && E.restore(E.snapshot(M3)).kick === false, 'a saved match keeps whether the next flick is the kick-off');
    // the bot does not waste its kick-off on a goal that will not count
    let wasted = 0, played = 0;
    for (const level of ['easy', 'medium', 'hard']) for (let seed = 1; seed <= 3; seed++) {
      const M = E.match({ kicker: 1 });
      let x = seed * 7919 >>> 0; const rnd = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
      const c = E.choose(M, level, rnd), s = E.run(E.flick(M, c.id, c.angle, c.power));
      played++; if (s.goal >= 0) wasted++;
    }
    ok(played === 9 && wasted <= 3, 'the bot rarely aims a kick-off flick into the goal (' + wasted + ' of ' + played + ')');
  }
  return { testFootballKickoff };
};
