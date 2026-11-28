'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, ROOT, LOCALE_CODES } = T;
  // #1207: tiles slide down four lanes and each tap plays the next note of an old tune
  function testTileTunes() {
    const games = T.games();
    head('Tile Tunes (#1207)');
    const t0 = Date.now();
    const file = path.join(ROOT, 'www/games/tiletunes/index.html');
    ok(fs.existsSync(file), 'the Tile Tunes page exists');
    const E = loadEngine('tiletunes', 'TileTunesEngineFactory');
    const html = fs.readFileSync(file, 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    ok(E.LANES === 4 && E.LIVES === 3 && JSON.stringify(E.SPEED_IDS) === '["slow","normal","fast","insane"]' && E.SPEEDS.slow < 1 && E.SPEEDS.normal === 1 && E.SPEEDS.fast > 1 && E.SPEEDS.insane > E.SPEEDS.fast, 'four lanes, three slips, four speeds, one above fast (#1272)');

    // the notes
    ok(Math.abs(E.freq(69) - 440) < 1e-9 && Math.abs(E.freq(60) - 261.6256) < 1e-3, 'A4 is 440 Hz and middle C 261.63 Hz');
    ok(JSON.stringify(E.parse('C4 F#4:0.5 Bb3:2')) === '[{"m":60,"d":1},{"m":66,"d":0.5},{"m":58,"d":2}]', 'a token is a note, its octave and an optional length in beats');
    let threw = false;
    try { E.parse('H4'); } catch (er) { threw = true; }
    ok(threw, 'an unknown note name is refused rather than played wrong');

    // every song: parses, has its title in every language, ends in a short while, and
    // its lanes follow the tune without ever asking for the same lane on a new pitch
    const songs = E.SONGS;
    ok(songs.length >= 8 && new Set(songs.map((s) => s.id)).size === songs.length, 'at least eight songs with their own ids (' + songs.length + ')');
    const bad = [];
    const used = new Set();
    for (const s of songs) {
      const c = E.chart(s.id), n = c.notes;
      if (!n.length || n.length < 30) bad.push(s.id + ': only ' + n.length + ' notes');
      if (!LOCALE_CODES.every((l) => s.t[l] && s.t[l].indexOf("'") < 0)) bad.push(s.id + ': a title is missing');
      if (n.some((x) => x.lane < 0 || x.lane > 3 || x.lane !== (x.lane | 0))) bad.push(s.id + ': lane out of range');
      if (new Set(n.map((x) => x.lane)).size !== 4) bad.push(s.id + ': not every lane is used');
      if (n.some((x, i) => i && x.m !== n[i - 1].m && x.lane === n[i - 1].lane)) bad.push(s.id + ': a new pitch in the same lane');
      if (n.some((x, i) => i && x.m === n[i - 1].m && x.lane !== n[i - 1].lane)) bad.push(s.id + ': a repeated note moved');
      if (n.some((x) => x.m < 55 || x.m > 84 || x.d < 0.5)) bad.push(s.id + ': a note outside G3..C6 or shorter than half a beat');
      const sec = E.seconds(s.id, 'normal');
      if (sec < 15 || sec > 90) bad.push(s.id + ': ' + sec.toFixed(0) + ' s');
      const gap = Math.min(...n.slice(0, -1).map((x) => x.d)) / (c.bpm / 60);
      if (gap < 0.18) bad.push(s.id + ': taps ' + gap.toFixed(2) + ' s apart at normal speed');
      n.forEach((x) => used.add(x.lane));
    }
    ok(!bad.length, 'every song parses, is named in all ' + LOCALE_CODES.length + ' languages, lasts 15–90 s, uses all four lanes and moves lane on each new pitch' + (bad.length ? ' (' + bad.slice(0, 6).join('; ') + ')' : ''));
    ok(songs.every((s, i) => !i || E.chart(s.id).bpm >= E.chart(songs[i - 1].id).bpm - 20), 'the song list runs roughly from gentle to quick');

    // The test player: at every speed it taps each tile in its lane as the tile reaches
    // the line, ticking the music at 60 frames a second. Every song must be finished with
    // no slip; a second player taps a little late every time and must still finish clean.
    const play = (song, speed, lateBy) => {
      const S = E.newGame({ song, speed });
      let frames = 0, guard = 0;
      while (!S.over && guard++ < 200000) {
        const n = E.next(S);
        if (S.wait || S.pos >= n.b + lateBy) { const r = E.tap(S, n.lane); if (r.type !== 'hit') return { S, fail: 'tap ' + r.type + ' at note ' + S.i }; continue; }
        const r = E.tick(S, 1 / 60);
        frames++;
        if (r) return { S, fail: r.type + ' at note ' + S.i };
      }
      return { S, frames };
    };
    const fails = [];
    let runs = 0;
    for (const s of songs) for (const sp of E.SPEED_IDS) for (const late of [0, 0.4]) {
      runs++;
      const r = play(s.id, sp, late);
      const R = E.result(r.S);
      if (r.fail || !R.won || R.miss || R.stars !== 3 || R.hits !== R.total) fails.push(s.id + '/' + sp + '/' + late + ': ' + (r.fail || JSON.stringify(R)));
    }
    ok(runs === songs.length * 8 && !fails.length, 'a test player finishes every song at every speed, on the beat and 0.4 beats late, with three stars (' + runs + ' runs)' + (fails.length ? ' (' + fails.slice(0, 4).join('; ') + ')' : ''));
    {
      const r = play('twinkle', 'normal', 0);
      const sec = E.seconds('twinkle', 'normal');
      ok(Math.abs(r.S.t - sec) < 1.5, 'the music runs at its tempo: Twinkle takes about ' + sec.toFixed(1) + ' s (' + r.S.t.toFixed(1) + ' s played)');
    }

    // the rules
    {
      const S = E.newGame({ song: 'ode', speed: 'normal' });
      ok(S.wait && S.i === 0 && E.tick(S, 5) === null && S.pos < 0, 'the first tile waits above the line until it is tapped');
      const first = E.next(S);
      ok(E.tap(S, (first.lane + 1) % 4).type === 'none' && S.miss === 0, 'while the tune waits, a tap in another lane costs nothing');
      ok(E.tap(S, first.lane).type === 'hit' && !S.wait && S.i === 1, 'tapping the waiting tile starts the tune');
      const n2 = E.next(S);
      const w = E.tap(S, (n2.lane + 2) % 4);
      ok(w.type === 'wrong' && S.miss === 1 && S.i === 1, 'while it runs, a tap on an empty lane is a slip and plays nothing');
      // let the next tile sink past the line
      let late = null;
      for (let k = 0; k < 600 && !late; k++) late = E.tick(S, 1 / 60);
      ok(late && late.type === 'late' && S.miss === 2 && S.wait && S.pos < E.next(S).b, 'a tile that sinks past the line is a slip, and the board winds back so it waits above the line');
      ok(E.valid(S), 'a game in progress passes the save check');
      const b1 = JSON.parse(JSON.stringify(S)); b1.song = 'nope';
      const b2 = JSON.parse(JSON.stringify(S)); b2.i = 9999;
      const b3 = JSON.parse(JSON.stringify(S)); b3.miss = 7;
      const b4 = JSON.parse(JSON.stringify(S)); b4.over = 'won';
      ok(!E.valid(b1) && !E.valid(b2) && !E.valid(b3) && !E.valid(b4) && !E.valid(null), 'a tampered or broken save is refused');
      E.tap(S, E.next(S).lane);
      E.pause(S);
      ok(S.wait && E.tick(S, 10) === null && S.miss === 2, 'a pause makes the tune wait, so coming back costs no slip');
      const lost = E.tap(S, (E.next(S).lane + 1) % 4);
      ok(lost.type === 'none', 'a stray tap after a pause is ignored too');
      E.tap(S, E.next(S).lane);
      const third = E.tap(S, (E.next(S).lane + 3) % 4);
      ok(third.type === 'wrong' && third.lost && S.over === 'lost' && E.tap(S, 0).type === 'none' && E.result(S).stars === 0, 'the third slip loses the song, and no more taps count');
      // the never-tapping player: three tiles slip by and the song is lost
      const N = E.newGame({ song: 'twinkle', speed: 'fast' });
      E.tap(N, E.next(N).lane);
      let lates = 0;
      for (let k = 0; k < 20000 && !N.over; k++) {
        if (N.wait) { E.tap(N, E.next(N).lane); continue; }
        // tap only the tiles after a slip, so every other tile is let go
        const r = E.tick(N, 1 / 60);
        if (r && r.type === 'late') lates++;
        if (r) { k += 0; }
      }
      ok(N.over === 'lost' && lates === 3 && N.miss === 3, 'a player who lets every running tile go loses after three slips');
      const one = E.newGame({ song: 'twinkle' });
      ok(E.result({ song: 'twinkle', over: 'won', i: E.chart('twinkle').notes.length, miss: 2 }).stars === 1 && E.result({ song: 'twinkle', over: 'won', i: 1, miss: 1 }).stars === 2 && one.speed === 'normal', 'stars: three with no slip, one with two');
      const d = E.newGame({ song: 'x', speed: 'y' });
      ok(d.song === songs[0].id && d.speed === 'normal', 'an unknown song or speed falls back to the first song at normal speed');
    }

    // the page
    ok(/C\.daily\('tiletunes', date\)\.rng/.test(html) && /speed: 'normal'/.test(html) && /C\.stats\.daily\('tiletunes', daily/.test(html), 'the daily song is picked by the core\'s daily seed and played at normal speed');
    ok(/C\.audio\.piano \? C\.audio\.piano\(E\.freq\(n\.m\)\) : null/.test(html) && !/\.(mp3|ogg|wav|m4a)\b/.test(html), 'every tile plays the core\'s piano voice, and the game carries no audio file');
    ok(html.indexOf("unlock('tt-fast')") > 0 && /\(S\.speed === 'fast' \|\| S\.speed === 'insane'\) && !daily/.test(html), 'the fast award needs fast or faster outside the daily song');

    // strings: every key the page uses is in every locale
    const strBlock = html.slice(html.indexOf('strings: {'), html.indexOf('\n  var params'));
    const keys = [...new Set([...html.matchAll(/C\.t\('([A-Za-z0-9]+)'/g)].map((m) => m[1]))];
    const CORE_KEYS = ['help', 'keyboard', 'tutorial', 'done', 'daily', 'resetWarn', 'dailyDone', 'settings', 'stars', 'speedSlow', 'speedNormal', 'speedFast', 'best', 'again'];
    const own = keys.filter((k) => CORE_KEYS.indexOf(k) < 0);
    ok(own.length >= 20, 'the page names its own strings (' + own.length + ' keys)');
    // each locale's block runs from its `xx: {` line to the next one
    const parts = strBlock.split(/\n {6}([a-z]{2}): \{/);
    const blocks = {};
    for (let i = 1; i < parts.length; i += 2) blocks[parts[i]] = parts[i + 1];
    const missing = [];
    ok(Object.keys(blocks).length === LOCALE_CODES.length, 'the page has one string block per locale (' + Object.keys(blocks).join(' ') + ')');
    for (const loc of LOCALE_CODES) {
      if (!blocks[loc]) { missing.push(loc + ':*'); continue; }
      for (const k of own) if (!new RegExp('(^|[\\s,{])' + k + ': \'').test(blocks[loc])) missing.push(loc + ':' + k);
    }
    ok(!missing.length, 'every string the page uses is in all ' + LOCALE_CODES.length + ' locales' + (missing.length ? ' (missing ' + missing.slice(0, 8).join(', ') + ')' : ''));
    const coreMissing = CORE_KEYS.filter((k) => keys.indexOf(k) >= 0 && (core.match(new RegExp('[\\s,{]' + k + ": '", 'g')) || []).length < LOCALE_CODES.length);
    ok(!coreMissing.length, 'the core labels it borrows exist in every locale' + (coreMissing.length ? ' (' + coreMissing.join(', ') + ')' : ''));
    const enKeys = [...(blocks.en || '').matchAll(/([A-Za-z0-9]+): '/g)].map((m) => m[1]);
    ok(['again', 'help', 'daily', 'done', 'time'].every((k) => enKeys.indexOf(k) < 0), 'the page does not redefine a core label (again, help, daily, done, time)');
    ok((html.match(/\{ title: C\.t\('tutTitle\d'\)/g) || []).length === 3, 'three tutorial cards');

    const gm = games.find((g) => g.id === 'tiletunes');
    ok(!!gm && games.filter((g) => g.id === 'tiletunes').length === 1 && gm.cat === 'skill' && gm.people === 1 && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l]), 'Tile Tunes is listed once, as a one-player skill game, with a name and summary in every locale');
    ok(!!gm && LOCALE_CODES.every((l) => html.slice(html.indexOf('name: {'), html.indexOf('accent: ACCENT')).indexOf(l + ": '" + gm.name[l] + "'") >= 0), 'the page and games.json give the game the same name in every locale');
    ok(!!gm && !/piano tiles/i.test(JSON.stringify(gm.name) + JSON.stringify(gm.summary)) && !/Piano Tiles/i.test(html), 'the product name "Piano Tiles" is not used');
    const otherNames = games.filter((g) => g.id !== 'tiletunes').flatMap((g) => LOCALE_CODES.map((l) => l + ':' + g.name[l]));
    ok(!!gm && LOCALE_CODES.every((l) => otherNames.indexOf(l + ':' + gm.name[l]) < 0), 'no other game has the same name in any language');

    // awards
    const AW = ['tt-song', 'tt-clean', 'tt-fast', 'tt-all', 'tt-daily'];
    const awLines = AW.map((id) => core.split('\n').find((l) => l.indexOf("{ id: '" + id + "'") >= 0) || '');
    ok(awLines.every((l, i) => l && html.indexOf("unlock('" + AW[i] + "')") > 0 && LOCALE_CODES.every((loc) => new RegExp('[{,]\\s*' + loc + ": '[^']+'").test(l) && new RegExp('[{,]\\s*d' + loc + ": '[^']+'").test(l))), 'the five awards are in the core with a title and description in every locale, and the game unlocks them');
    ok(/\btt: 'tiletunes'/.test(core), 'the core maps the tt- award prefix to Tile Tunes');
    const dupTitles = [];
    for (const loc of LOCALE_CODES) {
      awLines.forEach((l) => {
        const t = (l.match(new RegExp('[{,]\\s*' + loc + ": '([^']+)'")) || [])[1];
        if (t && core.split(' ' + loc + ": '" + t + "'").length !== 2) dupTitles.push(loc + ':' + t);
      });
    }
    ok(!dupTitles.length, 'no other award has the same title in any language' + (dupTitles.length ? ' (' + dupTitles.join(', ') + ')' : ''));

    // the accent: ΔE 15 from every game (the brief asks it of every accent, not only of skill games)
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const lab = (x) => { const [Rr, Gr, Bl] = rgb(x).map(lin), f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]; };
    const dE = (p, q) => { const a = lab(p), b = lab(q); return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); };
    const lum = (x) => rgb(x).map(lin).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
    const col = gm ? gm.color : '';
    const others = games.filter((g) => g.id !== 'tiletunes' && /^#[0-9A-Fa-f]{6}$/.test(g.color));
    ok(others.length > 90, 'the accent is compared against ' + others.length + ' games');
    const near = others.reduce((b, g) => { const d = dE(col, g.color); return d < b[0] ? [d, g.id] : b; }, [1e9, '']);
    ok(near[0] >= 15, 'the accent ' + col + ' is at least ΔE 15 from every game (nearest ' + near[1] + ', ' + near[0].toFixed(1) + ')');
    const hue = (h) => { const [x, y, z] = rgb(h), mx = Math.max(x, y, z), d = mx - Math.min(x, y, z); if (!d) return 0; const q = mx === x ? ((y - z) / d) % 6 : mx === y ? (z - x) / d + 2 : (x - y) / d + 4; return (q * 60 + 360) % 360; };
    const hd = (p, q) => { const d = Math.abs(p - q) % 360; return Math.min(d, 360 - d); };
    const hueGuard = others.filter((g) => ['chain', 'ludo', 'gridlock'].includes(g.id));
    ok(!!gm && hueGuard.length === 3 && hueGuard.every((g) => hd(hue(g.color), hue(col)) >= 15), 'the hue keeps 15° from Chain Reaction, Ludo and Gridlock (' + hueGuard.map((g) => g.id + ' ' + hd(hue(g.color), hue(col)).toFixed(0) + '°').join(', ') + ')');
    const con = 1.05 / (lum(col) + 0.05);
    ok(con >= 4.5, 'white text on the accent reads at 4.5:1 or more (' + con.toFixed(2) + ')');
    ok(html.indexOf("var ACCENT = '" + col + "'") >= 0, 'the page uses the listed accent');

    // layout and drawing rules from earlier canvas bugs
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/tiletunes/icon.svg'), 'utf8');
    ok(!!gm && icon.indexOf('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>') === icon.indexOf('<rect'), 'the icon sits on the game\'s soft tint');
    ok(/\.tt-box canvas \{[^}]*width: 100%; height: 100%/.test(html), 'the canvas is sized by CSS width and height (#919)');
    ok(/document\.fonts\.ready\.then/.test(html) && /ResizeObserver/.test(html) && /cv\.width !== [^|]*\|\| cv\.height !== /.test(html), 'the board redraws when the web font arrives and when its box changes, checking both sides of the backing store');
    ok(/drawn\.w/.test(html) && /e\.persisted/.test(html) && /C\.keyIs\(e, /.test(html) && /pointerdown/.test(html), 'taps are read against the board as last drawn, keys go through C.keyIs, it answers on pointerdown and handles the back/forward cache');
    ok(/class: 'ch-fit'/.test(html) && /ch-split/.test(html) && /ctx\.tutorialIfNew\(TUT\)/.test(html) && !/localStorage|history\.(push|replace)State|fetch\(|XMLHttpRequest|setInterval/.test(html), 'core layout, a tutorial, no direct storage, history, network or interval timer');
    const coreCss = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8');
    const usedTokens = [...new Set([...html.matchAll(/var\((--c-[a-z0-9-]+)/g)].map((m) => m[1]))];
    const unknownTokens = usedTokens.filter((v) => coreCss.indexOf(v + ':') < 0);
    ok(usedTokens.length > 2 && unknownTokens.length === 0, 'every core colour token it uses exists in chogan.css (' + usedTokens.length + ' used' + (unknownTokens.length ? '; unknown: ' + unknownTokens.join(', ') : '') + ')');
    // endless (#1272): songs follow one another until the third slip
    const run = E.newGame({ song: songs[songs.length - 1].id, speed: 'normal', endless: true });
    const len = E.chart(run.song).notes.length;
    let moved = 0;
    for (let i = 0; i < len; i++) { run.pos = E.next(run).b; if (E.tap(run, E.next(run).lane).moved) moved++; }
    ok(len > 0 && moved === 1 && run.over === null && run.song === songs[0].id && run.songs === 1 && run.i === 0 && E.total(run) === len, 'in endless play the last note of a song starts the next one, and the last song wraps to the first');
    // #1293: the next song used to appear LEAD beats above the line on a moving board
    ok(run.pos <= E.next(run).b - E.VIEW, 'the next song comes in from the top of the screen (#1293)');
    const mid = Object.assign({}, run, { wait: false });
    E.pause(mid);
    ok(E.valid(mid) && E.tap(mid, E.next(mid).lane).type === 'hit', 'a pause right after the song change leaves a first tile that can be tapped (#1293)');
    run.wait = false;
    for (let i = 0; i < 3; i++) E.tap(run, (E.next(run).lane + 1) % 4);
    const rr = E.result(run);
    ok(run.over === 'lost' && rr.endless === true && rr.hits === len && rr.songs === 1, 'three slips end an endless run, which counts every note played');
    const one = E.newGame({ song: songs[0].id });
    for (let i = 0; i < E.chart(one.song).notes.length; i++) { one.pos = E.next(one).b; E.tap(one, E.next(one).lane); }
    ok(one.over === 'won' && one.endless === undefined, 'without endless play a finished song is still won');
    ok(E.valid(run) && E.valid(E.newGame({ endless: true })) && E.valid(one) && !E.valid(Object.assign({}, run, { done: -1 })), 'endless runs and older saves are accepted, a damaged count is not');
    ok(LOCALE_CODES.every((l) => { const i = html.indexOf('\n      ' + l + ': {', html.indexOf('strings: {')); const block = html.slice(i, html.indexOf('\n      }', i)); return ['ttEndless:', 'ttEndlessNote:', 'ttRecord:'].every((k) => block.includes(k)); }), 'endless play is worded in every locale');
    ok(/prefs\.endless/.test(html) && /ctx\.store\.set\('endless'/.test(html) && /endless: !!prefs\.endless/.test(html), 'the gear holds the endless switch and its best score is kept apart from the song stars');
    ok(Date.now() - t0 < 3000, 'the Tile Tunes tests finish in under 3 s (' + (Date.now() - t0) + ' ms)');
  }
  return { testTileTunes };
};
