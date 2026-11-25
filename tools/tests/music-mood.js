'use strict';
// #1140: Piano (and Pet) start no music, yet coming back to the tab or turning the music switch on
// fell back to the menu's tune, which then played under every note the player made.
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT } = T;
  function testMoodlessMusic() {
    head('A game without music never gets the menu tune (#1140)');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const at = core.indexOf('  var music = { timer: null');
    const end = core.indexOf('  Chogan.audio = audioApi;', at);
    ok(at > 0 && end > at, 'chogan.js has the music block to run');
    if (!(at > 0 && end > at)) return;
    const node = () => ({ type: '', frequency: { value: 0 }, gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} }, connect() {}, start() {}, stop() {} });
    const run = () => {
      const ctx = {
        Chogan: {}, Math, state: { settings: { music: true, sfx: true } }, saveSettings() {},
        AC: { state: 'running', currentTime: 0, createOscillator: node, createGain: node, resume() {} },
        musBus: node(), audioReady: true, ensureAudio() {}, now: () => 0, SFX: {},
        MOODS: { menu: { root: 220, scale: [0, 2, 4, 7, 9], bpm: 90, pad: 'sine', lead: 'sine', chords: [0, 3], air: 0.2 }, puzzle: { root: 262, scale: [0, 2, 4, 7, 9], bpm: 80, pad: 'sine', lead: 'sine', chords: [0, 4], air: 0.2 } },
        setInterval: () => 1, clearInterval() {}
      };
      vm.createContext(ctx);
      vm.runInContext(core.slice(at, end) + '\nthis.__music = music; this.__api = audioApi;', ctx);
      return ctx;
    };
    let c = run();
    c.__api.setMusic(false); c.__api.setMusic(true);
    ok(!c.__music.playing && c.__music.mood === null, 'turning music on in a game with no mood plays nothing (it played the menu tune)');
    c = run();
    c.__api.stopMusic(0); if (c.__api.resume) c.__api.resume(); else c.__api.music(c.__music.moodName || 'menu');
    ok(!c.__music.playing, 'coming back to a game with no mood plays nothing');
    c = run();
    c.__api.music('puzzle'); c.__api.stopMusic(0); c.__api.setMusic(false); c.__api.setMusic(true);
    ok(c.__music.playing && c.__music.moodName === 'puzzle', 'a game with a mood gets its own tune back after the switch');
    ok(/visibilitychange[\s\S]{0,200}audioApi\.resume\(\)/.test(core) && !/moodName \|\| 'menu'/.test(core), 'the tab-return path resumes the page\'s own mood, never a menu fallback');
  }
  return { testMoodlessMusic };
};
