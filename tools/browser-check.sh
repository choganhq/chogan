#!/usr/bin/env bash
# باز کردن منو و همه‌ی بازی‌ها در کروم بدون سر و گزارش خطای کنسول.
# استفاده: tools/browser-check.sh [مسیر کروم]
#
# خروج ۰: همه‌ی صفحه‌های فهرست بدون خطا بار شدند.
# خروج ۱: دست‌کم یک صفحه خطا داد یا خالی برگشت، یا کمتر از فهرست بررسی شد.
# خروج ۲: نمی‌شود بررسی کرد. قبلاً نبودن کروم با خروج ۰ «رد» می‌شد، و اگر
#   games.json خوانده نمی‌شد فهرست صفحه‌ها خالی می‌ماند و بدون بررسی حتی یک
#   صفحه پیام موفقیت چاپ می‌شد. هر دو سبز بودند.
set -uo pipefail
cd "$(dirname "$0")/.."

cannot() { echo "browser-check: نمی‌شود بررسی کرد: $1" >&2; exit 2; }

CHROME="${1:-$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)}"
[ -n "$CHROME" ] || cannot "کروم یا کرومیوم پیدا نشد"
[ -x "$CHROME" ] || command -v "$CHROME" >/dev/null 2>&1 || cannot "کروم در این مسیر اجراشدنی نیست: $CHROME"

# فهرست صفحه‌ها پیش از راه انداختن سرور ساخته می‌شود تا خطایش چیزی را نیمه‌کاره نگذارد
if ! PAGES=$(python3 -c "
import json, sys
d = json.load(open('www/games.json'))
games = d.get('games') or []
if not games:
    sys.exit('games.json هیچ بازی‌ای ندارد')
print('index.html')
for g in games:
    print(g['path'])
" 2>&1); then
  cannot "فهرست صفحه‌ها از www/games.json ساخته نشد: $(printf '%s' "$PAGES" | tail -n 1)"
fi
EXPECTED=$(printf '%s\n' "$PAGES" | grep -c .)
[ "$EXPECTED" -ge 2 ] || cannot "فهرست صفحه‌ها از منو و یک بازی کمتر است ($EXPECTED) — games.json را ببین"

PORT="${PORT:-8731}"
python3 -m http.server "$PORT" -d www --bind 127.0.0.1 >/dev/null 2>&1 &
SRV=$!
TMP=$(mktemp -d)
trap 'kill $SRV 2>/dev/null; rm -rf "$TMP"' EXIT
sleep 1
kill -0 "$SRV" 2>/dev/null || cannot "سرور محلی روی پورت $PORT بالا نیامد"

FAIL=0
CHECKED=0
for p in $PAGES; do
  ERR="$TMP/$(echo "$p" | tr '/' '_').log"
  "$CHROME" --headless --disable-gpu --no-sandbox --enable-logging=stderr --log-level=0 \
    --virtual-time-budget=6000 --window-size=420,900 \
    --dump-dom "http://127.0.0.1:$PORT/$p" >"$TMP/dom.html" 2>"$ERR"
  BAD=$(grep -E "CONSOLE" "$ERR" | grep -viE "MARK-|Download the React|favicon" | grep -iE "uncaught|error|failed|refused|denied" || true)
  SIZE=$(wc -c < "$TMP/dom.html")
  if [ -n "$BAD" ]; then
    echo "خطا در $p:"
    echo "$BAD" | sed 's/^/    /' | head -8
    FAIL=1
  elif [ "$SIZE" -lt 400 ]; then
    echo "صفحه‌ی $p تقریباً خالی برگشت ($SIZE بایت)"
    FAIL=1
  else
    echo "اوکی  $p  (${SIZE} بایت رندر شد)"
  fi
  CHECKED=$((CHECKED + 1))
done

if [ "$CHECKED" -ne "$EXPECTED" ]; then
  echo "browser-check: بررسی تمام نشد: $CHECKED از $EXPECTED صفحه" >&2
  exit 1
fi
if [ "$FAIL" = 0 ]; then echo "همه‌ی صفحه‌ها بدون خطای کنسول بار شدند ($CHECKED از $EXPECTED)"; fi
exit $FAIL
