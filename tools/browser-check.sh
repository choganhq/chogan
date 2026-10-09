#!/usr/bin/env bash
# Opens the menu and every game in headless Chrome and reports console errors.
# Usage: tools/browser-check.sh [path to Chrome]
#
# Exit 0: every listed page loaded without errors.
# Exit 1: at least one page errored or came back empty, or fewer pages were
#   checked than listed.
# Exit 2: cannot test. A missing Chrome used to "skip" with exit 0, and an
#   unreadable games.json left the page list empty and printed success without
#   checking a single page. Both were green (#53).
set -uo pipefail
cd "$(dirname "$0")/.."

cannot() { echo "browser-check: cannot test: $1" >&2; exit 2; }

CHROME="${1:-$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)}"
[ -n "$CHROME" ] || cannot "Chrome or Chromium not found"
[ -x "$CHROME" ] || command -v "$CHROME" >/dev/null 2>&1 || cannot "Chrome is not executable at this path: $CHROME"

# The page list is built before the server starts, so its failure leaves nothing half-started
if ! PAGES=$(python3 -c "
import json, sys
d = json.load(open('www/games.json'))
games = d.get('games') or []
if not games:
    sys.exit('games.json lists no games')
print('index.html')
for g in games:
    print(g['path'])
" 2>&1); then
  cannot "Could not build the page list from www/games.json: $(printf '%s' "$PAGES" | tail -n 1)"
fi
EXPECTED=$(printf '%s\n' "$PAGES" | grep -c .)
[ "$EXPECTED" -ge 2 ] || cannot "Page list is shorter than the menu plus one game ($EXPECTED) — check games.json"

PORT="${PORT:-8731}"
python3 -m http.server "$PORT" -d www --bind 127.0.0.1 >/dev/null 2>&1 &
SRV=$!
TMP=$(mktemp -d)
trap 'kill $SRV 2>/dev/null; rm -rf "$TMP"' EXIT
sleep 1
kill -0 "$SRV" 2>/dev/null || cannot "Local server did not start on port $PORT"

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
    echo "Error in $p:"
    echo "$BAD" | sed 's/^/    /' | head -8
    FAIL=1
  elif [ "$SIZE" -lt 400 ]; then
    echo "Page $p came back almost empty ($SIZE bytes)"
    FAIL=1
  else
    echo "ok  $p  (${SIZE} bytes rendered)"
  fi
  CHECKED=$((CHECKED + 1))
done

if [ "$CHECKED" -ne "$EXPECTED" ]; then
  echo "browser-check: did not finish: $CHECKED of $EXPECTED pages" >&2
  exit 1
fi
if [ "$FAIL" = 0 ]; then echo "All pages loaded without console errors ($CHECKED of $EXPECTED)"; fi
exit $FAIL
