// A TV hides an app that does not declare these, and nothing on a phone would show it (#1210).
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;
  function testAndroidTv() {
    head('Android TV');
    const m = fs.readFileSync(path.join(ROOT, 'android/app/src/main/AndroidManifest.xml'), 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '');
    ok(/category android:name="android\.intent\.category\.LEANBACK_LAUNCHER"/.test(m), 'listed on a TV home screen');
    ['android.software.leanback', 'android.hardware.touchscreen'].forEach((f) => {
      ok(m.includes('<uses-feature android:name="' + f + '" android:required="false" />'), f + ' is declared optional');
    });
    ok(m.includes('android:banner="@drawable/tv_banner"'), 'the app has a TV banner');
    const file = path.join(ROOT, 'android/app/src/main/res/drawable-xhdpi/tv_banner.png');
    const png = fs.existsSync(file) ? fs.readFileSync(file) : Buffer.alloc(24);
    ok(png.readUInt32BE(16) === 320 && png.readUInt32BE(20) === 180, 'the banner is 320x180 at xhdpi');
  }
  return { testAndroidTv };
};
