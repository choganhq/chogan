// A momentary connection error must not cost the watcher its whole hourly run.
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;
  function testWatchRetry() {
    head('The watcher retries a failed gh call');
    const sh = fs.readFileSync(path.join(ROOT, 'tools/watch/watch.sh'), 'utf8');
    const fn = (sh.match(/\ngh\(\) \{\n[\s\S]*?\n\}\n/) || [''])[0];
    ok(!!fn, 'watch.sh wraps gh in a retrying function');
    const os = require('os'), cp = require('child_process');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-retry-'));
    // a stand-in gh that fails `FAILS` times, printing half an answer first, then succeeds
    fs.writeFileSync(path.join(dir, 'gh'), '#!/usr/bin/env bash\necho x >> "$D/calls"\n' +
      'if [ "$(wc -l < "$D/calls")" -le "$FAILS" ]; then echo partial; exit 1; fi\necho 7\n', { mode: 0o755 });
    const run = fails => {
      fs.rmSync(path.join(dir, 'calls'), { force: true });
      const r = cp.spawnSync('bash', ['-c', fn + 'gh pr list'], { encoding: 'utf8',
        env: { PATH: dir + ':' + process.env.PATH, D: dir, FAILS: String(fails), GH_RETRY_WAIT: '0' } });
      const calls = fs.existsSync(path.join(dir, 'calls')) ? fs.readFileSync(path.join(dir, 'calls'), 'utf8').split('\n').length - 1 : 0;
      return { code: r.status, out: r.stdout, calls };
    };
    const twice = run(2);
    ok(twice.code === 0 && twice.out === '7\n' && twice.calls === 3, 'two failures, then the answer alone');
    const never = run(99);
    ok(never.code === 1 && never.out === '' && never.calls === 4, 'it gives up after four tries with no output');
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return { testWatchRetry };
};
