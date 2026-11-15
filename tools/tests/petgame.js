'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, rng, fs, path, ROOT, LOCALE_CODES } = T;

  // #903: a game for cats, dogs and infants. Critters run about a full-bleed canvas, a touch pops one,
  // and holding all four corners leaves.
  function testPetGame() {
    head('Pet Game (#903)');
    const t0 = Date.now();
    const file = path.join(ROOT, 'www/games/petgame/index.html');
    // no early return: a missing page must fail the group, not hide every check after it
    if (!fs.existsSync(file)) throw new Error('www/games/petgame/index.html does not exist');
    const E = loadEngine('petgame', 'PetEngineFactory');
    const html = fs.readFileSync(file, 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const W = 390, H = 700;

    // sizes follow the field
    ok(E.radius(390, 700) >= 26 && E.radius(390, 700) <= 64 && E.radius(1280, 800) <= 64 && E.radius(100, 100) === 26, 'a critter is 26 to 64 px in radius');
    ok(E.wanted(390, 700) >= 3 && E.wanted(1280, 800) <= 7 && E.wanted(1280, 800) > E.wanted(390, 400), 'three to seven critters, more on a bigger field');

    // every kind, every speed: critters stay inside the field and keep moving
    const kinds = ['mouse', 'bug', 'butterfly', 'light'];
    ok(E.KINDS.join() === 'mouse,butterfly,bug,light' && E.MODES.join() === 'mixed,mouse,bug,butterfly,light', 'four kinds and five modes');
    kinds.forEach((k) => ['slow', 'normal', 'fast'].forEach((sp) => {
      const r = rng(7), S = E.newField(W, H, k, sp);
      E.fill(S, r);
      ok(S.critters.length === E.wanted(W, H) && S.critters.every((c) => c.kind === k), k + ' at ' + sp + ': a field of only that kind');
      const start = S.critters.map((c) => [c.x, c.y]);
      let inside = true, travelled = 0;
      for (let i = 0; i < 600; i++) {
        E.step(S, 1 / 30, r);
        S.critters.forEach((c) => { if (c.x < 0 || c.x > W || c.y < 0 || c.y > H || !isFinite(c.x + c.y)) inside = false; });
      }
      S.critters.forEach((c, i) => { if (start[i]) travelled += Math.hypot(c.x - start[i][0], c.y - start[i][1]); });
      ok(inside, k + ' at ' + sp + ': twenty seconds on, nothing leaves the field');
      ok(travelled > 20, k + ' at ' + sp + ': they actually move (' + travelled.toFixed(0) + ' px)');
    }));
    // mixed fields show more than one kind
    const mix = E.newField(W, H, 'mixed', 'normal'), rm = rng(3);
    for (let i = 0; i < 12; i++) E.spawn(mix, rm);
    ok(new Set(mix.critters.map((c) => c.kind)).size >= 3, 'a mixed field has at least three kinds');
    ok(E.newField(W, H, 'nonsense', 'normal').mode === 'mixed' && E.newField(W, H, 'mouse', 'nonsense').speed === 1, 'unknown mode or speed fall back to mixed and normal');

    // a speed setting scales the pace
    const dist = (sp) => {
      const r = rng(11), S = E.newField(W, H, 'mouse', sp); E.fill(S, r);
      let total = 0, prev = S.critters.map((c) => [c.x, c.y]);
      for (let i = 0; i < 300; i++) { E.step(S, 1 / 30, r); S.critters.forEach((c, j) => { total += Math.hypot(c.x - prev[j][0], c.y - prev[j][1]); prev[j] = [c.x, c.y]; }); }
      return total;
    };
    ok(dist('fast') > dist('slow') * 1.5, 'fast is clearly quicker than slow');

    // poke: generous reach, nearest wins, a miss pops nothing
    const r1 = rng(5), P = E.newField(W, H, 'bug', 'normal'); E.fill(P, r1);
    const c0 = P.critters[0], reach = c0.r * E.HIT_K;
    ok(E.hit(P, c0.x, c0.y, 0) !== null, 'a poke on a critter finds one');
    ok(E.hit(P, c0.x + reach * 0.9, c0.y, 0) !== null && E.hit(P, c0.x + reach * 0.9, c0.y, 0) !== undefined, 'a poke a little off the edge still counts');
    const far = E.newField(W, H, 'bug', 'normal'); far.critters.push({ id: 1, kind: 'bug', r: 30, x: 50, y: 50, age: 1, variant: 0 });
    ok(E.hit(far, 300, 600, 0) === null, 'a poke far from every critter finds nothing');
    ok(E.hit(far, 50 + 30 * E.HIT_K + 10, 50, 0) === null && E.hit(far, 50 + 30 * E.HIT_K + 10, 50, 12) !== null, 'the slop widens the reach');
    const two = E.newField(W, H, 'bug', 'normal');
    two.critters.push({ id: 1, kind: 'bug', r: 30, x: 100, y: 100, age: 1, variant: 0 }, { id: 2, kind: 'bug', r: 30, x: 130, y: 100, age: 1, variant: 0 });
    ok(E.hit(two, 124, 100, 0).id === 2 && E.hit(two, 106, 100, 0).id === 1, 'the nearest of two overlapping critters is the one popped');

    // popping: removes it, counts it, throws sparks, and a replacement comes by itself
    const Q = E.newField(W, H, 'mixed', 'normal'), rq = rng(9); E.fill(Q, rq);
    const n0 = Q.critters.length, victim = Q.critters[0];
    ok(E.pop(Q, victim, rq) === true && Q.critters.length === n0 - 1 && Q.popped === 1 && Q.bits.length >= 10 && Q.rings.length === 1, 'a pop removes the critter, counts it and throws sparks');
    ok(E.pop(Q, victim, rq) === false && Q.popped === 1, 'the same critter cannot be popped twice');
    for (let i = 0; i < 60; i++) E.step(Q, 1 / 30, rq);
    ok(Q.critters.length === n0, 'a new critter has appeared two seconds later');
    ok(Q.bits.length === 0 && Q.rings.length === 0, 'the sparks have faded after two seconds');
    const many = E.newField(W, H, 'mouse', 'normal');
    for (let i = 0; i < 40; i++) { E.spawn(many, rq); E.pop(many, many.critters[many.critters.length - 1], rq); }
    ok(many.bits.length <= 240, 'sparks are capped at 240');
    const kb = E.newField(W, H, 'mouse', 'normal'); E.fill(kb, rq);
    ok(E.popAny(kb, rq) !== null && kb.popped === 1 && E.popAny(E.newField(W, H, 'mouse', 'normal'), rq) === null, 'a key pops one critter, and an empty field pops none');
    // a field never runs dry however fast it is played
    const hammer = E.newField(W, H, 'mixed', 'normal'); E.fill(hammer, rq);
    let always = true;
    for (let i = 0; i < 300; i++) { E.popAny(hammer, rq); E.step(hammer, 1 / 30, rq); if (hammer.critters.length + hammer.queue.length < E.wanted(W, H)) always = false; }
    ok(always, 'popping as fast as possible never leaves the field short of critters');
    // changing kind and resizing
    const sw = E.newField(W, H, 'mixed', 'normal'); E.fill(sw, rq); E.setMode(sw, 'light', rq);
    ok(sw.critters.length === E.wanted(W, H) && sw.critters.every((c) => c.kind === 'light') && sw.mode === 'light', 'changing the kind swaps the whole field');
    E.resize(sw, 200, 300);
    ok(sw.critters.every((c) => c.x <= 200 && c.y <= 300 && c.r === E.radius(200, 300)), 'turning the phone keeps every critter inside the new field');
    // a hit field with a one-dimension resize 0 doesn't throw
    E.step(sw, 0, rq);

    // corners: all four, held, for 1.5 s
    const z = E.zones(W, H);
    const inZone = (q) => ({ x: q.x + q.w / 2, y: q.y + q.h / 2 });
    const four = z.map(inZone);
    ok(z.length === 4 && E.zoneSize(W, H) >= 56 && E.zoneSize(W, H) <= 110, 'four corner zones of 56 to 110 px');
    ok(E.cornersHeld(four, W, H) === true, 'a finger in each corner counts as held');
    ok(E.cornersHeld(four.slice(0, 3), W, H) === false && E.cornersHeld([], W, H) === false, 'three corners, or none, do not');
    ok(E.cornersHeld([four[0], four[0], four[1], four[2]], W, H) === false, 'two fingers in one corner do not make four');
    ok(E.cornersHeld([{ x: W / 2, y: H / 2 }, four[1], four[2], four[3]], W, H) === false, 'a finger in the middle is not a corner');
    ok(E.cornersHeld(four, 40, 40) === false, 'a field too small for four zones never counts');
    const HS = E.newField(W, H, 'mixed', 'normal');
    let done = false, t = 0;
    while (t < 1.4) { done = E.holdStep(HS, true, 0.1) || done; t += 0.1; }
    ok(done === false && HS.hold > 1.3 && HS.hold < 1.5, 'one and a half seconds are not up at 1.4');
    ok(E.holdStep(HS, true, 0.2) === true, 'the hold completes after about 1.5 seconds');
    E.holdStep(HS, false, 0.016);
    ok(HS.hold === 0, 'letting go of any corner restarts the count');
    ok(E.holdStep(HS, true, 1.0) === false && E.holdStep(HS, false, 0.1) === false && E.holdStep(HS, true, 1.0) === false, 'two one-second holds with a break between do not add up');

    // the page
    const cvRule = (html.match(/\.pg-canvas\s*\{[^}]*\}/) || [''])[0];
    ok(/width:\s*100%/.test(cvRule) && /height:\s*100%/.test(cvRule), 'the canvas is sized by CSS, not by its backing store (it drew double-size at a pixel ratio above 1 in Goose Race)');
    ok(/touch-action:\s*none/.test(cvRule), 'the canvas takes every touch itself, so nothing scrolls or zooms');
    ok(/cv\.width !== Math\.round\(Z\.w \* dpr\) \|\| cv\.height !== Math\.round\(Z\.h \* dpr\)/.test(html) && /document\.fonts\.ready/.test(html) && /ResizeObserver/.test(html),
      'the backing store is compared on both sides, and the page redraws on resize and when fonts arrive');
    ok(/pointerdown/.test(html) && /pointermove/.test(html) && /setPointerCapture/.test(html), 'pointer events with capture, so several fingers work');
    ok(/addEventListener\('keydown'[\s\S]*?\},\s*true\)/.test(html) && /stopImmediatePropagation/.test(html), 'a key handler in the capture phase stops Escape and Backspace from leaving the game');
    ok(/C\.back\(\)/.test(html) && /cornersHeld/.test(html), 'holding the corners calls the back action');
    ok(!/<(img|link)[^>]+(https?:)?\/\/(?!www)/.test(html.replace(/xmlns="[^"]*"/g, '')) && !/https?:\/\//.test(html.replace(/xmlns="[^"]*"/g, '').replace(/<!--[\s\S]*?-->/g, '')), 'no external resource');

    // strings: nine languages, every key present in each
    const m = html.match(/strings:\s*\{([\s\S]*?)\n\s{4}\}\n\s{2}\}\);/);
    ok(!!m, 'the string table was found');
    const keys = ['pgScene', 'pgKind', 'pgMixed', 'pgMice', 'pgBugs', 'pgButterflies', 'pgLights', 'pgSpeed', 'pgSlow', 'pgNormal', 'pgFast', 'pgSound', 'pgOn', 'pgOff', 'pgRules', 'pgKeys', 'pgKeyWhat', 'pgCorners', 'pgCornersWhat', 'pgTutTitle', 'pgTutText'];
    LOCALE_CODES.forEach((l) => {
      const block = ((m && m[1]) || '').match(new RegExp('\\n\\s{6}' + l + ': \\{([\\s\\S]*?)\\n\\s{6}\\}'));
      ok(!!block && keys.every((k) => new RegExp('\\b' + k + ': \'').test(block[1])), l + ': every string key is present');
    });
    // sounds and the award live in the core
    ok(['pgPop0', 'pgPop1', 'pgPop2'].every((s) => core.indexOf(s + ': function') > 0), 'three pop sounds exist in the core');
    ok(/id: 'pet-hundred'/.test(core) && /'pet-hundred'/.test(html), 'the hundred-pops award exists and the page unlocks it');

    // the catalogue entry
    const gm = T.games().find((g) => g.id === 'petgame');
    ok(!!gm && gm.cat === 'skill' && gm.people === 1 && gm.daily === false, 'Pet Game is listed once as a one-person game with no daily');
    ok(T.games().filter((g) => g.id === 'petgame').length === 1, 'listed exactly once');
    ok(!!gm && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l] && html.indexOf(l + ": '" + gm.name[l] + "'") > 0), 'its name and summary exist in every language, and the page uses the same names');
    const others = T.games().filter((g) => g.id !== 'petgame');
    ok(others.length > 10 && !!gm && LOCALE_CODES.every((l) => others.every((g) => g.name[l].toLowerCase() !== gm.name[l].toLowerCase())), 'no other game has the same name in any language');
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/petgame/icon.svg'), 'utf8');
    ok(!!gm && icon.indexOf('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>') >= 0, 'the icon sits on the game\'s soft tint');
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const lumC = (x) => rgb(x).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
    const lab = (x) => {
      const [Rr, Gr, Bl] = rgb(x).map(lin), f = (q) => q > 0.008856 ? Math.cbrt(q) : 7.787 * q + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
    };
    const dE = (a, b) => { const P2 = lab(a), Q2 = lab(b); return Math.hypot(P2[0] - Q2[0], P2[1] - Q2[1], P2[2] - Q2[2]); };
    const near = gm ? others.map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0] : ['none', 0];
    ok(!!gm && near[1] >= 15 && 1.05 / (lumC(gm.color) + 0.05) >= 4.5 && html.indexOf("accent: '" + gm.color + "'") > 0,
      'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    ok(Date.now() - t0 < 3000, 'the Pet Game tests finish in under 3 s (' + (Date.now() - t0) + ' ms)');
  }
  return { testPetGame };
};
