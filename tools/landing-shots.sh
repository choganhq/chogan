#!/usr/bin/env bash
# Rebuilds the dark-theme screenshot sets of the playchogan.com landing page (#1047):
# the same six pages as tools/screenshots.sh, in Persian and English, shot in the dark theme,
# as WebP at 400 and 800 px wide with a content hash in the name (they are cached for a year).
# Writes worker/landing/public/shots/{fa,en}-dark-*.webp and the dark entries of
# worker/landing/shots-data.js. Own server on port 8771; stops only its own PIDs.
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME="${CHROME:-$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)}"
[ -n "$CHROME" ] || { echo "Chrome not found" >&2; exit 2; }
command -v ffmpeg >/dev/null || { echo "ffmpeg not found" >&2; exit 2; }
PORT="${PORT:-8771}"
if ss -ltn | grep -q ":$PORT "; then echo "port $PORT is busy" >&2; exit 2; fi
OUT=$(mktemp -d)
SHOTS=worker/landing/public/shots
cat > www/_shot.html <<'HTML'
<!doctype html><meta charset=utf-8><title>shot</title>
<script>
var p = new URLSearchParams(location.search);
['hokm','eightball','airhockey','chess','sudoku'].forEach(function(g){ try { localStorage.setItem('chogan.'+g+'.tutSeen','true'); } catch(e){} });
try { localStorage.setItem('chogan.app.welcomeSeen','true'); localStorage.setItem('chogan.app.installNo','true'); } catch(e){}
try {
  localStorage.setItem('chogan.app.settings', JSON.stringify({lang:p.get('lang')||'fa',theme:'dark',sfx:true,music:true,haptics:true}));
  localStorage.setItem('chogan.app.coins','245');
} catch(e){}
location.replace(p.get('to'));
</script>
HTML
python3 -m http.server "$PORT" -d www --bind 127.0.0.1 >/dev/null 2>&1 &
SRV=$!
cleanup() { kill $SRV 2>/dev/null || true; rm -f www/_shot.html; rm -rf "$OUT"; }
trap cleanup EXIT
sleep 1
kill -0 $SRV || { echo "server did not start" >&2; exit 2; }
TODAY=$(date +%Y-%m-%d)
PAGES=("index.html" "games%2Fhokm%2Findex.html" "games%2Feightball%2Findex.html" "games%2Fairhockey%2Findex.html" "games%2Fchess%2Findex.html" "games%2Fsudoku%2Findex.html%3Fdaily%3D$TODAY")
rm -f "$SHOTS"/*-dark-*.webp
for lang in fa en; do
  for i in 1 2 3 4 5 6; do
    "$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars --virtual-time-budget=8000 \
      --window-size=450,900 --force-device-scale-factor=2.4 --screenshot="$OUT/$lang-$i.png" \
      "http://127.0.0.1:$PORT/_shot.html?lang=$lang&to=${PAGES[$((i-1))]}" >/dev/null 2>&1
    [ -s "$OUT/$lang-$i.png" ] || { echo "no screenshot for $lang $i" >&2; exit 1; }
    for w in 400 800; do
      ffmpeg -loglevel error -y -i "$OUT/$lang-$i.png" -vf "scale=$w:-1" -c:v libwebp -quality 80 "$OUT/$lang-dark-$i-$w.webp"
      h=$(sha256sum "$OUT/$lang-dark-$i-$w.webp" | cut -c1-8)
      cp "$OUT/$lang-dark-$i-$w.webp" "$SHOTS/$lang-dark-$i-$w.$h.webp"
    done
  done
done
node - <<'NODE'
const fs = require('fs'), f = 'worker/landing/shots-data.js';
const src = fs.readFileSync(f, 'utf8');
const data = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1));
for (const k of Object.keys(data)) if (k.endsWith('-dark')) delete data[k];
const files = fs.readdirSync('worker/landing/public/shots');
for (const l of ['fa', 'en']) {
  data[l + '-dark'] = [1, 2, 3, 4, 5, 6].map((i) => ({
    400: '/shots/' + files.find((x) => x.startsWith(l + '-dark-' + i + '-400.')),
    800: '/shots/' + files.find((x) => x.startsWith(l + '-dark-' + i + '-800.')),
  }));
}
fs.writeFileSync(f, src.slice(0, src.indexOf('export default')) + 'export default ' + JSON.stringify(data, null, 1) + ';\n');
NODE
echo "dark sets written: $(ls $SHOTS | grep -c -- '-dark-') files"
