#!/usr/bin/env bash
# Runs the web app on this laptop with fresh, isolated state.
#
# All app state lives in the browser's localStorage and the service worker cache.
# It used to open with a leftover profile, so progress from the last run reached
# the next one and a check could differ because of leftovers rather than code.
# Here every run gets a fresh temporary profile that is deleted at the end (#54).
#
# Nothing is written inside www: a temporary root links to the www files and the
# helper pages sit beside it in _dev/. Edits to www show up on refresh.
#
# Usage:
#   tools/dev.sh                          server and Chrome with a fresh profile
#   tools/dev.sh --seed                   the same, welcome skipped, invented data
#   tools/dev.sh --seed --lang en --theme dark
#   tools/dev.sh --no-browser             server only
#   tools/dev.sh --selftest               checks profile isolation, no window
#   PORT defaults to 8000; --selftest defaults to 8739.
#
# Kills only the process IDs it started itself, never by name.
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
    *) echo "dev.sh: unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done
if [ "$SELFTEST" = 1 ]; then PORT="${PORT:-8739}"; else PORT="${PORT:-8000}"; fi
[[ "$APP_LANG" =~ ^(fa|en)$ ]]         || { echo "dev.sh: --lang must be fa or en" >&2; exit 2; }
[[ "$THEME" =~ ^(light|dark|auto)$ ]]  || { echo "dev.sh: --theme must be light, dark or auto" >&2; exit 2; }
[[ "$PORT" =~ ^[0-9]+$ ]]              || { echo "dev.sh: PORT must be a number" >&2; exit 2; }

WORK=$(mktemp -d)
ROOT="$WORK/root"
mkdir -p "$ROOT/_dev"
for e in $(ls -A www); do ln -s "$PWD/www/$e" "$ROOT/$e"; done

# Every browser launch gets its profile from this function; the self-test calls it
# too, so what is tested is exactly what is used.
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
  kill -0 "$SRV" 2>/dev/null || { echo "dev.sh: server did not start on port $PORT (busy?)" >&2; cat "$WORK/server.log" >&2; exit 2; }
}

find_chrome() { command -v google-chrome || command -v chromium || command -v chromium-browser || true; }

# Invented data for a quick start. Game ids come from games.json so the game list
# is not repeated anywhere else.
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
  # Self-test. The control comes first: if even a fixed profile does not keep a value
  # across two runs, the probe cannot see state and a "clean" fresh profile means nothing.
  #
  # Service worker isolation is deliberately not tested. Headless Chrome here could not
  # see a registration persist even on the fixed control profile (six trials in two
  # headless modes, all zero), so any "no service worker" claim would pass vacuously.
  # The structure guarantees it instead: registrations live in the profile folder,
  # and every run gets a fresh folder that is deleted afterwards.
  CHROME=$(find_chrome)
  [ -n "$CHROME" ] || { echo "dev.sh --selftest: cannot test: Chrome not found" >&2; exit 2; }
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
  echo "Control, one profile across two runs: wrote \"$c_write\", then read \"$c_read\""
  [ "$c_write" = "control" ] && [ "$c_read" = "control" ] || {
    echo "dev.sh --selftest: cannot test: the fixed control profile did not keep the value across two runs" >&2; exit 2; }

  first=$(probe "$(new_profile)" "write=leftover")
  second=$(probe "$(new_profile)" "read=1")
  echo "Two dev.sh runs, each with a fresh profile: the first wrote \"$first\", the second read \"$second\""
  [ "$first" = "leftover" ] || { echo "dev.sh --selftest: cannot test: the first run could not write" >&2; exit 2; }
  [ "$second" = "<none>" ] || { echo "dev.sh --selftest: failure: a fresh profile saw the previous run's state (\"$second\")" >&2; exit 1; }

  echo "OK: localStorage does not carry over from one dev.sh run to the next."
  echo "Not tested: service worker isolation, which headless Chrome here cannot observe; the fresh profile per run guarantees it."
  exit 0
fi

start_server
URL="http://127.0.0.1:$PORT/"
[ "$SEED" = 1 ] && URL="http://127.0.0.1:$PORT/_dev/seed.html?lang=$APP_LANG&theme=$THEME"
echo "Web app: http://127.0.0.1:$PORT/"

if [ "$BROWSER" = 0 ]; then
  echo "Server only. Ctrl+C to stop."
  wait "$SRV"
  exit $?
fi

CHROME=$(find_chrome)
[ -n "$CHROME" ] || { echo "dev.sh: Chrome not found; use --no-browser to run only the server" >&2; exit 2; }
PROFILE=$(new_profile)
"$CHROME" --user-data-dir="$PROFILE" --no-first-run --no-default-browser-check "$URL" >/dev/null 2>&1 &
CHR=$!
echo "Chrome opened with a fresh profile. Closing the window or Ctrl+C removes the server and the profile."
wait "$CHR"
