'use strict';
// Tanks on two phones (#754): only a turn's input travels, so both phones must reach the
// same field from the same seed and the same turns, and a phone that drifts must be caught
// by the digest each turn carries and put right from the host's match.
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, ROOT, LOCALE_CODES } = T;

  // a seeded generator per tag, like C.daily('tanks', 'net|seed|tag').rng on the page
  function seeded(str) {
    let a = 2166136261;
    for (let i = 0; i < str.length; i++) a = Math.imul(a ^ str.charCodeAt(i), 16777619) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function testTanksLink() {
    head('Tanks: two phones play the same match (#754)');
    const A = loadEngine('tanks', 'TanksEngineFactory');
    const B = loadEngine('tanks', 'TanksEngineFactory');
    ok(typeof A.digest === 'function', 'the engine exports digest()');
    ok(typeof A.syncPick === 'function', 'the engine exports syncPick()');
    // no early return: the page checks below must still run and fail on their own
    if (typeof A.digest === 'function' && typeof A.syncPick === 'function') engineChecks(A, B);
    else ok(false, 'two-phone engine checks cannot run without digest() and syncPick()');
    pageChecks();
  }

  function engineChecks(A, B) {
    const seeds = ['a1b2c3', 'zz9', 'host-42'];
    ok(seeds.length > 0, 'seed list is not empty');
    let turns = 0, equal = 0;
    for (const seed of seeds) {
      const rf = (tag) => seeded('net|' + seed + '|' + tag);
      const ma = A.match(rf('field')), mb = B.match(rf('field'));
      ok(A.digest(ma) === B.digest(mb) && JSON.stringify(ma) === JSON.stringify(mb), seed + ': the same seed gives both phones the same field');
      const plan = seeded('plan|' + seed);
      for (let t = 0; t < 20 && !A.over(ma); t++) {
        let who = ma.turn;
        if (ma.shots[who] <= 0) { ma.turn = mb.turn = 1 - who; who = ma.turn; }
        // the shooter's input, as it would travel: steps, arm, angle, power
        const steps = [];
        const k = Math.floor(plan() * 3);
        for (let i = 0; i < k; i++) steps.push(plan() < 0.5 ? -1 : 1);
        const arms = A.ORDER.filter((x) => A.left(ma, who, x) > 0);
        const msg = { m: steps, arm: arms[Math.floor(plan() * arms.length)], angle: Math.round((10 + plan() * 70) * 10) / 10, power: Math.round((30 + plan() * 70) * 10) / 10 };
        const wire = JSON.parse(JSON.stringify(msg));
        msg.m.forEach((d) => A.move(ma, who, d));
        wire.m.forEach((d) => B.move(mb, who, d));
        const ra = A.fire(ma, who, msg.arm, msg.angle, msg.power, null, rf('wind' + (ma.n)));
        const rb = B.fire(mb, who, wire.arm, wire.angle, wire.power, null, rf('wind' + (mb.n)));
        turns++;
        if (ra && rb && A.digest(ma) === B.digest(mb) && ma.h.join() === mb.h.join() && ma.score.join() === mb.score.join()) equal++;
      }
    }
    ok(turns >= 40, 'enough turns were played on both phones (' + turns + ')');
    ok(equal === turns, 'after every turn both phones hold the same ground, points and digest (' + equal + '/' + turns + ')');

    // a phone that drifts by one pixel of ground is caught, and the host's match stands
    const base = A.match(seeded('drift'));
    const bent = JSON.parse(JSON.stringify(base));
    bent.h[200] = bent.h[200] + 1;
    ok(A.digest(base) !== A.digest(bent), 'one pixel of ground changes the digest');
    const moved = JSON.parse(JSON.stringify(base));
    moved.tanks[1].x += 1;
    ok(A.digest(base) !== A.digest(moved), 'a tank one pixel off changes the digest');
    const host = { g: 2, seed: 's', n: 5, sum: A.digest(base) }, guest = { g: 2, seed: 's', n: 5, sum: A.digest(bent) };
    ok(A.syncPick(guest, host, true) === 'take', 'at the same shot with different digests the guest takes the host\'s match');
    ok(A.syncPick(host, guest, false) === 'keep', 'and the host keeps its own');
    ok(A.syncPick(host, Object.assign({}, host), false) === 'keep' && A.syncPick(host, Object.assign({}, host), true) === 'keep', 'equal matches change nothing');
    ok(A.syncPick({ g: 2, n: 5 }, { g: 2, n: 6 }, false) === 'take', 'a phone a shot behind takes the newer match, even the host');
    ok(A.syncPick({ g: 2, n: 6 }, { g: 2, n: 5 }, true) === 'tell', 'a phone a shot ahead answers with its match, even the guest');
    ok(A.syncPick({ g: 3, n: 0 }, { g: 2, n: 9 }, true) === 'tell', 'a later match beats more shots in an older one');
    ok(A.syncPick({ g: 2, n: 9 }, { g: 3, n: 0 }, false) === 'take', 'a new match on the other phone is taken');
    ok(A.syncPick(host, Object.assign({}, host, { seed: 't' }), true) === 'take', 'a different field at the same shot: the guest takes it');

    // a finished match can travel in a sync (the last shot), but never loads from a save
    const done = JSON.parse(JSON.stringify(base));
    done.shots = [0, 0];
    ok(A.validMatch(done, true) && !A.validMatch(done), 'a finished match passes only as a sync');
  }

  function pageChecks() {
    // the page side: its own seeded rng, no awards and no daily, listed as a link game
    const page = fs.readFileSync(path.join(ROOT, 'www/games/tanks/index.html'), 'utf8');
    ok(/function seeded\(tag\) \{ return G\.mode === 'net' \? C\.daily\('tanks', 'net\|' \+ G\.seed \+ '\|' \+ tag\)\.rng : rngFor\(tag\); \}/.test(page), 'two-phone matches draw field and wind from the shared seed, never Math.random');
    const after = page.slice(page.indexOf('/* ==== ENGINE END ==== */'));
    ok(!/rngFor\('/.test(after) && (after.match(/seeded\('(field|wind|bot)/g) || []).length === 4, 'every field, wind and bot draw on the page goes through seeded()');
    ok(/C\.link\.available\(\)/.test(page), 'the two-phone mode is offered only where the link exists');
    const fin = (page.match(/function finish\(\) \{[\s\S]*?\n {2}\}/) || [''])[0];
    ok(fin.length > 0, 'finish() was found');
    // outside the bot-only block, every award must be fenced off from two phones
    const outside = fin.replace(/if \(G\.mode === 'bot'\) \{[\s\S]*?\n {4}\}/, '');
    const unlocks = outside.split('\n').filter((l) => /achievements\.unlock/.test(l));
    ok(unlocks.length > 0 && unlocks.every((l) => /!net/.test(l)), 'finish() gives no award in a two-phone match (' + unlocks.length + ' award line(s) outside the bot block)');
    const starts = [...page.matchAll(/newGame\(\{ mode: 'net'[^}]*\}/g)].map((m) => m[0]);
    ok(starts.length > 0 && starts.every((x) => !/daily/.test(x)), 'a two-phone match never starts as a daily (' + starts.length + ' start(s))');
    const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8'));
    const list = Array.isArray(games) ? games : games.games;
    const tanks = (list || []).find((g) => g.id === 'tanks');
    ok(!!tanks && tanks.link === true, 'games.json marks Tanks as a link game');
    const keys = ['twoPhones', 'hostGame', 'joinGame', 'rival', 'linkSearching', 'linkConnected', 'linkLost', 'linkMismatch', 'linkError', 'linkPermission', 'linkBluetooth', 'linkPick'];
    const blocks = [...page.matchAll(/\n {6}([a-z]{2}): \{/g)].map((m) => m[1]);
    ok(LOCALE_CODES.every((c) => blocks.includes(c)), 'every language has a string block (' + blocks.join(',') + ')');
    for (const k of keys) {
      const n = (page.match(new RegExp('[{ ,]' + k + ": '", 'g')) || []).length;
      ok(n === LOCALE_CODES.length, k + ' is written in all ' + LOCALE_CODES.length + ' languages (' + n + ')');
    }
  }

  return { testTanksLink };
};
