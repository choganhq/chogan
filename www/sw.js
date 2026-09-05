/* سرویس‌ورکر چوگان — کش-اول، اسم کش گره‌خورده به نسخه.
   importScripts باعث می‌شود مرورگر با تغییر version.js سرویس‌ورکر را دوباره نصب کند. */
importScripts('./version.js');

const CACHE = 'chogan-v' + self.APP_VERSION;

// پوسته‌ی اپ. فهرست بازی‌ها از games.json موقع نصب خوانده می‌شود
// تا اضافه کردن بازی جدید هیچ دستکاری‌ای در این فایل نخواهد.
const SHELL = [
  './',
  './index.html',
  './version.js',
  './games.json',
  './manifest.webmanifest',
  './favicon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './lib/chogan.css',
  './lib/chogan.js',
  './fonts/vazirmatn-variable.woff2'
];

async function buildList() {
  const list = SHELL.slice();
  try {
    const res = await fetch('./games.json', { cache: 'no-store' });
    const data = await res.json();
    (data.games || []).forEach(function (g) {
      if (g.path) list.push('./' + g.path);
      if (g.icon) list.push('./' + g.icon);
      (g.files || []).forEach(function (f) { list.push('./' + f); });
    });
  } catch (e) {
    // اگر فهرست بازی‌ها نیامد، نصب شکست می‌خورد و مرورگر بعداً دوباره تلاش می‌کند.
    throw e;
  }
  return list;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    buildList()
      .then((list) => caches.open(CACHE).then((c) => c.addAll(list)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  // ignoreSearch لازم است: منو بازی‌ها را با ?daily=YYYY-MM-DD صدا می‌زند و
  // بدون این گزینه، درخواستِ چالش روزانه هیچ‌وقت با نسخه‌ی کش‌شده جور نمی‌شد
  // و آفلاین کاربر را به منو برمی‌گرداند.
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(function () {
        // آفلاین و بیرون از کش: برای ناوبری، منو را بده
        if (req.mode === 'navigate') return caches.match('./index.html');
        throw new Error('offline');
      });
    })
  );
});
