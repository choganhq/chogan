/* ===========================================================================
   چوگان — هسته‌ی مشترک اپ
   جاوااسکریپت خام، بدون وابستگی، بدون مرحله‌ی بیلد.
   هر چیزی که بین بازی‌ها مشترک است فقط اینجا زندگی می‌کند.
   =========================================================================== */
(function (global) {
  'use strict';

  var Chogan = {};
  var NS = 'chogan';
  var APP = 'app';

  /* ======================================================= ابزار کوچک */

  function el(tag, props, kids) {
    var n = document.createElement(tag);
    if (props) {
      for (var k in props) {
        if (!Object.prototype.hasOwnProperty.call(props, k)) continue;
        var v = props[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'html') n.innerHTML = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'style' && typeof v === 'object') { for (var s in v) n.style.setProperty(s, v[s]); }
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else if (k === 'dataset') { for (var d in v) n.dataset[d] = v[d]; }
        else n.setAttribute(k, v === true ? '' : v);
      }
    }
    if (kids !== null && kids !== undefined) {
      var list = Array.isArray(kids) ? kids : [kids];
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c === null || c === undefined || c === false) continue;
        n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      }
    }
    return n;
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  Chogan.el = el;
  Chogan.$ = $;
  Chogan.$$ = $$;
  Chogan.clamp = clamp;

  /* ============================================ تصادف قطعی و بذر روز */

  // درهم‌سازی رشته به عدد ۳۲ بیتی. برای ساختن بذر از متن.
  function hash32(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  // mulberry32 — کوچک، سریع، قطعی. برای پازل روزانه و نقشه‌ها.
  function rng(seed) {
    var a = (typeof seed === 'string' ? hash32(seed) : (seed >>> 0)) || 1;
    var f = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.int = function (n) { return Math.floor(f() * n); };
    f.range = function (a2, b2) { return a2 + Math.floor(f() * (b2 - a2 + 1)); };
    f.pick = function (arr) { return arr[Math.floor(f() * arr.length)]; };
    f.shuffle = function (arr) {
      var out = arr.slice();
      for (var i = out.length - 1; i > 0; i--) {
        var j = Math.floor(f() * (i + 1));
        var t2 = out[i]; out[i] = out[j]; out[j] = t2;
      }
      return out;
    };
    return f;
  }
  Chogan.hash32 = hash32;
  Chogan.rng = rng;

  function dateKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function keyToDate(k) {
    var p = k.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  Chogan.dateKey = dateKey;
  Chogan.keyToDate = keyToDate;

  // بذر قطعی چالش روزانه. برای همه‌ی کاربران در یک روز یکسان است.
  Chogan.daily = function (gameId, date) {
    var key = typeof date === 'string' ? date : dateKey(date);
    var seed = hash32('chogan|' + gameId + '|' + key);
    return { date: key, gameId: gameId, seed: seed, rng: rng(seed) };
  };

  /* ================================================== ذخیره‌سازی محلی */

  var memFallback = {};
  var lsOk = (function () {
    try {
      var k = '__ch__';
      global.localStorage.setItem(k, '1');
      global.localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  })();

  function rawGet(key) {
    try { return lsOk ? global.localStorage.getItem(key) : (memFallback[key] || null); }
    catch (e) { return memFallback[key] || null; }
  }
  function rawSet(key, val) {
    memFallback[key] = val;
    try { if (lsOk) global.localStorage.setItem(key, val); } catch (e) { /* پر یا خصوصی */ }
  }
  function rawDel(key) {
    delete memFallback[key];
    try { if (lsOk) global.localStorage.removeItem(key); } catch (e) { /* بی‌خیال */ }
  }

  // هر بازی فقط از راه این پوشش به ذخیره‌سازی دست می‌زند.
  // پیشوند اجباری است تا بازی‌ها داده‌ی هم را خراب نکنند.
  // localStorage.clear در کل اپ ممنوع است چون ذخیره‌ی همه را می‌سوزاند.
  Chogan.storage = function (id) {
    var pre = NS + '.' + id + '.';
    return {
      id: id,
      prefix: pre,
      get: function (key, def) {
        var raw = rawGet(pre + key);
        if (raw === null) return def === undefined ? null : def;
        try { return JSON.parse(raw); } catch (e) { return def === undefined ? null : def; }
      },
      set: function (key, val) {
        try { rawSet(pre + key, JSON.stringify(val)); } catch (e) { /* حلقه یا حجم */ }
        return val;
      },
      remove: function (key) { rawDel(pre + key); },
      has: function (key) { return rawGet(pre + key) !== null; },
      // پاک کردن کامل داده‌ی همین بازی. فقط از تنظیمات صدا زده می‌شود.
      wipe: function () {
        var keys = [];
        try {
          if (lsOk) {
            for (var i = 0; i < global.localStorage.length; i++) {
              var k = global.localStorage.key(i);
              if (k && k.indexOf(pre) === 0) keys.push(k);
            }
          }
        } catch (e) { /* بی‌خیال */ }
        for (var m in memFallback) if (m.indexOf(pre) === 0) keys.push(m);
        for (var j = 0; j < keys.length; j++) rawDel(keys[j]);
      }
    };
  };

  var appStore = Chogan.storage(APP);
  Chogan.store = appStore;

  /* ========================================================= وضعیت اپ */

  var DEFAULT_SETTINGS = {
    lang: 'fa',
    theme: 'auto',   // auto | light | dark
    sfx: true,
    music: true,
    haptics: true
  };

  function randomId() {
    var s = '';
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var buf = null;
    try {
      if (global.crypto && global.crypto.getRandomValues) {
        buf = new Uint8Array(12);
        global.crypto.getRandomValues(buf);
      }
    } catch (e) { buf = null; }
    for (var i = 0; i < 12; i++) {
      var v = buf ? buf[i] : Math.floor(Math.random() * 256);
      s += chars[v % chars.length];
    }
    return s;
  }

  var state = {
    settings: Object.assign({}, DEFAULT_SETTINGS, appStore.get('settings', {})),
    // شناسه‌ی ناشناس تصادفی. الان هیچ‌جا فرستاده نمی‌شود؛
    // فقط برای اینکه اگر روزی همگام‌سازی آمد، مدل داده عوض نشود.
    profile: Object.assign({ name: '', country: '', uid: '' }, appStore.get('profile', {})),
    coins: appStore.get('coins', 0),
    unlocks: appStore.get('unlocks', []),
    achievements: appStore.get('achievements', {}),
    stats: appStore.get('stats', { plays: 0, timeMs: 0, byGame: {}, daily: {}, streak: { count: 0, best: 0, last: '' } }),
    league: appStore.get('league', null),
    counters: appStore.get('counters', {})
  };
  if (!state.profile.uid) { state.profile.uid = randomId(); appStore.set('profile', state.profile); }
  Chogan.state = state;

  function saveSettings() { appStore.set('settings', state.settings); }
  function saveStats() { appStore.set('stats', state.stats); }

  /* ============================================== زبان و رقم و جهت */

  var STR = {
    fa: {
      appName: 'چوگان', home: 'خانه', daily: 'روزانه', league: 'لیگ',
      achievements: 'دستاوردها', profile: 'پروفایل', settings: 'تنظیمات',
      play: 'بازی', resume: 'ادامه', newGame: 'بازی تازه', again: 'دوباره',
      menu: 'منو', back: 'بازگشت', close: 'بستن', cancel: 'انصراف',
      confirm: 'تأیید', done: 'باشه', next: 'بعدی', skip: 'رد کردن',
      start: 'شروع', pause: 'مکث', resumeGame: 'ادامه‌ی بازی', restart: 'شروع دوباره',
      quit: 'خروج به منو', help: 'راهنما', share: 'اشتراک‌گذاری', copied: 'در حافظه کپی شد',
      best: 'بهترین', score: 'امتیاز', time: 'زمان', coins: 'سکه',
      newBadge: 'جدید', continueBadge: 'ادامه', todayChallenge: 'چالش روزانه',
      todayChallengeSub: 'هر روز یک پازل تازه، یکسان برای همه',
      won: 'بردی', lost: 'باختی', finished: 'تمام شد',
      earned: 'به دست آوردی', weeklyPoints: 'امتیاز هفته', tier: 'رده',
      promoted: 'صعود کردی', demoted: 'سقوط کردی', stayed: 'در رده ماندی',
      bronze: 'برنز', silver: 'نقره', gold: 'طلا', diamond: 'الماس', legend: 'افسانه',
      seasonEnds: 'پایان فصل', days: 'روز', hours: 'ساعت', minutes: 'دقیقه',
      rank: 'رتبه', points: 'امتیاز', you: 'تو',
      offlineRivals: 'حریف‌های آفلاین، ساخته‌شده روی همین دستگاه',
      streak: 'پیوستگی', dayStreak: 'روز پیوسته', locked: 'قفل',
      unlockedAt: 'باز شد', totalPlays: 'بازی', playTime: 'زمان بازی',
      language: 'زبان', theme: 'تم', themeAuto: 'خودکار', themeLight: 'روشن', themeDark: 'تاریک',
      sfx: 'افکت صوتی', music: 'موسیقی', haptics: 'لرزش',
      resetGame: 'بازنشانی داده‌ی بازی', resetAsk: 'داده‌ی این بازی کامل پاک شود؟',
      resetWarn: 'این کار برگشت ندارد.', resetDone: 'پاک شد',
      about: 'درباره', version: 'نسخه', source: 'کد منبع', license: 'مجوز',
      aboutText: 'رایگان، متن‌باز، بدون تبلیغ، بدون ردیاب، کاملاً آفلاین.',
      name: 'نام', country: 'کشور', optional: 'اختیاری',
      hint: 'راهنمایی', notEnoughCoins: 'سکه کافی نداری', hintUsed: 'راهنمایی گرفتی',
      coinsEarned: 'سکه گرفتی', playToEarn: 'یک دور بازی کن تا سکه بگیری',
      keyboard: 'کیبورد', difficulty: 'سختی',
      easy: 'آسان', medium: 'متوسط', hard: 'سخت', expert: 'خبره',
      today: 'امروز', dailyDone: 'امروز را زدی', dailyOpen: 'هنوز نزدی',
      noAchievements: 'هنوز دستاوردی نگرفتی', emptyDaily: 'برای این روز چیزی ثبت نشده',
      sun: 'ی', mon: 'د', tue: 'س', wed: 'چ', thu: 'پ', fri: 'ج', sat: 'ش',
      unlocks: 'تم‌ها و شخصیت‌ها', unlockCost: 'باز کردن', owned: 'باز شده', apply: 'انتخاب',
      tutorial: 'آموزش', gotIt: 'فهمیدم', stars: 'ستاره'
    },
    en: {
      appName: 'Chogan', home: 'Home', daily: 'Daily', league: 'League',
      achievements: 'Awards', profile: 'Profile', settings: 'Settings',
      play: 'Play', resume: 'Resume', newGame: 'New game', again: 'Again',
      menu: 'Menu', back: 'Back', close: 'Close', cancel: 'Cancel',
      confirm: 'Confirm', done: 'OK', next: 'Next', skip: 'Skip',
      start: 'Start', pause: 'Pause', resumeGame: 'Resume', restart: 'Restart',
      quit: 'Quit to menu', help: 'Help', share: 'Share', copied: 'Copied to clipboard',
      best: 'Best', score: 'Score', time: 'Time', coins: 'Coins',
      newBadge: 'New', continueBadge: 'Resume', todayChallenge: 'Daily challenge',
      todayChallengeSub: 'A fresh puzzle every day, the same for everyone',
      won: 'You won', lost: 'You lost', finished: 'Finished',
      earned: 'You earned', weeklyPoints: 'Weekly points', tier: 'Tier',
      promoted: 'Promoted', demoted: 'Relegated', stayed: 'Held your tier',
      bronze: 'Bronze', silver: 'Silver', gold: 'Gold', diamond: 'Diamond', legend: 'Legend',
      seasonEnds: 'Season ends in', days: 'd', hours: 'h', minutes: 'm',
      rank: 'Rank', points: 'Points', you: 'You',
      offlineRivals: 'Offline rivals, generated on this device',
      streak: 'Streak', dayStreak: 'day streak', locked: 'Locked',
      unlockedAt: 'Unlocked', totalPlays: 'Games', playTime: 'Play time',
      language: 'Language', theme: 'Theme', themeAuto: 'Auto', themeLight: 'Light', themeDark: 'Dark',
      sfx: 'Sound effects', music: 'Music', haptics: 'Vibration',
      resetGame: 'Reset game data', resetAsk: 'Erase all data for this game?',
      resetWarn: 'This cannot be undone.', resetDone: 'Erased',
      about: 'About', version: 'Version', source: 'Source code', license: 'License',
      aboutText: 'Free, open source, no ads, no trackers, fully offline.',
      name: 'Name', country: 'Country', optional: 'optional',
      hint: 'Hint', notEnoughCoins: 'Not enough coins', hintUsed: 'Hint used',
      coinsEarned: 'coins earned', playToEarn: 'Play a round to earn coins',
      keyboard: 'Keyboard', difficulty: 'Difficulty',
      easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert',
      today: 'Today', dailyDone: 'Done today', dailyOpen: 'Not played yet',
      emptyDaily: 'Nothing recorded for this day', noAchievements: 'No awards yet',
      sun: 'S', mon: 'M', tue: 'T', wed: 'W', thu: 'T', fri: 'F', sat: 'S',
      unlocks: 'Themes and characters', unlockCost: 'Unlock', owned: 'Unlocked', apply: 'Select',
      tutorial: 'How to play', gotIt: 'Got it', stars: 'stars'
    }
  };
  var localStrings = { fa: {}, en: {} };

  Chogan.strings = function (obj) {
    if (obj.fa) Object.assign(localStrings.fa, obj.fa);
    if (obj.en) Object.assign(localStrings.en, obj.en);
  };

  Chogan.t = function (key, vars) {
    var l = state.settings.lang;
    var s = localStrings[l][key];
    if (s === undefined) s = STR[l][key];
    if (s === undefined) s = localStrings.fa[key];
    if (s === undefined) s = STR.fa[key];
    if (s === undefined) s = key;
    if (vars) {
      for (var k in vars) s = s.split('{' + k + '}').join(vars[k]);
    }
    return s;
  };

  var FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  Chogan.num = function (v) {
    var s = String(v);
    if (state.settings.lang !== 'fa') return s;
    return s.replace(/\d/g, function (d) { return FA_DIGITS[+d]; });
  };
  Chogan.time = function (ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    var out = h > 0 ? (h + ':' + pad2(m) + ':' + pad2(s)) : (m + ':' + pad2(s));
    return Chogan.num(out);
  };
  Chogan.duration = function (ms) {
    var mins = Math.round(ms / 60000);
    if (mins < 60) return Chogan.num(mins) + ' ' + Chogan.t('minutes');
    var h = Math.floor(mins / 60);
    return Chogan.num(h) + ' ' + Chogan.t('hours');
  };

  Chogan.applyLang = function () {
    var l = state.settings.lang;
    document.documentElement.lang = l;
    document.documentElement.dir = (l === 'fa') ? 'rtl' : 'ltr';
  };
  Chogan.setLang = function (l) {
    state.settings.lang = (l === 'en') ? 'en' : 'fa';
    saveSettings();
    Chogan.applyLang();
    if (Chogan.onLangChange) Chogan.onLangChange();
  };

  /* ============================================================== تم */

  Chogan.applyTheme = function () {
    var t = state.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    var dark = t === 'dark' || (t === 'auto' && global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#15120E' : '#FBF6EF');
  };
  Chogan.setTheme = function (t) {
    state.settings.theme = t;
    saveSettings();
    Chogan.applyTheme();
  };

  // رنگ شش‌رقمی به rgba با شفافیت دلخواه. عمداً از color-mix استفاده نمی‌کنیم
  // چون وب‌ویوهای قدیمی اندروید آن را نمی‌فهمند و رنگ کلاً می‌افتد.
  Chogan.alpha = function (hex, a) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return hex;
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  };

  // رنگ تأکید هر بازی روی ریشه می‌نشیند تا همه‌ی توکن‌ها از آن پیروی کنند.
  // رنگ نرم نیمه‌شفاف است تا هم روی تم روشن هم تاریک درست بنشیند.
  Chogan.setAccent = function (color, soft) {
    var r = document.documentElement;
    if (color) {
      r.style.setProperty('--game', color);
      r.style.setProperty('--game-soft', soft || Chogan.alpha(color, 0.16));
    } else {
      r.style.removeProperty('--game');
      r.style.removeProperty('--game-soft');
    }
  };

  /* ============================================================= صدا */
  /* همه‌ی صداها رویه‌ای‌اند. هیچ فایل صوتی‌ای در بسته نیست. */

  var AC = null, master = null, sfxBus = null, musBus = null, audioReady = false;

  function ensureAudio() {
    if (AC) return AC;
    var Ctor = global.AudioContext || global.webkitAudioContext;
    if (!Ctor) return null;
    try { AC = new Ctor(); } catch (e) { return null; }
    master = AC.createGain(); master.gain.value = 0.9; master.connect(AC.destination);
    sfxBus = AC.createGain(); sfxBus.gain.value = 0.5; sfxBus.connect(master);
    musBus = AC.createGain(); musBus.gain.value = 0.0; musBus.connect(master);
    return AC;
  }

  function now() { return AC ? AC.currentTime : 0; }

  // یک نت ساده با پاکت نمایی
  function tone(opt) {
    if (!AC || !state.settings.sfx) return;
    var t0 = opt.at || now();
    var osc = AC.createOscillator();
    var g = AC.createGain();
    osc.type = opt.type || 'sine';
    osc.frequency.setValueAtTime(opt.freq, t0);
    if (opt.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opt.to), t0 + (opt.dur || 0.15));
    var peak = opt.gain === undefined ? 0.3 : opt.gain;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (opt.attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (opt.dur || 0.15));
    osc.connect(g);
    g.connect(opt.bus || sfxBus);
    osc.start(t0);
    osc.stop(t0 + (opt.dur || 0.15) + 0.03);
  }

  function noise(opt) {
    if (!AC || !state.settings.sfx) return;
    var dur = opt.dur || 0.2;
    var t0 = opt.at || now();
    var len = Math.max(1, Math.floor(AC.sampleRate * dur));
    var buf = AC.createBuffer(1, len, AC.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = AC.createBufferSource();
    src.buffer = buf;
    var f = AC.createBiquadFilter();
    f.type = opt.filter || 'lowpass';
    f.frequency.setValueAtTime(opt.freq || 900, t0);
    if (opt.to) f.frequency.exponentialRampToValueAtTime(Math.max(40, opt.to), t0 + dur);
    var g = AC.createGain();
    g.gain.setValueAtTime(opt.gain === undefined ? 0.25 : opt.gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  var SFX = {
    tap: function () { tone({ freq: 620, to: 520, dur: 0.07, gain: 0.16, type: 'sine' }); },
    select: function () { tone({ freq: 880, dur: 0.06, gain: 0.13, type: 'triangle' }); },
    place: function () { tone({ freq: 300, to: 460, dur: 0.11, gain: 0.22, type: 'triangle' }); },
    pop: function () { tone({ freq: 700, to: 1100, dur: 0.09, gain: 0.18, type: 'sine' }); },
    flag: function () { tone({ freq: 520, to: 760, dur: 0.08, gain: 0.16, type: 'square' }); },
    dig: function () { noise({ freq: 1400, to: 500, dur: 0.1, gain: 0.12 }); },
    coin: function () {
      tone({ freq: 988, dur: 0.07, gain: 0.16, type: 'triangle' });
      tone({ freq: 1319, dur: 0.14, gain: 0.14, type: 'triangle', at: now() + 0.06 });
    },
    good: function () {
      var b = now();
      [523, 659, 784].forEach(function (f, i) {
        tone({ freq: f, dur: 0.17, gain: 0.16, type: 'sine', at: b + i * 0.055 });
      });
    },
    bad: function () {
      tone({ freq: 220, to: 130, dur: 0.28, gain: 0.2, type: 'sawtooth' });
    },
    error: function () {
      tone({ freq: 300, to: 200, dur: 0.16, gain: 0.16, type: 'square' });
    },
    boom: function () {
      noise({ freq: 800, to: 60, dur: 0.55, gain: 0.4 });
      tone({ freq: 90, to: 40, dur: 0.5, gain: 0.3, type: 'sine' });
    },
    shoot: function () { tone({ freq: 1200, to: 700, dur: 0.05, gain: 0.07, type: 'square' }); },
    hit: function () { noise({ freq: 2200, to: 900, dur: 0.05, gain: 0.06 }); },
    build: function () {
      tone({ freq: 392, dur: 0.1, gain: 0.18, type: 'triangle' });
      tone({ freq: 587, dur: 0.16, gain: 0.15, type: 'triangle', at: now() + 0.08 });
    },
    chain: function () {
      var b = now();
      for (var i = 0; i < 4; i++) tone({ freq: 440 * Math.pow(1.18, i), dur: 0.09, gain: 0.12, type: 'triangle', at: b + i * 0.05 });
    },
    win: function () {
      var b = now();
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone({ freq: f, dur: 0.4, gain: 0.2, type: 'triangle', at: b + i * 0.1 });
      });
    },
    lose: function () {
      var b = now();
      [392, 349, 294, 220].forEach(function (f, i) {
        tone({ freq: f, dur: 0.36, gain: 0.18, type: 'sine', at: b + i * 0.13 });
      });
    },
    tick: function () { tone({ freq: 1400, dur: 0.03, gain: 0.06, type: 'square' }); }
  };

  /* --------- موسیقی پس‌زمینه: حلقه‌ی کوتاه و ملایم، هر بازی یک حال */

  var MOODS = {
    menu:        { root: 261.63, scale: [0, 2, 4, 7, 9], bpm: 68, pad: 'sine',     lead: 'triangle', chords: [0, 5, 3, 4], air: 0.22 },
    'tower-defence': { root: 196.00, scale: [0, 2, 3, 5, 7, 10], bpm: 92, pad: 'sawtooth', lead: 'square', chords: [0, 3, 5, 3], air: 0.16 },
    sudoku:      { root: 220.00, scale: [0, 2, 4, 7, 11], bpm: 58, pad: 'sine',     lead: 'sine',     chords: [0, 4, 5, 2], air: 0.26 },
    minesweeper: { root: 174.61, scale: [0, 3, 5, 7, 10], bpm: 74, pad: 'triangle', lead: 'triangle', chords: [0, 5, 2, 6], air: 0.2 },
    dots:        { root: 293.66, scale: [0, 2, 4, 7, 9], bpm: 104, pad: 'triangle', lead: 'square',   chords: [0, 3, 4, 5], air: 0.18 }
  };

  var music = { timer: null, mood: null, step: 0, next: 0, playing: false };

  function noteFreq(mood, degree, octave) {
    var sc = mood.scale;
    var i = ((degree % sc.length) + sc.length) % sc.length;
    var oct = octave + Math.floor(degree / sc.length);
    return mood.root * Math.pow(2, oct + sc[i] / 12);
  }

  function scheduleMusic() {
    if (!AC || !music.playing || !music.mood) return;
    var m = music.mood;
    var spb = 60 / m.bpm / 2;          // نیم‌ضرب
    var horizon = now() + 0.6;
    while (music.next < horizon) {
      var t = music.next;
      var bar = Math.floor(music.step / 8) % m.chords.length;
      var chord = m.chords[bar];
      var inBar = music.step % 8;

      if (inBar === 0) {
        // پد آرام
        [0, 2, 4].forEach(function (d, i) {
          var o = AC.createOscillator(), g = AC.createGain();
          o.type = m.pad;
          o.frequency.value = noteFreq(m, chord + d, i === 0 ? -1 : 0);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.06, t + 0.4);
          g.gain.linearRampToValueAtTime(0.0001, t + spb * 8);
          o.connect(g); g.connect(musBus);
          o.start(t); o.stop(t + spb * 8 + 0.1);
        });
      }
      // ملودی پراکنده
      if (inBar % 2 === 0 && Math.random() < 0.55) {
        var deg = chord + [0, 2, 4, 6][Math.floor(Math.random() * 4)];
        var o2 = AC.createOscillator(), g2 = AC.createGain();
        o2.type = m.lead;
        o2.frequency.value = noteFreq(m, deg, 1);
        g2.gain.setValueAtTime(0.0001, t);
        g2.gain.exponentialRampToValueAtTime(0.035, t + 0.02);
        g2.gain.exponentialRampToValueAtTime(0.0001, t + spb * 1.6);
        o2.connect(g2); g2.connect(musBus);
        o2.start(t); o2.stop(t + spb * 2);
      }
      music.step++;
      music.next += spb;
    }
  }

  var audioApi = {
    ready: function () { return audioReady; },
    unlock: function () {
      var ctx = ensureAudio();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      audioReady = true;
      if (music.mood && state.settings.music && !music.playing) audioApi.music(music.moodName);
    },
    sfx: function (name) {
      if (!state.settings.sfx) return;
      if (!AC) { if (!audioReady) return; ensureAudio(); }
      if (!AC) return;
      if (AC.state === 'suspended') AC.resume();
      var f = SFX[name];
      if (f) { try { f(); } catch (e) { /* صدا هیچ‌وقت نباید بازی را بخواباند */ } }
    },
    music: function (moodName) {
      music.moodName = moodName;
      music.mood = MOODS[moodName] || MOODS.menu;
      if (!state.settings.music || !audioReady) return;
      ensureAudio();
      if (!AC) return;
      if (AC.state === 'suspended') AC.resume();
      if (music.timer) clearInterval(music.timer);
      music.playing = true;
      music.step = 0;
      music.next = now() + 0.15;
      musBus.gain.cancelScheduledValues(now());
      musBus.gain.setValueAtTime(musBus.gain.value, now());
      musBus.gain.linearRampToValueAtTime(music.mood.air, now() + 1.6);
      music.timer = setInterval(scheduleMusic, 120);
      scheduleMusic();
    },
    stopMusic: function (fade) {
      if (!AC || !music.playing) { music.playing = false; return; }
      var d = fade === undefined ? 0.6 : fade;
      try {
        musBus.gain.cancelScheduledValues(now());
        musBus.gain.setValueAtTime(musBus.gain.value, now());
        musBus.gain.linearRampToValueAtTime(0.0001, now() + d);
      } catch (e) { /* بی‌خیال */ }
      music.playing = false;
      if (music.timer) { clearInterval(music.timer); music.timer = null; }
    },
    setSfx: function (on) { state.settings.sfx = !!on; saveSettings(); },
    setMusic: function (on) {
      state.settings.music = !!on;
      saveSettings();
      if (on) audioApi.music(music.moodName || 'menu'); else audioApi.stopMusic(0.25);
    }
  };
  Chogan.audio = audioApi;

  /* =========================================================== لرزش */

  var HAPTICS = {
    tap: [8],
    select: [5],
    success: [12, 40, 18],
    error: [26, 60, 26],
    win: [10, 40, 10, 40, 30],
    warn: [16]
  };
  Chogan.haptic = function (type) {
    if (!state.settings.haptics) return;
    if (!global.navigator || !global.navigator.vibrate) return;
    var p = HAPTICS[type] || HAPTICS.tap;
    try { global.navigator.vibrate(p); } catch (e) { /* دستگاه پشتیبانی نمی‌کند */ }
  };
  // بازخورد استاندارد یک لمس: صدا + لرزش با هم
  Chogan.feedback = function (kind) {
    var map = { tap: ['tap', 'tap'], select: ['select', 'select'], good: ['good', 'success'],
      bad: ['bad', 'error'], win: ['win', 'win'], coin: ['coin', 'success'], place: ['place', 'tap'] };
    var m = map[kind] || map.tap;
    audioApi.sfx(m[0]);
    Chogan.haptic(m[1]);
  };

  /* =========================================================== سکه */

  var coinsApi = {
    get: function () { return state.coins; },
    can: function (n) { return state.coins >= n; },
    add: function (n, silent) {
      n = Math.max(0, Math.round(n));
      if (!n) return state.coins;
      state.coins += n;
      appStore.set('coins', state.coins);
      bump('coinsEarned', n);
      Chogan.achievements.check();
      if (!silent) Chogan.ui.coinFly(n);
      return state.coins;
    },
    spend: function (n) {
      if (state.coins < n) return false;
      state.coins -= n;
      appStore.set('coins', state.coins);
      Chogan.ui.refreshCoins();
      return true;
    }
  };
  Chogan.coins = coinsApi;

  function bump(key, by) {
    state.counters[key] = (state.counters[key] || 0) + (by === undefined ? 1 : by);
    appStore.set('counters', state.counters);
    return state.counters[key];
  }
  Chogan.counter = function (key) { return state.counters[key] || 0; };
  Chogan.bump = bump;

  /* ======================================================= دستاوردها */

  var ACH = [
    { id: 'first-play',  icon: 'star',    fa: 'اولین قدم',        en: 'First step',        dfa: 'اولین بازی‌ات را انجام دادی',        den: 'Play your first game' },
    { id: 'play-10',     icon: 'star',    fa: 'ده تایی',          en: 'Ten rounds',        dfa: 'ده بازی انجام دادی',                den: 'Play 10 games' },
    { id: 'play-50',     icon: 'medal',   fa: 'پنجاه تایی',       en: 'Fifty rounds',      dfa: 'پنجاه بازی انجام دادی',             den: 'Play 50 games' },
    { id: 'play-200',    icon: 'trophy',  fa: 'دویست تایی',       en: 'Two hundred',       dfa: 'دویست بازی انجام دادی',             den: 'Play 200 games' },
    { id: 'sampler',     icon: 'palette', fa: 'همه‌چیزخور',       en: 'Sampler',           dfa: 'هر چهار بازی را امتحان کردی',        den: 'Try all four games' },
    { id: 'coins-100',   icon: 'coin',    fa: 'صد سکه',           en: 'Hundred coins',     dfa: 'در مجموع صد سکه گرفتی',             den: 'Earn 100 coins in total' },
    { id: 'coins-1000',  icon: 'coin',    fa: 'هزار سکه',         en: 'Thousand coins',    dfa: 'در مجموع هزار سکه گرفتی',           den: 'Earn 1000 coins in total' },
    { id: 'daily-1',     icon: 'calendar',fa: 'اولین روزانه',     en: 'First daily',       dfa: 'اولین چالش روزانه را زدی',           den: 'Finish your first daily' },
    { id: 'daily-25',    icon: 'calendar',fa: 'بیست‌وپنج روزانه', en: 'Daily regular',     dfa: 'بیست‌وپنج چالش روزانه زدی',          den: 'Finish 25 daily challenges' },
    { id: 'streak-3',    icon: 'flame',   fa: 'سه روز پشت هم',    en: 'Three in a row',    dfa: 'سه روز پیوسته بازی کردی',           den: 'Play three days in a row' },
    { id: 'streak-7',    icon: 'flame',   fa: 'یک هفته',          en: 'A full week',       dfa: 'هفت روز پیوسته بازی کردی',          den: 'Play seven days in a row' },
    { id: 'streak-30',   icon: 'flame',   fa: 'یک ماه',           en: 'A full month',      dfa: 'سی روز پیوسته بازی کردی',           den: 'Play thirty days in a row' },
    { id: 'tier-silver', icon: 'medal',   fa: 'نقره‌ای',          en: 'Silver',            dfa: 'به رده‌ی نقره رسیدی',               den: 'Reach the Silver tier' },
    { id: 'tier-gold',   icon: 'medal',   fa: 'طلایی',            en: 'Gold',              dfa: 'به رده‌ی طلا رسیدی',                den: 'Reach the Gold tier' },
    { id: 'tier-diamond',icon: 'gem',     fa: 'الماسی',           en: 'Diamond',           dfa: 'به رده‌ی الماس رسیدی',              den: 'Reach the Diamond tier' },
    { id: 'tier-legend', icon: 'crown',   fa: 'افسانه',           en: 'Legend',            dfa: 'به رده‌ی افسانه رسیدی',             den: 'Reach the Legend tier' },
    { id: 'night-owl',   icon: 'moon',    fa: 'شب‌زنده‌دار',      en: 'Night owl',         dfa: 'بین دو تا پنج بامداد بازی کردی',     den: 'Play between 2 and 5 AM' },
    { id: 'td-win',      icon: 'tower',   fa: 'برج‌بان',          en: 'Tower keeper',      dfa: 'یک نقشه‌ی دفاع از برج را بردی',      den: 'Win a tower defence map' },
    { id: 'td-perfect',  icon: 'shield',  fa: 'بی‌خش',            en: 'Flawless',          dfa: 'یک نقشه را بدون از دست دادن جان بردی', den: 'Win a map without losing a life' },
    { id: 'td-stars',    icon: 'star',    fa: 'سه ستاره',         en: 'Three stars',       dfa: 'در یک نقشه سه ستاره گرفتی',          den: 'Earn three stars on a map' },
    { id: 'td-endless',  icon: 'infinity',fa: 'موج سی',           en: 'Wave thirty',       dfa: 'در حالت بی‌پایان به موج سی رسیدی',    den: 'Reach wave 30 in endless mode' },
    { id: 'sd-win',      icon: 'grid',    fa: 'اولین سودوکو',     en: 'First sudoku',      dfa: 'یک سودوکو را کامل کردی',             den: 'Complete a sudoku' },
    { id: 'sd-expert',   icon: 'brain',   fa: 'سودوکوی خبره',     en: 'Expert sudoku',     dfa: 'یک سودوکوی خبره را حل کردی',         den: 'Solve an expert sudoku' },
    { id: 'sd-clean',    icon: 'sparkle', fa: 'بی‌راهنمایی',      en: 'No help',           dfa: 'سودوکو را بدون راهنمایی و بدون خطا تمام کردی', den: 'Finish a sudoku with no hints and no mistakes' },
    { id: 'sd-fast',     icon: 'bolt',    fa: 'سریع',             en: 'Speedy',            dfa: 'سودوکوی متوسط را زیر پنج دقیقه حل کردی', den: 'Solve a medium sudoku under five minutes' },
    { id: 'ms-win',      icon: 'mine',    fa: 'مین‌یاب',          en: 'Sweeper',           dfa: 'یک مین‌روب را بردی',                 den: 'Win a minesweeper game' },
    { id: 'ms-large',    icon: 'mine',    fa: 'میدان بزرگ',       en: 'Big field',         dfa: 'مین‌روب بزرگ را بردی',               den: 'Win a large minesweeper board' },
    { id: 'ms-fast',     icon: 'bolt',    fa: 'دست تند',          en: 'Quick hands',       dfa: 'مین‌روب کوچک را زیر سی ثانیه بردی',   den: 'Win a small board under 30 seconds' },
    { id: 'dt-win',      icon: 'box',     fa: 'جعبه‌گیر',         en: 'Box taker',         dfa: 'یک دست نقطه‌بازی را بردی',           den: 'Win a dots and boxes match' },
    { id: 'dt-hard',     icon: 'brain',   fa: 'مغلوب‌کننده',      en: 'Mind beater',       dfa: 'حریف سخت را شکست دادی',              den: 'Beat the hard AI' },
    { id: 'dt-chain',    icon: 'link',    fa: 'زنجیره‌ساز',       en: 'Chain master',      dfa: 'در یک نوبت پنج مربع گرفتی',          den: 'Take five boxes in one turn' },
    { id: 'dt-shutout',  icon: 'crown',   fa: 'قلعه‌ی بسته',      en: 'Shutout',           dfa: 'حریف را بدون هیچ مربعی نگه داشتی',    den: 'Win without conceding a box' }
  ];

  var achApi = {
    all: ACH,
    def: function (id) { for (var i = 0; i < ACH.length; i++) if (ACH[i].id === id) return ACH[i]; return null; },
    has: function (id) { return !!state.achievements[id]; },
    count: function () { return Object.keys(state.achievements).length; },
    unlock: function (id) {
      if (state.achievements[id]) return false;
      var d = achApi.def(id);
      if (!d) return false;
      state.achievements[id] = Date.now();
      appStore.set('achievements', state.achievements);
      Chogan.ui.toast({
        icon: d.icon,
        title: state.settings.lang === 'fa' ? d.fa : d.en,
        sub: state.settings.lang === 'fa' ? d.dfa : d.den
      });
      audioApi.sfx('coin');
      Chogan.haptic('success');
      return true;
    },
    // بررسی دستاوردهای عمومی که فقط به شمارنده‌ها وابسته‌اند
    check: function () {
      var s = state.stats;
      var c = state.counters;
      if (s.plays >= 1) achApi.unlock('first-play');
      if (s.plays >= 10) achApi.unlock('play-10');
      if (s.plays >= 50) achApi.unlock('play-50');
      if (s.plays >= 200) achApi.unlock('play-200');
      if (Object.keys(s.byGame).length >= 4) achApi.unlock('sampler');
      if ((c.coinsEarned || 0) >= 100) achApi.unlock('coins-100');
      if ((c.coinsEarned || 0) >= 1000) achApi.unlock('coins-1000');
      if ((c.dailyDone || 0) >= 1) achApi.unlock('daily-1');
      if ((c.dailyDone || 0) >= 25) achApi.unlock('daily-25');
      if (s.streak.count >= 3) achApi.unlock('streak-3');
      if (s.streak.count >= 7) achApi.unlock('streak-7');
      if (s.streak.count >= 30) achApi.unlock('streak-30');
      var h = new Date().getHours();
      if (h >= 2 && h < 5) achApi.unlock('night-owl');
    }
  };
  Chogan.achievements = achApi;

  /* ============================================================ لیگ */

  var TIERS = [
    { id: 1, key: 'bronze',  color: '#B08050', up: 300,  down: -1 },
    { id: 2, key: 'silver',  color: '#9AA3AB', up: 700,  down: 150 },
    { id: 3, key: 'gold',    color: '#D9A441', up: 1400, down: 420 },
    { id: 4, key: 'diamond', color: '#6BB6C4', up: 2600, down: 950 },
    { id: 5, key: 'legend',  color: '#A57BD1', up: -1,   down: 1900 }
  ];

  // فصل از شنبه شروع می‌شود. کلید فصل، تاریخ همان شنبه است.
  function seasonStart(d) {
    d = d ? new Date(d.getTime()) : new Date();
    d.setHours(0, 0, 0, 0);
    var back = (d.getDay() + 1) % 7;   // getDay: یکشنبه=۰، شنبه=۶
    d.setDate(d.getDate() - back);
    return d;
  }
  function seasonKey(d) { return dateKey(seasonStart(d)); }

  function defaultLeague() {
    return { season: seasonKey(), tier: 1, points: 0, history: [], lastResult: null };
  }

  function rollSeason() {
    if (!state.league) { state.league = defaultLeague(); appStore.set('league', state.league); return; }
    var cur = seasonKey();
    if (state.league.season === cur) return;
    var t = TIERS[state.league.tier - 1];
    var res = 'stayed';
    var newTier = state.league.tier;
    if (t.up > 0 && state.league.points >= t.up) { newTier = Math.min(5, state.league.tier + 1); res = 'promoted'; }
    else if (t.down >= 0 && state.league.points < t.down) { newTier = Math.max(1, state.league.tier - 1); res = 'demoted'; }
    state.league.history.unshift({
      season: state.league.season, points: state.league.points,
      tier: state.league.tier, result: res
    });
    state.league.history = state.league.history.slice(0, 12);
    state.league.tier = newTier;
    state.league.points = 0;
    state.league.season = cur;
    state.league.lastResult = { result: res, tier: newTier, season: state.league.history[0].season };
    appStore.set('league', state.league);
    if (newTier >= 2) achApi.unlock('tier-silver');
    if (newTier >= 3) achApi.unlock('tier-gold');
    if (newTier >= 4) achApi.unlock('tier-diamond');
    if (newTier >= 5) achApi.unlock('tier-legend');
  }

  // حریف‌های آفلاین. ساخته‌شده روی همین دستگاه از بذر فصل و شناسه‌ی ناشناس.
  // هیچ شبکه‌ای در کار نیست و در رابط کاربری هم همین را می‌گوییم.
  var BOT_NAMES = ['آرش', 'نیلوفر', 'کاوه', 'مهسا', 'بهرام', 'رؤیا', 'سامان', 'پریسا', 'تورج', 'شیرین',
    'Lena', 'Mateo', 'Yuki', 'Omar', 'Ingrid', 'Diego', 'Anya', 'Kwame', 'Sofia', 'Noor',
    'رستم', 'گلنار', 'Hugo', 'Mira', 'Tariq', 'Elif', 'Jonas', 'Priya'];
  var BOT_COUNTRIES = ['IR', 'IR', 'IR', 'DE', 'ES', 'JP', 'EG', 'SE', 'MX', 'TR', 'IN', 'BR', 'FR', 'GH', 'IT', 'NL'];

  function leagueTable() {
    rollSeason();
    var lg = state.league;
    var r = rng('league|' + lg.season + '|' + lg.tier + '|' + state.profile.uid);
    var start = seasonStart();
    var elapsed = clamp((Date.now() - start.getTime()) / (7 * 86400000), 0, 1);
    var t = TIERS[lg.tier - 1];
    var target = t.up > 0 ? t.up : 3200;
    var rows = [];
    var names = r.shuffle(BOT_NAMES).slice(0, 19);
    for (var i = 0; i < 19; i++) {
      // توان هر حریف بین ۰٫۳ تا ۱٫۲۵ برابر آستانه‌ی صعود
      var power = 0.3 + r() * 0.95;
      var pts = Math.round(target * power * (0.15 + 0.85 * elapsed) * (0.9 + r() * 0.2));
      rows.push({
        id: 'bot-' + i,
        name: names[i],
        country: r.pick(BOT_COUNTRIES),
        points: Math.max(0, pts),
        me: false
      });
    }
    rows.push({
      id: state.profile.uid,
      name: state.profile.name || Chogan.t('you'),
      country: state.profile.country || '',
      points: lg.points,
      me: true
    });
    rows.sort(function (a, b) { return b.points - a.points || (a.me ? 1 : -1); });
    for (var j = 0; j < rows.length; j++) rows[j].rank = j + 1;
    return rows;
  }

  var leagueApi = {
    tiers: TIERS,
    tier: function () { rollSeason(); return TIERS[state.league.tier - 1]; },
    state: function () { rollSeason(); return state.league; },
    table: leagueTable,
    endsIn: function () {
      var end = seasonStart().getTime() + 7 * 86400000;
      return Math.max(0, end - Date.now());
    },
    add: function (points) {
      rollSeason();
      points = Math.max(0, Math.round(points));
      state.league.points += points;
      appStore.set('league', state.league);
      return points;
    },
    clearLastResult: function () {
      if (state.league) { state.league.lastResult = null; appStore.set('league', state.league); }
    }
  };
  Chogan.league = leagueApi;

  /* ============================================================ آمار */

  function touchStreak() {
    var s = state.stats.streak;
    var today = dateKey();
    if (s.last === today) return;
    var y = new Date(); y.setDate(y.getDate() - 1);
    s.count = (s.last === dateKey(y)) ? s.count + 1 : 1;
    s.last = today;
    if (s.count > (s.best || 0)) s.best = s.count;
    saveStats();
  }

  var statsApi = {
    get: function () { return state.stats; },
    game: function (id) {
      if (!state.stats.byGame[id]) state.stats.byGame[id] = { plays: 0, wins: 0, timeMs: 0, best: {} };
      return state.stats.byGame[id];
    },
    // ثبت پایان یک دور. تنها راه ورود امتیاز به لیگ و سکه به کیف.
    record: function (o) {
      var g = statsApi.game(o.gameId);
      g.plays++;
      if (o.won) g.wins++;
      g.timeMs += Math.max(0, o.timeMs || 0);
      state.stats.plays++;
      state.stats.timeMs += Math.max(0, o.timeMs || 0);
      touchStreak();
      saveStats();
      var pts = leagueApi.add(o.points || 0);
      var coins = 0;
      if (o.coins) coins = coinsApi.add(o.coins, true);
      achApi.check();
      return { points: pts, coins: o.coins || 0 };
    },
    // بهترین‌ها: کمترین بهتر است یا بیشترین، بسته به نوع
    best: function (gameId, key, value, lowerIsBetter) {
      var g = statsApi.game(gameId);
      var cur = g.best[key];
      var better = (cur === undefined || cur === null) ||
        (lowerIsBetter ? value < cur : value > cur);
      if (better) { g.best[key] = value; saveStats(); }
      return better;
    },
    getBest: function (gameId, key) {
      var g = state.stats.byGame[gameId];
      return g && g.best ? g.best[key] : undefined;
    },
    // ثبت چالش روزانه
    daily: function (gameId, date, payload) {
      if (!state.stats.daily[date]) state.stats.daily[date] = {};
      if (!state.stats.daily[date][gameId]) bump('dailyDone');
      state.stats.daily[date][gameId] = Object.assign({ at: Date.now() }, payload);
      saveStats();
      achApi.check();
    },
    dailyDone: function (gameId, date) {
      var d = state.stats.daily[date];
      return !!(d && d[gameId]);
    },
    dailyOf: function (date) { return state.stats.daily[date] || {}; }
  };
  Chogan.stats = statsApi;

  /* ==================================================== اشتراک‌گذاری */

  Chogan.share = function (text) {
    if (global.navigator && global.navigator.share) {
      global.navigator.share({ text: text }).catch(function () { copyText(text); });
      return;
    }
    copyText(text);
  };
  function copyText(text) {
    var done = function () { Chogan.ui.toast({ icon: 'check', title: Chogan.t('copied') }); };
    if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
      global.navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text, done); });
    } else legacyCopy(text, done);
  }
  function legacyCopy(text, done) {
    try {
      var ta = el('textarea', { style: { position: 'fixed', opacity: '0', top: '0' } });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      done();
    } catch (e) { /* بی‌خیال */ }
  }

  /* ====================================================== آیکون‌های SVG */
  /* همه اینلاین‌اند. هیچ تصویر بیرونی و هیچ فونت آیکونی در کار نیست. */

  var ICON = {
    home: 'M3 10.6 12 3l9 7.6M5.6 9.4V20a1 1 0 0 0 1 1h3.2v-5.4h4.4V21h3.2a1 1 0 0 0 1-1V9.4',
    calendar: 'M4 6.8A1.8 1.8 0 0 1 5.8 5h12.4A1.8 1.8 0 0 1 20 6.8v12.4a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 19.2zM4 10h16M8.5 3v4M15.5 3v4',
    trophy: 'M7 4h10v5a5 5 0 0 1-10 0zM7 6H4.5A2.5 2.5 0 0 0 7 10.5M17 6h2.5A2.5 2.5 0 0 1 17 10.5M9.5 14.5 9 19h6l-.5-4.5M7 21h10',
    medal: 'M8 3l2.5 6M16 3l-2.5 6M12 21a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM12 13.2l.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2L9.1 15.4l2-.3z',
    user: 'M12 12.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5c1.3-3.4 4.1-5 7.5-5s6.2 1.6 7.5 5',
    back: 'M15 5l-7 7 7 7',
    forward: 'M9 5l7 7-7 7',
    close: 'M6 6l12 12M18 6L6 18',
    check: 'M5 12.5l4.5 4.5L19 7',
    gear: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z M19.4 13.5a7.6 7.6 0 0 0 0-3l1.8-1.3-1.9-3.3-2.1.8a7.6 7.6 0 0 0-2.6-1.5L14.3 3h-4.6l-.3 2.2a7.6 7.6 0 0 0-2.6 1.5l-2.1-.8-1.9 3.3 1.8 1.3a7.6 7.6 0 0 0 0 3l-1.8 1.3 1.9 3.3 2.1-.8a7.6 7.6 0 0 0 2.6 1.5l.3 2.2h4.6l.3-2.2a7.6 7.6 0 0 0 2.6-1.5l2.1.8 1.9-3.3z',
    star: 'M12 3.5l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 10l6.1-.9z',
    flame: 'M12 21c3.6 0 6-2.4 6-5.6 0-3.9-3.4-5.6-4.2-9.4-1.8 1.3-2.4 3-2.1 5-1-.4-1.7-1.4-2-2.7C8 10 6 12 6 15.4 6 18.6 8.4 21 12 21z',
    coin: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v10M14.8 9.3c-.6-.8-1.6-1.3-2.8-1.3-1.7 0-2.8.9-2.8 2.2 0 2.8 5.6 1.4 5.6 4.2 0 1.3-1.1 2.2-2.8 2.2-1.2 0-2.2-.5-2.8-1.3',
    gem: 'M6 3h12l3 6-9 12L3 9zM3 9h18M9 3l-3 6 6 12 6-12-3-6',
    crown: 'M4 8l3.5 3L12 5l4.5 6L20 8l-1.6 10H5.6zM5 20.5h14',
    moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z',
    tower: 'M8 21V9l4-5 4 5v12M5 21h14M10.5 13h3M10.5 17h3M8 9h8',
    shield: 'M12 3l7.5 3v6c0 4.4-3.1 8.1-7.5 9.4C7.6 20.1 4.5 16.4 4.5 12V6z',
    infinity: 'M9.5 12c0 2-1.4 3.5-3.2 3.5S3 14 3 12s1.4-3.5 3.3-3.5C9.2 8.5 10.8 15.5 17.7 15.5 19.6 15.5 21 14 21 12s-1.4-3.5-3.3-3.5S14.5 10 14.5 12',
    grid: 'M4 4h16v16H4zM4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16',
    brain: 'M9.5 4A3 3 0 0 0 6.6 6.2 3 3 0 0 0 5 9a3 3 0 0 0 .8 2A3 3 0 0 0 5 13.4a3 3 0 0 0 2.2 2.9A3 3 0 0 0 10 20a2.5 2.5 0 0 0 2-1V4.8A2.5 2.5 0 0 0 9.5 4zM14.5 4a3 3 0 0 1 2.9 2.2A3 3 0 0 1 19 9a3 3 0 0 1-.8 2 3 3 0 0 1 .8 2.4 3 3 0 0 1-2.2 2.9A3 3 0 0 1 14 20a2.5 2.5 0 0 1-2-1',
    sparkle: 'M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
    bolt: 'M13.5 3 5 13.5h5.5L10 21l8.5-10.5H13z',
    mine: 'M12 19.5a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 4v2M12 21v-1.5M4 13.5H2.5M21.5 13.5H20M6.2 7.7 5 6.5M17.8 7.7 19 6.5M9.6 11.2a3.4 3.4 0 0 1 2-1.6',
    box: 'M4 4h16v16H4zM4 12h16M12 4v16',
    link: 'M10 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.5 1.5M14 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5L12.5 17',
    palette: 'M12 21a9 9 0 1 1 9-9c0 2-1.6 3-3.2 3H16a2 2 0 0 0-1.6 3.2c.3.5.1 1.3-.6 1.6-.5.2-1.1.2-1.8.2zM7.5 12.5a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4zM10 8.4a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4zM14.5 8.4a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z',
    sound: 'M4 9.5h3L12 5v14l-5-4.5H4zM16 9.2a4 4 0 0 1 0 5.6M18.6 6.6a7.7 7.7 0 0 1 0 10.8',
    mute: 'M4 9.5h3L12 5v14l-5-4.5H4zM16.5 10l5 4M21.5 10l-5 4',
    music: 'M9 18V6l10-2v12M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM19 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z',
    vibrate: 'M8 5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 8 18.5zM4 9v6M20 9v6',
    share: 'M12 3v12M12 3 8.5 6.5M12 3l3.5 3.5M5 12v7a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-7',
    refresh: 'M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5',
    pause: 'M9 5v14M15 5v14',
    play: 'M7 4.5 19 12 7 19.5z',
    undo: 'M4 9h11a5 5 0 0 1 0 10h-6M4 9l4-4M4 9l4 4',
    pencil: 'M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19zM14.5 6.5l3 3',
    eraser: 'M8 20h11M5.5 16.5 13 9l5 5-6 6H8zM10 12l5 5',
    bulb: 'M9.5 18h5M10 21h4M12 3a5.5 5.5 0 0 0-3.3 9.9c.6.5 1 1.2 1.1 2h4.4c.1-.8.5-1.5 1.1-2A5.5 5.5 0 0 0 12 3z',
    flag: 'M6 21V4M6 5h11l-2 3.5L17 12H6',
    help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.3a2.6 2.6 0 0 1 5 .8c0 1.7-2.5 2.2-2.5 3.9M12 17.2h.01',
    keyboard: 'M3 6.5h18v11H3zM7 10h.01M11 10h.01M15 10h.01M17.5 13.5H6.5',
    trash: 'M4.5 6.5h15M9 6.5V4.5h6v2M6.5 6.5 7.5 20h9l1-13.5M10 10v6M14 10v6',
    info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5h.01',
    globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3.5 12h17M12 3a13 13 0 0 1 0 18 13 13 0 0 1 0-18z',
    sun: 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19',
    lock: 'M6.5 10.5h11V20h-11zM8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3',
    plus: 'M12 5v14M5 12h14',
    minus: 'M5 12h14'
  };

  Chogan.icon = function (name, size, cls) {
    var d = ICON[name] || ICON.help;
    var s = size || 24;
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', s);
    svg.setAttribute('height', s);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.9');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    if (cls) svg.setAttribute('class', cls);
    var p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
    return svg;
  };
  Chogan.iconMarkup = function (name, size) {
    var d = ICON[name] || ICON.help;
    return '<svg viewBox="0 0 24 24" width="' + (size || 24) + '" height="' + (size || 24) +
      '" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
  };

  /* شخصیت‌های تزئینی. ساده، دوست‌داشتنی، تماماً وکتور. */
  var MASCOT = {
    fox: '<svg viewBox="0 0 120 120" width="{S}" height="{S}" aria-hidden="true">' +
      '<path d="M22 40 26 16l20 12z" fill="#E07A5F"/><path d="M98 40 94 16 74 28z" fill="#E07A5F"/>' +
      '<path d="M60 26c22 0 38 16 38 36S82 100 60 100 22 82 22 62s16-36 38-36z" fill="#EE9070"/>' +
      '<path d="M60 60c14 0 24 10 24 22 0 10-11 18-24 18s-24-8-24-18c0-12 10-22 24-22z" fill="#FBEDE6"/>' +
      '<circle cx="46" cy="58" r="5" fill="#3A2620"/><circle cx="74" cy="58" r="5" fill="#3A2620"/>' +
      '<path d="M60 74c3.5 0 6-2.4 6-5s-2.7-4-6-4-6 1.4-6 4 2.5 5 6 5z" fill="#3A2620"/>' +
      '<path d="M54 82c2 3 10 3 12 0" stroke="#3A2620" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
    owl: '<svg viewBox="0 0 120 120" width="{S}" height="{S}" aria-hidden="true">' +
      '<path d="M60 20c22 0 36 18 36 40s-14 40-36 40S24 82 24 60 38 20 60 20z" fill="#6A8CBF"/>' +
      '<circle cx="45" cy="52" r="15" fill="#FBEDE6"/><circle cx="75" cy="52" r="15" fill="#FBEDE6"/>' +
      '<circle cx="45" cy="52" r="6.5" fill="#2C2620"/><circle cx="75" cy="52" r="6.5" fill="#2C2620"/>' +
      '<path d="M60 60 52 70h16z" fill="#D9A441"/>' +
      '<path d="M34 30c4-8 10-10 14-6M86 30c-4-8-10-10-14-6" stroke="#4E6C97" stroke-width="4" fill="none" stroke-linecap="round"/>' +
      '<path d="M44 88c6 6 26 6 32 0" stroke="#4E6C97" stroke-width="4" fill="none" stroke-linecap="round"/></svg>',
    cat: '<svg viewBox="0 0 120 120" width="{S}" height="{S}" aria-hidden="true">' +
      '<path d="M28 44 30 20l20 14zM92 44 90 20 70 34z" fill="#E4A853"/>' +
      '<path d="M60 28c20 0 34 16 34 34S80 98 60 98 26 82 26 62s14-34 34-34z" fill="#F0BC70"/>' +
      '<circle cx="47" cy="58" r="5.5" fill="#2C2620"/><circle cx="73" cy="58" r="5.5" fill="#2C2620"/>' +
      '<path d="M60 70c2.6 0 4.6-1.6 4.6-3.4S62.6 64 60 64s-4.6 1-4.6 2.6S57.4 70 60 70z" fill="#C8574B"/>' +
      '<path d="M60 70v5M56 80c2 2 6 2 8 0" stroke="#2C2620" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<path d="M20 62h16M20 70h16M84 62h16M84 70h16" stroke="#D8A55C" stroke-width="3" stroke-linecap="round"/></svg>',
    bear: '<svg viewBox="0 0 120 120" width="{S}" height="{S}" aria-hidden="true">' +
      '<circle cx="32" cy="34" r="14" fill="#7BAE7F"/><circle cx="88" cy="34" r="14" fill="#7BAE7F"/>' +
      '<circle cx="60" cy="62" r="36" fill="#94C398"/>' +
      '<circle cx="47" cy="56" r="5" fill="#22301F"/><circle cx="73" cy="56" r="5" fill="#22301F"/>' +
      '<ellipse cx="60" cy="76" rx="20" ry="14" fill="#E7F2E4"/>' +
      '<path d="M60 70c3.4 0 6-2 6-4.4s-2.6-3.6-6-3.6-6 1.2-6 3.6 2.6 4.4 6 4.4z" fill="#22301F"/>' +
      '<path d="M60 74v4M54 82c2 2.6 10 2.6 12 0" stroke="#22301F" stroke-width="3" fill="none" stroke-linecap="round"/></svg>'
  };
  Chogan.mascot = function (name, size) {
    var m = MASCOT[name] || MASCOT.fox;
    return m.split('{S}').join(size || 120);
  };
  Chogan.mascotNames = Object.keys(MASCOT);

  /* ====================================================== رابط کاربری */

  var ui = {};

  ui.toastHost = function () {
    var h = $('.ch-toasts');
    if (!h) { h = el('div', { class: 'ch-toasts', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(h); }
    return h;
  };

  ui.toast = function (o) {
    var host = ui.toastHost();
    var node = el('div', { class: 'ch-toast' }, [
      el('div', { class: 'ch-toast__icon' }, [Chogan.icon(o.icon || 'star', 26)]),
      el('div', { class: 'ch-grow' }, [
        el('div', { class: 'ch-toast__t', text: o.title }),
        o.sub ? el('div', { class: 'ch-toast__s', text: o.sub }) : null
      ])
    ]);
    host.appendChild(node);
    setTimeout(function () {
      node.classList.add('ch-toast--out');
      setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 260);
    }, o.ms || 3200);
    return node;
  };

  ui.modal = function (o) {
    var scrim = el('div', { class: 'ch-scrim', role: 'dialog', 'aria-modal': 'true' });
    var box = el('div', { class: 'ch-modal' });
    if (o.title) box.appendChild(el('h2', { text: o.title }));
    if (o.body) {
      var list = Array.isArray(o.body) ? o.body : [o.body];
      list.forEach(function (b) { box.appendChild(typeof b === 'string' ? el('p', { class: 'ch-dim', text: b }) : b); });
    }
    var closed = false;
    var close = function () {
      if (closed) return;
      closed = true;
      scrim.style.animation = 'ch-fade var(--t-fast) reverse';
      setTimeout(function () { if (scrim.parentNode) scrim.parentNode.removeChild(scrim); }, 110);
      document.removeEventListener('keydown', onKey);
      // از هر مسیری که بسته شد — دکمه، Escape یا کلیک بیرون — یک بار صدا می‌خورد
      if (o.onClose) o.onClose();
    };
    if (o.actions && o.actions.length) {
      var row = el('div', { class: 'ch-modal__actions' });
      o.actions.forEach(function (a) {
        row.appendChild(el('button', {
          class: 'ch-btn ' + (a.kind === 'primary' ? 'ch-btn--primary' : (a.kind === 'danger' ? 'ch-btn--danger' : '')),
          type: 'button',
          onclick: function () {
            Chogan.feedback('tap');
            if (a.keepOpen !== true) close();
            if (a.onClick) a.onClick();
          }
        }, a.label));
      });
      box.appendChild(row);
    }
    function onKey(e) {
      if (e.key === 'Escape' && o.dismissable !== false) close();
    }
    document.addEventListener('keydown', onKey);
    if (o.dismissable !== false) {
      scrim.addEventListener('click', function (e) {
        if (e.target === scrim) close();
      });
    }
    scrim.appendChild(box);
    document.body.appendChild(scrim);
    var focusable = box.querySelector('button, [tabindex], input');
    if (focusable) setTimeout(function () { focusable.focus(); }, 40);
    return { close: close, box: box };
  };

  ui.confirm = function (o) {
    return ui.modal({
      title: o.title,
      body: o.body,
      actions: [
        { label: o.cancelLabel || Chogan.t('cancel') },
        { label: o.okLabel || Chogan.t('confirm'), kind: o.danger ? 'danger' : 'primary', onClick: o.onOk }
      ]
    });
  };

  ui.reduceMotion = function () {
    if (document.documentElement.getAttribute('data-motion') === 'off') return true;
    return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  };

  ui.confetti = function (opts) {
    if (ui.reduceMotion()) return;
    opts = opts || {};
    var cv = el('canvas', { class: 'ch-confetti' });
    document.body.appendChild(cv);
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var W = cv.width = Math.floor(innerWidth * dpr);
    var H = cv.height = Math.floor(innerHeight * dpr);
    cv.style.width = innerWidth + 'px';
    cv.style.height = innerHeight + 'px';
    var ctx = cv.getContext('2d');
    var colors = opts.colors || ['#E07A5F', '#6A8CBF', '#E4A853', '#7BAE7F', '#A57BD1', '#D9A441'];
    var n = opts.count || 110;
    var parts = [];
    for (var i = 0; i < n; i++) {
      parts.push({
        x: W * (0.2 + Math.random() * 0.6),
        y: H * (0.28 + Math.random() * 0.12),
        vx: (Math.random() - 0.5) * 9 * dpr,
        vy: (-7 - Math.random() * 9) * dpr,
        w: (5 + Math.random() * 7) * dpr,
        h: (8 + Math.random() * 10) * dpr,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.34,
        c: colors[Math.floor(Math.random() * colors.length)]
      });
    }
    var t0 = performance.now();
    (function frame(t) {
      var age = t - t0;
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.vy += 0.42 * dpr;
        p.vx *= 0.995;
        p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = clamp(1 - (age - 1500) / 900, 0, 1);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (age < 2500) requestAnimationFrame(frame);
      else if (cv.parentNode) cv.parentNode.removeChild(cv);
    })(t0);
  };

  ui.shake = function (node) {
    if (!node || ui.reduceMotion()) return;
    node.classList.remove('ch-shake');
    void node.offsetWidth;
    node.classList.add('ch-shake');
    setTimeout(function () { node.classList.remove('ch-shake'); }, 520);
  };

  ui.countUp = function (node, to, opts) {
    opts = opts || {};
    var from = opts.from === undefined ? 0 : opts.from;
    if (ui.reduceMotion()) { node.textContent = Chogan.num(to) + (opts.suffix || ''); return; }
    var dur = opts.ms || 700;
    var t0 = performance.now();
    (function step(t) {
      var k = clamp((t - t0) / dur, 0, 1);
      var eased = 1 - Math.pow(1 - k, 3);
      node.textContent = Chogan.num(Math.round(from + (to - from) * eased)) + (opts.suffix || '');
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  };

  ui.refreshCoins = function () {
    $$('[data-coin-view]').forEach(function (n) { n.textContent = Chogan.num(state.coins); });
  };
  ui.coinFly = function (n) {
    ui.refreshCoins();
    if (!n) return;
    var host = $('[data-coin-view]');
    if (host && host.parentNode) {
      host.parentNode.classList.add('ch-pulse');
      setTimeout(function () { host.parentNode.classList.remove('ch-pulse'); }, 400);
    }
  };

  ui.switch = function (checked, onChange) {
    var b = el('button', { class: 'ch-switch', type: 'button', role: 'switch', 'aria-checked': checked ? 'true' : 'false' });
    b.addEventListener('click', function () {
      var v = b.getAttribute('aria-checked') !== 'true';
      b.setAttribute('aria-checked', v ? 'true' : 'false');
      Chogan.feedback('select');
      onChange(v);
    });
    return b;
  };

  ui.segmented = function (options, value, onChange) {
    var wrap = el('div', { class: 'ch-seg', role: 'tablist' });
    options.forEach(function (o) {
      var b = el('button', {
        type: 'button', role: 'tab', text: o.label,
        'aria-selected': o.value === value ? 'true' : 'false'
      });
      b.addEventListener('click', function () {
        $$('button', wrap).forEach(function (x) { x.setAttribute('aria-selected', 'false'); });
        b.setAttribute('aria-selected', 'true');
        Chogan.feedback('select');
        onChange(o.value);
      });
      wrap.appendChild(b);
    });
    return wrap;
  };

  ui.help = function (title, rows) {
    var list = el('div', { class: 'ch-list' });
    rows.forEach(function (r) {
      list.appendChild(el('div', { class: 'ch-item' }, [
        el('div', { class: 'ch-item__label', text: r.what }),
        el('span', { class: 'ch-badge', text: r.key })
      ]));
    });
    return ui.modal({
      title: title,
      body: [list],
      actions: [{ label: Chogan.t('done'), kind: 'primary' }]
    });
  };

  // آموزش دو سه صفحه‌ای بار اول. بعداً از دکمه‌ی راهنما در دسترس است.
  ui.tutorial = function (pages, onDone) {
    var i = 0;
    var art = el('div', { class: 'ch-tut__art' });
    var h = el('h2', { class: 'ch-center' });
    var p = el('p', { class: 'ch-dim ch-center' });
    var dots = el('div', { class: 'ch-tut__dots' });
    var nextBtn = null;   // بعد از ساخته شدن پنجره از دکمه‌های خودش گرفته می‌شود
    function render() {
      var pg = pages[i];
      art.innerHTML = pg.art || '';
      h.textContent = pg.title;
      p.textContent = pg.text;
      dots.innerHTML = '';
      for (var j = 0; j < pages.length; j++) {
        dots.appendChild(el('div', { class: 'ch-tut__dot' + (j === i ? ' ch-tut__dot--on' : '') }));
      }
      if (nextBtn) nextBtn.textContent = (i === pages.length - 1) ? Chogan.t('gotIt') : Chogan.t('next');
    }
    var m = ui.modal({
      body: [el('div', { class: 'ch-tut' }, [art, h, p, dots])],
      actions: [
        { label: Chogan.t('skip'), keepOpen: true, onClick: function () { m.close(); if (onDone) onDone(); } },
        { label: Chogan.t('next'), kind: 'primary', keepOpen: true, onClick: function () {
          if (i < pages.length - 1) { i++; render(); }
          else { m.close(); if (onDone) onDone(); }
        } }
      ],
      dismissable: false
    });
    nextBtn = m.box.querySelectorAll('.ch-modal__actions .ch-btn')[1];
    render();
    return m;
  };

  Chogan.ui = ui;

  /* ================================================ ناوبری و چرخه‌ی عمر */

  var NAV_KEY = 'chogan.nav';
  function ss(key, val) {
    try {
      if (val === undefined) return global.sessionStorage.getItem(key);
      global.sessionStorage.setItem(key, val);
      return val;
    } catch (e) { return null; }
  }

  // منو قبل از رفتن به بازی این را می‌گذارد تا بازگشت بداند تاریخچه دارد.
  Chogan.markNav = function () { ss(NAV_KEY, 'menu'); };

  Chogan.back = function () {
    audioApi.stopMusic(0.2);
    var fromMenu = ss(NAV_KEY) === 'menu';
    if (fromMenu && global.history.length > 1) global.history.back();
    else global.location.href = '../../index.html';
  };

  var pauseHooks = [];
  var resumeHooks = [];
  Chogan.onPause = function (fn) { pauseHooks.push(fn); };
  Chogan.onResume = function (fn) { resumeHooks.push(fn); };

  function firePause() { for (var i = 0; i < pauseHooks.length; i++) { try { pauseHooks[i](); } catch (e) { /* یکی خراب بود بقیه بمانند */ } } }
  function fireResume() { for (var i = 0; i < resumeHooks.length; i++) { try { resumeHooks[i](); } catch (e) { /* همان */ } } }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { firePause(); audioApi.stopMusic(0.25); }
    else { fireResume(); if (state.settings.music && audioReady) audioApi.music(music.moodName || 'menu'); }
  });
  global.addEventListener('pagehide', firePause);

  /* ==================================================== پوسته‌ی بازی */

  Chogan.game = function (cfg) {
    var store = Chogan.storage(cfg.id);
    if (cfg.strings) Chogan.strings(cfg.strings);

    var title = el('div', { class: 'ch-gamebar__title ch-grow', text: cfg.name[state.settings.lang] || cfg.name.fa });
    var backBtn = el('button', { class: 'ch-iconbtn ch-iconbtn--plain', type: 'button', 'aria-label': Chogan.t('back') }, [Chogan.icon('back', 22)]);
    backBtn.addEventListener('click', function () { Chogan.feedback('tap'); ctx.save(); Chogan.back(); });

    var bar = el('header', { class: 'ch-gamebar' }, [backBtn, title]);
    var main = el('main', { class: 'ch-gamemain' + (cfg.scroll ? ' ch-gamemain--scroll' : '') });
    var root = el('div', { class: 'ch-gameroot' }, [bar, main]);

    var stats = {};
    var saveFn = null;
    var lastFinish = null;

    var ctx = {
      id: cfg.id,
      store: store,
      root: root,
      bar: bar,
      main: main,
      t: Chogan.t,
      num: Chogan.num,

      mount: function () {
        document.body.className = 'ch-noscroll';
        document.body.appendChild(root);
        Chogan.setAccent(cfg.accent, cfg.accentSoft);
        return ctx;
      },

      setTitle: function (txt) { title.textContent = txt; },

      // نمایشگر عددی داخل سربرگ
      stat: function (key, label) {
        var b = el('b', { text: Chogan.num(0) });
        var box = el('div', { class: 'ch-gamebar__stat' }, [b, el('span', { text: label })]);
        stats[key] = { node: b, box: box, label: box.querySelector('span'), value: 0 };
        bar.appendChild(box);
        return box;
      },
      setStat: function (key, value, animate) {
        var s = stats[key];
        if (!s) return;
        if (animate && typeof value === 'number' && typeof s.value === 'number') {
          ui.countUp(s.node, value, { from: s.value, ms: 420 });
        } else {
          s.node.textContent = typeof value === 'number' ? Chogan.num(value) : value;
        }
        s.value = value;
      },
      statNode: function (key) { return stats[key] ? stats[key].node : null; },

      button: function (o) {
        var b = el('button', {
          class: 'ch-iconbtn' + (o.plain ? ' ch-iconbtn--plain' : ''),
          type: 'button',
          'aria-label': o.label
        }, [Chogan.icon(o.icon, 22)]);
        b.addEventListener('click', function () { Chogan.feedback('tap'); o.onClick(b); });
        bar.appendChild(b);
        return b;
      },

      /* ---- ذخیره‌ی خودکار: بازی نیمه‌کاره هیچ‌وقت نمی‌سوزد ---- */
      autosave: function (fn) { saveFn = fn; },
      save: function () {
        if (!saveFn) return;
        var s = null;
        try { s = saveFn(); } catch (e) { s = null; }
        if (s && s.inProgress !== false) store.set('session', Object.assign({ inProgress: true, at: Date.now() }, s));
        else store.remove('session');
      },
      loadSave: function () { return store.get('session', null); },
      clearSave: function () { store.remove('session'); },

      /* ---- آموزش و راهنما ---- */
      tutorialIfNew: function (pages) {
        if (store.get('tutSeen', false)) return false;
        ui.tutorial(pages, function () { store.set('tutSeen', true); });
        return true;
      },
      showTutorial: function (pages) { ui.tutorial(pages, function () { store.set('tutSeen', true); }); },
      showHelp: function (rows) { ui.help(Chogan.t('help'), rows); },

      /* ---- پایان یک دور ---- */
      finish: function (o) {
        lastFinish = o;
        var rec = statsApi.record({
          gameId: cfg.id,
          won: !!o.won,
          timeMs: o.timeMs || 0,
          points: o.points || 0,
          coins: o.coins || 0
        });
        ctx.clearSave();
        if (o.won) { audioApi.sfx('win'); Chogan.haptic('win'); ui.confetti(); }
        else { audioApi.sfx('lose'); Chogan.haptic('error'); }

        var lines = el('div', { class: 'ch-list' });
        (o.lines || []).forEach(function (l) {
          lines.appendChild(el('div', { class: 'ch-item' }, [
            el('div', { class: 'ch-item__label', text: l.label }),
            el('b', { class: 'ch-num', text: l.value })
          ]));
        });
        if (rec.coins) {
          lines.appendChild(el('div', { class: 'ch-item' }, [
            el('div', { class: 'ch-item__label', text: Chogan.t('coins') }),
            el('span', { class: 'ch-coin' }, [Chogan.icon('coin', 18), el('b', { text: '+' + Chogan.num(rec.coins) })])
          ]));
        }
        if (rec.points) {
          lines.appendChild(el('div', { class: 'ch-item' }, [
            el('div', { class: 'ch-item__label', text: Chogan.t('weeklyPoints') }),
            el('b', { class: 'ch-num', text: '+' + Chogan.num(rec.points) })
          ]));
        }

        var body = [];
        if (o.stars !== undefined && o.stars !== null) body.push(starsRow(o.stars));
        if (o.note) body.push(el('p', { class: 'ch-dim ch-center', text: o.note }));
        body.push(lines);

        var actions = [];
        if (o.shareText) {
          actions.push({ label: Chogan.t('share'), keepOpen: true, onClick: function () { Chogan.share(o.shareText); } });
        }
        actions.push({ label: Chogan.t('menu'), onClick: function () { Chogan.back(); } });
        if (o.onAgain) actions.push({ label: Chogan.t('again'), kind: 'primary', onClick: o.onAgain });

        return ui.modal({
          title: o.title || (o.won ? Chogan.t('won') : Chogan.t('finished')),
          body: body,
          actions: actions,
          dismissable: false
        });
      },

      lastResult: function () { return lastFinish; }
    };

    function starsRow(n) {
      var row = el('div', { class: 'ch-row ch-center', style: { 'justify-content': 'center', gap: '6px', margin: '4px 0 14px' } });
      for (var i = 1; i <= 3; i++) {
        var s = Chogan.icon('star', 42);
        s.style.color = i <= n ? 'var(--c-gold)' : 'var(--c-text-faint)';
        if (i > n) s.style.opacity = '.35';
        s.setAttribute('fill', i <= n ? 'currentColor' : 'none');
        if (i <= n && !ui.reduceMotion()) {
          s.style.animation = 'ch-pop 420ms var(--ease-back) backwards';
          s.style.animationDelay = (i * 110) + 'ms';
        }
        row.appendChild(s);
      }
      return row;
    }

    // ذخیره‌ی خودکار روی مکث و بستن صفحه
    Chogan.onPause(function () { ctx.save(); });

    // موسیقی و بازخورد
    if (cfg.mood) {
      var startMusic = function () { audioApi.music(cfg.mood); };
      if (audioReady) startMusic(); else Chogan.afterUnlock(startMusic);
    }
    return ctx;
  };

  /* ================================================ راه‌اندازی صفحه */

  var unlockHooks = [];
  Chogan.afterUnlock = function (fn) { unlockHooks.push(fn); };

  function unlockAudioOnce() {
    audioApi.unlock();
    for (var i = 0; i < unlockHooks.length; i++) { try { unlockHooks[i](); } catch (e) { /* بی‌خیال */ } }
    unlockHooks = [];
    document.removeEventListener('pointerdown', unlockAudioOnce);
    document.removeEventListener('keydown', unlockAudioOnce);
  }

  Chogan.boot = function (o) {
    o = o || {};
    Chogan.applyLang();
    Chogan.applyTheme();
    rollSeason();
    if (o.accent) Chogan.setAccent(o.accent, o.accentSoft);
    document.addEventListener('pointerdown', unlockAudioOnce, { passive: true });
    document.addEventListener('keydown', unlockAudioOnce);
    if (global.matchMedia) {
      var mq = global.matchMedia('(prefers-color-scheme: dark)');
      var onch = function () { if (state.settings.theme === 'auto') Chogan.applyTheme(); };
      if (mq.addEventListener) mq.addEventListener('change', onch);
      else if (mq.addListener) mq.addListener(onch);
    }
    // سرویس‌ورکر فقط برای نسخه‌ی وب و فقط از صفحه‌ی منو ثبت می‌شود.
    // داخل اپ اندروید فایل‌ها از قبل محلی‌اند و لایه‌ی کش لازم نیست.
    if (o.sw && !global.Capacitor && 'serviceWorker' in global.navigator &&
        (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      global.addEventListener('load', function () {
        global.navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' })
          .then(function (reg) { reg.update(); })
          .catch(function () { /* بدون سرویس‌ورکر هم اپ کار می‌کند */ });
      });
    }
    return Chogan;
  };

  /* ------------------------------------------------------- کمکی‌ها */

  Chogan.flag = function (cc) {
    if (!cc || cc.length !== 2) return '';
    var A = 0x1F1E6;
    var up = cc.toUpperCase();
    return String.fromCodePoint(A + up.charCodeAt(0) - 65) + String.fromCodePoint(A + up.charCodeAt(1) - 65);
  };

  Chogan.hasResume = function (gameId) {
    var s = Chogan.storage(gameId).get('session', null);
    return !!(s && s.inProgress);
  };

  Chogan.version = (global.APP_VERSION || '0.0.0');

  // برای تست‌های خودکار در نود
  if (typeof module !== 'undefined' && module.exports) module.exports = Chogan;
  global.Chogan = Chogan;
})(typeof window !== 'undefined' ? window : globalThis);
