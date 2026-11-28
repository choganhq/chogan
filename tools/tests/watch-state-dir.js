// The watch folder is a symlink to a shared disk, outside the run's allowed directories,
// so the run could not record anything in waiting.md (#1285).
module.exports = function (T) {
  const { ok, head, fs, path, os, spawnSync, ROOT } = T;
  function testWatchStateDir() {
    head('The watcher run may write its state folder');
    const sh = fs.readFileSync(path.join(ROOT, 'tools/watch/watch.sh'), 'utf8');
    const cmd = (sh.match(/\| claude -p [\s\S]*?>"\$OUT" 2>&1/) || [''])[0].slice(2);
    ok(!!cmd, 'watch.sh starts claude');
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'watch-dir-')));
    fs.mkdirSync(path.join(dir, 'shared'));
    fs.symlinkSync(path.join(dir, 'shared'), path.join(dir, 'watch'));
    const out = path.join(dir, 'args');
    spawnSync('bash', ['-c', 'claude() { printf "%s\\n" "$@"; }\n' + cmd],
      { env: { PATH: process.env.PATH, OUT: out, HERE: path.join(dir, 'watch'), sid: 's', name: 'n' } });
    const args = fs.existsSync(out) ? fs.readFileSync(out, 'utf8').split('\n') : [];
    // the resolved folder, not the link: that is the path the permission check compares
    ok(args.some((a, i) => a === path.join(dir, 'shared') && args[i - 1] === '--add-dir'),
      'the real state folder is passed with --add-dir');
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return { testWatchStateDir };
};
