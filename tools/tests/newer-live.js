'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, os, spawnSync, ROOT } = T;

  // #1183: an older run deployed over a newer one
  function testNewerLive() {
    head('An older run does not deploy over a newer one (#1183)');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'newer-'));
    try {
      const git = (...a) => spawnSync('git', ['-C', tmp, '-c', 'user.name=t', '-c', 'user.email=t@invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...a], { encoding: 'utf8' }).stdout.trim();
      const commit = (m) => { git('commit', '-q', '--allow-empty', '-m', m); return git('rev-parse', 'HEAD'); };
      git('init', '-q');
      const older = commit('older'), newer = commit('newer');
      git('update-ref', 'refs/remotes/origin/staging', newer);
      const served = path.join(tmp, 'version.js');
      const run = (sha, live, event) => {
        fs.writeFileSync(served, "self.APP_COMMIT = '" + live + "';\n");
        return spawnSync('bash', [path.join(ROOT, 'tools/newer-live.sh'), 'file://' + served], { cwd: tmp, encoding: 'utf8',
          env: Object.assign({}, process.env, { GITHUB_SHA: sha, GITHUB_REF_NAME: 'staging', GITHUB_EVENT_NAME: event || 'push' }) }).stdout.trim();
      };
      ok(run(older, newer) === 'superseded=true', 'an older commit is not deployed when a newer one is live');
      ok(run(newer, older) === 'superseded=false', 'a newer commit is deployed over an older one');
      ok(run(newer, newer) === 'superseded=false', 'the live commit can be deployed again');
      ok(run(older, newer, 'workflow_dispatch') === 'superseded=false', 'a manual run always deploys');
      ok(run(older, '0'.repeat(40)) === 'superseded=false', 'an unknown live commit does not stop a deploy');
      git('update-ref', 'refs/remotes/origin/staging', older);
      ok(run(older, newer) === 'superseded=false', 'after the branch is reset, the commit left behind is replaced');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }

    const y = fs.readFileSync(path.join(ROOT, '.github/workflows/test.yml'), 'utf8');
    const job = (name) => (y.split('\n  ' + name + ':\n')[1] || '').split(/\n  [a-z-]+:\n/)[0];
    for (const name of ['pages', 'staging']) {
      const j = job(name);
      ok(/run: bash tools\/newer-live\.sh /.test(j) && /steps\.newer\.outputs\.superseded != 'true'/.test(j), name + ' asks before it deploys');
      ok(/cancel-in-progress: false/.test(j), name + ': a later job waits instead of cancelling a deploy that may be newer');
      ok(/fetch-depth: 0/.test(j), name + ' has the history the comparison needs');
    }
  }

  return { testNewerLive };
};
