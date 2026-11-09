'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT, LOCALE_CODES } = T;
  // Two phones over Nearby (choganhq/chogan-plus#4). The link itself is plain JavaScript in
  // the core; here two copies talk through a fake transport that can drop the connection,
  // so a lost move, a duplicate and a version mismatch are all exercised without phones.
  function testLink() {
    head('Two phones: the Nearby link (#691)');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const a = core.indexOf('  function makeLink(getTransport) {');
    const b = core.indexOf('  Chogan.link = makeLink(nativeTransport);', a);
    ok(a > 0 && b > a, 'the core has makeLink and Chogan.link');
    // Without the link none of the checks below can run; say so instead of looking short
    if (!(a > 0 && b > a)) { ok(false, 'the link checks could not run'); return; }
    const sb = { global: {}, console, JSON, Promise };
    vm.createContext(sb);
    vm.runInContext(core.slice(a, b) + '\nthis.makeLink = makeLink; this.nativeTransport = nativeTransport;', sb);

    // A pair of fake transports. `up` decides whether a sent message arrives.
    function pair() {
      const ends = [], net = { up: true, log: [] };
      function make(me) {
        const end = { cb: null, stopped: false };
        end.t = {
          start(o, cb) { end.cb = cb; end.role = o.role; end.service = o.service; },
          send(id, data) { net.log.push([me, data]); if (net.up) ends[1 - me].cb && ends[1 - me].cb({ type: 'message', id: 'p' + me, data }); },
          stop() { end.stopped = true; }
        };
        return end;
      }
      ends.push(make(0), make(1));
      net.connect = () => { net.up = true; ends[0].cb({ type: 'connected', id: 'p1' }); ends[1].cb({ type: 'connected', id: 'p0' }); };
      net.drop = () => { net.up = false; ends[0].cb({ type: 'disconnected', id: 'p1' }); ends[1].cb({ type: 'disconnected', id: 'p0' }); };
      net.ends = ends;
      return net;
    }

    ok(sb.nativeTransport() === null && !sb.makeLink(sb.nativeTransport).available(), 'without the native plugin the link is not available (web, PWA, F-Droid)');

    const net = pair();
    const L0 = sb.makeLink(() => net.ends[0].t), L1 = sb.makeLink(() => net.ends[1].t);
    const got0 = [], got1 = [], st0 = [], st1 = [];
    L0.open({ role: 'host', game: 'reversi', version: '1', onMessage: (d) => got0.push(d), onStatus: (s) => st0.push(s) });
    L1.open({ role: 'guest', game: 'reversi', version: '1', onMessage: (d) => got1.push(d), onStatus: (s) => st1.push(s) });
    ok(net.ends[0].service === 'chogan.reversi' && net.ends[0].role === 'host' && net.ends[1].role === 'guest', 'each game looks only for its own service, host and guest');
    net.connect();
    ok(L0.status === 'connected' && L1.status === 'connected', 'both sides report connected after the hello');
    L0.send({ i: 19 }); L1.send({ i: 26 });
    ok(JSON.stringify(got1) === '[{"i":19}]' && JSON.stringify(got0) === '[{"i":26}]', 'a move arrives on the other phone, once');

    // Lost on the way: sent while the link is down, delivered after the reconnect
    net.drop();
    ok(L0.status === 'lost' && L1.status === 'lost', 'a drop shows as lost on both sides');
    L0.send({ i: 37 });
    ok(got1.length === 1, 'nothing arrives while the link is down');
    net.connect();
    ok(JSON.stringify(got1) === '[{"i":19},{"i":37}]', 'the move sent while down arrives after reconnecting');
    ok(got0.length === 1, 'moves already delivered are not delivered again');

    // A duplicate or an out-of-order message is ignored
    net.ends[1].cb({ type: 'message', id: 'p0', data: JSON.stringify({ k: 'data', n: 1, d: { i: 99 } }) });
    net.ends[1].cb({ type: 'message', id: 'p0', data: JSON.stringify({ k: 'data', n: 9, d: { i: 98 } }) });
    net.ends[1].cb({ type: 'message', id: 'p0', data: 'not json' });
    ok(got1.length === 2, 'a repeated, skipped or broken message is ignored');
    // A stranger on another endpoint cannot inject a move
    net.ends[1].cb({ type: 'message', id: 'pX', data: JSON.stringify({ k: 'data', n: 3, d: { i: 5 } }) });
    ok(got1.length === 2, 'a message from another endpoint is ignored');

    L0.close();
    ok(net.ends[0].stopped && L0.status === 'idle', 'close stops the transport');

    // Different builds refuse each other instead of misreading moves
    const net2 = pair();
    const M0 = sb.makeLink(() => net2.ends[0].t), M1 = sb.makeLink(() => net2.ends[1].t);
    const ms = [];
    M0.open({ role: 'host', game: 'reversi', version: '1', onStatus: (s) => ms.push(s) });
    M1.open({ role: 'guest', game: 'reversi', version: '2' });
    net2.connect();
    ok(ms.indexOf('mismatch') >= 0 && net2.ends[0].stopped, 'a peer on another version is refused and the link closes');

    // A native failure (no permission, Bluetooth off) reaches the page as a status
    const net3 = pair();
    const E0 = sb.makeLink(() => net3.ends[0].t), es = [];
    E0.open({ role: 'host', game: 'reversi', version: '1', onStatus: (s, info) => es.push([s, info && info.message]) });
    net3.ends[0].cb({ type: 'error', message: 'permission' });
    ok(E0.status === 'error' && JSON.stringify(es[es.length - 1]) === '["error","permission"]', 'a native error shows as status error with its message');

    // #744: the page must tell a refused permission, Bluetooth off and any other Nearby failure
    // apart; one message for all three sent a player with Bluetooth on hunting for a permission.
    const why = [];
    const net4 = pair();
    const E2 = sb.makeLink(() => net4.ends[0].t);
    E2.open({ role: 'guest', game: 'reversi', version: '1', onStatus: (s, info) => { if (s === 'error') why.push(info); } });
    ['permission', 'bluetooth', '8007: STATUS_BLUETOOTH_ERROR', 'boom'].forEach((m) => net4.ends[0].cb({ type: 'error', message: m }));
    const got = why.map((i) => (i && i.reason) + '/' + (i && i.code));
    ok(got.join() === 'permission/,bluetooth/,other/8007,other/', 'a native error carries its reason and Nearby code (' + got.join() + ')');
    // Reversi shows each reason in its own words, in every language
    const rvs = fs.readFileSync(path.join(ROOT, 'www/games/reversi/index.html'), 'utf8');
    const miss = ['linkPermission', 'linkBluetooth', 'linkError'].filter((k) => (rvs.match(new RegExp('[ ,{]' + k + ": '", 'g')) || []).length !== LOCALE_CODES.length);
    ok(!miss.length, 'Reversi has a message for each link failure in every language' + (miss.length ? ' (' + miss.join(', ') + ')' : ''));
    ok(/why\.reason === 'permission'\) return C\.t\('linkPermission'\)/.test(rvs) && /why\.reason === 'bluetooth'\) return C\.t\('linkBluetooth'\)/.test(rvs) && /why\.code \? ' \(' \+ why\.code \+ '\)'/.test(rvs), 'Reversi picks the message by reason and shows the code of any other failure');

    // #693: the hint is a sentence inside .ch-badge, which never wraps, so on a phone it ran off
    // both edges. Its own rule must let it wrap; the Playwright proof in the PR measured the box.
    const rv = fs.readFileSync(path.join(ROOT, 'www/games/reversi/index.html'), 'utf8');
    ok(/el\('span', \{ class: 'ch-badge rv-link'/.test(rv), 'Reversi shows the two-phones hint as .rv-link');
    const rule = (rv.match(/\.rv-top \.rv-link\s*\{([^}]*)\}/) || [])[1] || '';
    ok(/white-space:\s*normal/.test(rule) && /max-width:\s*100%/.test(rule), 'the two-phones hint wraps inside the screen (' + (rule.trim() || 'no .rv-top .rv-link rule') + ')');
  }
  return { testLink };
};
