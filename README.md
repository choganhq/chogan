# Chogan — چوگان

## English

Chogan is a small collection of finishable games in a single app. Free, open source, no ads, no in-app purchases, no analytics or trackers, and fully offline.

**[Play on the web](https://choganhq.github.io/chogan/)** · Android builds on the [Releases page](https://github.com/choganhq/chogan/releases)

### The games

| Game | About |
| --- | --- |
| Tower Defence | Four towers, three fixed maps plus a daily map, twenty waves and an endless mode |
| Sudoku | Four difficulties with a guaranteed unique solution, notes, hints and a daily challenge |
| Minesweeper | No-guess generation, four sizes, chording and flags, daily challenge |
| Dots and Boxes | Two players on one phone, or three levels of AI |

Around the games: a daily challenge that is identical on every device with no server at all, a weekly offline league with five tiers, over thirty awards, a shared coin that is only ever spent on hints and cosmetics, stats and a profile, and a bilingual Persian and English interface with light and dark themes.

### Why it needs no permissions

The Android manifest declares `VIBRATE` and nothing else — not even internet access, because nothing in the app ever touches the network. Fonts, sounds and every asset ship inside the package; sound is generated procedurally with WebAudio, so there is not a single audio file in the build. Progress is stored on the device only, and Google auto-backup is turned off.

### Building

The web version needs no build step:

```bash
python3 -m http.server -d www 8000
```

The Android version needs Gradle only — no Node, no npm, no `node_modules`:

```bash
cd android && gradle assembleDebug
```

Capacitor's runtime is pulled from Maven Central as `com.capacitorjs:core`, and a Gradle task named `syncWebAssets` replaces `npx cap sync`.

### Testing

```bash
node tools/test.js
tools/browser-check.sh
```

The tests extract each game engine from the published HTML file itself, between the `ENGINE START` and `ENGINE END` markers, so no second copy of the code exists for testing.

### Adding a game

See [NEW_GAME.md](NEW_GAME.md). In short: one folder under `www/games/`, one entry in `games.json`, bump the version.

### F-Droid and GitHub builds do not cross-update

They are signed with different keys, so switching source means uninstalling first, which wipes local progress. Pick one source and stay on it.

### License

MIT, see [LICENSE](LICENSE). The Vazirmatn font is under the OFL; its licence text ships beside the font in `www/fonts/OFL.txt`.

---

<div dir="rtl">

## فارسی

مجموعه‌بازی چوگان: چند بازی کوچک و تمام‌شدنی در یک اپ. رایگان، متن‌باز، بدون تبلیغ، بدون خرید درون‌برنامه‌ای، بدون تحلیل‌گر و ردیاب، و کاملاً آفلاین.

**[بازی روی وب](https://choganhq.github.io/chogan/)** · نسخه‌ی اندروید از بخش [Releases](https://github.com/choganhq/chogan/releases)

### بازی‌ها

| بازی | توضیح |
| --- | --- |
| دفاع از برج | چهار برج، سه نقشه‌ی ثابت به‌علاوه‌ی نقشه‌ی روزانه، بیست موج و حالت بی‌پایان |
| سودوکو | چهار سختی با جواب یکتای تضمین‌شده، یادداشت، راهنمایی و چالش روزانه |
| مین‌روب | تولید بدون حدس، چهار اندازه، کورد و پرچم، چالش روزانه |
| نقطه‌بازی | دو نفره روی یک گوشی یا مقابل هوش مصنوعی با سه سطح |

بیرون از بازی‌ها: چالش روزانه‌ی مشترک برای همه‌ی دستگاه‌ها بدون هیچ سروری، لیگ هفتگی آفلاین با پنج رده، بیش از سی دستاورد، سکه‌ی مشترک که فقط خرج راهنمایی و تزئینات می‌شود، آمار و پروفایل، و رابط دوزبانه‌ی فارسی و انگلیسی با تم روشن و تاریک.

### چرا هیچ مجوزی نمی‌خواهد

منیفست اندروید فقط `VIBRATE` دارد و بس. حتی مجوز اینترنت هم اعلام نشده، چون هیچ‌جای اپ به شبکه وصل نمی‌شود: فونت، صدا، تصویر و همه‌ی دارایی‌ها داخل بسته‌اند. صداها با WebAudio به‌صورت رویه‌ای ساخته می‌شوند، پس حتی یک فایل صوتی هم در بسته نیست. پیشرفت فقط روی خود دستگاه ذخیره می‌شود و بکاپ خودکار گوگل هم خاموش است.

### ساختار

```
capacitor.config.json      تنها منبع شناسه و نام بسته
www/
  index.html               منوی اصلی با پنج زبانه
  games.json               تنها منبع فهرست بازی‌ها؛ منو و سرویس‌ورکر هر دو از آن می‌خوانند
  version.js               تنها منبع نسخه برای وب و اندروید
  sw.js                    سرویس‌ورکر آفلاین، کش-اول
  lib/chogan.css           سیستم طراحی: توکن‌های رنگ و شعاع و سایه و فاصله
  lib/chogan.js            هسته‌ی مشترک همه‌ی بازی‌ها
  fonts/                   وزیرمتن، داخل بسته
  games/<id>/              هر بازی یک پوشه: index.html و icon.svg
android/                   پروژه‌ی اندروید، فقط یک فایل جاوا
template/game/             اسکلت بازی جدید
tools/                     تست خودکار موتورها و بررسی مرورگر
fastlane/metadata/         متادیتای اف‌دروید، دوزبانه
```

### اجرای محلی

نسخه‌ی وب هیچ بیلدی ندارد:

```bash
python3 -m http.server -d www 8000
```

نسخه‌ی اندروید فقط گریدل لازم دارد. نه نود، نه npm، نه `node_modules`:

```bash
cd android && gradle assembleDebug
```

هسته‌ی کپسیتور به‌صورت `com.capacitorjs:core` از Maven Central می‌آید و تسک گریدل `syncWebAssets` جای `npx cap sync` را گرفته است.

### تست

```bash
node tools/test.js        # موتور هر چهار بازی، از دل همان فایل‌های منتشرشده
tools/browser-check.sh    # منو و همه‌ی بازی‌ها در کروم بدون سر
```

تست‌ها موتور را بین دو نشانه‌ی `ENGINE START` و `ENGINE END` از خود فایل HTML بیرون می‌کشند، پس هیچ‌وقت نسخه‌ی دومی از کد برای تست وجود ندارد. چیزهایی که واقعاً سنجیده می‌شوند: یکتا بودن جواب سودوکو، بدون حدس بودن تخته‌ی مین‌روب، قوی‌تر بودن هوش سخت نقطه‌بازی از متوسط، و بردنی ولی نه آسان بودن دفاع از برج.

### بازی جدید

[NEW_GAME.md](NEW_GAME.md) را ببین. خلاصه‌اش: یک پوشه زیر `www/games/`، یک ورودی در `games.json`، بالا بردن نسخه.

### انتشار

```bash
# نسخه را در www/version.js بالا ببر، چنج‌لاگ را در fastlane بنویس، بعد:
git tag v0.2.0 && git push origin v0.2.0
```

بقیه‌اش خودکار است: APK امضاشده ساخته می‌شود، امضایش تأیید می‌شود و همراه فایل چک‌سام به Releases می‌رود. هر تگی که به `-test` ختم شود بیلد آزمایشی است: از قید هم‌خوانی تگ با نسخه معاف و به‌صورت pre-release منتشر می‌شود.

سکرت‌های امضا در سطح سازمان `choganhq` تعریف شده‌اند: `ANDROID_KEYSTORE_BASE64` و `ANDROID_KEYSTORE_PASSWORD` و `ANDROID_KEY_ALIAS` و `ANDROID_KEY_PASSWORD`.

### هشدار درباره‌ی آپدیت اف‌دروید و گیت‌هاب

APK اف‌دروید و APK بخش Releases این ریپو با کلیدهای متفاوتی امضا می‌شوند، پس روی هم آپدیت نمی‌شوند. برای عوض کردن منبع باید اول اپ را حذف کنی، که یعنی پیشرفت ذخیره‌شده هم پاک می‌شود. یکی از دو منبع را انتخاب کن و همان را نگه دار.

### مجوز

MIT. متن کامل در [LICENSE](LICENSE). فونت وزیرمتن زیر مجوز OFL است، متنش کنار خود فونت در `www/fonts/OFL.txt`.

</div>
