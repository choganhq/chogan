/* Chogan cue-sports table physics, shared by every table game (8-ball now,
   snooker later), so the rules of motion live in one place and never inside a game.

   Pure and deterministic: a fixed timestep, no Math.random, no clock. The page
   animates a shot by calling tick() once per physics step, and the AI runs the
   same tick() to the end through simulate(), so what the AI predicted is exactly
   what the player then sees.

   Units are table units: the cloth runs from x = 0 to length and y = 0 to width,
   and the cushion noses sit on those lines, so a ball touches a cushion when its
   centre is one radius away. A ball is { id, x, y, vx, vy, inPlay }; id 0 is the
   cue ball by convention. */
(function (root) {
  'use strict';

  var DT = 1 / 300;            // one physics step, in seconds
  var MAX_TICKS = 300 * 40;    // a shot that has not settled after 40 s is stopped

  // Table geometry. The defaults are a 2:1 table with balls a little bigger
  // than regulation, so they stay large enough to touch on a 390px phone.
  function table(o) {
    o = o || {};
    var L = o.length || 200, W = o.width || L / 2, r = o.radius || 2.6;
    var T = {
      L: L, W: W, r: r,
      corner: o.cornerMouth || r * 2.8,   // gap along each rail from a corner
      side: o.sideMouth || r * 3.3,       // full width of a middle pocket mouth
      cushion: o.cushion || 0.78,         // restitution of the normal speed off a cushion
      cushionSlide: o.cushionSlide || 0.97,
      ball: o.ball || 0.96,               // restitution between two balls
      rollA: o.rollA || 35,               // rolling friction: constant part (units/s²)
      rollB: o.rollB || 0.55,             // and the part that grows with speed (1/s)
      minSpeed: o.minSpeed || 1.5,        // below this a ball is at rest
      maxSpeed: o.maxSpeed || 600
    };
    var c = T.corner, h = T.side / 2;
    // Pocket centres: corners, then the two middle pockets
    // cap: a ball whose centre comes this close to a pocket centre drops, so a
    // ball does not stop hanging over the hole beyond the cushion line
    var cc = c * 0.8, sc = r * 1.05;
    T.pockets = [{ x: 0, y: 0, cap: cc }, { x: L, y: 0, cap: cc }, { x: 0, y: W, cap: cc }, { x: L, y: W, cap: cc }, { x: L / 2, y: 0, cap: sc }, { x: L / 2, y: W, cap: sc }];
    // Cushion tips (the jaws): a ball that misses the mouth bounces off these points
    T.tips = [
      [0, c], [0, W - c], [L, c], [L, W - c],
      [c, 0], [L - c, 0], [c, W], [L - c, W],
      [L / 2 - h, 0], [L / 2 + h, 0], [L / 2 - h, W], [L / 2 + h, W]
    ];
    return T;
  }

  // Where the long rails are open: near a corner, or across a middle pocket
  function gapX(T, x) { return x < T.corner || x > T.L - T.corner || Math.abs(x - T.L / 2) < T.side / 2; }
  function gapY(T, y) { return y < T.corner || y > T.W - T.corner; }

  function clone(balls) {
    var out = [];
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      out.push({ id: b.id, x: b.x, y: b.y, vx: b.vx || 0, vy: b.vy || 0, inPlay: b.inPlay !== false });
    }
    return out;
  }

  function speedOf(T, power) {
    var p = Math.max(0, Math.min(1, power));
    return 15 + (T.maxSpeed - 15) * p;
  }

  function nearestPocket(T, x, y) {
    var best = 0, bd = Infinity;
    for (var k = 0; k < T.pockets.length; k++) {
      var dx = T.pockets[k].x - x, dy = T.pockets[k].y - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }

  // A shot in progress. ev collects what the rules need, in order.
  function start(T, balls, shot, cueId) {
    var s = {
      T: T, balls: clone(balls), ticks: 0, moving: true,
      ev: { first: null, potted: [], pockets: [], cushions: 0, cushionsAfter: 0, contacts: 0 },
      hits: 0, pots: []
    };
    var cid = cueId === undefined ? 0 : cueId;
    for (var i = 0; i < s.balls.length; i++) {
      var b = s.balls[i];
      if (b.id === cid && b.inPlay) {
        var v = speedOf(T, shot.power);
        b.vx = Math.cos(shot.angle) * v;
        b.vy = Math.sin(shot.angle) * v;
      }
    }
    s.cue = cid;
    return s;
  }

  function pot(s, b, at) {
    b.inPlay = false; b.vx = 0; b.vy = 0;
    var k = nearestPocket(s.T, b.x, b.y);
    s.ev.potted.push(b.id);
    s.ev.pockets.push(k);
    s.pots.push({ id: b.id, pocket: k, at: at });
  }

  function cushion(s) {
    s.ev.cushions++;
    if (s.ev.first !== null) s.ev.cushionsAfter++;
  }

  // One physics step. Returns true while anything still moves. s.hits and
  // s.pots describe only this step, for sounds and effects on the page.
  function tick(s) {
    var T = s.T, B = s.balls, n = B.length, r = T.r, d2min = 4 * r * r, i, j, b, o;
    s.hits = 0; s.pots = [];
    for (i = 0; i < n; i++) {
      b = B[i];
      if (b.inPlay && (b.vx !== 0 || b.vy !== 0)) { b.x += b.vx * DT; b.y += b.vy * DT; }
    }
    // Ball against ball: equal masses, the normal speeds swap minus a little loss
    for (i = 0; i < n; i++) {
      b = B[i];
      if (!b.inPlay) continue;
      var bm = b.vx !== 0 || b.vy !== 0;
      for (j = i + 1; j < n; j++) {
        o = B[j];
        if (!o.inPlay || (!bm && o.vx === 0 && o.vy === 0)) continue;
        var dx = o.x - b.x, dy = o.y - b.y, dd = dx * dx + dy * dy;
        if (dd >= d2min) continue;
        var d = Math.sqrt(dd), nx, ny;
        if (d > 1e-9) { nx = dx / d; ny = dy / d; } else { nx = 1; ny = 0; d = 0; }
        var vn = (b.vx - o.vx) * nx + (b.vy - o.vy) * ny;
        if (vn > 0) {
          var imp = vn * (1 + T.ball) / 2;
          b.vx -= imp * nx; b.vy -= imp * ny;
          o.vx += imp * nx; o.vy += imp * ny;
          s.hits++;
          s.ev.contacts++;
          if (s.ev.first === null) {
            if (b.id === s.cue) s.ev.first = o.id;
            else if (o.id === s.cue) s.ev.first = b.id;
          }
          bm = true;
        }
        // push the pair apart so they never sink into each other
        var push = (2 * r - d) / 2;
        b.x -= nx * push; b.y -= ny * push;
        o.x += nx * push; o.y += ny * push;
      }
    }
    // Cushions, jaws and pockets
    for (i = 0; i < n; i++) {
      b = B[i];
      if (!b.inPlay) continue;
      if (b.x < r && !gapY(T, b.y)) { b.x = 2 * r - b.x; if (b.vx < 0) { b.vx = -b.vx * T.cushion; b.vy *= T.cushionSlide; cushion(s); } }
      else if (b.x > T.L - r && !gapY(T, b.y)) { b.x = 2 * (T.L - r) - b.x; if (b.vx > 0) { b.vx = -b.vx * T.cushion; b.vy *= T.cushionSlide; cushion(s); } }
      if (b.y < r && !gapX(T, b.x)) { b.y = 2 * r - b.y; if (b.vy < 0) { b.vy = -b.vy * T.cushion; b.vx *= T.cushionSlide; cushion(s); } }
      else if (b.y > T.W - r && !gapX(T, b.x)) { b.y = 2 * (T.W - r) - b.y; if (b.vy > 0) { b.vy = -b.vy * T.cushion; b.vx *= T.cushionSlide; cushion(s); } }
      // A ball near a mouth may meet a cushion tip instead of the hole
      if (b.x < r * 2 || b.x > T.L - r * 2 || b.y < r * 2 || b.y > T.W - r * 2) {
        for (var k = 0; k < T.tips.length; k++) {
          var tx = b.x - T.tips[k][0], ty = b.y - T.tips[k][1], td = tx * tx + ty * ty;
          if (td >= r * r || td < 1e-12) continue;
          var tl = Math.sqrt(td), ux = tx / tl, uy = ty / tl, vu = b.vx * ux + b.vy * uy;
          b.x = T.tips[k][0] + ux * r; b.y = T.tips[k][1] + uy * r;
          if (vu < 0) {
            b.vx -= (1 + T.cushion) * vu * ux; b.vy -= (1 + T.cushion) * vu * uy;
            cushion(s);
          }
        }
      }
      // Past a cushion line can only happen through a mouth: the ball drops
      if (b.x < 0 || b.x > T.L || b.y < 0 || b.y > T.W) { pot(s, b, s.ticks); continue; }
      if (b.x < T.corner || b.x > T.L - T.corner || b.y < r || b.y > T.W - r) {
        for (var q = 0; q < T.pockets.length; q++) {
          var pq = T.pockets[q], qx = b.x - pq.x, qy = b.y - pq.y;
          if (qx * qx + qy * qy < pq.cap * pq.cap) { pot(s, b, s.ticks); break; }
        }
      }
    }
    // Rolling friction slows every ball to rest
    var moving = false;
    for (i = 0; i < n; i++) {
      b = B[i];
      if (!b.inPlay || (b.vx === 0 && b.vy === 0)) continue;
      var v = Math.sqrt(b.vx * b.vx + b.vy * b.vy), nv = v - (T.rollA + T.rollB * v) * DT;
      if (nv < T.minSpeed) { b.vx = 0; b.vy = 0; continue; }
      var f = nv / v;
      b.vx *= f; b.vy *= f;
      moving = true;
    }
    s.ticks++;
    s.moving = moving && s.ticks < MAX_TICKS;
    if (!s.moving) for (i = 0; i < n; i++) { B[i].vx = 0; B[i].vy = 0; }
    return s.moving;
  }

  // Runs a shot to rest and returns the finished state: balls, events, ticks.
  function simulate(T, balls, shot, cueId) {
    var s = start(T, balls, shot, cueId);
    while (tick(s)) { /* the same steps the page animates */ }
    return s;
  }

  // Where the aim line from (x, y) at this angle first meets a ball or a cushion.
  // The page draws the ghost ball from it and the AI aims with the same geometry.
  function aim(T, balls, x, y, angle, cueId) {
    var dx = Math.cos(angle), dy = Math.sin(angle), r = T.r, best = Infinity, hit = null;
    var cid = cueId === undefined ? 0 : cueId;
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      if (!b.inPlay || b.id === cid) continue;
      var ox = b.x - x, oy = b.y - y, along = ox * dx + oy * dy;
      if (along <= 0) continue;
      var perp2 = ox * ox + oy * oy - along * along, rr = 4 * r * r;
      if (perp2 >= rr) continue;
      var t = along - Math.sqrt(rr - perp2);
      if (t < best && t >= -1e-9) { best = t; hit = b; }
    }
    // the cushion the line reaches first, at one radius off the nose
    var tw = Infinity;
    if (dx > 1e-9) tw = Math.min(tw, (T.L - r - x) / dx); else if (dx < -1e-9) tw = Math.min(tw, (r - x) / dx);
    if (dy > 1e-9) tw = Math.min(tw, (T.W - r - y) / dy); else if (dy < -1e-9) tw = Math.min(tw, (r - y) / dy);
    if (hit && best <= tw) {
      var gx = x + dx * best, gy = y + dy * best, nx = (hit.x - gx) / (2 * r), ny = (hit.y - gy) / (2 * r);
      // the cue ball keeps only the part of its motion along the tangent
      var dn = dx * nx + dy * ny, cx = dx - dn * nx, cy = dy - dn * ny;
      return { ball: hit.id, t: best, x: gx, y: gy, obj: Math.atan2(ny, nx), cue: Math.atan2(cy, cx), cueSpeed: Math.sqrt(cx * cx + cy * cy), cut: Math.acos(Math.max(-1, Math.min(1, dn))) };
    }
    return { ball: null, t: tw, x: x + dx * tw, y: y + dy * tw };
  }

  // True when a ball of radius r could stand at (x, y) without touching another
  function free(T, balls, x, y, skipId) {
    if (x < T.r || x > T.L - T.r || y < T.r || y > T.W - T.r) return false;
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      if (!b.inPlay || b.id === skipId) continue;
      var dx = b.x - x, dy = b.y - y;
      if (dx * dx + dy * dy < 4 * T.r * T.r * 1.0001) return false;
    }
    return true;
  }

  // Is the straight path of a ball from a to b clear of every other ball?
  function clear(T, balls, ax, ay, bx, by, skipA, skipB) {
    var dx = bx - ax, dy = by - ay, len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-9) return true;
    dx /= len; dy /= len;
    for (var i = 0; i < balls.length; i++) {
      var o = balls[i];
      if (!o.inPlay || o.id === skipA || o.id === skipB) continue;
      var ox = o.x - ax, oy = o.y - ay, t = ox * dx + oy * dy;
      if (t <= 0 || t >= len) continue;
      var px = ox - dx * t, py = oy - dy * t;
      if (px * px + py * py < 4 * T.r * T.r) return false;
    }
    return true;
  }

  // With the white in hand, one drag on it can mean "move it" or "pull back and
  // shoot". Only placing was ever possible, so the break (always in hand) could
  // not be played with the slingshot the tutorial teaches (#278). A first
  // movement within 40 degrees of straight back from the aim is a pull.
  function pullsBack(angle, dx, dy) {
    if (dx * dx + dy * dy < 1e-12) return false;
    var d = Math.atan2(dy, dx) - angle - Math.PI;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return Math.abs(d) < Math.PI * 40 / 180;
  }

  // #532: a player could only pull back by starting on the white ball, which felt like a
  // long press on it; the cue stick drawn behind the ball is a handle too. True when the
  // point (px, py) is on the stick: behind the ball (cx, cy) against the aim, between the
  // stick's tip (from) and its end (to), within tol of its line.
  function onStick(angle, cx, cy, px, py, from, to, tol) {
    var ux = Math.cos(angle), uy = Math.sin(angle), dx = px - cx, dy = py - cy;
    var along = -(dx * ux + dy * uy), across = Math.abs(dx * uy - dy * ux);
    return along >= from && along <= to && across <= tol;
  }

  // #505: the turn control (#492) measured a drag across the aim line as it stood when
  // the drag began, so the same finger move turned the cue one way or the other with the
  // cue's direction, and its speed matched nothing the finger did. A move now turns the
  // cue by the angle it sweeps round the white ball (cx, cy), as Point mode does, but
  // from where the cue already is, never snapping to the finger; inside minR of the ball
  // the radius is taken as minR, so a finger crossing the ball cannot spin the cue.
  function turnStep(cx, cy, px, py, qx, qy, minR) {
    var rx = px - cx, ry = py - cy, r = Math.sqrt(rx * rx + ry * ry);
    if (r < 1e-9) return 0;
    var t = (rx * (qy - py) - ry * (qx - px)) / r;
    return t / Math.max(r, minR);
  }

  // #506: the power bar took the distance from where the finger went down in either
  // direction, so sliding left of the start to back out of a shot built power instead.
  // The bar fills from the left in every language; only a pull to the right adds power,
  // and the full bar is 80% of its width away.
  function barPower(dx, width) {
    return width > 0 ? Math.max(0, Math.min(1, dx / (width * 0.8))) : 0;
  }

  // #407: a potted ball vanished at the pocket's mouth in one frame. Pool and
  // snooker keep each pot for SINK_MS and draw the ball sliding into the
  // pocket's centre as it shrinks and fades. sinksOf reads where each ball of
  // this step's pots dropped; sinkAt is its place, scale and alpha at q (0..1).
  var SINK_MS = 220;
  function sinksOf(s, now) {
    return s.pots.map(function (p) {
      var b = null;
      for (var i = 0; i < s.balls.length; i++) if (s.balls[i].id === p.id) b = s.balls[i];
      var pk = s.T.pockets[p.pocket];
      return { id: p.id, pocket: p.pocket, x: b ? b.x : pk.x, y: b ? b.y : pk.y, t0: now };
    });
  }
  function sinkAt(T, p, q) {
    var pk = T.pockets[p.pocket], e = q * q;
    return { x: p.x + (pk.x - p.x) * e, y: p.y + (pk.y - p.y) * e, k: 1 - 0.85 * e, a: 1 - e };
  }

  // the fine-aim buttons turn the cue by this many radians a tap, and again every 60 ms
  // while held, never faster (#586)
  var FINE_STEP = 0.002;

  // the Turn control's drag is multiplied by one of these, chosen behind the gear; normal
  // is the speed it always had (#587)
  var TURN_SPEEDS = { slow: 0.25, medium: 0.5, normal: 1 };

  var api = {
    DT: DT, MAX_TICKS: MAX_TICKS, table: table, clone: clone, speedOf: speedOf,
    start: start, tick: tick, simulate: simulate, aim: aim, free: free, clear: clear, nearestPocket: nearestPocket,
    pullsBack: pullsBack, onStick: onStick, turnStep: turnStep, barPower: barPower, SINK_MS: SINK_MS, sinksOf: sinksOf, sinkAt: sinkAt, FINE_STEP: FINE_STEP, TURN_SPEEDS: TURN_SPEEDS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ChoganCue = api;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
