// Cutting a run's summary by bytes split a Persian letter and left runs.md invalid
// UTF-8, which the next watcher run could neither read nor write (#1259).
module.exports = function (T) {
  const { ok, head, fs, path, os, spawnSync, ROOT } = T;
  function testWatchRunsLog() {
    head('The watcher keeps runs.md valid UTF-8');
    const sh = fs.readFileSync(path.join(ROOT, 'tools/watch/watch.sh'), 'utf8');
    const line = (sh.match(/^ *tail -c 4000 "\$OUT".*$/m) || [''])[0];
    ok(!!line, 'watch.sh copies the end of the run output');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-runs-'));
    const out = path.join(dir, 'out');
    // one ASCII byte after 2-byte letters puts the 4000-byte cut inside a letter
    fs.writeFileSync(out, 'س'.repeat(3000) + '.');
    const r = spawnSync('bash', ['-c', line], { env: { PATH: process.env.PATH, OUT: out } });
    let text = null;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(r.stdout); } catch (e) {}
    ok(text !== null, 'the copied tail is valid UTF-8');
    ok(text === 'س'.repeat(1999) + '.', 'only the half letter is dropped');
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return { testWatchRunsLog };
};
