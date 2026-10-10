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

  // زبان پیش‌فرض از خود دستگاه. فارسی زبان اول پروژه است ولی روی گوشی
  // انگلیسی، صفحه‌ی خوشامد فارسی باز می‌شد. کاربر در همان صفحه و بعد هم در
  // تنظیمات می‌تواند عوضش کند. همان قاعده‌ای که لیبل لانچر با values-fa دارد.
  function deviceLang() {
    try {
      var l = ((global.navigator.languages && global.navigator.languages[0]) || global.navigator.language || '').toLowerCase();
      if (/^fa\b|^fa-/.test(l)) return 'fa';
      // فقط چینی ساده‌شده ترجمه داریم، پس zh-TW و zh-HK به انگلیسی می‌روند
      if (l === 'zh' || /^zh-(cn|sg|hans)/.test(l)) return 'zh';
      if (/^de\b|^de-/.test(l)) return 'de';
      return 'en';
    } catch (e) { return 'fa'; }
  }

  var DEFAULT_SETTINGS = {
    lang: deviceLang(),
    theme: 'auto',   // auto | light | dark
    sfx: true,
    music: true,
    haptics: true,
    cardBack: 'carpet'   // carpet | termeh, shared by every card game (#181)
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

  // برگشت از bfcache جاوااسکریپت را دوباره اجرا نمی‌کند، پس وضعیت درون‌حافظه
  // از چیزی که صفحه‌ی بازی در حافظه‌ی محلی نوشته عقب می‌ماند. شیء state سر
  // جایش تازه می‌شود، نه جایگزین، چون همه‌جا به همین ارجاع چسبیده‌اند.
  Chogan.reloadState = function () {
    state.settings = Object.assign({}, DEFAULT_SETTINGS, appStore.get('settings', {}));
    state.profile = Object.assign({ name: '', country: '', uid: state.profile.uid }, appStore.get('profile', {}));
    state.coins = appStore.get('coins', 0);
    state.unlocks = appStore.get('unlocks', []);
    state.achievements = appStore.get('achievements', {});
    state.stats = appStore.get('stats', state.stats);
    state.league = appStore.get('league', state.league);
    state.counters = appStore.get('counters', {});
  };

  // قبل از هر تغییر روی داده‌ی مشترک، دوباره از حافظه می‌خوانیم تا تب یا
  // صفحه‌ی دیگری که هم‌زمان باز است نوشته‌اش پاک نشود.
  function mutate(key, fn) {
    var fresh = appStore.get(key, null);
    if (fresh !== null && typeof fresh === typeof state[key]) state[key] = fresh;
    var out = fn(state[key]);
    if (out !== undefined) state[key] = out;
    appStore.set(key, state[key]);
    return state[key];
  }
  Chogan.mutate = mutate;

  function saveSettings() { appStore.set('settings', state.settings); }
  function saveStats() { appStore.set('stats', state.stats); }

  /* ============================================== زبان و رقم و جهت */

  // زبان‌های اپ. اضافه کردن زبان تازه یعنی یک ورودی اینجا و یک دیکشنری در هر
  // فایل. کلید ترجمه‌نشده به انگلیسی برمی‌گردد، پس رشته‌ی تازه منتظر مترجم نمی‌ماند
  // و زبان کم‌ترجمه‌شده هم قابل استفاده می‌ماند.
  var LOCALES = [
    { code: 'fa', label: 'فارسی',    dir: 'rtl', tag: 'fa',      date: 'fa-IR-u-ca-gregory' },
    { code: 'en', label: 'English',  dir: 'ltr', tag: 'en',      date: 'en-US' },
    { code: 'zh', label: '中文', dir: 'ltr', tag: 'zh-Hans', date: 'zh-CN' },
    { code: 'de', label: 'Deutsch',  dir: 'ltr', tag: 'de',      date: 'de-DE' }
  ];
  function localeOf(code) {
    for (var i = 0; i < LOCALES.length; i++) if (LOCALES[i].code === code) return LOCALES[i];
    return LOCALES[0];
  }
  Chogan.locales = function () { return LOCALES.slice(); };
  Chogan.isRtl = function () { return localeOf(state.settings.lang).dir === 'rtl'; };
  Chogan.dateLocale = function () { return localeOf(state.settings.lang).date; };

  var STR = {
    fa: {
      appName: 'چوگان', home: 'خانه', daily: 'روزانه', league: 'لیگ',
      achievements: 'دستاوردها', profile: 'پروفایل', settings: 'تنظیمات',
      play: 'بازی', resume: 'ادامه', newGame: 'بازی تازه', again: 'دوباره',
      cardBack: 'پشت کارت', backCarpet: 'قالی', backTermeh: 'ترمه',
      menu: 'منو', back: 'بازگشت', undo: 'برگرداندن', close: 'بستن', cancel: 'انصراف', result: 'نتیجه',
      saveImage: 'ذخیره‌ی عکس', copyText: 'کپی متن',
      updateReady: 'نسخه‌ی تازه آماده است', updateNow: 'آپدیت',
      confirm: 'تأیید', done: 'باشه', next: 'بعدی', skip: 'رد کردن',
      start: 'شروع', pause: 'مکث', resumeGame: 'ادامه‌ی بازی', restart: 'شروع دوباره',
      quit: 'خروج به منو', help: 'راهنما', share: 'اشتراک‌گذاری', copied: 'در حافظه کپی شد', imageSaved: 'عکس در گالری ذخیره شد',
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
      hint: 'راهنمایی', hints: 'راهنمایی', notEnoughCoins: 'سکه کافی نداری', hintUsed: 'راهنمایی گرفتی',
      coinsEarned: 'سکه گرفتی', playToEarn: 'یک دور بازی کن تا سکه بگیری',
      keyboard: 'کیبورد', difficulty: 'سختی',
      fullscreen: 'تمام‌صفحه', exitFullscreen: 'خروج از تمام‌صفحه',
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
      cardBack: 'Card back', backCarpet: 'Carpet', backTermeh: 'Termeh',
      menu: 'Menu', back: 'Back', undo: 'Undo', close: 'Close', cancel: 'Cancel', result: 'Result',
      saveImage: 'Save image', copyText: 'Copy text',
      updateReady: 'A new version is ready', updateNow: 'Update',
      confirm: 'Confirm', done: 'OK', next: 'Next', skip: 'Skip',
      start: 'Start', pause: 'Pause', resumeGame: 'Resume', restart: 'Restart',
      quit: 'Quit to menu', help: 'Help', share: 'Share', copied: 'Copied to clipboard', imageSaved: 'Saved to your gallery',
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
      hint: 'Hint', hints: 'Hints', notEnoughCoins: 'Not enough coins', hintUsed: 'Hint used',
      coinsEarned: 'coins earned', playToEarn: 'Play a round to earn coins',
      keyboard: 'Keyboard', difficulty: 'Difficulty',
      fullscreen: 'Fullscreen', exitFullscreen: 'Exit fullscreen',
      easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert',
      today: 'Today', dailyDone: 'Done today', dailyOpen: 'Not played yet',
      emptyDaily: 'Nothing recorded for this day', noAchievements: 'No awards yet',
      sun: 'S', mon: 'M', tue: 'T', wed: 'W', thu: 'T', fri: 'F', sat: 'S',
      unlocks: 'Themes and characters', unlockCost: 'Unlock', owned: 'Unlocked', apply: 'Select',
      tutorial: 'How to play', gotIt: 'Got it', stars: 'stars'
    },
    zh: {
      appName: 'Chogan', home: '主页', daily: '每日', league: '联赛',
      achievements: '成就', profile: '个人', settings: '设置',
      play: '开始', resume: '继续', newGame: '新游戏', again: '再来一局',
      cardBack: '牌背', backCarpet: '波斯地毯', backTermeh: '波斯织锦',
      menu: '菜单', back: '返回', undo: '撤销', close: '关闭', cancel: '取消', result: '结果',
      saveImage: '保存图片', copyText: '复制文字',
      updateReady: '新版本已就绪', updateNow: '更新',
      confirm: '确定', done: '好', next: '下一步', skip: '跳过',
      start: '开始', pause: '暂停', resumeGame: '继续游戏', restart: '重新开始',
      quit: '退出到菜单', help: '帮助', share: '分享', copied: '已复制到剪贴板', imageSaved: '已保存到相册',
      best: '最佳', score: '分数', time: '时间', coins: '金币',
      newBadge: '新', continueBadge: '继续', todayChallenge: '每日挑战',
      todayChallengeSub: '每天一道新题，所有人都一样',
      won: '你赢了', lost: '你输了', finished: '结束',
      earned: '你获得了', weeklyPoints: '本周积分', tier: '段位',
      promoted: '晋级', demoted: '降级', stayed: '保级',
      bronze: '青铜', silver: '白银', gold: '黄金', diamond: '钻石', legend: '传奇',
      seasonEnds: '赛季结束还有', days: '天', hours: '时', minutes: '分',
      rank: '排名', points: '积分', you: '你',
      offlineRivals: '离线对手，在本机生成',
      streak: '连续', dayStreak: '天连续', locked: '未解锁',
      unlockedAt: '解锁于', totalPlays: '局数', playTime: '游戏时长',
      language: '语言', theme: '主题', themeAuto: '自动', themeLight: '浅色', themeDark: '深色',
      sfx: '音效', music: '音乐', haptics: '振动',
      resetGame: '重置游戏数据', resetAsk: '确定清除这个游戏的全部数据？',
      resetWarn: '此操作无法撤销。', resetDone: '已清除',
      about: '关于', version: '版本', source: '源代码', license: '许可协议',
      aboutText: '免费、开源、无广告、无追踪，完全离线。',
      name: '名字', country: '国家', optional: '可选',
      hint: '提示', hints: '提示', notEnoughCoins: '金币不足', hintUsed: '已使用提示',
      coinsEarned: '获得金币', playToEarn: '玩一局即可获得金币',
      keyboard: '键盘', difficulty: '难度',
      fullscreen: '全屏', exitFullscreen: '退出全屏',
      easy: '简单', medium: '中等', hard: '困难', expert: '专家',
      today: '今天', dailyDone: '今天已完成', dailyOpen: '还没玩',
      noAchievements: '还没有成就', emptyDaily: '这一天没有记录',
      sun: '日', mon: '一', tue: '二', wed: '三', thu: '四', fri: '五', sat: '六',
      unlocks: '主题和角色', unlockCost: '解锁', owned: '已解锁', apply: '选择',
      tutorial: '玩法', gotIt: '明白了', stars: '星'
    },
    de: {
      appName: 'Chogan', home: 'Start', daily: 'Täglich', league: 'Liga',
      achievements: 'Erfolge', profile: 'Profil', settings: 'Einstellungen',
      play: 'Spielen', resume: 'Weiter', newGame: 'Neues Spiel', again: 'Nochmal',
      cardBack: 'Kartenrücken', backCarpet: 'Teppich', backTermeh: 'Termeh-Brokat',
      menu: 'Menü', back: 'Zurück', undo: 'Rückgängig', close: 'Schließen', cancel: 'Abbrechen', result: 'Ergebnis',
      saveImage: 'Bild speichern', copyText: 'Text kopieren',
      updateReady: 'Eine neue Version ist da', updateNow: 'Aktualisieren',
      confirm: 'Bestätigen', done: 'OK', next: 'Weiter', skip: 'Überspringen',
      start: 'Start', pause: 'Pause', resumeGame: 'Weiter', restart: 'Neu starten',
      quit: 'Zurück zum Menü', help: 'Hilfe', share: 'Teilen', copied: 'In die Zwischenablage kopiert', imageSaved: 'In der Galerie gespeichert',
      best: 'Rekord', score: 'Punkte', time: 'Zeit', coins: 'Münzen',
      newBadge: 'Neu', continueBadge: 'Weiter', todayChallenge: 'Tagesrätsel',
      todayChallengeSub: 'Jeden Tag ein neues Rätsel, für alle dasselbe',
      won: 'Gewonnen', lost: 'Verloren', finished: 'Geschafft',
      earned: 'Verdient', weeklyPoints: 'Wochenpunkte', tier: 'Stufe',
      promoted: 'Aufgestiegen', demoted: 'Abgestiegen', stayed: 'Stufe gehalten',
      bronze: 'Bronze', silver: 'Silber', gold: 'Gold', diamond: 'Diamant', legend: 'Legende',
      seasonEnds: 'Saison endet in', days: 'T', hours: 'Std', minutes: 'Min',
      rank: 'Platz', points: 'Punkte', you: 'Du',
      offlineRivals: 'Offline-Gegner, auf diesem Gerät erzeugt',
      streak: 'Serie', dayStreak: 'Tage in Folge', locked: 'Gesperrt',
      unlockedAt: 'Freigeschaltet', totalPlays: 'Spiele', playTime: 'Spielzeit',
      language: 'Sprache', theme: 'Design', themeAuto: 'Auto', themeLight: 'Hell', themeDark: 'Dunkel',
      sfx: 'Soundeffekte', music: 'Musik', haptics: 'Vibration',
      resetGame: 'Spieldaten zurücksetzen', resetAsk: 'Alle Daten dieses Spiels löschen?',
      resetWarn: 'Das lässt sich nicht rückgängig machen.', resetDone: 'Gelöscht',
      about: 'Über', version: 'Version', source: 'Quellcode', license: 'Lizenz',
      aboutText: 'Kostenlos, Open Source, ohne Werbung, ohne Tracker, komplett offline.',
      name: 'Name', country: 'Land', optional: 'optional',
      hint: 'Tipp', hints: 'Tipps', notEnoughCoins: 'Nicht genug Münzen', hintUsed: 'Tipp genutzt',
      coinsEarned: 'Münzen verdient', playToEarn: 'Spiel eine Runde, um Münzen zu verdienen',
      keyboard: 'Tastatur', difficulty: 'Schwierigkeit',
      fullscreen: 'Vollbild', exitFullscreen: 'Vollbild beenden',
      easy: 'Leicht', medium: 'Mittel', hard: 'Schwer', expert: 'Experte',
      today: 'Heute', dailyDone: 'Heute erledigt', dailyOpen: 'Noch nicht gespielt',
      emptyDaily: 'Für diesen Tag ist nichts gespeichert', noAchievements: 'Noch keine Erfolge',
      sun: 'So', mon: 'Mo', tue: 'Di', wed: 'Mi', thu: 'Do', fri: 'Fr', sat: 'Sa',
      unlocks: 'Designs und Figuren', unlockCost: 'Freischalten', owned: 'Freigeschaltet', apply: 'Auswählen',
      tutorial: 'Anleitung', gotIt: 'Verstanden', stars: 'Sterne'
    }
  };
  var localStrings = (function () { var o = {}; for (var i = 0; i < LOCALES.length; i++) o[LOCALES[i].code] = {}; return o; })();

  Chogan.strings = function (obj) {
    for (var i = 0; i < LOCALES.length; i++) {
      var c = LOCALES[i].code;
      if (obj[c]) Object.assign(localStrings[c], obj[c]);
    }
  };

  Chogan.t = function (key, vars) {
    var l = state.settings.lang;
    var s = (localStrings[l] || {})[key];
    if (s === undefined) s = (STR[l] || {})[key];
    // انگلیسی پیش از فارسی: زبانی که هنوز کامل ترجمه نشده باید خوانا بماند،
    // نه اینکه وسط متنش فارسی راست‌به‌چپ بیفتد.
    if (s === undefined) s = localStrings.en[key];
    if (s === undefined) s = STR.en[key];
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
    var loc = localeOf(state.settings.lang);
    document.documentElement.lang = loc.tag;
    document.documentElement.dir = loc.dir;
    // منیفست عوض نمی‌شود. یک فایل داریم با name_localized و مرورگر خودش
    // بر اساس زبان دستگاه انتخاب می‌کند. جابه‌جا کردن لینک، اسم را موقع نصب
    // قفل می‌کرد: هر کس با دستگاه فارسی نصب می‌کرد، بعد از عوض کردن زبانِ
    // دستگاه هم اسم فارسی می‌ماند.
    // عنوان صفحه هم اسم اپ را نشان می‌دهد و باید با زبان عوض شود
    if (Chogan.pageTitle) {
      try { document.title = Chogan.pageTitle(); } catch (e) { /* عنوان قبلی بماند */ }
    }
  };
  Chogan.setLang = function (l) {
    state.settings.lang = localeOf(l).code;
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
      mutate('coins', function (c) { return (typeof c === 'number' ? c : 0) + n; });
      bump('coinsEarned', n);
      Chogan.achievements.check();
      if (!silent) Chogan.ui.coinFly(n);
      return state.coins;
    },
    spend: function (n) {
      var fresh = appStore.get('coins', state.coins);
      if (typeof fresh === 'number') state.coins = fresh;
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

  // متن دستاورد به زبان جاری، و اگر ترجمه نشده به انگلیسی. منو هم از همین
  // استفاده می‌کند تا منطق زبان دو جا تکرار نشود.
  Chogan.achText = function (d) {
    var l = state.settings.lang;
    return { title: d[l] || d.en, sub: d['d' + l] || d.den };
  };

  var ACH = [
    { id: 'first-play',  icon: 'star',    fa: 'اولین قدم',        en: 'First step',        dfa: 'اولین بازی‌ات را انجام دادی',        den: 'Play your first game', zh: '第一步', dzh: '完成第一局游戏', de: 'Erster Schritt', dde: 'Spiel dein erstes Spiel' },
    { id: 'play-10',     icon: 'star',    fa: 'ده تایی',          en: 'Ten rounds',        dfa: 'ده بازی انجام دادی',                den: 'Play 10 games', zh: '十局', dzh: '玩满十局', de: 'Zehn Runden', dde: 'Spiel 10 Spiele' },
    { id: 'play-50',     icon: 'medal',   fa: 'پنجاه تایی',       en: 'Fifty rounds',      dfa: 'پنجاه بازی انجام دادی',             den: 'Play 50 games', zh: '五十局', dzh: '玩满五十局', de: 'Fünfzig Runden', dde: 'Spiel 50 Spiele' },
    { id: 'play-200',    icon: 'trophy',  fa: 'دویست تایی',       en: 'Two hundred',       dfa: 'دویست بازی انجام دادی',             den: 'Play 200 games', zh: '两百局', dzh: '玩满两百局', de: 'Zweihundert', dde: 'Spiel 200 Spiele' },
    { id: 'sampler',     icon: 'palette', fa: 'همه‌چیزخور',       en: 'Sampler',           dfa: 'چهار بازی مختلف را امتحان کردی',     den: 'Try four different games', zh: '尝鲜者', dzh: '玩过四个不同的游戏', de: 'Probierer', dde: 'Probier vier verschiedene Spiele' },
    { id: 'coins-100',   icon: 'coin',    fa: 'صد سکه',           en: 'Hundred coins',     dfa: 'در مجموع صد سکه گرفتی',             den: 'Earn 100 coins in total', zh: '一百金币', dzh: '累计获得一百金币', de: 'Hundert Münzen', dde: 'Verdiene insgesamt 100 Münzen' },
    { id: 'coins-1000',  icon: 'coin',    fa: 'هزار سکه',         en: 'Thousand coins',    dfa: 'در مجموع هزار سکه گرفتی',           den: 'Earn 1000 coins in total', zh: '一千金币', dzh: '累计获得一千金币', de: 'Tausend Münzen', dde: 'Verdiene insgesamt 1000 Münzen' },
    { id: 'daily-1',     icon: 'calendar',fa: 'اولین روزانه',     en: 'First daily',       dfa: 'اولین چالش روزانه را زدی',           den: 'Finish your first daily', zh: '首个每日', dzh: '完成第一个每日挑战', de: 'Erstes Tagesrätsel', dde: 'Schaff dein erstes Tagesrätsel' },
    { id: 'daily-25',    icon: 'calendar',fa: 'بیست‌وپنج روزانه', en: 'Daily regular',     dfa: 'بیست‌وپنج چالش روزانه زدی',          den: 'Finish 25 daily challenges', zh: '每日常客', dzh: '完成二十五个每日挑战', de: 'Stammgast', dde: 'Schaff 25 Tagesrätsel' },
    { id: 'streak-3',    icon: 'flame',   fa: 'سه روز پشت هم',    en: 'Three in a row',    dfa: 'سه روز پیوسته بازی کردی',           den: 'Play three days in a row', zh: '连续三天', dzh: '连续三天玩游戏', de: 'Drei in Folge', dde: 'Spiel drei Tage in Folge' },
    { id: 'streak-7',    icon: 'flame',   fa: 'یک هفته',          en: 'A full week',       dfa: 'هفت روز پیوسته بازی کردی',          den: 'Play seven days in a row', zh: '整整一周', dzh: '连续七天玩游戏', de: 'Eine ganze Woche', dde: 'Spiel sieben Tage in Folge' },
    { id: 'streak-30',   icon: 'flame',   fa: 'یک ماه',           en: 'A full month',      dfa: 'سی روز پیوسته بازی کردی',           den: 'Play thirty days in a row', zh: '整整一月', dzh: '连续三十天玩游戏', de: 'Ein ganzer Monat', dde: 'Spiel dreißig Tage in Folge' },
    { id: 'tier-silver', icon: 'medal',   fa: 'نقره‌ای',          en: 'Silver',            dfa: 'به رده‌ی نقره رسیدی',               den: 'Reach the Silver tier', zh: '白银', dzh: '达到白银段位', de: 'Silber', dde: 'Erreiche die Silberstufe' },
    { id: 'tier-gold',   icon: 'medal',   fa: 'طلایی',            en: 'Gold',              dfa: 'به رده‌ی طلا رسیدی',                den: 'Reach the Gold tier', zh: '黄金', dzh: '达到黄金段位', de: 'Gold', dde: 'Erreiche die Goldstufe' },
    { id: 'tier-diamond',icon: 'gem',     fa: 'الماسی',           en: 'Diamond',           dfa: 'به رده‌ی الماس رسیدی',              den: 'Reach the Diamond tier', zh: '钻石', dzh: '达到钻石段位', de: 'Diamant', dde: 'Erreiche die Diamantstufe' },
    { id: 'tier-legend', icon: 'crown',   fa: 'افسانه',           en: 'Legend',            dfa: 'به رده‌ی افسانه رسیدی',             den: 'Reach the Legend tier', zh: '传奇', dzh: '达到传奇段位', de: 'Legende', dde: 'Erreiche die Legendenstufe' },
    { id: 'night-owl',   icon: 'moon',    fa: 'شب‌زنده‌دار',      en: 'Night owl',         dfa: 'بین دو تا پنج بامداد بازی کردی',     den: 'Play between 2 and 5 AM', zh: '夜猫子', dzh: '在凌晨两点到五点之间玩', de: 'Nachteule', dde: 'Spiel zwischen 2 und 5 Uhr nachts' },
    { id: 'td-win',      icon: 'tower',   fa: 'برج‌بان',          en: 'Tower keeper',      dfa: 'یک نقشه‌ی دفاع از برج را بردی',      den: 'Win a tower defence map', zh: '守塔人', dzh: '通关一张塔防地图', de: 'Turmwächter', dde: 'Gewinne eine Karte in Turmverteidigung' },
    { id: 'td-perfect',  icon: 'shield',  fa: 'بی‌خش',            en: 'Flawless',          dfa: 'یک نقشه را بدون از دست دادن جان بردی', den: 'Win a map without losing a life', zh: '毫发无伤', dzh: '一条命都没丢就通关', de: 'Makellos', dde: 'Gewinne eine Karte, ohne ein Leben zu verlieren' },
    { id: 'td-stars',    icon: 'star',    fa: 'سه ستاره',         en: 'Three stars',       dfa: 'در یک نقشه سه ستاره گرفتی',          den: 'Earn three stars on a map', zh: '三颗星', dzh: '在一张地图上拿到三星', de: 'Drei Sterne', dde: 'Hol drei Sterne auf einer Karte' },
    { id: 'td-endless',  icon: 'infinity',fa: 'موج سی',           en: 'Wave thirty',       dfa: 'در حالت بی‌پایان به موج سی رسیدی',    den: 'Reach wave 30 in endless mode', zh: '第三十波', dzh: '无尽模式打到第三十波', de: 'Welle dreißig', dde: 'Erreiche im Endlosmodus Welle 30' },
    { id: 'sd-win',      icon: 'grid',    fa: 'اولین سودوکو',     en: 'First sudoku',      dfa: 'یک سودوکو را کامل کردی',             den: 'Complete a sudoku', zh: '首个数独', dzh: '完成一局数独', de: 'Erstes Sudoku', dde: 'Löse ein Sudoku' },
    { id: 'sd-expert',   icon: 'brain',   fa: 'سودوکوی خبره',     en: 'Expert sudoku',     dfa: 'یک سودوکوی خبره را حل کردی',         den: 'Solve an expert sudoku', zh: '专家数独', dzh: '解开一局专家数独', de: 'Sudoku-Experte', dde: 'Löse ein Sudoku auf Experte' },
    { id: 'sd-clean',    icon: 'sparkle', fa: 'بی‌راهنمایی',      en: 'No help',           dfa: 'سودوکو را بدون راهنمایی و بدون خطا تمام کردی', den: 'Finish a sudoku with no hints and no mistakes', zh: '不用提示', dzh: '无提示、无错误完成数独', de: 'Ohne Hilfe', dde: 'Löse ein Sudoku ohne Tipps und ohne Fehler' },
    { id: 'sd-fast',     icon: 'bolt',    fa: 'سریع',             en: 'Speedy',            dfa: 'سودوکوی متوسط را زیر پنج دقیقه حل کردی', den: 'Solve a medium sudoku under five minutes', zh: '手快', dzh: '五分钟内解开中等数独', de: 'Flink', dde: 'Löse ein mittleres Sudoku in unter fünf Minuten' },
    { id: 'ms-win',      icon: 'mine',    fa: 'مین‌یاب',          en: 'Sweeper',           dfa: 'یک مین‌روب را بردی',                 den: 'Win a minesweeper game', zh: '扫雷成功', dzh: '赢下一局扫雷', de: 'Minenräumer', dde: 'Gewinne ein Minesweeper-Spiel' },
    { id: 'ms-large',    icon: 'mine',    fa: 'میدان بزرگ',       en: 'Big field',         dfa: 'مین‌روب بزرگ را بردی',               den: 'Win a large minesweeper board', zh: '大雷区', dzh: '赢下大号扫雷棋盘', de: 'Großes Feld', dde: 'Gewinne auf einem großen Minesweeper-Brett' },
    { id: 'ms-fast',     icon: 'bolt',    fa: 'دست تند',          en: 'Quick hands',       dfa: 'مین‌روب کوچک را زیر سی ثانیه بردی',   den: 'Win a small board under 30 seconds', zh: '快手', dzh: '三十秒内赢下小号棋盘', de: 'Schnelle Hände', dde: 'Gewinne ein kleines Brett in unter 30 Sekunden' },
    { id: 'dt-win',      icon: 'box',     fa: 'جعبه‌گیر',         en: 'Box taker',         dfa: 'یک دست نقطه‌بازی را بردی',           den: 'Win a dots and boxes match', zh: '抢格子', dzh: '赢下一局点格棋', de: 'Kästchensammler', dde: 'Gewinne eine Partie Käsekästchen' },
    { id: 'dt-hard',     icon: 'brain',   fa: 'مغلوب‌کننده',      en: 'Mind beater',       dfa: 'حریف سخت را شکست دادی',              den: 'Beat the hard AI', zh: '智胜', dzh: '击败困难电脑', de: 'Denkerbezwinger', dde: 'Schlag den schweren Gegner' },
    { id: 'dt-chain',    icon: 'link',    fa: 'زنجیره‌ساز',       en: 'Chain master',      dfa: 'در یک نوبت پنج مربع گرفتی',          den: 'Take five boxes in one turn', zh: '连锁高手', dzh: '一回合拿下五个格子', de: 'Kettenmeister', dde: 'Hol fünf Kästchen in einem Zug' },
    { id: 'dt-shutout',  icon: 'crown',   fa: 'قلعه‌ی بسته',      en: 'Shutout',           dfa: 'حریف را بدون هیچ مربعی نگه داشتی',    den: 'Win without conceding a box', zh: '零封', dzh: '一个格子都不让对手拿', de: 'Zu null', dde: 'Gewinne, ohne ein Kästchen abzugeben' },
    { id: 'ng-win',      icon: 'grid',    fa: 'اولین تصویر',      en: 'First picture',     dfa: 'یک نونوگرام را حل کردی',             den: 'Solve a nonogram', zh: '第一幅图', dzh: '解开一道数织', de: 'Erstes Bild', dde: 'Löse ein Nonogramm' },
    { id: 'ng-large',    icon: 'palette', fa: 'بوم بزرگ',         en: 'Big canvas',        dfa: 'یک نونوگرام پانزده در پانزده را حل کردی', den: 'Solve a 15×15 nonogram', zh: '大画布', dzh: '解开一道15×15数织', de: 'Große Leinwand', dde: 'Löse ein 15×15-Nonogramm' },
    { id: 'ng-fast',     icon: 'bolt',    fa: 'قلم تند',          en: 'Quick brush',       dfa: 'نونوگرام ده در ده را زیر سه دقیقه حل کردی', den: 'Solve a 10×10 nonogram under three minutes', zh: '快笔', dzh: '三分钟内解开10×10数织', de: 'Schneller Pinsel', dde: 'Löse ein 10×10-Nonogramm in unter drei Minuten' },
    { id: 'mc-win',      icon: 'gem',     fa: 'دانه‌کار',          en: 'Sower',             dfa: 'یک دست منقله را از حریف بردی',        den: 'Win a mancala match against the AI', zh: '播种人', dzh: '对战电脑赢下一局播棋', de: 'Säer', dde: 'Gewinne eine Partie Mancala gegen den Computer' },
    { id: 'mc-hard',     icon: 'brain',   fa: 'استاد منقله',      en: 'Mancala master',    dfa: 'حریف سخت منقله را شکست دادی',         den: 'Beat the hard mancala AI', zh: '播棋大师', dzh: '击败困难的播棋电脑', de: 'Mancala-Meister', dde: 'Schlag den schweren Mancala-Gegner' },
    { id: 'mc-capture',  icon: 'bolt',    fa: 'درو',              en: 'Harvest',           dfa: 'با یک حرکت ده دانه یا بیشتر گرفتی',    den: 'Capture ten or more seeds in one move', zh: '大丰收', dzh: '一步吃掉十颗或更多种子', de: 'Ernte', dde: 'Fang zehn oder mehr Samen mit einem Zug' },
    { id: 'fc-win',      icon: 'crown',   fa: 'چهار شاه',         en: 'Four kings',        dfa: 'یک دست فری‌سل را بردی',              den: 'Win a game of FreeCell', zh: '四王归位', dzh: '赢下一局空当接龙', de: 'Vier Könige', dde: 'Gewinne eine Partie FreeCell' },
    { id: 'fc-clean',    icon: 'sparkle', fa: 'بی‌برگشت',         en: 'No take-backs',     dfa: 'فری‌سل را بدون برگرداندن حتی یک حرکت بردی', den: 'Win FreeCell without undoing a move', zh: '落子无悔', dzh: '不撤销任何一步赢下空当接龙', de: 'Ohne Zurücknehmen', dde: 'Gewinne FreeCell, ohne einen Zug zurückzunehmen' },
    { id: 'fc-fast',     icon: 'bolt',    fa: 'ورق‌باز تند',      en: 'Quick dealer',      dfa: 'فری‌سل را زیر چهار دقیقه بردی',       den: 'Win FreeCell in under four minutes', zh: '快手发牌', dzh: '四分钟内赢下空当接龙', de: 'Schneller Geber', dde: 'Gewinne FreeCell in unter vier Minuten' },
    { id: 'pg-win',      icon: 'sparkle', fa: 'تک‌میخ',           en: 'Last peg',          dfa: 'میخ‌پران را با یک میخ تمام کردی',     den: 'Finish peg solitaire with one peg left', zh: '仅剩一枚', dzh: '孔明棋只剩一枚棋子', de: 'Letzter Stift', dde: 'Beende Solitär mit einem einzigen Stift' },
    { id: 'pg-centre',   icon: 'crown',   fa: 'دل تخته',          en: 'Dead centre',       dfa: 'آخرین میخ را وسط تخته نشاندی',       den: 'Leave the last peg in the centre', zh: '正中央', dzh: '最后一枚棋子落在正中', de: 'Mittenrein', dde: 'Lass den letzten Stift in der Mitte stehen' },
    { id: 'pg-clean',    icon: 'brain',   fa: 'بی‌برگشت',         en: 'No take-backs',     dfa: 'بدون برگرداندن به یک میخ رسیدی',     den: 'Get down to one peg without undoing', zh: '一步不悔', dzh: '不撤销就只剩一枚', de: 'Ohne Zurücknehmen', dde: 'Komm auf einen Stift, ohne einen Zug zurückzunehmen' },
    { id: 'rv-win',      icon: 'medal',   fa: 'برگرداننده',       en: 'Flipper',           dfa: 'یک دست ریورسی را مقابل حریف بردی',    den: 'Win a reversi match against the AI', zh: '翻盘手', dzh: '对战电脑赢下一局黑白棋', de: 'Umdreher', dde: 'Gewinne eine Partie Reversi gegen den Computer' },
    { id: 'rv-hard',     icon: 'brain',   fa: 'استاد محاصره',     en: 'Outflanker',        dfa: 'در ریورسی حریف سخت را شکست دادی',     den: 'Beat the hard AI at reversi', zh: '包围大师', dzh: '在黑白棋中击败困难电脑', de: 'Umzingler', dde: 'Schlag den schweren Reversi-Gegner' },
    { id: 'rv-corners',  icon: 'crown',   fa: 'چهار گوشه',        en: 'Four corners',      dfa: 'با هر چهار گوشه‌ی تخته ریورسی را بردی', den: 'Win at reversi holding all four corners', zh: '四角皆占', dzh: '占据全部四个角赢下黑白棋', de: 'Vier Ecken', dde: 'Gewinne Reversi mit allen vier Ecken' },
    { id: 'bg-win',      icon: 'medal',   fa: 'نردباز',           en: 'Backgammon player', dfa: 'یک دست تخته‌نرد را از حریف بردی',     den: 'Win a backgammon game against the AI', zh: '双陆棋手', dzh: '对战电脑赢下一局双陆棋', de: 'Backgammon-Spieler', dde: 'Gewinne eine Partie Backgammon gegen den Computer' },
    { id: 'bg-hard',     icon: 'brain',   fa: 'استاد تخته',       en: 'Board master',      dfa: 'حریف سخت تخته‌نرد را بردی',           den: 'Beat the hard backgammon AI', zh: '棋盘大师', dzh: '击败困难难度的双陆棋电脑', de: 'Brettmeister', dde: 'Schlag den schweren Backgammon-Gegner' },
    { id: 'bg-gammon',   icon: 'crown',   fa: 'مارس',             en: 'Gammon',            dfa: 'تخته‌نرد را با مارس یا بک‌گمون بردی', den: 'Win a gammon or a backgammon', zh: '全胜', dzh: '以全胜或完胜赢下双陆棋', de: 'Gammon', dde: 'Gewinne ein Gammon oder Backgammon' },
    { id: 'mr-win',      icon: 'medal',   fa: 'دوزباز',           en: 'Morris winner',     dfa: 'یک دست دوز را از هوش مصنوعی بردی',    den: 'Win a game of morris against the AI', zh: '九子棋胜者', dzh: '在九子棋中战胜电脑', de: 'Mühlensieger', dde: 'Gewinne eine Partie Mühle gegen den Computer' },
    { id: 'mr-hard',     icon: 'brain',   fa: 'استاد دوز',        en: 'Morris master',     dfa: 'حریف سخت دوز را شکست دادی',          den: 'Beat the hard morris AI', zh: '九子棋大师', dzh: '击败九子棋困难电脑', de: 'Mühlenmeister', dde: 'Schlag den schweren Mühle-Gegner' },
    { id: 'mr-clean',    icon: 'shield',  fa: 'بی‌تلفات',          en: 'Not a scratch',     dfa: 'دوز را بدون از دست دادن حتی یک مهره بردی', den: 'Win at morris without losing a piece', zh: '全身而退', dzh: '一枚棋子都没丢就赢下九子棋', de: 'Ohne Kratzer', dde: 'Gewinne Mühle, ohne einen Stein zu verlieren' },
    { id: 'bs-win',      icon: 'flag',    fa: 'دریاسالار',        en: 'Admiral',           dfa: 'یک نبرد دریایی را بردی',              den: 'Win a battleship match', zh: '海军上将', dzh: '赢下一局海战棋', de: 'Admiral', dde: 'Gewinne eine Partie Schiffe versenken' },
    { id: 'bs-hard',     icon: 'brain',   fa: 'ناخدای زیرک',      en: 'Sharp captain',     dfa: 'حریف سخت نبرد دریایی را شکست دادی',   den: 'Beat the hard battleship AI', zh: '精明舰长', dzh: '击败困难海战棋电脑', de: 'Scharfer Kapitän', dde: 'Schlag den schweren Gegner bei Schiffe versenken' },
    { id: 'bs-intact',   icon: 'shield',  fa: 'ناوگان سالم',      en: 'Fleet intact',      dfa: 'بدون از دست دادن هیچ کشتی‌ای بردی',   den: 'Win without losing a ship', zh: '舰队完好', dzh: '一艘船都没损失就获胜', de: 'Flotte intakt', dde: 'Gewinne, ohne ein Schiff zu verlieren' },
    { id: 'br-win',      icon: 'link',    fa: 'پل‌ساز',           en: 'Bridge builder',    dfa: 'یک پازل پل‌ها را حل کردی',            den: 'Solve a bridges puzzle', zh: '架桥人', dzh: '解开一道数桥', de: 'Brückenbauer', dde: 'Löse ein Brücken-Rätsel' },
    { id: 'br-large',    icon: 'grid',    fa: 'مجمع‌الجزایر',     en: 'Archipelago',       dfa: 'پازل پل‌های یازده در یازده را حل کردی', den: 'Solve an 11×11 bridges puzzle', zh: '群岛', dzh: '解开一道 11×11 数桥', de: 'Archipel', dde: 'Löse ein 11×11-Brücken-Rätsel' },
    { id: 'br-clean',    icon: 'sparkle', fa: 'یک‌نفس',           en: 'In one go',         dfa: 'پازل پل‌ها را بدون برگرداندن حل کردی', den: 'Solve a bridges puzzle without undo', zh: '一气呵成', dzh: '不撤销解开一道数桥', de: 'In einem Rutsch', dde: 'Löse ein Brücken-Rätsel ohne Rückgängig' },
    { id: 'cb-win',      icon: 'lock',    fa: 'رمزگشا',           en: 'Codebreaker',       dfa: 'یک رمز را شکستی',                    den: 'Crack a code', zh: '解码者', dzh: '破解一个密码', de: 'Codeknacker', dde: 'Knack einen Code' },
    { id: 'cb-hard',     icon: 'brain',   fa: 'قفل سخت',          en: 'Hard lock',         dfa: 'رمز سخت را شکستی',                   den: 'Crack a hard code', zh: '硬锁', dzh: '破解一个困难密码', de: 'Hartes Schloss', dde: 'Knack einen schweren Code' },
    { id: 'cb-quick',    icon: 'bolt',    fa: 'چهار حدس',         en: 'Four guesses',      dfa: 'رمز معمولی یا سخت را در چهار حدس یا کمتر شکستی', den: 'Crack a normal or hard code in four guesses or fewer', zh: '四次破解', dzh: '四次以内破解普通或困难密码', de: 'Vier Versuche', dde: 'Knack einen normalen oder schweren Code in höchstens vier Versuchen' },
    { id: 'bo-first',    icon: 'grid',    fa: 'دیوار اول',        en: 'First wall',        dfa: 'یک مرحله‌ی آجرشکن را تمام کردی',      den: 'Clear a breakout level', zh: '第一面墙', dzh: '通关一关打砖块', de: 'Erste Mauer', dde: 'Räum ein Breakout-Level ab' },
    { id: 'bo-flawless', icon: 'shield',  fa: 'بی‌افت',           en: 'Not a ball lost',   dfa: 'یک مرحله را بدون از دست دادن توپ تمام کردی', den: 'Clear a level without losing a ball', zh: '一球不丢', dzh: '一个球都没丢就通关一关', de: 'Kein Ball verloren', dde: 'Räum ein Level ab, ohne einen Ball zu verlieren' },
    { id: 'bo-all',      icon: 'trophy',  fa: 'دیوارشکن',         en: 'Wall breaker',      dfa: 'هر دوازده مرحله‌ی آجرشکن را تمام کردی', den: 'Clear all twelve breakout levels', zh: '破墙者', dzh: '通关全部十二关打砖块', de: 'Mauerbrecher', dde: 'Räum alle zwölf Breakout-Level ab' },
    { id: 'ps-win',      icon: 'trophy',  fa: 'یازده‌باز',        en: 'Eleven up',         dfa: 'یک دست پاسور را از حریف بردی',        den: 'Win a game of pasur against the AI', zh: '凑十一', dzh: '在帕苏尔中战胜电脑', de: 'Elf gemacht', dde: 'Gewinne eine Partie Pasur gegen den Computer' },
    { id: 'ps-hard',     icon: 'brain',   fa: 'استاد پاسور',      en: 'Pasur master',      dfa: 'حریف سخت پاسور را شکست دادی',         den: 'Beat the hard pasur AI', zh: '帕苏尔大师', dzh: '击败困难的帕苏尔电脑', de: 'Pasur-Meister', dde: 'Schlag den starken Pasur-Gegner' },
    { id: 'ps-surs',     icon: 'sparkle', fa: 'سه سور',           en: 'Three surs',        dfa: 'در یک دست پاسور سه بار سور زدی',      den: 'Score three surs in one game of pasur', zh: '三次清台', dzh: '在一局帕苏尔中清台三次', de: 'Drei Surs', dde: 'Schaff drei Surs in einem Pasur-Spiel' },
    { id: 'hk-win',      icon: 'trophy',  fa: 'حکم بُردی',         en: 'Trump taken',       dfa: 'یک بازی حکم را با یارت بردی',          den: 'Win a game of hokm with your partner', zh: '霍克姆获胜', dzh: '和搭档赢下一局霍克姆', de: 'Trumpf geholt', dde: 'Gewinne eine Partie Hokm mit deinem Partner' },
    { id: 'hk-hard',     icon: 'brain',   fa: 'استاد حکم',         en: 'Hokm master',       dfa: 'حکم را در برابر حریف سخت بردی',        den: 'Win hokm against the hard AI', zh: '霍克姆大师', dzh: '战胜困难的霍克姆电脑', de: 'Hokm-Meister', dde: 'Gewinne Hokm gegen die starke KI' },
    { id: 'hk-kot',      icon: 'flame',   fa: 'کُت',               en: 'Kot',               dfa: 'یک دست حکم را هفت به صفر بردی',         den: 'Win a hand of hokm seven to nothing', zh: '完胜', dzh: '以七比零赢下一局霍克姆', de: 'Kot', dde: 'Gewinne eine Hokm-Runde sieben zu null' },
    { id: 'bd-sprint',   icon: 'bolt',    fa: 'دونده',            en: 'Sprinter',          dfa: 'چهل خط بلوک‌ریز را تمام کردی',          den: 'Finish a 40-line Block Drop sprint', zh: '竞速者', dzh: '完成一次 40 行落块竞速', de: 'Sprinter', dde: 'Schaff einen 40-Reihen-Sprint im Blocksturz' },
    { id: 'bd-tetris',   icon: 'flame',   fa: 'چهار با هم',       en: 'Four at once',      dfa: 'در بلوک‌ریز چهار خط را با هم پاک کردی',   den: 'Clear four lines at once in Block Drop', zh: '一次四行', dzh: '在落块中一次消除四行', de: 'Vier auf einmal', dde: 'Räum im Blocksturz vier Reihen auf einmal ab' },
    { id: 'bd-marathon', icon: 'trophy',  fa: 'ماراتن‌رو',        en: 'Marathoner',        dfa: 'ماراتن صدخطی بلوک‌ریز را تمام کردی',    den: 'Finish the 100-line Block Drop marathon', zh: '马拉松选手', dzh: '完成 100 行落块马拉松', de: 'Marathonläufer', dde: 'Schaff den 100-Reihen-Marathon im Blocksturz' },
    { id: 'mj-win',      icon: 'gem',     fa: 'جفت‌جور',          en: 'Pair finder',       dfa: 'یک دست ماهجونگ را تمام کردی',         den: 'Clear a mahjong board', zh: '配对高手', dzh: '清空一局麻将', de: 'Paarfinder', dde: 'Räum ein Mahjong-Brett ab' },
    { id: 'mj-turtle',   icon: 'crown',   fa: 'لاک‌پشت',          en: 'Turtle',            dfa: 'چیدمان لاک‌پشت را کامل خالی کردی',      den: 'Clear the turtle layout', zh: '乌龟', dzh: '清空乌龟布局', de: 'Schildkröte', dde: 'Räum die Schildkröte ab' },
    { id: 'mj-clean',    icon: 'sparkle', fa: 'بی‌کمک',           en: 'On your own',       dfa: 'بدون راهنمایی، بُر یا برگرداندن ماهجونگ را بردی', den: 'Clear mahjong without hints, shuffles or undo', zh: '全凭自己', dzh: '不用提示、洗牌或撤销清空麻将', de: 'Ganz allein', dde: 'Räum Mahjong ohne Tipp, Mischen oder Zurück ab' },
    { id: 'cs-mate',     icon: 'crown',   fa: 'کیش و مات',        en: 'Checkmate',         dfa: 'یک بازی شطرنج با مات تمام شد',         den: 'Finish a game of chess with checkmate', zh: '将死', dzh: '以将死结束一局国际象棋', de: 'Schachmatt', dde: 'Beende eine Partie Schach mit Matt' },
    { id: 'cs-bot',      icon: 'trophy',  fa: 'از ربات بردی',      en: 'Beat the machine',  dfa: 'ربات شطرنج را در سطح سخت بردی',        den: 'Beat the chess AI on hard', zh: '战胜电脑', dzh: '在困难难度下战胜国际象棋电脑', de: 'Maschine besiegt', dde: 'Besiege die Schach-KI auf Schwer' }
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
      mutate('achievements', function (a) { a[id] = Date.now(); return a; });
      Chogan.ui.toast({
        icon: d.icon,
        title: Chogan.achText(d).title,
        sub: Chogan.achText(d).sub
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
      // ادامه‌ی یک نشست (مثل حالت بی‌پایان بعد از برد) بازی تازه نیست
      if (!o.continued) { g.plays++; state.stats.plays++; }
      if (o.won) g.wins++;
      g.timeMs += Math.max(0, o.timeMs || 0);
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
    // فقط اولین نتیجه‌ی هر روز ثبت می‌شود. بازی دوباره‌ی همان روز نباید رکورد
    // ثبت‌شده را عوض کند — وگرنه یک باخت، بردِ صبح را پاک می‌کرد.
    // خروجی می‌گوید ثبت شد یا نه، تا بازی بداند پاداش روزانه بدهد یا ندهد.
    daily: function (gameId, date, payload) {
      if (!state.stats.daily[date]) state.stats.daily[date] = {};
      if (state.stats.daily[date][gameId]) return false;
      bump('dailyDone');
      state.stats.daily[date][gameId] = Object.assign({ at: Date.now() }, payload);
      saveStats();
      achApi.check();
      return true;
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

  /* ------------------------------------------------- کارت تصویری نتیجه */
  // یک بوم ۱۰۸۰×۱۳۵۰ که برند، عنوان، تخته‌ی پایانی و ردیف‌های نتیجه را
  // می‌کشد. تخته را خود بازی می‌کشد چون فقط او مدلش را می‌داند.
  var CARD_W = 1080, CARD_H = 1500;

  function cssVar(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) { return fallback; }
  }

  // roundRect در وب‌ویوهای قدیمی نیست
  function rrect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  Chogan.rrect = rrect;

  function fontsReady() {
    if (document.fonts && document.fonts.ready) {
      // یک بار متن فارسی را بخواه تا فونت متغیر واقعاً بار شود
      try { document.fonts.load('700 76px Vazirmatn', 'چوگان'); } catch (e) { /* مهم نیست */ }
      return document.fonts.ready.catch(function () { });
    }
    return Promise.resolve();
  }

  // o: { game, title, note, stars, lines, footer, paint }
  Chogan.card = function (o) {
    return fontsReady().then(function () {
      var cv = document.createElement('canvas');
      cv.width = CARD_W; cv.height = CARD_H;
      var g = cv.getContext('2d');
      var rtl = document.documentElement.dir === 'rtl';
      var fam = 'Vazirmatn, system-ui, sans-serif';
      var col = {
        bg: cssVar('--c-bg', '#FBF6EF'),
        surface: cssVar('--c-surface', '#FFFFFF'),
        surface2: cssVar('--c-surface-2', '#F3EADF'),
        surface3: cssVar('--c-surface-3', '#EDE0D0'),
        line: cssVar('--c-line', '#E6D9C8'),
        text: cssVar('--c-text', '#2C2620'),
        dim: cssVar('--c-text-dim', '#7A6A57'),
        faint: cssVar('--c-text-faint', '#A99883'),
        accent: cssVar('--c-accent', '#D9A441'),
        gold: cssVar('--c-gold', '#D9A441'),
        game: cssVar('--game', '') || cssVar('--c-accent', '#D9A441')
      };
      try { g.direction = rtl ? 'rtl' : 'ltr'; } catch (e) { /* پشتیبانی نشد */ }

      var START = rtl ? 'right' : 'left', END = rtl ? 'left' : 'right';
      var PAD = 84;
      var xs = rtl ? CARD_W - PAD : PAD;      // لبه‌ی شروع خط
      var xe = rtl ? PAD : CARD_W - PAD;      // لبه‌ی پایان خط

      g.fillStyle = col.bg;
      g.fillRect(0, 0, CARD_W, CARD_H);
      g.fillStyle = col.surface;
      rrect(g, 36, 36, CARD_W - 72, CARD_H - 72, 56);
      g.fill();

      // برند
      g.textBaseline = 'alphabetic';
      g.textAlign = START;
      g.fillStyle = col.game;
      g.font = '800 46px ' + fam;
      g.fillText(rtl ? 'چوگان' : 'Chogan', xs, 150);
      if (o.game) {
        g.textAlign = END;
        g.fillStyle = col.faint;
        g.font = '600 36px ' + fam;
        g.fillText(o.game, xe, 150);
      }
      g.strokeStyle = col.line; g.lineWidth = 3;
      g.beginPath(); g.moveTo(PAD, 186); g.lineTo(CARD_W - PAD, 186); g.stroke();

      // عنوان
      var y = 268;
      g.textAlign = 'center';
      g.fillStyle = col.text;
      g.font = '800 70px ' + fam;
      g.fillText(o.title || '', CARD_W / 2, y);
      y += 20;
      if (o.note) {
        y += 46;
        g.fillStyle = col.dim;
        g.font = '600 34px ' + fam;
        g.fillText(o.note, CARD_W / 2, y);
      }
      if (o.stars !== undefined && o.stars !== null) {
        y += 74;
        drawStars(g, CARD_W / 2, y, o.stars, col);
        y += 12;
      }

      // تخته
      var lines = o.lines || [];
      var rowH = 74;
      var listH = lines.length * rowH;
      var footTop = CARD_H - PAD - 40;
      var boxTop = y + 44;
      var boxBottom = footTop - listH - 44;
      // بدون تخته، ردیف‌ها می‌آیند بالا تا کارت وسطش خالی نماند
      var box = o.paint
        ? { x: PAD, y: boxTop, w: CARD_W - PAD * 2, h: Math.max(160, boxBottom - boxTop) }
        : { x: PAD, y: boxTop, w: CARD_W - PAD * 2, h: Math.max(0, (boxBottom - boxTop) / 3) };
      if (o.paint) {
        g.save();
        try {
          g.translate(box.x, box.y);
          g.beginPath(); g.rect(0, 0, box.w, box.h); g.clip();
          o.paint(g, box.w, box.h, col);
        } catch (e) { /* تخته نکشیده شد، بقیه‌ی کارت سالم است */ }
        g.restore();
      }

      // ردیف‌های نتیجه
      var ly = box.y + box.h + 44;
      lines.forEach(function (l, i) {
        if (i) {
          g.strokeStyle = col.line; g.lineWidth = 2;
          g.beginPath(); g.moveTo(PAD, ly - rowH / 2 - 14); g.lineTo(CARD_W - PAD, ly - rowH / 2 - 14); g.stroke();
        }
        g.textAlign = START;
        g.fillStyle = col.dim;
        g.font = '600 36px ' + fam;
        g.fillText(l.label, xs, ly);
        g.textAlign = END;
        g.fillStyle = l.gold ? col.gold : col.text;
        g.font = '800 40px ' + fam;
        g.fillText(l.value, xe, ly);
        ly += rowH;
      });

      // پابرگ
      g.textAlign = 'center';
      g.fillStyle = col.faint;
      g.font = '600 28px ' + fam;
      g.fillText(o.footer || 'choganhq.github.io/chogan', CARD_W / 2, CARD_H - PAD + 6);
      return cv;
    });
  };

  function drawStars(g, cx, cy, n, col) {
    var R = 30, gap = 84;
    for (var i = 0; i < 3; i++) {
      var x = cx + (i - 1) * gap;
      g.beginPath();
      for (var k = 0; k < 10; k++) {
        var rad = k % 2 ? R * 0.45 : R;
        var a = -Math.PI / 2 + k * Math.PI / 5;
        var px = x + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
        if (k) g.lineTo(px, py); else g.moveTo(px, py);
      }
      g.closePath();
      if (i < n) { g.fillStyle = col.gold; g.fill(); }
      else { g.strokeStyle = col.line; g.lineWidth = 4; g.stroke(); }
    }
  }

  function canvasBlob(cv) {
    return new Promise(function (res) {
      if (cv.toBlob) cv.toBlob(function (b) { res(b); }, 'image/png');
      else res(null);
    });
  }

  // متن همیشه همراه عکس می‌رود تا جایی که عکس پشتیبانی نمی‌شود دست خالی نماند
  Chogan.shareCard = function (o) {
    var text = o.text || '';
    Chogan.card(o).then(function (cv) {
      return canvasBlob(cv).then(function (blob) { return { cv: cv, blob: blob }; });
    }).then(function (r) {
      var file = null;
      if (r.blob && global.File) {
        try { file = new File([r.blob], 'chogan.png', { type: 'image/png' }); } catch (e) { file = null; }
      }
      var nav = global.navigator;
      var canFiles = false;
      try { canFiles = !!(file && nav && nav.canShare && nav.canShare({ files: [file] })); } catch (e) { canFiles = false; }
      cardSheet(r.cv, r.blob, text, canFiles ? file : null);
    }, function () { Chogan.share(text); });
  };

  function cardSheet(cv, blob, text, file) {
    var url = blob && global.URL && URL.createObjectURL ? URL.createObjectURL(blob) : cv.toDataURL('image/png');
    var img = el('img', { class: 'ch-card__img', src: url, alt: '' });
    var actions = [];
    var nav = global.navigator;
    // Android app: the WebView ignores <a download> and has no navigator.share, so
    // both buttons did nothing there (#168). MainActivity exposes a small bridge.
    var droid = global.ChoganAndroid;
    if (droid && droid.shareImage) {
      var png = function () { return cv.toDataURL('image/png').split(',')[1]; };
      actions.push({
        label: Chogan.t('share'), kind: 'primary', keepOpen: true, onClick: function () {
          if (!droid.shareImage(png(), text)) copyText(text);
        }
      });
      actions.push({
        label: Chogan.t('saveImage'), keepOpen: true, onClick: function () {
          // Below Android 10 saving needs a storage permission the app doesn't take; share instead
          if (droid.canSave() && droid.saveImage(png())) Chogan.ui.toast({ icon: 'check', title: Chogan.t('imageSaved') });
          else droid.shareImage(png(), text);
        }
      });
      if (text) actions.push({ label: Chogan.t('copyText'), keepOpen: true, onClick: function () { copyText(text); } });
      Chogan.ui.modal({ title: Chogan.t('share'), body: [img], actions: actions, closeButton: true,
        onClose: function () { if (blob && global.URL && URL.revokeObjectURL) setTimeout(function () { URL.revokeObjectURL(url); }, 400); } });
      return;
    }
    if (file) {
      actions.push({
        label: Chogan.t('share'), kind: 'primary', keepOpen: true, onClick: function () {
          nav.share({ files: [file], text: text }).catch(function () { /* لغو شد */ });
        }
      });
    } else if (nav && nav.share) {
      actions.push({
        label: Chogan.t('share'), kind: 'primary', keepOpen: true, onClick: function () {
          nav.share({ text: text }).catch(function () { copyText(text); });
        }
      });
    }
    actions.push({
      label: Chogan.t('saveImage'), keepOpen: true, onClick: function () {
        var a = el('a', { href: url, download: 'chogan.png' });
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { if (a.parentNode) a.parentNode.removeChild(a); }, 0);
      }
    });
    if (text) actions.push({ label: Chogan.t('copyText'), keepOpen: true, onClick: function () { copyText(text); } });

    Chogan.ui.modal({
      title: Chogan.t('share'),
      body: [img],
      actions: actions,
      closeButton: true,
      onClose: function () {
        // آدرس شیء را آزاد کن وگرنه تا بسته شدن صفحه در حافظه می‌ماند
        if (blob && global.URL && URL.revokeObjectURL) setTimeout(function () { URL.revokeObjectURL(url); }, 400);
      }
    });
  }

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
    expand: 'M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5',
    collapse: 'M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5',
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
    list: 'M4 5h16v5H4zM4 14h16v5H4z',
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

  /* ------------------------------------------------------ تمام‌صفحه */
  // اپ چندصفحه‌ای است و هر بازی سند خودش را دارد، پس مرورگر با هر ناوبری از
  // تمام‌صفحه بیرون می‌آید. دکمه هم در منو و هم در نوار بازی می‌نشیند تا
  // برگرداندنش یک ضربه باشد. اپ نصب‌شده روی دسکتاپ پنجره‌ی نواردار است و
  // تمام‌صفحه به کارش می‌آید، پس فقط وقتی پنهان است که از قبل تمام‌صفحه باشد
  // یا داخل اپ اندروید (#108).
  Chogan.fullscreen = {
    available: function () {
      try {
        if (global.Capacitor) return false;
        if (global.matchMedia && global.matchMedia('(display-mode: fullscreen)').matches) return false;
        var e = document.documentElement;
        return !!(document.fullscreenEnabled && e.requestFullscreen);
      } catch (e) { return false; }
    },
    on: function () { return !!document.fullscreenElement; },
    toggle: function () {
      try {
        if (document.fullscreenElement) return document.exitFullscreen();
        return document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      } catch (e) { return Promise.reject(e); }
    },
    // دکمه‌ای که خودش برچسب و آیکونش را با وضعیت به‌روز نگه می‌دارد
    button: function (extraClass) {
      if (!Chogan.fullscreen.available()) return null;
      var btn = el('button', { class: 'ch-iconbtn' + (extraClass ? ' ' + extraClass : ''), type: 'button' });
      var sync = function () {
        var on = Chogan.fullscreen.on();
        btn.innerHTML = '';
        btn.appendChild(Chogan.icon(on ? 'collapse' : 'expand', 22));
        btn.setAttribute('aria-label', Chogan.t(on ? 'exitFullscreen' : 'fullscreen'));
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      };
      btn.addEventListener('click', function () {
        Chogan.feedback('tap');
        // درخواست باید روی همین ضربه باشد، وگرنه مرورگر ردش می‌کند
        var p = Chogan.fullscreen.toggle();
        if (p && p.catch) p.catch(function () { /* کاربر یا مرورگر نخواست */ });
      });
      document.addEventListener('fullscreenchange', sync);
      sync();
      return btn;
    }
  };

  /* ======================================================= playing cards */
  // Shared by every card game (Pasur, Hokm): a game never draws its own deck (#178).
  // A card is rank << 2 | suit: rank 0 ace … 9 ten, 10 jack, 11 queen, 12 king;
  // suit 0 clubs, 1 diamonds, 2 hearts, 3 spades.
  Chogan.cards = (function () {
    var GLYPH = ['♣︎', '♦︎', '♥︎', '♠︎'];
    var RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    var GOLD = '#D4A72C', GOLD2 = '#A9801A', SKIN = '#F2D3B1', SKIN2 = '#E2B994', INK = '#1E1A17', CURL = '#4A403A',
      ROSE = '#E8A39A', CREAM = '#F7EBD0', PEARL = '#FBF5E6', RUBY = '#C0392B', EMER = '#2E8B57';
    function f(n) { return Math.round(n * 100) / 100; }
    function circ(x, y, r, fill, extra) { return '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + f(r) + '" fill="' + fill + '"' + (extra || '') + '/>'; }
    var BOTEH = 'M0 3 C-2.2 3 -2.6 .4 -1 -1 C0 -2 1.6 -2.4 2 -4 C2.6 -2 2.2 .6 1 2 C.6 2.6 .3 3 0 3Z';
    function boteh(x, y, k, rot, fill) {
      return '<path transform="translate(' + f(x) + ' ' + f(y) + ') rotate(' + (rot || 0) + ') scale(' + k + ')" d="' + BOTEH + '" fill="' + fill + '"/>';
    }

    /* Court cards: Shah, Bibi and Sarbaz in a Qajar style, drawn for Chogan (#181).
       The cartoon faces of #171 read as too plain. The silhouettes (crown, headscarf,
       tall hat) carry the card at the 44px of a Hokm hand; the detail is for bigger
       cards. The robe takes the suit's colour through currentColor; gold and skin are
       fixed like printed ink. No ids anywhere: a face is inlined many times per page. */
    // A cream ring pass gives the scalloped outline, the solid base fills the gaps;
    // without the base the cream showed between curls and the beard read as bubbles.
    function curls(pts, r, base) {
      var a = '', b = '';
      pts.forEach(function (p) { a += circ(p[0], p[1], r + .55, CREAM); });
      pts.forEach(function (p, i) {
        b += circ(p[0], p[1], r, INK) +
          '<path d="M' + f(p[0] + r * .55) + ' ' + f(p[1] - r * .1) + ' a' + f(r * .55) + ' ' + f(r * .5) + ' 0 1 ' + (i % 2) + ' ' + f(-r * .9) + ' ' + f(r * .35) +
          '" fill="none" stroke="' + CURL + '" stroke-width=".38" stroke-linecap="round"/>';
      });
      return a + base + b;
    }
    function robeTop(x) { return 30 + 14 * Math.pow((x - 20) / 16, 2); }
    function robePattern(kind) {
      var s = '', row = 0;
      for (var y = 33; y < 44; y += 2.6, row++) {
        for (var x = 6 + (row % 2) * 1.6; x < 35; x += 3.2) {
          if (y < robeTop(x) + 1.6) continue;
          if (kind === 'boteh') s += boteh(x, y, .32, row % 2 ? 180 : 0, GOLD);
          else if (kind === 'flower') s += circ(x, y, .55, GOLD) + circ(x, y, .22, PEARL);
          else s += circ(x, y, .3, GOLD);
        }
      }
      return s;
    }
    function robe(kind) {
      return '<path d="M4 44 Q5 31 20 30 Q35 31 36 44Z" fill="currentColor"/>' + robePattern(kind) +
        '<path d="M27 31.2 Q35 33 36 44 H30 Q30 36 27 31.2Z" fill="#000" opacity=".16"/>' +
        '<path d="M4 44 Q5 31 20 30 Q35 31 36 44" fill="none" stroke="' + GOLD + '" stroke-width="1"/>' +
        '<path d="M4.6 43.2 H35.4" stroke="' + GOLD + '" stroke-width="1.2"/>' +
        '<path d="M5 43.2 H35" stroke="' + INK + '" stroke-width=".5" stroke-dasharray=".6 .9" opacity=".55"/>';
    }
    var BROW = '<path d="M15.6 16.9 Q17.9 15.6 20 16.8 Q22.1 15.6 24.4 16.9" fill="none" stroke="' + INK + '" stroke-width="1.05" stroke-linecap="round"/>';
    var EYES = '<path d="M16 19 Q17.4 18 18.8 19 Q17.4 19.8 16 19Z M21.2 19 Q22.6 18 24 19 Q22.6 19.8 21.2 19Z" fill="' + INK + '"/>' +
      circ(17.6, 18.8, .25, '#fff') + circ(22.8, 18.8, .25, '#fff');
    var NOSE = '<path d="M20 19.6 Q19.2 21.6 20.3 22" fill="none" stroke="' + SKIN2 + '" stroke-width=".55" stroke-linecap="round"/>';
    var FACE = '<ellipse cx="20" cy="19.5" rx="5.9" ry="6.8" fill="' + SKIN + '"/>' +
      '<path d="M23.6 14.4 Q26.6 19 24.4 25 Q26.2 19.6 23.6 14.4Z" fill="' + SKIN2 + '" opacity=".7"/>' + BROW + EYES + NOSE;
    var ARCH = '<path d="M5 44 V17 Q5 5 20 3.5 Q35 5 35 17 V44Z" fill="' + GOLD + '" opacity=".16"/>' +
      '<path d="M5 44 V17 Q5 5 20 3.5 Q35 5 35 17 V44" fill="none" stroke="' + GOLD + '" stroke-width=".9"/>' +
      '<path d="M6.6 44 V17.4 Q6.6 6.6 20 5.2 Q33.4 6.6 33.4 17.4 V44" fill="none" stroke="' + GOLD + '" stroke-width=".3"/>';
    function beardPts() {
      var pts = [], row = 0;
      for (var y = 21.4; y < 38.6; y += 1.55, row++) {
        var w = y <= 27 ? 5.7 : Math.max(.4, 5.7 * (1 - (y - 27) / 12));
        for (var x = 20 - w + (row % 2) * .8; x <= 20 + w + .01; x += 1.6) {
          if (Math.abs(x - 20) < 6 && y < 19.9 + 6 * (1 - Math.pow((x - 20) / 6, 2))) continue;   // keep the chin clear
          pts.push([x, y]);
        }
      }
      return pts;
    }
    function hairPts() {
      var pts = [];
      [[12.6, 14.6], [12.1, 17], [11.9, 19.4], [11.8, 21.8], [11.5, 24.2], [11.2, 26.6], [10.9, 29], [10.6, 31.4], [10.3, 33.8],
       [13.3, 25.4], [13, 27.8], [12.7, 30.2], [12.4, 32.6], [12.2, 35]].forEach(function (p) { pts.push(p, [40 - p[0], p[1]]); });
      return pts;
    }
    function shah() {
      return '<path d="M8.2 44 V24" stroke="' + GOLD2 + '" stroke-width="1.1"/>' + circ(8.2, 22.6, 1.7, GOLD) + circ(8.2, 22.6, .7, RUBY) +
        robe('boteh') +
        '<path d="M18 37 H22 V44 H18Z" fill="' + GOLD + '"/>' + circ(20, 39.2, .7, RUBY) + circ(20, 41.8, .6, EMER) +
        '<path d="M14.6 30.6 L20 37.4 L25.4 30.6" fill="none" stroke="' + GOLD + '" stroke-width="1.8"/>' +
        '<path d="M14.6 30.6 L20 37.4 L25.4 30.6" fill="none" stroke="' + PEARL + '" stroke-width=".7" stroke-dasharray=".1 1.3" stroke-linecap="round"/>' +
        FACE + curls(beardPts(), .82, '<path d="M14.3 19.5 Q13.8 33 20 38.4 Q26.2 33 25.7 19.5 Q24.5 25.5 20 25.5 Q15.5 25.5 14.3 19.5Z" fill="' + INK + '"/>') +
        '<path d="M16.6 24.4 Q18.4 22.6 20 23.8 Q21.6 22.6 23.4 24.4 Q24.4 23.8 24.6 22.8 Q22 26.2 20 24.8 Q18 26.2 15.4 22.8 Q15.6 23.8 16.6 24.4Z" fill="' + INK + '" stroke="' + CURL + '" stroke-width=".4"/>' +
        '<path d="M18.6 26.2 Q20 27 21.4 26.2" fill="none" stroke="#B5524A" stroke-width=".7"/>' +
        '<path d="M13.6 14 L12.6 5 Q20 1.8 27.4 5 L26.4 14Z" fill="' + GOLD + '"/>' +
        '<path d="M15.2 13 L14.8 6 M18.4 13 L18.2 4.4 M21.6 13 L21.8 4.4 M24.8 13 L25.2 6" stroke="' + GOLD2 + '" stroke-width=".45"/>' +
        '<rect x="13.4" y="11.6" width="13.2" height="2.4" fill="' + GOLD2 + '"/>' +
        '<path d="M14 12.8 H26" stroke="' + PEARL + '" stroke-width=".7" stroke-dasharray=".1 1.2" stroke-linecap="round"/>' +
        circ(20, 8.2, 1.7, RUBY, ' stroke="' + GOLD2 + '" stroke-width=".4"') + circ(16.2, 9, .9, EMER) + circ(23.8, 9, .9, EMER) +
        '<path d="M20 4.2 Q17.6 1.4 19.4 .4 Q21.6 .8 20.6 3 Q22.8 1.6 23.6 2.4 Q22.4 4 20 4.2Z" fill="' + INK + '"/>' + circ(20, 4.3, .7, GOLD);
    }
    function bibi() {
      return curls(hairPts(), .95, '<path d="M12.6 20 Q11.6 9.5 20 9.5 Q28.4 9.5 27.4 20 L30 36 Q20 32 10 36Z" fill="' + INK + '"/>') +
        robe('flower') +
        '<path d="M15.5 31 Q20 33.8 24.5 31 L23 44 H17Z" fill="' + PEARL + '" opacity=".9"/>' +
        '<path d="M17 33 L17.6 44 M23 33 L22.4 44" stroke="' + GOLD + '" stroke-width=".6"/>' +
        circ(20, 36, .45, GOLD) + circ(20, 38.4, .45, GOLD) + circ(20, 40.8, .45, GOLD) +
        FACE + circ(16.4, 22, 1.3, ROSE) + circ(23.6, 22, 1.3, ROSE) +
        '<path d="M18.4 23.9 Q20 24.9 21.6 23.9 Q20 23.3 18.4 23.9Z" fill="#B5524A"/>' +
        circ(14.1, 21.8, .7, GOLD) + circ(25.9, 21.8, .7, GOLD) + circ(14.1, 23, .4, RUBY) + circ(25.9, 23, .4, RUBY) +
        '<path d="M11.4 15.5 Q20 3.6 28.6 15.5 Q20 10.6 11.4 15.5Z" fill="' + GOLD + '"/>' +
        '<path d="M13 14.6 Q20 9.8 27 14.6" fill="none" stroke="' + GOLD2 + '" stroke-width=".45"/>' +
        circ(15, 14.6, .45, GOLD) + circ(17.4, 13.6, .45, GOLD) + circ(22.6, 13.6, .45, GOLD) + circ(25, 14.6, .45, GOLD) +
        circ(20, 9.6, 1.25, RUBY, ' stroke="' + GOLD2 + '" stroke-width=".4"') +
        '<path d="M14.5 31.6 Q20 35.6 25.5 31.6" fill="none" stroke="' + PEARL + '" stroke-width="1.5" stroke-dasharray=".1 1.5" stroke-linecap="round"/>' +
        '<path d="M24 41 Q25.5 38 26.4 36" stroke="#2E7D4F" stroke-width=".8"/><path d="M25 39.2 Q27 38.6 27.2 39.8 Q25.8 40.2 25 39.2Z" fill="#2E7D4F"/>' +
        circ(26.6, 35.4, 1.9, RUBY) + '<path d="M25.6 35 Q26.6 34 27.6 35 Q26.6 36.4 25.6 35Z" fill="#8E1F17"/>';
    }
    function sarbaz() {
      return '<path d="M33.5 44 L33.5 9" stroke="#7A4E2A" stroke-width="1.3"/>' +
        '<path d="M33.5 4.5 L35.3 10 L31.7 10Z" fill="' + GOLD + '"/><path d="M32 10.6 H35" stroke="' + RUBY + '" stroke-width="1"/>' +
        robe('dots') +
        '<path d="M15.6 34 H24.4 M15 36.2 H25 M14.6 38.4 H25.4" stroke="' + GOLD + '" stroke-width=".7"/>' +
        [[15.4, 34], [24.6, 34], [14.8, 36.2], [25.2, 36.2], [14.4, 38.4], [25.6, 38.4]].map(function (p) { return circ(p[0], p[1], .45, GOLD); }).join('') +
        '<path d="M5.6 41 H34.4" stroke="' + INK + '" stroke-width="1.4"/><rect x="18.6" y="40" width="2.8" height="2" rx=".4" fill="' + GOLD + '"/>' +
        '<path d="M9 33 L29 43" stroke="' + GOLD + '" stroke-width="1.6"/>' +
        '<path d="M7.6 33.4 Q11 30.6 14 31.2 L13 33.6 Q10 33 7.6 33.4Z M32.4 33.4 Q29 30.6 26 31.2 L27 33.6 Q30 33 32.4 33.4Z" fill="' + GOLD + '"/>' +
        '<path d="M8 33.6 L8.4 35 M9.6 33.3 L9.9 34.7 M11.2 33.1 L11.4 34.5 M32 33.6 L31.6 35 M30.4 33.3 L30.1 34.7 M28.8 33.1 L28.6 34.5" stroke="' + GOLD + '" stroke-width=".4"/>' +
        FACE +
        '<path d="M15 22.6 Q17.8 21.2 20 22.8 Q22.2 21.2 25 22.6 Q23.8 21.4 25.6 21 Q22 24.6 20 23.6 Q18 24.6 14.4 21 Q16.2 21.4 15 22.6Z" fill="' + INK + '"/>' +
        '<path d="M14 14.4 L15 4.4 Q20 2.8 25 4.4 L26 14.4Z" fill="' + INK + '"/>' +
        '<path d="M15.6 6 Q16.4 7 15.4 8 M18 5 Q18.8 6 17.8 7 M24.4 6 Q23.6 7 24.6 8 M22 5 Q21.2 6 22.2 7 M15.2 11 Q16 12 15 13 M24.8 11 Q24 12 25 13" fill="none" stroke="' + CURL + '" stroke-width=".45"/>' +
        circ(20, 9.4, 2.3, GOLD) +
        '<path d="M20 6.6 V12.2 M17.2 9.4 H22.8 M18 7.4 L22 11.4 M22 7.4 L18 11.4" stroke="' + GOLD + '" stroke-width=".5"/>' +
        circ(20, 9.4, 1.1, RUBY);
    }
    var faces = {};
    // Built once per rank: the king alone is ~20 KB of markup and a hand repaints often
    function faceSvg(rank) {
      if (!faces[rank]) {
        faces[rank] = '<svg viewBox="0 0 40 44" xmlns="http://www.w3.org/2000/svg">' + ARCH +
          (rank === 12 ? shah() : rank === 11 ? bibi() : sarbaz()) + '</svg>';
      }
      return faces[rank];
    }

    /* Card backs (#181): two Persian patterns, the player picks one and every card game
       uses it. Each is one framed picture, set once as a CSS background so a deck of
       backs costs one decode, not one SVG per card. */
    var NAVY = '#1F3A93', RED = '#8B1E2B', RED2 = '#6E1622', TURQ = '#3CB4C4', IVORY = '#EFE2C4', GREEN = '#2E5E4E', MAROON = '#5A1A2A';
    var BACKS = ['carpet', 'termeh'];
    function wrap(inner) { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 70">' + inner + '</svg>'; }
    function rosette(x, y, r, petal, heart) {
      var s = '';
      for (var i = 0; i < 4; i++) {
        var a = i * Math.PI / 2, px = f(x + Math.cos(a) * r * .55), py = f(y + Math.sin(a) * r * .55);
        s += '<ellipse cx="' + px + '" cy="' + py + '" rx="' + f(r * .5) + '" ry="' + f(r * .3) + '" transform="rotate(' + (i * 90) + ' ' + px + ' ' + py + ')" fill="' + petal + '"/>';
      }
      return s + circ(x, y, r * .3, heart);
    }
    function lozenge(cx, cy, rx, ry) {
      return 'M' + cx + ' ' + (cy - ry) + ' Q' + f(cx + rx * .58) + ' ' + f(cy - ry * .45) + ' ' + (cx + rx) + ' ' + cy +
        ' Q' + f(cx + rx * .58) + ' ' + f(cy + ry * .45) + ' ' + cx + ' ' + (cy + ry) +
        ' Q' + f(cx - rx * .58) + ' ' + f(cy + ry * .45) + ' ' + (cx - rx) + ' ' + cy +
        ' Q' + f(cx - rx * .58) + ' ' + f(cy - ry * .45) + ' ' + cx + ' ' + (cy - ry) + 'Z';
    }
    // scallops along the medallion's edge, the lobed toranj of Persian carpets
    function lobes(cx, cy, rx, ry, n, r, fill) {
      var s = '';
      for (var i = 0; i < n; i++) {
        var t = i / n * 2 * Math.PI, c = Math.cos(t), sn = Math.sin(t), k = 1 / (Math.abs(c) + Math.abs(sn));
        s += circ(cx + c * rx * k, cy + sn * ry * k, r, fill);
      }
      return s;
    }
    function star8(cx, cy, r, fill) {
      var sq = '<rect x="' + f(cx - r) + '" y="' + f(cy - r) + '" width="' + f(2 * r) + '" height="' + f(2 * r) + '"';
      return '<g fill="' + fill + '">' + sq + '/>' + sq + ' transform="rotate(45 ' + cx + ' ' + cy + ')"/></g>';
    }
    function frameBand(band, motif) {
      var s = '<rect width="50" height="70" rx="4" fill="' + band + '"/>' +
        '<rect x="1.2" y="1.2" width="47.6" height="67.6" rx="3.4" fill="none" stroke="' + GOLD + '" stroke-width=".8"/>';
      for (var x = 5; x <= 45; x += 4) s += motif(x, 3.4) + motif(50 - x, 66.6);
      for (var y = 7.6; y <= 62.4; y += 4.2) s += motif(3.4, y) + motif(46.6, 70 - y);
      return s + '<rect x="5.6" y="5.6" width="38.8" height="58.8" rx="1.4" fill="none" stroke="' + GOLD + '" stroke-width=".6"/>';
    }
    function carpet() {     // lachak-toranj: lobed centre medallion, quarter medallions in the corners
      var s = frameBand(NAVY, function (x, y) { return rosette(x, y, 1.9, IVORY, RED); }) +
        '<rect x="6.2" y="6.2" width="37.6" height="57.6" fill="' + RED + '"/>';
      for (var y = 10, row = 0; y < 62; y += 5, row++) {
        for (var x = 10 + (row % 2) * 3.5; x < 41; x += 7) {
          if (Math.abs((x - 25) / 13) + Math.abs((y - 35) / 19) < 1.05) continue;
          s += rosette(x, y, 1.6, GOLD, NAVY) +
            '<path d="M' + f(x + 1.4) + ' ' + f(y + 1) + ' q1.6 1.2 .6 2.4 M' + f(x - 1.4) + ' ' + f(y - 1) + ' q-1.6 -1.2 -.6 -2.4" fill="none" stroke="' + IVORY + '" stroke-width=".35"/>';
        }
      }
      [['M6.2 6.2 H18 A11.8 11.8 0 0 1 6.2 18Z', 10, 10], ['M43.8 6.2 H32 A11.8 11.8 0 0 0 43.8 18Z', 40, 10],
       ['M6.2 63.8 H18 A11.8 11.8 0 0 0 6.2 52Z', 10, 60], ['M43.8 63.8 H32 A11.8 11.8 0 0 1 43.8 52Z', 40, 60]].forEach(function (c) {
        s += '<path d="' + c[0] + '" fill="' + NAVY + '" stroke="' + GOLD + '" stroke-width=".7"/>' + rosette(c[1], c[2], 2.6, GOLD, RED);
      });
      return wrap(s + '<path d="M25 12.4 L27.4 17 L25 18.6 L22.6 17Z M25 57.6 L27.4 53 L25 51.4 L22.6 53Z" fill="' + GOLD + '"/>' +
        circ(25, 15.6, .7, RED) + circ(25, 54.4, .7, RED) + lobes(25, 35, 12, 16.6, 28, 1.25, GOLD) +
        '<path d="' + lozenge(25, 35, 12, 16.6) + '" fill="' + NAVY + '" stroke="' + GOLD + '" stroke-width=".8"/>' +
        [[25, 22.4], [25, 47.6], [17.4, 35], [32.6, 35]].map(function (p) { return rosette(p[0], p[1], 1.9, IVORY, RED); }).join('') +
        '<path d="' + lozenge(25, 35, 7.2, 10) + '" fill="' + RED2 + '" stroke="' + GOLD + '" stroke-width=".6"/>' +
        lobes(25, 35, 7.2, 10, 20, .45, IVORY) + star8(25, 35, 3.6, GOLD) + star8(25, 35, 2.2, NAVY) + rosette(25, 35, 2.4, TURQ, GOLD));
    }
    function termeh() {     // rows of three-layer boteh on maroon, alternate rows turned
      function rich(x, y, k, rot, outer, inner) {
        return '<g transform="translate(' + f(x) + ' ' + f(y) + ') rotate(' + rot + ') scale(' + k + ')">' +
          '<path d="' + BOTEH + '" fill="' + outer + '"/>' +
          '<path transform="translate(.05 .5) scale(.62)" d="' + BOTEH + '" fill="' + MAROON + '"/>' +
          '<path transform="translate(.1 .8) scale(.38)" d="' + BOTEH + '" fill="' + inner + '"/>' +
          '<circle cx="0" cy="2.2" r=".28" fill="' + outer + '"/></g>';
      }
      var s = frameBand(GREEN, function (x, y) { return circ(x, y, .9, GOLD) + circ(x, y, .4, MAROON); }) +
        '<rect x="6.2" y="6.2" width="37.6" height="57.6" fill="' + MAROON + '"/>';
      var zz = 'M7.4 8';
      for (var x = 7.4; x < 42.6; x += 1.6) zz += ' L' + f(x + .8) + ' ' + (Math.round((x - 7.4) / 1.6) % 2 ? 8 : 9.2);
      s += '<path d="' + zz + '" fill="none" stroke="' + GOLD + '" stroke-width=".4"/><path d="' + zz + '" transform="rotate(180 25 35)" fill="none" stroke="' + GOLD + '" stroke-width=".4"/>';
      for (var y = 13, row = 0; y < 60; y += 6.2, row++) {
        for (x = 11 + (row % 2) * 3.4; x < 41; x += 6.8) {
          if (Math.pow((x - 25) / 10.4, 2) + Math.pow((y - 35) / 13.4, 2) < 1) continue;
          s += rich(x, y, .78, (row % 2 ? 180 : 0) + (x < 25 ? -12 : 12), row % 2 ? CREAM : GOLD, row % 2 ? GOLD : CREAM) + circ(x + 3.4, y + 3.1, .35, GOLD);
        }
      }
      return wrap(s + '<ellipse cx="25" cy="35" rx="9" ry="12" fill="' + GREEN + '" stroke="' + GOLD + '" stroke-width="1"/>' +
        '<ellipse cx="25" cy="35" rx="7.6" ry="10.6" fill="' + MAROON + '" stroke="' + GOLD + '" stroke-width=".5" stroke-dasharray=".1 1.1" stroke-linecap="round"/>' +
        rich(23.6, 31.4, 1.7, -20, GOLD, CREAM) + rich(26.4, 38.6, 1.7, 160, GOLD, CREAM) + circ(25, 35, .7, CREAM));
    }
    function backSvg(name) { return name === 'termeh' ? termeh() : carpet(); }
    function backName(v) { return BACKS.indexOf(v) >= 0 ? v : BACKS[0]; }
    // One <style> for every back on the page; the root's data-pback picks which applies,
    // so switching repaints every back at once without the game re-rendering
    function applyBack() {
      if (typeof document === 'undefined') return;
      if (!document.getElementById('ch-pbacks')) {
        var css = BACKS.map(function (n, i) {
          return (i ? '[data-pback="' + n + '"] ' : '') + '.ch-pback{background-image:url("data:image/svg+xml,' + encodeURIComponent(backSvg(n)) + '")}';
        }).join('\n');
        document.head.appendChild(el('style', { id: 'ch-pbacks', text: css }));
      }
      document.documentElement.setAttribute('data-pback', backName(state.settings.cardBack));
    }
    function setBack(v) {
      if (BACKS.indexOf(v) < 0) return false;
      state.settings.cardBack = v;
      saveSettings();
      applyBack();
      return true;
    }
    function back(extra) { applyBack(); return el('div', { class: 'ch-pback' + (extra ? ' ' + extra : ''), 'aria-hidden': 'true' }); }
    // A small button showing the current back; a tap moves to the next one (#181)
    function backPicker() {
      var mini = el('div', { class: 'ch-pback' });
      var btn = el('button', { class: 'ch-iconbtn ch-pbackbtn', type: 'button' }, [mini]);
      var sync = function () {
        var n = backName(state.settings.cardBack);
        var label = Chogan.t('cardBack') + ': ' + Chogan.t(n === 'termeh' ? 'backTermeh' : 'backCarpet');
        btn.setAttribute('aria-label', label);
        btn.title = label;
      };
      btn.addEventListener('click', function () {
        var n = backName(state.settings.cardBack);
        setBack(BACKS[(BACKS.indexOf(n) + 1) % BACKS.length]);
        Chogan.feedback('tap');
        sync();
      });
      applyBack();
      sync();
      return btn;
    }

    function rank(c) { return c >> 2; }
    function suit(c) { return c & 3; }
    function isRed(c) { return suit(c) === 1 || suit(c) === 2; }
    function label(c) { return RANKS[rank(c)] + GLYPH[suit(c)]; }
    // A card face as a button; extra classes carry the game's own states
    function cardEl(c, extra) {
      var r = rank(c), kids = [el('span', { class: 'ch-pcard__r', text: RANKS[r] })];
      if (r >= 10) {
        kids.push(el('span', { class: 'ch-pcard__mini', text: GLYPH[suit(c)] }));
        kids.push(el('span', { class: 'ch-pcard__face', html: faceSvg(r) }));
      } else kids.push(el('span', { class: 'ch-pcard__s', text: GLYPH[suit(c)] }));
      return el('button', { class: 'ch-pcard' + (isRed(c) ? ' ch-pcard--red' : '') + (extra ? ' ' + extra : ''),
        type: 'button', 'aria-label': label(c) }, kids);
    }
    return { GLYPH: GLYPH, RANKS: RANKS, BACKS: BACKS, rank: rank, suit: suit, isRed: isRed, label: label, faceSvg: faceSvg,
      backSvg: backSvg, setBack: setBack, applyBack: applyBack, backPicker: backPicker, el: cardEl, back: back };
  })();

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

  // نوار آپدیت. اعلان موقت به درد نمی‌خورد چون تا کاربر تصمیم نگیرد باید بماند.
  ui.updateBar = function (onGo) {
    var existing = document.querySelector('.ch-update');
    if (existing) return existing;
    var bar = el('div', { class: 'ch-update', role: 'status' });
    var go = el('button', { class: 'ch-btn ch-btn--primary ch-btn--sm', type: 'button', text: Chogan.t('updateNow') });
    var x = el('button', { class: 'ch-iconbtn ch-iconbtn--plain', type: 'button', 'aria-label': Chogan.t('close') },
      [Chogan.icon('close', 18)]);
    var close = function () { if (bar.parentNode) bar.parentNode.removeChild(bar); };
    go.addEventListener('click', function () {
      Chogan.feedback('tap');
      go.disabled = true;
      go.textContent = '…';
      if (onGo) onGo();
    });
    x.addEventListener('click', function () { Chogan.feedback('tap'); close(); });
    bar.appendChild(el('div', { class: 'ch-update__t', text: Chogan.t('updateReady') }));
    bar.appendChild(go);
    bar.appendChild(x);
    document.body.appendChild(bar);
    return bar;
  };

  ui.toast = function (o) {
    var host = ui.toastHost();
    // همان پیام دوباره روی هم چیده نمی‌شود: پیام موجود دوباره زمان می‌گیرد. با چند ضربه‌ی
    // پشت سر هم ده اعلان یکسان کل صفحه را می‌پوشاند (#139).
    var key = (o.title || '') + '\u0000' + (o.sub || '');
    for (var i = 0; i < host.children.length; i++) {
      var old = host.children[i];
      if (old._chKey === key && !old.classList.contains('ch-toast--out')) {
        clearTimeout(old._chTimer);
        old._chTimer = setTimeout(old._chHide, o.ms || 3200);
        return old;
      }
    }
    var node = el('div', { class: 'ch-toast' }, [
      el('div', { class: 'ch-toast__icon' }, [Chogan.icon(o.icon || 'star', 26)]),
      el('div', { class: 'ch-grow' }, [
        el('div', { class: 'ch-toast__t', text: o.title }),
        o.sub ? el('div', { class: 'ch-toast__s', text: o.sub }) : null
      ])
    ]);
    node._chKey = key;
    node._chHide = function () {
      node.classList.add('ch-toast--out');
      setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 260);
    };
    host.appendChild(node);
    node._chTimer = setTimeout(node._chHide, o.ms || 3200);
    return node;
  };

  ui.modal = function (o) {
    var scrim = el('div', { class: 'ch-scrim', role: 'dialog', 'aria-modal': 'true' });
    var box = el('div', { class: 'ch-modal' });
    if (o.title || o.closeButton) {
      var head = el('div', { class: 'ch-modal__head' });
      head.appendChild(el('h2', { text: o.title || '' }));
      if (o.closeButton) {
        var xb = el('button', { class: 'ch-iconbtn ch-iconbtn--plain', type: 'button', 'aria-label': Chogan.t('close') },
          [Chogan.icon('close', 20)]);
        xb.addEventListener('click', function () { Chogan.feedback('tap'); close('x'); });
        head.appendChild(xb);
      }
      box.appendChild(head);
    }
    if (o.body) {
      var list = Array.isArray(o.body) ? o.body : [o.body];
      list.forEach(function (b) { box.appendChild(typeof b === 'string' ? el('p', { class: 'ch-dim', text: b }) : b); });
    }
    var closed = false;
    var close = function (via) {
      if (closed) return;
      closed = true;
      // پنجره ۱۱۰ میلی‌ثانیه محو می‌شود و تا وقتی در DOM است کلیک می‌گیرد.
      // بدون این، دو ضربه‌ی پشت سر هم روی «تأیید» دو بار سکه خرج می‌کرد.
      scrim.style.pointerEvents = 'none';
      scrim.style.animation = 'ch-fade var(--t-fast) reverse';
      setTimeout(function () { if (scrim.parentNode) scrim.parentNode.removeChild(scrim); }, 110);
      document.removeEventListener('keydown', onKey);
      // از هر مسیری که بسته شد — دکمه، ضربدر، Escape یا کلیک بیرون — یک بار صدا می‌خورد
      if (o.onClose) o.onClose(via || 'action');
    };
    if (o.actions && o.actions.length) {
      var row = el('div', { class: 'ch-modal__actions' });
      o.actions.forEach(function (a) {
        row.appendChild(el('button', {
          class: 'ch-btn ' + (a.kind === 'primary' ? 'ch-btn--primary' : (a.kind === 'danger' ? 'ch-btn--danger' : '')),
          type: 'button',
          onclick: function () {
            // اکشن‌های keepOpen عمداً چند بار اجرا می‌شوند؛ بقیه فقط یک بار
            if (a.keepOpen !== true && closed) return;
            Chogan.feedback('tap');
            if (a.keepOpen !== true) close('action');
            if (a.onClick) a.onClick();
          }
        }, a.label));
      });
      box.appendChild(row);
    }
    function onKey(e) {
      // ضربدر که باشد، Escape هم باید کار کند حتی وقتی کلیک بیرون بسته است
      if (e.key === 'Escape' && (o.dismissable !== false || o.closeButton)) close('escape');
    }
    document.addEventListener('keydown', onKey);
    if (o.dismissable !== false) {
      scrim.addEventListener('click', function (e) {
        if (e.target === scrim) close('backdrop');
      });
    }
    scrim.appendChild(box);
    document.body.appendChild(scrim);
    // ضربدر اولین دکمه‌ی جعبه است ولی تمرکز باید روی خود کنش‌ها بنشیند
    var focusable = box.querySelector('.ch-modal__actions button') || box.querySelector('button, [tabindex], input');
    if (focusable) setTimeout(function () { focusable.focus(); }, 40);
    return { close: close, box: box };
  };

  ui.confirm = function (o) {
    var done = false;
    return ui.modal({
      title: o.title,
      body: o.body,
      actions: [
        { label: o.cancelLabel || Chogan.t('cancel'), onClick: function () { done = true; if (o.onCancel) o.onCancel(); } },
        { label: o.okLabel || Chogan.t('confirm'), kind: o.danger ? 'danger' : 'primary',
          onClick: function () { done = true; if (o.onOk) o.onOk(); } }
      ],
      // بستن با Escape یا کلیک بیرون هم یعنی انصراف
      onClose: function () { if (!done && o.onCancel) o.onCancel(); }
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
  global.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    Chogan.reloadState();
    if (Chogan.onRestore) Chogan.onRestore();
  });

  /* ==================================================== پوسته‌ی بازی */

  Chogan.game = function (cfg) {
    var store = Chogan.storage(cfg.id);
    if (cfg.strings) Chogan.strings(cfg.strings);

    // عنوان تب هم اسم بازی و اسم اپ را نشان می‌دهد؛ در HTML فارسی نوشته شده
    // و باید با زبان عوض شود. applyLang بعد از هر تغییر زبان صدایش می‌زند.
    Chogan.pageTitle = function () {
      var n = (cfg.name && (cfg.name[state.settings.lang] || cfg.name.en || cfg.name.fa)) || '';
      return n ? (n + ' — ' + Chogan.t('appName')) : Chogan.t('appName');
    };
    Chogan.applyLang();

    // چالش روزانه و بازی عادی دو نشست جدا هستند و نباید روی هم بنویسند.
    // قبلاً هر دو کلید 'session' را می‌گرفتند، پس باز کردن روزانه بازی
    // نیمه‌کاره را پاک می‌کرد و خود روزانه هم هیچ‌وقت ادامه نمی‌شد.
    var slot = (function () {
      try {
        var d = new URLSearchParams(location.search).get('daily');
        return d ? ('session.daily.' + d) : 'session';
      } catch (e) { return 'session'; }
    })();

    var title = el('div', { class: 'ch-gamebar__title ch-grow', text: cfg.name[state.settings.lang] || cfg.name.en || cfg.name.fa });
    // بازگشت در راست‌چین رو به راست است، مثل پیکان‌های منو (#107)
    var backBtn = el('button', { class: 'ch-iconbtn ch-iconbtn--plain', type: 'button', 'aria-label': Chogan.t('back') }, [Chogan.icon(Chogan.isRtl() ? 'forward' : 'back', 22)]);
    backBtn.addEventListener('click', function () { Chogan.feedback('tap'); ctx.save(); Chogan.back(); });

    var bar = el('header', { class: 'ch-gamebar' }, [backBtn, title]);
    // در نوار بازی هم هست چون ناوبری بین منو و بازی تمام‌صفحه را می‌بندد
    var fsBtn = Chogan.fullscreen.button('ch-iconbtn--plain');
    var main = el('main', { class: 'ch-gamemain' + (cfg.scroll ? ' ch-gamemain--scroll' : '') });
    var root = el('div', { class: 'ch-gameroot' }, [bar, main]);

    var stats = {};
    var saveFn = null;
    var lastFinish = null, resultBtn = null, reopenResult = null;

    var ctx = {
      id: cfg.id,
      store: store,
      root: root,
      bar: bar,
      main: main,
      t: Chogan.t,
      num: Chogan.num,

      mount: function () {
        // آخر از همه اضافه می‌شود تا بعد از دکمه‌های خود بازی بنشیند
        if (fsBtn) bar.appendChild(fsBtn);
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
        if (s && s.inProgress !== false) {
          store.set(slot, Object.assign({ inProgress: true, at: Date.now() }, s));
          hideResultBtn(); // دور تازه شروع شده، دکمه‌ی نتیجه‌ی قبلی دیگر معنی ندارد
        } else store.remove(slot);
      },
      loadSave: function () { return store.get(slot, null); },
      clearSave: function () { store.remove(slot); },

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
          continued: !!o.continued,
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

        var cardLines = (o.lines || []).slice();
        if (rec.coins) cardLines.push({ label: Chogan.t('coins'), value: '+' + Chogan.num(rec.coins), gold: true });

        var actions = [];
        if (o.shareText) {
          actions.push({
            label: Chogan.t('share'), keepOpen: true, onClick: function () {
              Chogan.shareCard({
                game: (cfg.name && (cfg.name[state.settings.lang] || cfg.name.en || cfg.name.fa)) || '',
                title: o.title || (o.won ? Chogan.t('won') : Chogan.t('finished')),
                note: o.note || null,
                stars: (o.stars === undefined ? null : o.stars),
                lines: cardLines,
                paint: o.paint || null,
                text: o.shareText
              });
            }
          });
        }
        actions.push({ label: Chogan.t('menu'), onClick: function () { Chogan.back(); } });
        if (o.onAgain) actions.push({ label: Chogan.t('again'), kind: 'primary', onClick: o.onAgain });

        // بستن با ضربدر تخته را همان‌طور که تمام شد نشان می‌دهد؛ دکمه‌ی «نتیجه»
        // در نوار بالا می‌ماند تا هر وقت خواست همین پنجره را برگرداند.
        reopenResult = function () {
          return ui.modal({
            title: o.title || (o.won ? Chogan.t('won') : Chogan.t('finished')),
            body: body,
            actions: actions,
            dismissable: false,
            closeButton: true,
            onClose: function (via) { if (via !== 'action') showResultBtn(); }
          });
        };
        hideResultBtn();
        return reopenResult();
      },

      lastResult: function () { return lastFinish; }
    };

    function showResultBtn() {
      if (!resultBtn) {
        resultBtn = ctx.button({
          icon: 'trophy',
          label: Chogan.t('result'),
          onClick: function () { if (reopenResult) reopenResult(); }
        });
        resultBtn.classList.add('ch-iconbtn--gold');
      }
      resultBtn.hidden = false;
    }
    function hideResultBtn() { if (resultBtn) resultBtn.hidden = true; }

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
  var unlockedOnce = false;
  // بعد از اولین لمس، کالبک تازه باید فوری اجرا شود نه اینکه در آرایه‌ای
  // که دیگر خوانده نمی‌شود گم شود.
  Chogan.afterUnlock = function (fn) {
    if (unlockedOnce) { try { fn(); } catch (e) { /* یکی خراب بود بقیه بمانند */ } return; }
    unlockHooks.push(fn);
  };

  function unlockAudioOnce() {
    unlockedOnce = true;
    audioApi.unlock();
    for (var i = 0; i < unlockHooks.length; i++) { try { unlockHooks[i](); } catch (e) { /* بی‌خیال */ } }
    unlockHooks = [];
    document.removeEventListener('pointerdown', unlockAudioOnce);
    document.removeEventListener('keydown', unlockAudioOnce);
  }

  Chogan.boot = function (o) {
    o = o || {};
    // صفحه‌ی منو. صفحه‌ی بازی خودش در Chogan.game عنوان دقیق‌ترش را می‌گذارد.
    if (!Chogan.pageTitle) Chogan.pageTitle = function () { return Chogan.t('appName'); };
    Chogan.applyLang();
    Chogan.applyTheme();
    Chogan.cards.applyBack();
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
      var sw = global.navigator.serviceWorker;
      // نصب اول کنترل‌کننده ندارد؛ عوض شدنِ کنترل‌کننده‌ی موجود یعنی نسخه‌ی
      // تازه جا افتاده و صفحه باید یک بار از نو بار شود.
      var hadController = !!sw.controller, reloading = false, offered = false;
      var reload = function () {
        if (reloading) return;
        reloading = true;
        location.reload();
      };
      sw.addEventListener('controllerchange', function () {
        if (!hadController) return;
        reload();
      });
      var offer = function (worker) {
        if (offered || !worker) return;
        offered = true;
        ui.updateBar(function () {
          worker.postMessage({ type: 'skipWaiting' });
          // اگر به هر دلیل کنترل‌کننده عوض نشد، دست کاربر خالی نماند
          setTimeout(reload, 2500);
        });
      };
      global.addEventListener('load', function () {
        sw.register('sw.js', { scope: './', updateViaCache: 'none' }).then(function (reg) {
          if (reg.waiting && sw.controller) offer(reg.waiting);
          reg.addEventListener('updatefound', function () {
            var w = reg.installing;
            if (!w) return;
            w.addEventListener('statechange', function () {
              // نصب تمام شده و کنترل‌کننده‌ای هم هست: این یک آپدیت است، نه نصب اول
              if (w.state === 'installed' && sw.controller) offer(w);
            });
          });
          reg.update();
          // یک تب می‌تواند روزها باز بماند. هر بار برگشتن به صفحه دوباره می‌پرسیم،
          // ولی نه بیشتر از هر پنج دقیقه یک بار.
          var last = Date.now();
          document.addEventListener('visibilitychange', function () {
            if (document.hidden || offered || Date.now() - last < 300000) return;
            last = Date.now();
            reg.update();
          });
        }).catch(function () { /* بدون سرویس‌ورکر هم اپ کار می‌کند */ });
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

  // کلید برگرداندن، یک جا برای همه‌ی بازی‌ها: U یا Ctrl+Z (روی مک Cmd+Z).
  // بیشتر بازی‌ها فقط U را می‌شناختند (#111). با چیدمان فارسی e.key می‌شود «ع» یا
  // «ظ»، پس وقتی کلید حرف لاتین نیست جای فیزیکی‌اش (e.code) ملاک است.
  // Ctrl+Shift+Z در بیشتر برنامه‌ها «دوباره انجام بده» است و برنمی‌گرداند.
  Chogan.undoKey = function (e) {
    if (!e || e.altKey) return false;
    var key = e.key || '';
    var k = /^[a-z]$/i.test(key) ? key.toLowerCase()
      : (e.code === 'KeyZ' ? 'z' : (e.code === 'KeyU' ? 'u' : ''));
    if (e.ctrlKey || e.metaKey) return k === 'z' && !e.shiftKey;
    return k === 'u';
  };

  Chogan.version = (global.APP_VERSION || '0.0.0');

  // برای تست‌های خودکار در نود
  if (typeof module !== 'undefined' && module.exports) module.exports = Chogan;
  global.Chogan = Chogan;
})(typeof window !== 'undefined' ? window : globalThis);
