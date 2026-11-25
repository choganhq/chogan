'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT } = T;
  const CODES = ['fa', 'en', 'zh', 'de', 'es', 'pl', 'fr', 'ar', 'hi', 'ru', 'pt'];

  // #1023: the Android apps showed no update row (it needs a service worker) and, in
  // Chogan Plus, the games' version instead of the app's own. The app now reports its
  // own build through a bridge and the Profile links to the store page.
  function testAndroidAppInfo() {
    head('Android: the Profile shows the app build and a store link (#1023)');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const src = (core.match(/Chogan\.appInfo = (function \(raw\) \{[\s\S]*?\n  \});\n  Chogan\.app = null;/) || [])[1];
    ok(!!src, 'Chogan.appInfo is in the core');
    if (!src) return;
    const appInfo = vm.runInNewContext('(' + src + ')', {});
    const raw = (version, pkg, installer) => JSON.stringify({ version, pkg, installer });
    const chogan = 'io.github.choganhq.chogan', plus = 'io.github.choganhq.choganplus';
    const a = appInfo(raw('0.37.0', chogan, 'com.android.vending'));
    ok(a && a.version === '0.37.0' && a.store === 'https://play.google.com/store/apps/details?id=' + chogan, 'Chogan from Play links to its Play page');
    ok(appInfo(raw('0.37.0', chogan, 'org.fdroid.fdroid')).store === 'https://f-droid.org/packages/' + chogan + '/', 'Chogan from F-Droid links to F-Droid');
    ok(appInfo(raw('0.37.0', chogan, '')).store === 'https://github.com/choganhq/chogan/releases/latest', 'a sideloaded APK links to the releases page');
    ok(appInfo(raw('0.2.7', plus, '')).store === 'https://play.google.com/store/apps/details?id=' + plus, 'Chogan Plus always links to Play, even when the installer is unknown');
    ok(appInfo('') === null && appInfo('not json') === null, 'no answer or garbage means no app info');
    ok(appInfo(raw('x', chogan, '')) === null && appInfo(raw('0.1.0', 'a b"c', '')) === null, 'a bad version or package name is refused, so nothing odd reaches a link');

    const html = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
    ok(/C\.app && !\(U && U\.supported\)/.test(html) && /href: C\.app\.store/.test(html), 'the update row offers the store page where there is no service worker');
    ok(/C\.app && C\.app\.version !== C\.version/.test(html), 'the version badge is the app\'s own version when it differs from the bundled games\'');
    const blocks = core.match(/updStore: '[^']+', updStoreNote: '[^']+'/g) || [];
    ok(blocks.length === CODES.length, 'both labels exist in every language (' + blocks.length + ' of ' + CODES.length + ')');

    const java = (f) => { try { return fs.readFileSync(path.join(ROOT, 'android/app/src/main/java/io/github/choganhq/chogan', f), 'utf8'); } catch (e) { return ''; } };
    ok(/getPackageInfo\(/.test(java('AppInfoBridge.java')) && /@JavascriptInterface/.test(java('AppInfoBridge.java')), 'the native bridge reads the package info');
    ok(/new AppInfoBridge\(this\), "ChoganApp"/.test(java('MainActivity.java')), 'MainActivity registers it as ChoganApp');
    const manifest = fs.readFileSync(path.join(ROOT, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
    ok(!/QUERY_ALL_PACKAGES|REQUEST_INSTALL_PACKAGES/.test(manifest), 'no new permission was added');
  }
  return { testAndroidAppInfo };
};
