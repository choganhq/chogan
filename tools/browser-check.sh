#!/usr/bin/env bash
# باز کردن منو و همه‌ی بازی‌ها در کروم بدون سر و گزارش خطای کنسول.
# استفاده: tools/browser-check.sh [مسیر کروم]
set -uo pipefail
cd "$(dirname "$0")/.."

CHROME="${1:-$(command -v google-chrome || command -v chromium || command -v chromium-browser)}"
if [ -z "$CHROME" ]; then echo "کروم پیدا نشد، از این تست رد می‌شوم"; exit 0; fi

PORT="${PORT:-8731}"
python3 -m http.server "$PORT" -d www --bind 127.0.0.1 >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
sleep 1

PAGES=$(python3 -c "
import json
d=json.load(open('www/games.json'))
print('index.html')
for g in d['games']: print(g['path'])
")

FAIL=0
TMP=$(mktemp -d)
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
done

if [ "$FAIL" = 0 ]; then echo "همه‌ی صفحه‌ها بدون خطای کنسول بار شدند"; fi
exit $FAIL
