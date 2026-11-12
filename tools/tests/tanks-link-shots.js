'use strict';
// Tanks on two phones, every shot on both (#861). The owner's two phones showed a shot on
// one phone only, either way round. The page's own turn code (onNet, onSync, pump, shoot,
// landed …) runs here twice, joined by an ordered wire with random delays, with the link
// dropping and coming back between and during shots, and one phone sometimes slow to
// finish a flight. A shot counts as shown when its flight lands on that phone; a sync that
// replaces the match while a shot flies or waits (the cause) loses it.
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, ROOT } = T;

  // the page draws field and wind from C.daily(…).rng; any fixed generator per tag will do,
  // as long as both phones use the same one
  function rngFor(str) {
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

  function region(page) {
    const a = page.indexOf('  function isBot(seat)');
    const b = page.indexOf('  /* ------------------------------------------------------------ result */');
    return a > 0 && b > a ? page.slice(a, b) : '';
  }

  // One phone: the page's code in its own closure, with a fake clock and timers
  function phone(code, E, side, clock, send, log) {
    const timers = new Map();
    let nextId = 1;
    const C = {
      t: (k) => k, num: String, feedback() {}, haptic() {}, version: '1', state: { profile: { name: '' } },
      ui: { reduceMotion: () => false }, link: { send: (d) => send(side, d), open() {} }
    };
    const env = {
      E, C, RNG: rngFor, clone: (x) => JSON.parse(JSON.stringify(x)),
      render() {}, renderStatus() {}, renderPlayers() {}, renderArms() {}, renderPad() {}, renderTop() {}, kick() {}, save() {},
      finish() { log.push(['finish']); },
      performance: { now: () => clock.t },
      setTimeout: (fn, ms) => { const id = nextId++; timers.set(id, { at: clock.t + ms, fn }); return id; },
      clearTimeout: (id) => { timers.delete(id); }
    };
    const body = 'var G = null, timer = null, raf = 0, flight = null, blasts = [], floaters = [], aiming = null, msg = "", arm = "shell";\n' +
      'function seeded(tag) { return RNG("net|" + G.seed + "|" + tag); }\n' + code +
      '\nreturn { setG: function (g) { G = g; }, G: function () { return G; }, flight: function () { return flight; }, onNet: onNet, sendSync: sendSync,' +
      ' startTurn: startTurn, shoot: shoot, landed: landed, render: function () {} };';
    const api = new Function(...Object.keys(env), body)(...Object.values(env));
    api.tick = () => {
      for (const [id, x] of [...timers]) if (x.at <= clock.t && timers.has(id)) { timers.delete(id); x.fn(); }
    };
    return api;
  }

  // Plays one match. opt.drops: chance per 20 ms step that the link drops for a while;
  // opt.slow: chance that a phone takes up to 4 s more to finish a flight (it looked away);
  // opt.bend: at this shot, the guest's ground is bent by a pixel before it fires.
  function match(code, E, seed, opt) {
    const R = rngFor('match|' + seed);
    const clock = { t: 0 };
    const logs = [[], []], shown = [[], []];
    const q = [[], []]; // messages on the way to phone i, in order
    const up = { v: true };
    const send = (from, d) => {
      const to = 1 - from, last = q[to].length ? q[to][q[to].length - 1].at : 0;
      q[to].push({ at: Math.max(last + 1, clock.t + 20 + Math.floor(R() * 380)), data: JSON.stringify(d) });
    };
    const P = [phone(code, E, 0, clock, send, logs[0]), phone(code, E, 1, clock, send, logs[1])];
    const M = E.match(rngFor('net|S' + seed + '|field'));
    for (let s = 0; s < 2; s++) {
      P[s].setG({ mode: 'net', level: 'medium', daily: null, side: s, g: 1, seed: 'S' + seed, M: JSON.parse(JSON.stringify(M)), M0: JSON.parse(JSON.stringify(M)),
        sent: null, steps: [], inbox: null, link: 'connected', linkWhy: null, peerName: '', done: false, phase: 'aim', best: 0, startedAt: 0 });
      P[s].startTurn();
    }
    const dur = [0, 0], plan = [null, null];
    let downUntil = 0, drops = 0, slows = 0, bent = false, holdHost = false;
    while (clock.t < 400000) {
      clock.t += 20;
      if (!up.v && clock.t >= downUntil) {
        // back: makeLink resends what was missed, and each phone's onStatus('connected') sends a sync
        up.v = true;
        for (const p of P) { p.G().link = 'connected'; p.sendSync(); }
      }
      if (up.v && opt.drops && R() < opt.drops) {
        up.v = false; drops++; downUntil = clock.t + 100 + Math.floor(R() * 1500);
        for (const p of P) p.G().link = 'lost';
      }
      if (up.v) {
        for (let i = 0; i < 2; i++) {
          while (q[i].length && q[i][0].at <= clock.t) {
            if (!up.v) break;
            P[i].onNet(JSON.parse(q[i].shift().data));
          }
        }
      } else {
        // what was on the way waits for the reconnect, still in order
        for (let i = 0; i < 2; i++) for (const m of q[i]) m.at = Math.max(m.at, downUntil);
      }
      for (const p of P) p.tick();
      for (let s = 0; s < 2; s++) {
        const f = P[s].flight();
        if (!f) { dur[s] = 0; continue; }
        if (!dur[s]) { dur[s] = 1000 + (opt.slow && R() < opt.slow ? (slows++, 1000 + Math.floor(R() * 3000)) : 0); }
        if (clock.t - f.t0 >= dur[s]) { shown[s].push(P[s].G().M.n); dur[s] = 0; P[s].landed(); }
      }
      if (P[0].G().done && P[1].G().done) break;
      for (let s = 0; s < 2; s++) {
        const G = P[s].G();
        const mine = G.phase === 'aim' && !G.done && G.M.turn === s && !P[s].flight() && G.link === 'connected';
        if (!mine) { plan[s] = null; continue; }
        if (s === 0 && holdHost) continue;
        if (opt.bend != null && s === 1 && G.M0.n === opt.bend && !bent) {
          // a phone that drifted: one pixel of its ground differs from the host's
          bent = true; G.M0.h[300] += 1; G.M.h[300] += 1; holdHost = true;
        }
        if (plan[s] == null) plan[s] = clock.t + Math.floor(R() * 800);
        if (clock.t < plan[s]) continue;
        plan[s] = null;
        const arms = E.ORDER.filter((a) => E.left(G.M, s, a) > 0);
        G.M.last[s] = { angle: 20 + Math.floor(R() * 60), power: 35 + Math.floor(R() * 60) };
        P[s].shoot(s, arms[Math.floor(R() * arms.length)], G.M.last[s].angle, G.M.last[s].power);
      }
      // the bend check: the guest has fired its bent shot and both phones are quiet again
      if (holdHost && bent && !P[0].flight() && !P[1].flight() && !q[0].length && !q[1].length && P[0].G().M0.n === opt.bend + 1 && P[1].G().M0.n === opt.bend + 1) break;
    }
    const sum = (s) => E.digest(P[s].G().M0);
    return { P, shown, sum: [sum(0), sum(1)], n: [P[0].G().M0.n, P[1].G().M0.n], done: [P[0].G().done, P[1].G().done], drops, slows };
  }

  function testTanksLinkShots() {
    head('Tanks: every two-phone shot plays on both phones (#861)');
    const E = loadEngine('tanks', 'TanksEngineFactory');
    const page = fs.readFileSync(path.join(ROOT, 'www/games/tanks/index.html'), 'utf8');
    const code = region(page);
    ok(code.length > 0 && /function onSync\(/.test(code) && /function landed\(/.test(code), 'the page\'s turn code was found (' + code.length + ' characters)');
    if (code.length > 0) {
      // control: a clean link, no drops, no slow phone
      const clean = match(code, E, 1, {});
      ok(clean.done[0] && clean.done[1] && clean.n[0] === 20 && clean.n[1] === 20, 'control: a clean match ends on both phones after 20 shots (' + clean.n.join('/') + ')');
      ok(clean.sum[0] === clean.sum[1], 'control: both phones end on the same match');
      const full = (list) => list.length === 20 && list.every((n, i) => n === i);
      ok(full(clean.shown[0]) && full(clean.shown[1]), 'control: each shot flies once on each phone');

      // the owner's case: the link drops and comes back, and a phone is now and then slow
      const seeds = [2, 3, 4, 5, 6, 7, 8, 9];
      ok(seeds.length > 0, 'the list of faulty matches is not empty');
      let drops = 0, slows = 0, good = 0, same = 0;
      const bad = [];
      for (const s of seeds) {
        const r = match(code, E, s, { drops: 0.002, slow: 0.25 });
        drops += r.drops; slows += r.slows;
        if (r.sum[0] === r.sum[1] && r.n[0] === 20 && r.n[1] === 20) same++;
        if (full(r.shown[0]) && full(r.shown[1])) good++;
        else bad.push(s + ': host ' + r.shown[0].join(',') + ' | guest ' + r.shown[1].join(','));
      }
      ok(drops >= seeds.length && slows >= seeds.length, 'the faults happened (' + drops + ' drops, ' + slows + ' slow flights in ' + seeds.length + ' matches)');
      ok(same === seeds.length, 'every faulty match ends on the same 20-shot match on both phones (' + same + '/' + seeds.length + ')');
      ok(good === seeds.length, 'every shot flies exactly once on both phones, in order (' + good + '/' + seeds.length + ')' + (bad.length ? '; ' + bad[0] : ''));

      // a guest that drifted is put right by the host after the guest's own shot
      const b = match(code, E, 11, { bend: 5 });
      ok(b.n[0] === 6 && b.n[1] === 6, 'the drift check ran to the guest\'s shot (' + b.n.join('/') + ')');
      ok(b.sum[0] === b.sum[1], 'after the drifted guest\'s shot both phones hold the host\'s match again (' + b.sum.join(' / ') + ')');
    }
    linkBar(page);
  }

  // (2) The link bar: host and join only before the match, then one small chip, as in Battleship
  function linkBar(page) {
    const grab = (n) => (page.match(new RegExp('  function ' + n + '\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}\\n')) || [''])[0];
    const fns = ['renderTop', 'pickRole', 'linkText'].map(grab);
    ok(fns[0].length > 0 && fns[2].length > 0, 'the page has renderTop and linkText');
    if (!(fns[0].length > 0 && fns[2].length > 0)) return;
    const kids = [];
    const top = { set innerHTML(v) { kids.length = 0; }, appendChild(c) { kids.push(c); } };
    const el = (tag, o) => ({ tag, cls: (o && o.class) || '', text: (o && o.text) || '', addEventListener() {} });
    const C = { t: (k) => k, num: String, icon: () => ({}), ui: { segmented: () => ({ cls: 'ch-seg' }) } };
    const LINK_TEXT = { searching: 'linkSearching', connected: 'linkConnected', lost: 'linkLost', mismatch: 'linkMismatch', error: 'linkError' };
    const run = (G) => {
      new Function('G', 'top', 'el', 'C', 'LINK_TEXT', 'askNew', 'showSettings', 'newGame', 'openLink', fns.join('\n') + '\nrenderTop();')(G, top, el, C, LINK_TEXT, () => {}, () => {}, () => {}, () => {});
      return { seg: kids.filter((k) => k.cls === 'ch-seg').length, chips: kids.filter((k) => /tk-link/.test(k.cls)).map((k) => k.text) };
    };
    const base = { mode: 'net', level: 'medium', daily: null, M0: { n: 0 } };
    const none = run(Object.assign({}, base, { side: null, link: 'idle' }));
    ok(none.seg === 1 && none.chips[0] === 'linkPick', 'before a role is picked: the host/join choice and the sentence that explains it (' + none.seg + ', ' + none.chips.join() + ')');
    const look = run(Object.assign({}, base, { side: 0, link: 'searching' }));
    ok(look.seg === 1 && look.chips[0] === 'linkSearching', 'while looking for the other phone the choice stays, to switch roles');
    const on = run(Object.assign({}, base, { side: 1, link: 'connected' }));
    ok(on.seg === 0 && on.chips.length === 1 && on.chips[0] === 'linkConnected', 'once linked: no host/join choice and no sentence, one small "connected" chip (' + on.seg + ' choice, ' + on.chips.join() + ')');
    const lost = run(Object.assign({}, base, { side: 0, link: 'searching', M0: { n: 6 } }));
    ok(lost.seg === 0 && lost.chips[0] === 'linkSearching', 'mid-match, looking again after an app switch, the choice does not come back');
  }

  return { testTanksLinkShots };
};
