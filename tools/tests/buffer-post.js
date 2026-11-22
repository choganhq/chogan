'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, spawnSync, ROOT } = T;

  // #1056: a release is posted to X, Mastodon and Bluesky through Buffer
  function testBufferPost() {
    head('Buffer post (#1056)');
    const py = path.join(ROOT, 'tools/buffer-post.py');
    const clDir = path.join(ROOT, 'fastlane/metadata/android/en-US/changelogs');
    const run = spawnSync('python3', ['-I', '-c', [
      'import importlib.util,glob,re,sys',
      "s=importlib.util.spec_from_file_location('b',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)",
      "fs=sorted(glob.glob(sys.argv[2]+'/*.txt'))",
      'posts=[m.build("1.0.0",m.load_sections(f)) for f in fs]',
      'print(len(fs))',
      'print(max(m.length(t) for t in posts))',
      // the only link may be the site's: the first link becomes X's preview card
      'print(max(len(re.findall(r"https?://|github\\.com", t)) for t in posts))',
    ].join('\n'), py, clDir], { encoding: 'utf8' });
    const [n, longest, links] = (run.stdout || '').trim().split('\n').map(Number);
    ok(run.status === 0 && n > 20, 'the Buffer post was built from every English changelog (' + n + ' files)');
    ok(longest <= 280, 'no post is over 280 counted characters (longest ' + longest + ')');
    ok(links === 1, 'a post has exactly one link, the site, so the preview card is the app and not a contributor (' + links + ')');
    const rel = fs.readFileSync(path.join(ROOT, '.github/workflows/release.yml'), 'utf8');
    ok(/social:[\s\S]*needs: apk[\s\S]*buffer-post\.py[^\n]*--send/.test(rel) && /BUFFER_API_KEY: \$\{\{ secrets\.BUFFER_API_KEY \}\}/.test(rel),
      'release.yml posts through Buffer in its own job after the APK, with the key from the secret');
    const man = fs.readFileSync(path.join(ROOT, '.github/workflows/social-post.yml'), 'utf8');
    ok(/default: true/.test(man.split('dry_run:')[1] || '') && /buffer-post\.py/.test(man), 'social-post.yml runs the same script and is a dry run by default');
  }
  return { testBufferPost };
};
