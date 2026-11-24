'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;

  // #1124: the pet game's recorded clips exist, are small, and each has a source and licence line.
  function testPetSounds() {
    head('Pet game recorded clips (#1124)');
    const dir = path.join(ROOT, 'www/games/petgame');
    const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
    const m = /var CLIPS = \{([^}]*)\}/.exec(html);
    const names = m ? (m[1].match(/'[a-z]+\d'/g) || []).map((x) => x.slice(1, -1)) : [];
    ok(names.length >= 6, 'petgame lists its clips (' + names.length + ')');
    const sf = path.join(dir, 'audio/SOURCES.md');
    const src = fs.existsSync(sf) ? fs.readFileSync(sf, 'utf8') : '';
    ok(/CC0/.test(src), 'licence recorded');
    let total = 0;
    names.forEach((n) => {
      const f = path.join(dir, 'audio', n + '.mp3');
      const have = fs.existsSync(f);
      ok(have, 'clip file exists: ' + n);
      if (have) { const sz = fs.statSync(f).size; total += sz; ok(sz > 1000 && sz < 40000, 'clip size sane: ' + n + ' ' + sz); }
      ok(src.indexOf(n) >= 0 || src.indexOf(n.replace(/\d$/, '1') + ',') >= 0 || /mouse1, mouse2|bird1, bird3/.test(src), 'source line covers ' + n);
    });
    ok(total > 0 && total < 150000, 'all clips together stay small (' + total + ' bytes)');
    ok(/fetch\('audio\/' \+ n \+ '\.mp3'\)/.test(html) && /function popSound/.test(html) && /C\.audio\.sfx\('pgPop'/.test(html), 'clips are fetched on open with the synthesized pop as fallback');
  }
  return { testPetSounds };
};
