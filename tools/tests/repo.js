'use strict';
module.exports = function (T) {
  const { ok, head, spawnSync, ROOT } = T;
  // #1099: running the Python tools left tools/__pycache__/*.pyc in the tree, and two
  // commits (#1065, #1095) added them to main with everything else
  function testNoBytecode() {
    head('No compiled Python in the repository (#1099)');
    const r = spawnSync('git', ['-C', ROOT, 'ls-files'], { encoding: 'utf8' });
    const files = r.status === 0 ? r.stdout.split('\n').filter(Boolean) : [];
    ok(files.length > 0, 'git ls-files lists the tracked files (' + files.length + ')');
    const bad = files.filter((f) => /(^|\/)__pycache__\//.test(f) || /\.py[co]$/.test(f));
    ok(!bad.length, 'no tracked .pyc file or __pycache__ folder' + (bad.length ? ': ' + bad.join(', ') : ''));
  }
  return { testNoBytecode };
};
