# ثبت چوگان در اف‌دروید

<div dir="rtl">

اف‌دروید خودش از سورس بیلد می‌گیرد؛ APK ما را برنمی‌دارد. کاری که باید بکنی این است که یک فایل متادیتا به مخزن `fdroiddata` اضافه کنی و مرج‌ریکوئست بزنی.

## آنچه از قبل آماده است

- مخزن عمومی با مجوز MIT و فایل `LICENSE`
- بدون هیچ وابستگی غیرآزاد. کپسیتور MIT است، کوردوا و اندروایکس آپاچی، و همه از Maven Central و مِیوِن گوگل می‌آیند
- بدون نود در مسیر بیلد؛ فقط گریدل، پس بیلد اف‌دروید ساده است
- هر انتشار تگ دارد و شماره‌ی نسخه‌اش با `www/version.js` می‌خواند، چون ورک‌فلو انتشار جز این را رد می‌کند
- متادیتای fastlane در همین مخزن، دوزبانه، با عنوان و توضیح و چنج‌لاگ و آیکون و هفت تصویر صفحه

## فایل متادیتا

در فورک خودت از `fdroiddata`، شاخه‌ای به اسم `io.github.choganhq.chogan` بساز و این فایل را بگذار در
`metadata/io.github.choganhq.chogan.yml`:

```yaml
Categories:
  - Puzzle Game
  - Strategy Game
  - Board Game
License: MIT
AuthorName: Chogan
AuthorEmail: choganhq@gmail.com
SourceCode: https://github.com/choganhq/chogan
IssueTracker: https://github.com/choganhq/chogan/issues
Changelog: https://github.com/choganhq/chogan/releases

RepoType: git
Repo: https://github.com/choganhq/chogan.git

Builds:
  - versionName: 0.2.0
    versionCode: 2
    commit: v0.2.0
    subdir: android/app
    gradle:
      - yes

AutoUpdateMode: Version
UpdateCheckMode: Tags
CurrentVersion: 0.2.0
CurrentVersionCode: 2
```

چند نکته که چرایی هر خط را می‌گوید:

- **دسته‌ی `Games` وجود ندارد.** اف‌دروید تاکسونومی ریزتری دارد؛ صد و سیزده دسته که در `config/categories.yml` همان مخزن `fdroiddata` فهرست شده‌اند. سه دسته‌ی بالا هر چهار بازی را پوشش می‌دهند: پازل برای سودوکو و مین‌روب، استراتژی برای دفاع از برج، و تخته‌ای برای نقطه‌بازی. چند دسته گذاشتن عادی است؛ حدود دو هزار و پانصد اپ در آن مخزن بیشتر از یک دسته دارند.
- **`Summary` و `Description` عمداً نیستند.** وقتی متادیتای fastlane داخل خود مخزن باشد، اف‌دروید توضیح و عنوان و تصویرها را از همان‌جا برمی‌دارد. نوشتنشان اینجا یعنی ساختن یک منبع دوم که کهنه می‌شود.
- **`subdir: android/app`** چون ماژول اپ آنجاست. ریشه‌ی پروژه‌ی گریدل `android/` است.
- **`gradle: [yes]`** یعنی بدون فلِیوِر.
- **`UpdateCheckMode: Tags` با `AutoUpdateMode: Version`** یعنی هر تگ تازه‌ی `vX.Y.Z` خودکار دیده می‌شود و نسخه‌ی بعدی بدون دست زدن به این فایل منتشر می‌شود.
- **`gradlew` نداریم و لازم هم نیست.** اف‌دروید گریدل خودش را می‌آورد و نسخه‌اش را از `android/gradle/wrapper/gradle-wrapper.properties` تشخیص می‌دهد. همین است که آن فایل با وجود نبود jar در مخزن مانده.

## مراحل

۱. مخزن `fdroiddata` را در گیت‌لب فورک کن، کلون کن، از `master` شاخه بزن.

۲. فایل بالا را اضافه کن.

۳. اگر `fdroidserver` نصب داری، محلی امتحانش کن:

```bash
fdroid lint io.github.choganhq.chogan
fdroid build io.github.choganhq.chogan
```

۴. کامیت با برچسب `New App` و پوش به فورک خودت.

۵. مرج‌ریکوئست بزن. کارکنان اف‌دروید سورس را می‌خوانند. از تأیید تا دیده شدن اپ در مخزن اصلی معمولاً بیست‌وچهار تا چهل‌وهشت ساعت طول می‌کشد.

## دو چیزی که باید بدانی

**امضاها یکی نیستند.** اف‌دروید با کلید خودش امضا می‌کند، پس APK اف‌دروید و APK بخش Releases این مخزن روی هم آپدیت نمی‌شوند. کاربری که بخواهد منبعش را عوض کند باید اول حذف کند و پیشرفتش می‌سوزد. همین جمله در README هم هست.

اگر روزی خواستی هر دو یکی باشند، راهش «بیلد قابل تکرار» است: اف‌دروید بیلد را تکرار می‌کند، با APK خودت بایت‌به‌بایت مقایسه می‌کند و اگر یکی بود همان فایل امضاشده‌ی تو را منتشر می‌کند. آن‌وقت این دو خط به متادیتا اضافه می‌شود:

```yaml
Binaries: https://github.com/choganhq/chogan/releases/download/v%v/io.github.choganhq.chogan-%v.apk
AllowedAPKSigningKeys: c3f70a1af8a45558678d1d9b413415d1b0a4c3208835ce78c1f37c4a3a008839
```

آن رشته، اثر انگشت SHA-256 گواهی امضای ماست. کار بیشتری می‌برد و اول کار لازم نیست.

**یک مجوز خودتعریف در فهرست دیده می‌شود.** به‌جز `VIBRATE`، بسته یک مجوز به اسم `io.github.choganhq.chogan.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` دارد که اندروایکس خودش می‌سازد. مجوز سیستمی نیست و فقط بین اجزای همین اپ معنا دارد.

</div>
