#!/usr/bin/env bash
# نسخه‌ی منتشرشده را برمی‌گرداند و بررسی می‌کند همان کامیت، همان محیط و همان اجرای
# استقرار را گزارش می‌دهد. قبلاً سبز شدن deploy-pages را کافی می‌دانستیم، در حالی که
# آن فقط یعنی آپلود پذیرفته شد؛ سایتی که هنوز نسخه‌ی قبلی را سرو می‌کرد هم سبز بود.
#
# خروج ۰: مطابق.
# خروج ۱: تا آخرین تلاش مطابق نشد یا اصلاً خوانده نشد.
# خروج ۲: نمی‌شود بررسی کرد، چون ورودی ناقص است یا ابزاری نیست. هیچ‌وقت ۰ نمی‌دهد.
set -uo pipefail

url="${1:-}"; want_commit="${2:-}"; want_env="${3:-}"; want_deploy="${4:-}"
tries="${VERIFY_TRIES:-30}"; interval="${VERIFY_INTERVAL:-10}"

cannot() { echo "verify-deploy: نمی‌شود بررسی کرد: $1" >&2; exit 2; }
command -v curl >/dev/null 2>&1                  || cannot "curl نیست"
[[ "$url" =~ ^https?://[^[:space:]]+$ ]]          || cannot "آدرس version.js نیامده یا نامعتبر است: '$url'"
[[ "$want_commit" =~ ^[0-9a-f]{40}$ ]]            || cannot "کامیت مورد انتظار ۴۰ نویسه‌ی هگز نیست: '$want_commit'"
[[ "$want_env" =~ ^[a-z]+$ ]]                     || cannot "نام محیط مورد انتظار نامعتبر است: '$want_env'"
[[ "$want_deploy" =~ ^[0-9]+-[0-9]+$ ]]           || cannot "شناسه‌ی استقرار مورد انتظار باید <run>-<attempt> باشد: '$want_deploy'"
[[ "$tries" =~ ^[1-9][0-9]*$ ]]                   || cannot "VERIFY_TRIES باید عدد مثبت باشد: '$tries'"
[[ "$interval" =~ ^[0-9]+$ ]]                     || cannot "VERIFY_INTERVAL باید عدد باشد: '$interval'"

body=""
field() { printf '%s\n' "$body" | sed -n "s/^self\.$1 = '\([^']*\)';$/\1/p" | tail -n 1; }

for i in $(seq 1 "$tries"); do
  # پارامتر تصادفی تا کش لبه‌ی پیجز نسخه‌ی قبلی را برنگرداند
  body=$(curl -fsS --max-time 15 "${url}?verify=${RANDOM}${i}" 2>/dev/null) || body=""
  got_commit=$(field APP_COMMIT); got_env=$(field APP_ENV); got_deploy=$(field APP_DEPLOY)
  echo "تلاش $i از $tries: commit=${got_commit:-<نیست>} env=${got_env:-<نیست>} deploy=${got_deploy:-<نیست>}"
  if [ "$got_commit" = "$want_commit" ] && [ "$got_env" = "$want_env" ] && [ "$got_deploy" = "$want_deploy" ]; then
    echo "مطابق: $url کامیت $want_commit، محیط $want_env و استقرار $want_deploy را سرو می‌کند"
    exit 0
  fi
  [ "$i" -lt "$tries" ] && sleep "$interval"
done
echo "verify-deploy: بعد از $tries تلاش مطابق نشد. انتظار: commit=$want_commit env=$want_env deploy=$want_deploy" >&2
exit 1
