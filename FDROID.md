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
  - Board Game
  - Puzzle Game
  - Strategy Game
License: MIT
AuthorName: Chogan
AuthorEmail: choganhq@gmail.com
SourceCode: https://github.com/choganhq/chogan
IssueTracker: https://github.com/choganhq/chogan/issues
Changelog: https://github.com/choganhq/chogan/releases

RepoType: git
Repo: https://github.com/choganhq/chogan.git
Binaries:
  https://github.com/choganhq/chogan/releases/download/v%v/io.github.choganhq.chogan-%v.apk

Builds:
  - versionName: 0.2.1
    versionCode: 3
    commit: v0.2.1
    subdir: android/app
    gradle:
      - yes

AllowedAPKSigningKeys: c3f70a1af8a45558678d1d9b413415d1b0a4c3208835ce78c1f37c4a3a008839

AutoUpdateMode: Version v%v
UpdateCheckMode: HTTP
UpdateCheckData:
  https://raw.githubusercontent.com/choganhq/chogan/main/www/version.js|APP_VERSION_CODE\s*=\s*(\d+)|.|APP_VERSION\s*=\s*'([^']+)'
CurrentVersion: 0.2.1
CurrentVersionCode: 3
```

چند نکته که چرایی هر خط را می‌گوید:

- **`UpdateCheckMode: HTTP` است، نه `Tags`.** این مهم‌ترین نکته‌ی این سند است. نسخه‌ی این پروژه در `build.gradle` مقدار ثابت نیست؛ موقع پیکربندی گریدل با رجکس از `www/version.js` خوانده می‌شود. پارسر اف‌دروید در حالت `Tags` دنبال مقدار ثابت می‌گردد و پیدایش نمی‌کند. پس `UpdateCheckData` مستقیم همان فایل را روی `raw.githubusercontent` می‌خواند: آدرس، رجکس `versionCode`، یک نقطه به معنی «همان صفحه را دوباره بخوان»، و رجکس `versionName`. نقطه به‌جای آدرس دوم قرارداد خودشان است و در حدود هشتصد فایل متادیتای واقعی به کار رفته.
- **`AutoUpdateMode: Version v%v`** آن `v%v` را لازم دارد چون تگ‌های ما `v0.2.1` هستند نه `0.2.1`. بدونش تگ را پیدا نمی‌کند.
- **`Binaries` و `AllowedAPKSigningKeys` یعنی بیلد تکرارپذیر.** اف‌دروید بیلد را تکرار می‌کند، با APK امضاشده‌ی خودمان روی Releases مقایسه می‌کند، و اگر یکی بود همان فایل ما را منتشر می‌کند. آن رشته اثر انگشت SHA-256 گواهی امضای ماست. اگر تکرارپذیری جواب ندهد، این دو خط را برمی‌داری و اف‌دروید با کلید خودش امضا می‌کند.
- **`Summary` و `Description` عمداً نیستند.** وقتی متادیتای fastlane داخل خود مخزن باشد، اف‌دروید توضیح و عنوان و تصویرها را از همان‌جا برمی‌دارد. نوشتنشان اینجا یعنی ساختن یک منبع دوم که کهنه می‌شود.
- **دسته‌ی `Games` وجود ندارد.** اف‌دروید تاکسونومی ریزتری دارد؛ صد و سیزده دسته که در `config/categories.yml` همان مخزن `fdroiddata` فهرست شده‌اند. سه دسته‌ی بالا هر چهار بازی را پوشش می‌دهند: پازل برای سودوکو و مین‌روب، استراتژی برای دفاع از برج، و تخته‌ای برای نقطه‌بازی.
- **`subdir: android/app`** چون ماژول اپ آنجاست. ریشه‌ی پروژه‌ی گریدل `android/` است.
- **`gradle: [yes]`** یعنی بدون فلِیوِر.
- **`gradlew` نداریم و لازم هم نیست.** اف‌دروید گریدل خودش را می‌آورد و نسخه‌اش را از `android/gradle/wrapper/gradle-wrapper.properties` تشخیص می‌دهد. همین است که آن فایل با وجود نبود jar در مخزن مانده.

## تله‌ای که وقت گرفت

اسکنر اف‌دروید نسخه‌ی ۰٫۲٫۰ را رد کرد. علتش بلوک «فراداده‌ی وابستگی‌ها» بود: افزونه‌ی گریدل اندروید یک بلوب دودویی مبهم مخصوص گوگل‌پلی داخل بلوک امضای APK تزریق می‌کند و `fdroid check apk` به خاطرش فایل را قبول نمی‌کند. برای بیلد تکرارپذیر هم سم است، چون محتوایش بین محیط‌های بیلد فرق می‌کند.

راه‌حلش در `android/app/build.gradle` است و از ۰٫۲٫۱ به بعد سر جایش هست:

```gradle
dependenciesInfo {
    includeInApk = false
    includeInBundle = false
}
```

اگر روزی اپ دیگری از همین قالب ساختی، این بلوک را از روز اول بگذار.

## مراحل

> مرج‌ریکوئست در ۶ سپتامبر ۲۰۲۶ ثبت شد. مراحل زیر برای دفعه‌ی بعد و برای اپ‌های بعدی می‌ماند.

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

**امضاها فعلاً یکی نیستند، ولی شاید بشوند.** تا وقتی اف‌دروید تکرارپذیری بیلد را تأیید نکرده، فرض این است که با کلید خودش امضا می‌کند و APK اف‌دروید و APK بخش Releases روی هم آپدیت نمی‌شوند. همین جمله در README هم هست.

اگر تکرارپذیری تأیید شود، همان فایل امضاشده‌ی ما منتشر می‌شود و آن جمله در README و `DECISIONS.md` غلط می‌شود — در جهت خوب: کاربر می‌تواند بین دو منبع جابه‌جا شود بدون حذف و بدون از دست دادن پیشرفت. تا آن روز عمداً دست نخورده می‌ماند، چون ادعای محافظه‌کارانه اگر غلط از آب دربیاید ضرری ندارد و ادعای خوش‌بینانه دارد.

**یک مجوز خودتعریف در فهرست دیده می‌شود.** به‌جز `VIBRATE`، بسته یک مجوز به اسم `io.github.choganhq.chogan.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` دارد که اندروایکس خودش می‌سازد. مجوز سیستمی نیست و فقط بین اجزای همین اپ معنا دارد.

</div>
