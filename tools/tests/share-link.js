'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT } = T;

  // #1069: a shared record carries the link to the game it came from.
  function testShareLink() {
    head('Share: the record text ends with the game link (#1069)');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const src = (core.match(/Chogan\.shareWithLink = (function \(text, gameId\) \{[\s\S]*?\n  \});/) || [])[1];
    ok(!!src, 'shareWithLink exists');
    if (!src) return;
    const f = vm.runInNewContext('(' + src + ')');
    const t = f('Chogan · Chess\n12 moves', 'chess');
    ok(t === 'Chogan · Chess\n12 moves\nhttps://choganhq.github.io/chogan/games/chess/', 'text then the game link');
    ok(f(t, 'chess') === t, 'a text that already has the link is left alone');
    ok(f('', 'chess') === 'https://choganhq.github.io/chogan/games/chess/', 'an empty text is just the link');
    ok(f('x', '../evil') === 'x\nhttps://choganhq.github.io/chogan/', 'a bad id falls back to the app link');
    ok(/text: Chogan\.shareWithLink\(o\.shareText, cfg\.id\)/.test(core), 'the result window uses it');
    // The link is built from the game id, so every game's folder must carry its id
    const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
    ok(list.length > 0, 'catalogue is non-empty');
    list.forEach(function (g) { ok(g.path === 'games/' + g.id + '/index.html', g.id + ': folder is the id'); });
  }
  return { testShareLink };
};
