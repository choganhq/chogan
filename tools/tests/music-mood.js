'use strict';
// #1140: Piano sets no music mood on purpose, yet turning the music switch on or coming back
// to the tab started the menu tune under the keys, because both paths fell back to 'menu'.
// A page that never asked for music must stay silent; the menu and games with a mood still play.
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT } = T;
  function testMusicNeedsMood() {
    head('Background music plays only where a page asked for it (#1140)');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const at = core.indexOf('  var audioApi = {');
    const end = core.indexOf('  Chogan.audio = audioApi;', at);
    const vis = core.match(/\n {2}document\.addEventListener\('visibilitychange', function \(\) \{\n[\s\S]*?\n {2}\}\);/);
    ok(at > 0 && end > at && !!vis, 'chogan.js has the audio API and the tab-visibility handler to run');
    if (!(at > 0 && end > at && vis)) return;
    const run = (moodName) => {
      const started = [];
      const music = { timer: null, mood: null, step: 0, next: 0, playing: false };
      const gain = { value: 0, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {} };
      const listeners = {};
      const ctx = {
        Chogan: {}, music, MOODS: { menu: { air: 0.1 }, calm: { air: 0.1 } },
        state: { settings: { music: false } }, saveSettings() {}, SFX: {},
        AC: { state: 'running', resume() {} }, ensureAudio() { return ctx.AC; }, audioReady: true,
        now: () => 0, musBus: { gain }, scheduleMusic() {}, setInterval: () => 1, clearInterval() {},
        fireResume() {}, firePause() {}, restoredElsewhere: () => false, global: { location: { reload() {} } },
        document: { hidden: false, addEventListener: (n, f) => { listeners[n] = f; } }
      };
      vm.createContext(ctx);
      vm.runInContext(core.slice(at, end) + vis[0], ctx);
      const A = ctx.audioApi;
      const real = A.music;
      A.music = function (m) { started.push(m); return real.call(A, m); };
      if (moodName) { music.moodName = moodName; music.mood = ctx.MOODS[moodName]; }
      return { A, ctx, listeners, started };
    };
    let r = run(null);
    r.A.setMusic(true);
    ok(r.started.length === 0, 'turning the music switch on in a page without a mood plays nothing (got: ' + r.started.join() + ')');
    r.ctx.document.hidden = true; r.listeners.visibilitychange(); r.ctx.document.hidden = false; r.listeners.visibilitychange();
    ok(r.started.length === 0, 'coming back to the tab in a page without a mood plays nothing (got: ' + r.started.join() + ')');
    r = run('menu');
    r.A.setMusic(true);
    ok(r.started.join() === 'menu', 'the menu still starts its tune when the switch is turned on');
    r = run('calm');
    r.ctx.state.settings.music = true;
    r.listeners.visibilitychange();
    ok(r.started.join() === 'calm', 'a game with a mood still resumes its own tune on return to the tab');
    const piano = fs.readFileSync(path.join(ROOT, 'www/games/piano/index.html'), 'utf8');
    ok(!/\bmood:\s*'/.test(piano), 'Piano asks for no background music');
  }
  return { testMusicNeedsMood };
};
