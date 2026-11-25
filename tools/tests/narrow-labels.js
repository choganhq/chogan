'use strict';
// #1172: on a 360px phone four labels ended in an ellipsis ("Rival · Me…", "Bot…",
// "Queen still i…", "Ne…"). Measured with Playwright in en/es/pt; these guards keep the
// rules that let them wrap or give them room.
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;
  function testNarrowLabels() {
    head('Labels on a 360px phone (#1172)');
    const read = (g) => fs.readFileSync(path.join(ROOT, 'www/games', g, 'index.html'), 'utf8');
    // the first top-level rule for a selector, outside any @media block
    const rule = (src, sel) => {
      const css = src.slice(src.indexOf('<style>'), src.indexOf('</style>')).replace(/@media[^{]*\{(?:[^{}]*\{[^}]*\})*[^{}]*\}/g, '');
      const m = css.match(new RegExp('(^|\\n)\\s*' + sel.replace(/\./g, '\\.') + '\\s*\\{([^}]*)\\}'));
      return m ? m[2] : null;
    };
    const cuts = (body) => /text-overflow:\s*ellipsis|white-space:\s*nowrap/.test(body);
    const checks = [
      ['backgammon', '.bg-player__name'],
      ['corridor', '.cr-player__name'],
      ['apiary', '.ap-side__name'],
      ['apiary', '.ap-side__sub'],
    ];
    ok(checks.length > 0, 'there are labels to check');
    for (const [g, sel] of checks) {
      const body = rule(read(g), sel);
      ok(body !== null && !cuts(body), g + ': ' + sel + ' wraps instead of ending in an ellipsis');
    }
    const cr = read('corridor');
    ok(/el\('div', \{ class: 'cr-player__text' \}, \[\s*el\('div', \{ class: 'cr-player__name'[^\n]*\n\s*el\('div', \{ class: 'cr-player__walls'/.test(cr),
      'corridor: the walls count sits under the name, not beside it');
    const ap = read('apiary');
    ok(/@media \(max-height: 480px\) \{[^@]*\.ap-side__name, \.ap-side__sub \{[^}]*white-space: nowrap/.test(ap),
      'apiary: a landscape phone keeps one-line names, so the status stays in sight');
    const td = read('tower-defence');
    ok(/\.td-bottom \{[^}]*flex-wrap: wrap[^}]*container-type: inline-size/.test(td) && /@container \(max-width: 420px\) \{ \.td-preview \{ flex-basis: 100%; \} \}/.test(td),
      'tower defence: on a narrow row the next-wave preview gets its own line');
  }
  return { testNarrowLabels };
};
