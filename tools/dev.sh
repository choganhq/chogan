#!/usr/bin/env bash
# نسخه‌ی وب را روی این لپ‌تاپ با وضعیت تازه و جدا راه می‌اندازد.
#
# همه‌ی وضعیت اپ در localStorage مرورگر و کش سرویس‌ورکر است. قبلاً هر بار با یک
# پروفایل مانده باز می‌شد، پس پیشرفت اجرای قبلی به اجرای بعدی می‌رسید و یک بررسی
# می‌توانست به خاطر باقی‌مانده‌ها فرق کند، نه به خاطر کد. اینجا هر اجرا پروفایل
# موقت تازه‌ای می‌گیرد که آخرش پاک می‌شود.
#
# داخل www چیزی نوشته نمی‌شود: یک ریشه‌ی موقت با پیوند به فایل‌های www ساخته
# می‌شود و صفحه‌های کمکی کنارش در _dev/ می‌نشینند. ویرایش www با ریفرش دیده می‌شود.
#
# استفاده:
#   tools/dev.sh                          سرور و کروم با پروفایل تازه
#   tools/dev.sh --seed                   همان، با خوشامد ردشده و داده‌ی ساختگی
#   tools/dev.sh --seed --lang en --theme dark
#   tools/dev.sh --no-browser             فقط سرور
#   tools/dev.sh --selftest               بررسی جدا بودن پروفایل‌ها، بدون پنجره
#   PORT پیش‌فرض ۸۰۰۰ است؛ --selftest پیش‌فرض ۸۷۳۹ را می‌گیرد.
#
# فقط شناسه‌ی پردازه‌هایی را می‌کشد که خودش راه انداخته، نه بر اساس نام.
set -uo pipefail
cd "$(dirname "$0")/.."

SEED=0; APP_LANG=fa; THEME=light; BROWSER=1; SELFTEST=0
while [ $# -gt 0 ]; do
  case "$1" in
    --seed) SEED=1 ;;
    --lang) APP_LANG="${2:-}"; shift ;;
    --theme) THEME="${2:-}"; shift ;;
    --no-browser) BROWSER=0 ;;
    --selftest) SELFTEST=1 ;;
    -h|--help) sed -n '2,23p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "dev.sh: گزینه‌ی ناشناخته: $1" >&2; exit 2 ;;
  esac
  shift
done
if [ "$SELFTEST" = 1 ]; then PORT="${PORT:-8739}"; else PORT="${PORT:-8000}"; fi
[[ "$APP_LANG" =~ ^(fa|en)$ ]]         || { echo "dev.sh: --lang باید fa یا en باشد" >&2; exit 2; }
[[ "$THEME" =~ ^(light|dark|auto)$ ]]  || { echo "dev.sh: --theme باید light یا dark یا auto باشد" >&2; exit 2; }
[[ "$PORT" =~ ^[0-9]+$ ]]              || { echo "dev.sh: PORT باید عدد باشد" >&2; exit 2; }

WORK=$(mktemp -d)
ROOT="$WORK/root"
mkdir -p "$ROOT/_dev"
for e in $(ls -A www); do ln -s "$PWD/www/$e" "$ROOT/$e"; done

# هر اجرای مرورگر از همین تابع پروفایل می‌گیرد؛ خودآزمایی هم همین را صدا می‌زند
# تا چیزی که سنجیده می‌شود همان چیزی باشد که واقعاً استفاده می‌شود.
new_profile() { mktemp -d "$WORK/profile.XXXXXX"; }

SRV=""; CHR=""
cleanup() {
  [ -n "$CHR" ] && kill "$CHR" 2>/dev/null
  [ -n "$SRV" ] && kill "$SRV" 2>/dev/null
  wait 2>/dev/null
  rm -rf "$WORK"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

start_server() {
  python3 -m http.server "$PORT" --bind 127.0.0.1 -d "$ROOT" >"$WORK/server.log" 2>&1 &
  SRV=$!
  sleep 1
  kill -0 "$SRV" 2>/dev/null || { echo "dev.sh: سرور روی پورت $PORT بالا نیامد (اشغال است؟)" >&2; cat "$WORK/server.log" >&2; exit 2; }
}

find_chrome() { command -v google-chrome || command -v chromium || command -v chromium-browser || true; }

# داده‌ی ساختگی برای شروع سریع. شناسه‌ی بازی‌ها از games.json خوانده می‌شود تا
# فهرست بازی‌ها جای دیگری تکرار نشود.
cat > "$ROOT/_dev/seed.html" <<'HTML'
<!doctype html><meta charset="utf-8"><title>seed</title>
<script>
var p = new URLSearchParams(location.search);
fetch('/games.json').then(function (r) { return r.json(); }).then(function (d) {
  (d.games || []).forEach(function (g) { localStorage.setItem('chogan.' + g.id + '.tutSeen', 'true'); });
  localStorage.setItem('chogan.app.welcomeSeen', 'true');
  localStorage.setItem('chogan.app.settings', JSON.stringify({
    lang: p.get('lang') || 'fa', theme: p.get('theme') || 'light', sfx: false, music: false, haptics: false
  }));
  localStorage.setItem('chogan.app.coins', '245');
  location.replace('/index.html');
});
</script>
HTML

if [ "$SELFTEST" = 1 ]; then
  # خودآزمایی. کنترل اول لازم است: اگر یک پروفایلِ ثابت هم مقدار را بین دو اجرا نگه
  # ندارد، کاوشگر نمی‌تواند وضعیت را ببیند و «پاک بودن» پروفایل تازه هیچ معنایی ندارد.
  #
  # جدا بودن سرویس‌ورکر عمداً سنجیده نمی‌شود. کروم بدون سر اینجا حتی روی پروفایل
  # ثابتِ کنترل هم نتوانست ماندن ثبت یک سرویس‌ورکر را ببیند (شش آزمایش در دو حالت
  # بدون سر، همه صفر)، پس هر ادعای «سرویس‌ورکری نیست» بی‌معنا سبز می‌شد. آن را
  # ساختار تضمین می‌کند: ثبت‌ها در پوشه‌ی پروفایل ذخیره می‌شوند و هر اجرا پوشه‌ی تازه
  # می‌گیرد که بعد پاک می‌شود.
  CHROME=$(find_chrome)
  [ -n "$CHROME" ] || { echo "dev.sh --selftest: نمی‌شود بررسی کرد: کروم پیدا نشد" >&2; exit 2; }
  cat > "$ROOT/_dev/probe.html" <<'HTML'
<!doctype html><meta charset="utf-8"><title>probe</title><body><pre id="out">running</pre>
<script>
var q = new URLSearchParams(location.search), KEY = 'chogan.dev.selftest';
if (q.get('write')) localStorage.setItem(KEY, q.get('write'));
document.getElementById('out').textContent = 'RESULT ' + JSON.stringify({ marker: localStorage.getItem(KEY) });
</script>
HTML
  start_server
  probe() { # profile, query → marker value, or <none>, or <unreadable>
    local out
    out=$("$CHROME" --headless=new --disable-gpu --no-sandbox --user-data-dir="$1" --virtual-time-budget=8000 \
      --dump-dom "http://127.0.0.1:$PORT/_dev/probe.html?$2" 2>/dev/null | grep -oE 'RESULT \{[^<]*\}' | head -n 1 | sed 's/&quot;/"/g')
    [ -n "$out" ] || { echo "<unreadable>"; return; }
    python3 -c 'import json,sys; v=json.loads(sys.argv[1][7:])["marker"]; print("<none>" if v is None else v)' "$out" 2>/dev/null || echo "<unreadable>"
  }

  CONTROL=$(new_profile)
  c_write=$(probe "$CONTROL" "write=control")
  c_read=$(probe "$CONTROL" "read=1")
  echo "کنترل، یک پروفایل در دو اجرا: نوشت «$c_write»، بعد خواند «$c_read»"
  [ "$c_write" = "control" ] && [ "$c_read" = "control" ] || {
    echo "dev.sh --selftest: نمی‌شود بررسی کرد: پروفایل ثابتِ کنترل مقدار را بین دو اجرا نگه نداشت" >&2; exit 2; }

  first=$(probe "$(new_profile)" "write=leftover")
  second=$(probe "$(new_profile)" "read=1")
  echo "دو اجرای dev.sh، هر کدام پروفایل تازه: اولی نوشت «$first»، دومی خواند «$second»"
  [ "$first" = "leftover" ] || { echo "dev.sh --selftest: نمی‌شود بررسی کرد: اجرای اول نتوانست بنویسد" >&2; exit 2; }
  [ "$second" = "<none>" ] || { echo "dev.sh --selftest: خطا: پروفایل تازه وضعیت اجرای قبل را دید («$second»)" >&2; exit 1; }

  echo "درست: localStorage از یک اجرای dev.sh به اجرای بعد نمی‌رسد."
  echo "سنجیده نشد: جدا بودن سرویس‌ورکر، که کروم بدون سر اینجا نمی‌تواند ببیند؛ با پروفایل تازه‌ی هر اجرا تضمین می‌شود."
  exit 0
fi

start_server
URL="http://127.0.0.1:$PORT/"
[ "$SEED" = 1 ] && URL="http://127.0.0.1:$PORT/_dev/seed.html?lang=$APP_LANG&theme=$THEME"
echo "نسخه‌ی وب: http://127.0.0.1:$PORT/"

if [ "$BROWSER" = 0 ]; then
  echo "فقط سرور. Ctrl+C برای پایان."
  wait "$SRV"
  exit $?
fi

CHROME=$(find_chrome)
[ -n "$CHROME" ] || { echo "dev.sh: کروم پیدا نشد؛ با --no-browser فقط سرور را راه بینداز" >&2; exit 2; }
PROFILE=$(new_profile)
"$CHROME" --user-data-dir="$PROFILE" --no-first-run --no-default-browser-check "$URL" >/dev/null 2>&1 &
CHR=$!
echo "کروم با پروفایل تازه باز شد. با بستن پنجره یا Ctrl+C سرور و پروفایل پاک می‌شوند."
wait "$CHR"
