'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, vm, ROOT, LOCALE_CODES } = T;
  // #972: a free-play piano toy («پیانو» / Piano)
  function testPiano() {
    head('Piano (#972)');
    const t0 = Date.now();
    const file = path.join(ROOT, 'www/games/piano/index.html');
    // no early return: a missing game must fail here, not skip every check below
    if (!fs.existsSync(file)) throw new Error('www/games/piano/index.html is missing');
    const html = fs.readFileSync(file, 'utf8');
    const E = loadEngine('piano', 'PianoEngineFactory');
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

    // pitch: every key against the closed equal-temperament formula, A4 = 440 Hz
    const ms = [];
    for (let m = E.LOW; m <= E.HIGH; m++) ms.push(m);
    const off = ms.map((m) => [m, 1200 * Math.log2(E.freq(m) / (440 * Math.pow(2, (m - 69) / 12)))]);
    ok(ms.length === 37 && E.LOW === 48 && E.HIGH === 84 && off.every(([, c]) => Math.abs(c) < 0.01), 'all 37 keys from C3 to C6 are in equal temperament within 0.01 cent (worst ' + Math.max(...off.map(([, c]) => Math.abs(c))).toExponential(1) + ')');
    ok(Math.abs(E.freq(69) - 440) < 1e-9 && Math.abs(E.freq(60) - 261.6256) < 1e-3 && E.freq(47) === 0 && E.freq(85) === 0, 'A4 is 440 Hz, middle C 261.63 Hz, and there is nothing outside the range');
    ok(E.name(60) === 'C4' && E.name(61) === 'C#4' && E.name(84) === 'C6' && E.name(59) === 'B3' && ms.every((m) => E.parse(E.name(m)) === m), 'note names and their parsing agree on every key');
    ok(E.WHITES.length === 22 && ms.filter((m) => E.isBlack(m)).length === 15, '22 white and 15 black keys');

    // layout: what a finger touches is the key drawn there
    const L8 = E.layout(390, 200, 4), L22 = E.layout(1280, 260, 4), Lt = E.layout(390, 200, 5);
    ok(E.whitesFor(300) === 8 && E.whitesFor(390) === 8 && E.whitesFor(844) === 19 && E.whitesFor(1280) === 22, 'a narrow phone shows 8 white keys, a wide screen all 22');
    ok(L8.lo === 60 && L8.hi === 72 && L22.lo === 48 && L22.hi === 84 && Lt.hi === 84 && Lt.lo === 72, 'the window starts on the chosen C and never runs past C6');
    let hitsOk = 0, hitsAll = 0;
    for (const L of [L8, L22, E.layout(844, 180, 3)]) {
      for (const k of L.whites) { hitsAll++; if (E.hit(L, k.x + k.w / 2, L.H - 4) === k.m) hitsOk++; }
      for (const k of L.blacks) { hitsAll++; if (E.hit(L, k.x + k.w / 2, k.h / 2) === k.m) hitsOk++; }
    }
    ok(hitsAll > 60 && hitsOk === hitsAll, 'the middle of every drawn key hits that key, black keys on top (' + hitsOk + '/' + hitsAll + ')');
    const b0 = L8.blacks[0];
    ok(E.hit(L8, b0.x + 1, b0.h + 2) === b0.m - 1 && E.hit(L8, b0.x + b0.w - 1, b0.h + 2) === b0.m + 1 && E.hit(L8, -1, 5) === -1 && E.hit(L8, 5, 200) === -1, 'below a black key is the white key under it; outside the board is nothing');

    // the computer keyboard: each key once, two rows that sound like a piano
    const letters = E.KEYS.map((k) => k[0]), offs = E.KEYS.map((k) => k[1]);
    ok(new Set(letters).size === letters.length && same(offs, Array.from({ length: 25 }, (_, i) => i)), 'the 25 keys each map once, to the 25 semitones from C to the C two octaves up');
    ok(letters.filter((k, i) => E.isBlack(60 + offs[i])).every((k) => 'sdghj23567'.includes(k)) && 'zxcvbnmqwertyui'.split('').every((k) => !E.isBlack(E.keyNote(k, 4))), 'letters Z–M and Q–I are white keys, S D G H J and 2 3 5 6 7 the black ones');
    ok(E.keyNote('z', 4) === 60 && E.keyNote('q', 4) === 72 && E.keyNote('i', 4) === 84 && E.keyNote('i', 5) === -1 && E.keyNote('z', 3) === 48 && E.keyNote('?', 4) === -1, 'Z is the chosen C, Q the next, and notes past the range are ignored');
    ok(ms.every((m) => { const k = E.keyFor(m, 4); return !k || E.keyNote(k, 4) === m; }) && E.shift(3, -1) === 3 && E.shift(5, 1) === 5 && E.shift(4, 1) === 5, 'a key label is the key that plays it; the octave stops at C3 and C5');
    ok(/C\.keyIs\(e, k\)/.test(html) && /\^Digit\[23567\]\$/.test(html) && /keyup/.test(html) && /e\.repeat/.test(html), 'letters go through Chogan.keyIs (the Persian layout), digits by their code; held keys do not retrigger and keyup lets go');
    ok(!/dir === 'rtl'|isRtl|C\.rtl/.test(html) && /\.pn-canvas \{[^}]*direction: ltr/.test(html) && /\.pn-oct \{[^}]*direction: ltr/.test(html), 'low notes stay on the left in every language');

    // practice tunes: the right keys in order, all inside the middle octave
    ok(E.TUNES.length === 17, 'seventeen practice tunes');
    const firsts = { twinkle: [60, 60, 67, 67, 69, 69, 67], mary: [64, 62, 60, 62, 64, 64, 64], clair: [60, 60, 60, 62, 64, 62], london: [67, 69, 67, 65, 64, 65, 67], ode: [64, 64, 65, 67, 67, 65, 64, 62], jingle: [64, 64, 64, 64, 64, 64, 64, 67, 60, 62, 64],
      frere: [60, 62, 64, 60, 60, 62, 64, 60], row: [60, 60, 60, 62, 64], macdonald: [60, 60, 60, 67, 69, 69, 67], buns: [64, 62, 60], saints: [60, 64, 65, 67], susanna: [60, 62, 64, 67, 67, 69, 67], lightly: [67, 64, 64, 65, 62, 62], deck: [72, 71, 69, 67, 65, 67, 69, 65], cucaracha: [60, 60, 60, 65, 69], itsy: [67, 60, 60, 60, 62, 64], canon: [72, 67, 69, 64, 65, 60, 65, 67] };
    ok(E.TUNES.every((t) => same(E.tune(t.id).slice(0, firsts[t.id].length).map((n) => n.m), firsts[t.id])), 'each tune opens with its known notes (' + Object.keys(firsts).join(', ') + ')');
    ok(E.TUNES.every((t) => { const n = E.tune(t.id); return n.length >= 20 && n.every((x) => x.m >= 60 && x.m <= 72 && !E.isBlack(x.m) && x.beats > 0); }), 'every note of every tune is a white key between C4 and C5, so all of it fits the 8 keys of an upright phone');
    let allRight = true;
    for (const t of E.TUNES) {
      const P = E.practice(t.id), n = E.tune(t.id);
      const res = n.map((x) => (E.press(P, x.m) === 'hold' ? E.advance(P) : 'miss'));
      if (!(res.slice(0, -1).every((r) => r === 'hit') && res[res.length - 1] === 'done')) allRight = false;
    }
    ok(allRight, 'playing each tune\'s notes in order moves on note by note and ends it');
    const P = E.practice('mary');
    ok(E.expected(P) === 64 && E.press(P, 60) === 'miss' && P.i === 0 && E.press(P, 64) === 'hold' && P.i === 0 && E.advance(P) === 'hit' && E.expected(P) === 62, 'a wrong key changes nothing; the right key only starts a hold, and the note counts when it has been held long enough');
    {
      const Q = E.practice('london');   // opens with a 1.5-beat note, then a half beat, then whole beats
      const need = [];
      for (let k = 0; k < 4; k++) { need.push(E.need(Q)); E.press(Q, Q.notes[Q.i].m); E.advance(Q); }
      ok(need[0] === Math.round(1.5 * E.BEAT_MS * E.HOLD) && need[1] === Math.round(0.5 * E.BEAT_MS * E.HOLD) && need[2] === Math.round(E.BEAT_MS * E.HOLD) && need[0] > need[2] && need[2] > need[1] && E.HOLD > 0.5 && E.HOLD < 1, 'a longer note has to be held longer (1.5 beats > 1 beat > half a beat), at most its own length: ' + need.join(', ') + ' ms');
      ok(E.need(null) === 0 && E.need(E.practice('mary')) === Math.round(E.BEAT_MS * E.HOLD), 'free play needs no hold; a one-beat note needs ' + Math.round(E.BEAT_MS * E.HOLD) + ' ms');
    }
    E.tune('mary').slice(1).forEach((x) => { E.press(P, x.m); E.advance(P); });
    ok(E.expected(P) === -1 && E.press(P, 64) === 'hold' && P.i === 0 && E.press(null, 60) === 'free' && E.practice('nope') === null, 'after the end the next key starts the tune again; free play has no tune');

    // the sound: the core's piano voice, run against a fake AudioContext
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const a = core.indexOf('/* ==== PIANO VOICE START ==== */'), b = core.indexOf('/* ==== PIANO VOICE END ==== */');
    ok(a > 0 && b > a, 'the core has the piano voice');
    const log = [];
    const param = (name) => ({ name, sets: [], setValueAtTime(v, t) { this.sets.push(['set', v, t]); }, exponentialRampToValueAtTime(v, t) { this.sets.push(['exp', v, t]); }, setTargetAtTime(v, t, c) { this.sets.push(['target', v, t, c]); }, cancelScheduledValues(t) { this.sets.push(['cancel', t]); } });
    const node = (kind) => { const n = { kind, out: [], connect(x) { this.out.push(x); } }; log.push(n); return n; };
    const AC = {
      state: 'running', currentTime: 3,
      createOscillator() { const o = node('osc'); o.frequency = param('f'); o.start = (t) => { o.started = t; }; o.stop = (t) => { o.stops = (o.stops || []).concat(t); }; return o; },
      createGain() { const g = node('gain'); g.gain = param('g'); return g; },
      createBiquadFilter() { const f = node('filter'); f.frequency = param('f'); return f; },
      createDynamicsCompressor() { const c = node('comp'); ['threshold', 'knee', 'ratio', 'attack', 'release'].forEach((k) => { c[k] = param(k); }); return c; },
      resume() { this.resumed = true; }
    };
    const sb = { state: { settings: { sfx: true } }, AC, sfxBus: { kind: 'bus' }, audioApi: {}, ensureAudio() {}, now() { return AC.currentTime; }, Math };
    vm.createContext(sb);
    vm.runInContext(core.slice(a, b), sb);
    const h = sb.audioApi.piano(E.freq(57));
    const oscs = log.filter((n) => n.kind === 'osc');
    const fs0 = oscs.map((o) => o.frequency.sets[0][1]);
    ok(!!h && oscs.length === 3 && Math.abs(fs0[0] - 220) < 1e-9 && Math.abs(fs0[1] - 440) < 1e-9 && Math.abs(fs0[2] - 660) < 1e-9 && oscs.every((o) => o.started === 3), 'A3 sounds at 220 Hz with partials at 440 and 660, started at once');
    const toBus = (n) => n.out.includes(sb.sfxBus) || n.out.some((x) => x.kind === 'comp' && x.out.includes(sb.sfxBus));
    const rel = log.filter((n) => n.kind === 'gain' && toBus(n));
    ok(rel.length === 1, 'the note goes out through the sound-effects bus, so the sound setting governs it');
    AC.currentTime = 3.4;
    h.stop(); h.stop();
    const rs = rel[0].gain.sets;
    ok(rs.filter((s) => s[0] === 'target').length === 1 && rs.some((s) => s[0] === 'target' && s[2] === 3.4 && s[1] < 0.001) && oscs.every((o) => o.stops.length === 2 && o.stops[1] <= 3.4 + 0.5), 'lifting the key fades the note from that moment and stops it within half a second, once');
    sb.state.settings.sfx = false;
    const n0 = log.length;
    ok(sb.audioApi.piano(440) === null && log.length === n0 && (sb.state.settings.sfx = true) && sb.audioApi.piano(0) === null && sb.audioApi.piano(NaN) === null, 'with sound effects off, or no pitch, no note is made');

    // #1019: on a Nokia X20 the piano was audible only at full phone volume. The old voice
    // struck at 0.29 (partials summed) and fell to 0.07 within a quarter second, so a held
    // key was about a third as loud as a one-off tap sound. Read the level the voice
    // schedules: the envelope at a moment times the sum of the partials' gains.
    const level = (freq, at) => {
      const start = log.length;
      AC.currentTime = 10;
      sb.audioApi.piano(freq);
      const mine = log.slice(start);
      const lp = mine.find((n) => n.kind === 'filter'), env = lp && lp.out[0];
      const sum = mine.filter((n) => n.kind === 'osc').reduce((s, o) => s + o.out[0].gain.sets[0][1], 0);
      if (!env || !env.gain) return 0;
      const pts = env.gain.sets.filter((s) => s[0] === 'set' || s[0] === 'exp');
      const t = 10 + at;
      let v = pts[0][1];
      for (let i = 1; i < pts.length; i++) {
        const [, v1, t1] = pts[i], [, v0, t0] = pts[i - 1];
        if (t >= t1) { v = v1; continue; }
        v = t <= t0 ? v0 : v0 * Math.pow(v1 / v0, (t - t0) / (t1 - t0));
        break;
      }
      return v * sum;
    };
    const lv = { strike: level(220, 0.006), a3: level(220, 1), c6: level(1046.5, 0.6) };
    ok(lv.strike >= 0.8 && lv.a3 >= 0.3 && lv.c6 >= 0.2, 'a key strikes loud and stays audible while held (strike ' + lv.strike.toFixed(2) + ' ≥ 0.8, A3 after 1 s ' + lv.a3.toFixed(2) + ' ≥ 0.3, C6 after 0.6 s ' + lv.c6.toFixed(2) + ' ≥ 0.2)');
    // #1114: a held key fades all the way down instead of sitting flat and then stopping. Read
    // the envelope's own stages: after the strike every stage falls, none falls faster than
    // 100 dB a second, and the last one (to silence) lasts at least half a second.
    {
      const start = log.length;
      AC.currentTime = 20;
      sb.audioApi.piano(220);
      const mine = log.slice(start), lp = mine.find((n) => n.kind === 'filter'), env = lp && lp.out[0];
      const pts = env.gain.sets.filter((s) => s[0] === 'set' || s[0] === 'exp');
      const seg = [];
      for (let i = 2; i < pts.length; i++) seg.push({ db: 20 * Math.log10(pts[i - 1][1] / pts[i][1]), dt: pts[i][2] - pts[i - 1][2] });
      ok(seg.length >= 3 && seg.every((x) => x.db > 0), 'a held note falls through every stage after the strike (' + seg.map((x) => x.db.toFixed(1) + ' dB').join(', ') + ')');
      ok(seg.every((x) => x.db / x.dt <= 100), 'and no stage drops faster than 100 dB a second (' + seg.map((x) => (x.db / x.dt).toFixed(0)).join(', ') + ')');
      ok(seg[seg.length - 1].dt >= 0.5, 'the last stage to silence is a fade of at least half a second (' + seg[seg.length - 1].dt.toFixed(2) + ' s)');
    }
    ok(E.TALL >= 7, 'a white key may be up to 7 key widths tall (' + E.TALL + ')');
    const comp = log.filter((n) => n.kind === 'comp');
    ok(comp.length === 1 && comp[0].out.includes(sb.sfxBus) && log.filter((n) => n.kind === 'gain' && n.out.includes(comp[0])).length >= 3, 'every note goes through one shared compressor, so a loud chord does not clip');
    ok(/C\.audio\.piano\(E\.freq\(m\)\)/.test(html) && !/\.(mp3|ogg|wav)\b/.test(html) && !/^\s*mood:/m.test(html), 'the page plays the synthesized voice, no audio files and no background music');

    // the page and its listing
    const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
    const gm = games.find((g) => g.id === 'piano');
    ok(!!gm && gm.cat === 'skill' && gm.people === 1 && gm.daily === false && gm.path === 'games/piano/index.html' && gm.added === '2026-11-20' && Array.isArray(gm.files) && gm.files.length === 0, 'Piano is listed as a one-player toy with no daily');
    ok(games.filter((g) => g.id === 'piano').length === 1, 'it is listed once');
    ok(!!gm && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l]) && gm.name.fa === 'پیانو' && gm.name.en === 'Piano', 'its name and summary exist in every language');
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (v) => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    const lab = (x) => {
      const [Rr, Gr, Bl] = rgb(x).map(lin), f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
    };
    const dE = (x, y) => { const P1 = lab(x), Q = lab(y); return Math.hypot(P1[0] - Q[0], P1[1] - Q[1], P1[2] - Q[2]); };
    const lum = (x) => rgb(x).map((v) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const others = games.filter((g) => g.id !== 'piano');
    const nearOf = (list) => gm ? list.map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0] || ['none', 99] : ['none', 0];
    const nearCat = nearOf(others.filter((g) => gm && g.cat === gm.cat)), nearAll = nearOf(others);
    ok(!!gm && gm.color === '#73002D' && others.length > 60 && nearCat[1] >= 15 && nearAll[1] >= 8 && 1.05 / (lum(gm.color) + 0.05) >= 4.5 && html.indexOf("ACCENT = '" + gm.color + "'") > 0 && /accent: ACCENT/.test(html),
      'the accent is ΔE ≥ 15 from every skill game (nearest ' + nearCat[0] + ', ' + nearCat[1].toFixed(1) + '), ≥ 8 from every game (nearest ' + nearAll[0] + ', ' + nearAll[1].toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    // Chain Reaction, Ludo and Gridlock each ask every other accent to sit 15° of hue away
    // from theirs; the first draft (#7D0A5F) was 1° from Chain Reaction and broke its test
    const hue = (h) => { const [x, y, z] = rgb(h), mx = Math.max(x, y, z), d = mx - Math.min(x, y, z); if (!d) return 0; const q = mx === x ? ((y - z) / d) % 6 : mx === y ? (z - x) / d + 2 : (x - y) / d + 4; return (q * 60 + 360) % 360; };
    const hd = (p, q) => { const d = Math.abs(p - q) % 360; return Math.min(d, 360 - d); };
    const guarded = others.filter((g) => ['chain', 'ludo', 'gridlock'].includes(g.id));
    ok(!!gm && guarded.length === 3 && guarded.every((g) => hd(hue(g.color), hue(gm.color)) >= 15), 'the hue keeps 15° from the games that guard theirs (' + guarded.map((g) => g.id + ' ' + (gm ? hd(hue(g.color), hue(gm.color)).toFixed(0) : '-') + '°').join(', ') + ')');
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/piano/icon.svg'), 'utf8');
    ok(!!gm && new RegExp('^<svg[^>]*>\\s*<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon.trim()), 'the icon starts on the soft tint of games.json');
    const ids = ['pn-tune', 'pn-all'];
    ok(ids.every((id) => core.split("id: '" + id + "'").length === 2 && html.indexOf("unlock('" + id + "')") > 0), 'the two awards are in the core once each and unlocked by the game');
    ok(/pn: 'piano'/.test(core), 'the award prefix pn belongs to Piano');
    const titleOf = (id) => { const i = core.indexOf("id: '" + id + "'"); const m = core.slice(i, i + 400).match(/ en: '([^']+)'/); return m ? m[1] : ''; };
    const titles = ids.map(titleOf);
    ok(titles.every((t) => t && core.split("en: '" + t + "'").length === 2), 'the award titles are unique in the core (' + titles.join(', ') + ')');
    ok(/\.pn-canvas \{[^}]*width: 100%; height: 100%/.test(html) && /cv\.width !== Math\.round\(Z\.w \* dpr\) \|\| cv\.height !== Math\.round\(Z\.h \* dpr\)/.test(html) && /drawn = L/.test(html) && /document\.fonts\.ready/.test(html) && /class: 'ch-fit'/.test(html), 'the canvas is sized in CSS (#919), resized on both sides, read against the layout last drawn, redrawn when fonts arrive, in the core\'s board slot');
    ok(/prefs\.hold === 'off'\) \{\s*if \(E\.advance\(prac\) === 'done'\) finishTune\(\);/.test(html) && /if \(\['on', 'off'\]\.indexOf\(prefs\.hold\) < 0\) prefs\.hold = 'on'/.test(html) && /pnHold, pnHoldOn|pnHoldOn: /.test(html) && /function showLength\(\)/.test(html) && /Math\.ceil\(b\)/.test(html), 'the hold can be switched off in the gear (default on, #1014) and the note length shows as beat cells above the keys');
    ok(/fingers\[e\.pointerId\]/.test(html) && /setPointerCapture/.test(html) && /addEventListener\('pointercancel', lift\)/.test(html) && /C\.onPause\(function \(\) \{[^}]*allOff\(\)/.test(html), 'each finger holds its own note (chords), and leaving the app lets every note go');
    ok(/ctx\.button\(\{ icon: 'gear', label: C\.t\('settings'\)/.test(html) && !/pnLabels/.test(html.slice(html.indexOf('function showHelp'), html.indexOf('function tArt'))), 'the key labels option sits behind a gear, not in help');
    // the first draft let the muted note replace a tune's progress and "well done" (seen in Playwright)
    ok(/if \(soundOff\(\) && !prac\) t = C\.t\('pnMuted'\)/.test(html), 'with sound off a tune still shows its progress; only free play gives way to the muted note');
    ok(/ctx\.tutorialIfNew\(TUT\)/.test(html) && !/history\.(push|replace)State|localStorage/.test(html) && !/C\.daily\(|C\.stats\.daily\(/.test(html), 'a tutorial, no history or direct storage, no daily');
    const blockOf = (l) => { const m = html.match(new RegExp('\\n      ' + l + ': \\{([\\s\\S]*?)\\n      \\}')); return m ? m[1] : ''; };
    const keys = (s) => [...s.matchAll(/(pn[A-Za-z0-9]+):/g)].map((m) => m[1]).sort();
    const faKeys = keys(blockOf('fa'));
    ok(faKeys.length > 30 && LOCALE_CODES.every((l) => same(keys(blockOf(l)), faKeys)), 'all ' + faKeys.length + ' strings exist in all ' + LOCALE_CODES.length + ' languages');
    const used = [...new Set([...html.matchAll(/C\.t\('(pn[A-Za-z0-9]+)'/g)].map((m) => m[1]))];
    ok(used.length > 25 && used.every((k) => faKeys.includes(k)), 'every string the page asks for is defined (' + used.length + ')');
    ok(LOCALE_CODES.every((l) => { const m = blockOf(l).match(/pnNames: '([^']+)'/); return m && m[1].split(' ').length === 7; }), 'the seven note names are given in every language');

    // #1104: a recording is stored and read back, so what comes back is cleaned
    const clean = E.recClean || (() => ['recClean is missing']);
    const good = [{ m: 60, t: 0, d: 400 }, { m: 64, t: 500, d: 300 }];
    ok(same(clean(good), good) && E.recSpan && E.recSpan(good) === 800, 'a recording keeps its notes and its length is where the last note ends');
    ok(same(clean(null), []) && same(clean('x'), []) && same(clean([null, 5, {}, { m: 60 }]), []), 'anything stored that is not a list of notes gives an empty recording');
    ok(clean([{ m: 10, t: 0, d: 100 }, { m: 60, t: -5, d: 100 }, { m: 60, t: 0, d: 0 }, { m: 60, t: 1e9, d: 100 }]).length === 0, 'a note outside the keys, before the start, without length or past the time limit is dropped');
    ok(same(clean([{ m: 62, t: 900, d: 100 }, { m: 60, t: 100, d: 100 }]).map((n) => n.m), [60, 62]), 'notes come back in time order');
    const many = Array.from({ length: 1500 }, (_, i) => ({ m: 60, t: i, d: 50 }));
    ok(E.REC_MAX_NOTES === 1000 && clean(many).length === 1000, 'a recording keeps at most 1000 notes');
    ok(/recBtn/.test(html) && /ctx\.store\.set\('rec'/.test(html) && /C\.t\('pnRecSaved'/.test(html) && /rt0/.test(html), 'the page has a record button, saves the recording and survives a note ending after the recording');
    // CI runs about three times slower than the laptop; keep local time under a third
    const took = Date.now() - t0;
    ok(took < 1500, 'the Piano tests finish in under 1.5 s (' + took + ' ms)');
  }
  return { testPiano };
};
