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
    // #1288: 1.1.0 had no new game and its post began with "Also:", referring to nothing
    const heads = spawnSync('python3', ['-I', '-c', [
      'import importlib.util,sys',
      "s=importlib.util.spec_from_file_location('b',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)",
      "print(m.build('1.0.0',[('Bug fixes',['one']),('Improvements',['two'])]).split('\\n')[2])",
      "print(m.build('1.0.0',[('New games',['Hex']),('Bug fixes',['one'])]).split('\\n')[3])",
    ].join('\n'), py], { encoding: 'utf8' });
    const [alone, after] = (heads.stdout || '').trim().split('\n');
    ok(heads.status === 0 && alone === "What's new: one; two", 'a post without new games does not begin with "Also" (' + alone + ')');
    ok(after === 'Also: one', 'after the new games the other lines still follow as "Also" (' + after + ')');
    // X weighs an emoji (and anything outside Latin and general punctuation) as two
    const weight = spawnSync('python3', ['-I', '-c', [
      'import importlib.util,sys',
      "s=importlib.util.spec_from_file_location('b',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)",
      "print(m.length('a\\U0001F3AE'), m.length('\\u06F1\\u2014\\u4E2D'))",
    ].join('\n'), py], { encoding: 'utf8' });
    ok((weight.stdout || '').trim() === '3 4', 'the count follows X: an emoji or a Chinese character is two (' + (weight.stdout || '').trim() + ')');
    const rel = fs.readFileSync(path.join(ROOT, '.github/workflows/release.yml'), 'utf8');
    ok(/social:[\s\S]*needs: apk[\s\S]*buffer-post\.py[^\n]*--send/.test(rel) && /BUFFER_API_KEY: \$\{\{ secrets\.BUFFER_API_KEY \}\}/.test(rel),
      'release.yml posts through Buffer in its own job after the APK, with the key from the secret');
    const man = fs.readFileSync(path.join(ROOT, '.github/workflows/social-post.yml'), 'utf8');
    ok(/default: true/.test(man.split('dry_run:')[1] || '') && /buffer-post\.py/.test(man), 'social-post.yml runs the same script and is a dry run by default');
    ok(!/ref: \$\{\{ inputs\.tag \}\}/.test(man) && /git show "\$\{TAG\}:www\/version\.js"/.test(man), 'social-post.yml runs the script from main and reads only the version and changelog from the tag');
  }
  return { testBufferPost };
};
