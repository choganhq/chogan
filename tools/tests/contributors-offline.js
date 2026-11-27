'use strict';
// tools/test.js asks contributors.sh about every release; two `git ls-remote` per call made a
// local run take more than ten minutes (#1266), so offline mode must not touch the remote.
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;
  const os = require('os');
  const { spawnSync } = require('child_process');

  function testContributorsOffline() {
    head('contributors.sh stays offline when asked to (#1266)');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chogan-git-'));
    try {
      const real = spawnSync('bash', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
      const log = path.join(dir, 'calls');
      fs.writeFileSync(path.join(dir, 'git'), '#!/bin/sh\necho "$*" >> "' + log + '"\nexec "' + real + '" "$@"\n', { mode: 0o755 });
      const run = (tag) => spawnSync('bash', [path.join(ROOT, 'tools/contributors.sh'), tag], {
        cwd: ROOT, encoding: 'utf8',
        env: Object.assign({}, process.env, { CONTRIBUTORS_OFFLINE: '1', PATH: dir + ':' + process.env.PATH })
      });
      const r = run('v0.18.0');
      const calls = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) : [];
      ok(r.status === 0 && r.stdout === 'lanlan3292\n', 'the release\'s contributor is still named');
      ok(calls.some((c) => /^tag /.test(c)), 'the git calls were seen');
      ok(!calls.some((c) => /^ls-remote/.test(c)), 'no call to the remote for a tag the clone has');
      ok(run('v999.0.0').status === 2, 'an unknown tag is still refused');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  return { testContributorsOffline };
};
