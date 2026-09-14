#!/usr/bin/env bash
# هویت استقرار را روی version.js منتشرشده مهر می‌زند. ورک‌فلو پیجز صدایش می‌زند.
#
# نسخه‌ی داخل ریپو هیچ‌وقت مهر نمی‌خورد: اف‌دروید از سورس می‌سازد و APP_VERSION را
# از main می‌خواند، پس این فیلدها فقط در فایل منتشرشده وجود دارند.
#
# ورودی‌ها پیش از نوشته شدن در جاوااسکریپت سنجیده می‌شوند. قبلاً هر مقداری بی‌پرسش
# اضافه می‌شد؛ یک کامیت خراب یا نام محیطی با کوتیشن، جاوااسکریپت شکسته یا تزریق‌شده
# را به دست همه‌ی کاربرها می‌رساند. تا همه‌ی مقدارها درست نباشند چیزی اضافه نمی‌شود.
set -euo pipefail

f="${1:?استفاده: stamp-version.sh <path/to/version.js>}"
[ -f "$f" ] || { echo "stamp-version: فایل نیست: $f" >&2; exit 1; }

sha="${GITHUB_SHA:-}"
run="${GITHUB_RUN_ID:-}"
attempt="${GITHUB_RUN_ATTEMPT:-}"
env="${APP_ENV:-}"

[[ "$sha" =~ ^[0-9a-f]{40}$ ]]  || { echo "stamp-version: GITHUB_SHA باید کامیت ۴۰ نویسه‌ای هگز باشد، آمد: '$sha'" >&2; exit 1; }
[[ "$run" =~ ^[0-9]+$ ]]        || { echo "stamp-version: GITHUB_RUN_ID باید عدد باشد، آمد: '$run'" >&2; exit 1; }
[[ "$attempt" =~ ^[0-9]+$ ]]    || { echo "stamp-version: GITHUB_RUN_ATTEMPT باید عدد باشد، آمد: '$attempt'" >&2; exit 1; }
[[ "$env" =~ ^[a-z]+$ ]]        || { echo "stamp-version: APP_ENV باید فقط حروف کوچک لاتین باشد، آمد: '$env'" >&2; exit 1; }

{
  printf '\n// هویت استقرار، مهرشده با tools/stamp-version.sh. فقط در نسخه‌ی منتشرشده هست.\n'
  # APP_BUILD شکل دوازده‌نویسه‌ای‌اش را نگه می‌دارد چون اسم کش سرویس‌ورکر از آن ساخته می‌شود
  printf "self.APP_BUILD = '%s';\n" "${sha:0:12}"
  printf "self.APP_COMMIT = '%s';\n" "$sha"
  printf "self.APP_ENV = '%s';\n" "$env"
  printf "self.APP_DEPLOY = '%s-%s';\n" "$run" "$attempt"
} >> "$f"
tail -n 6 "$f"
