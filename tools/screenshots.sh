#!/usr/bin/env bash
# Takes the F-Droid metadata screenshots with headless Chrome.
# Output goes straight into fastlane/metadata/android/*/images/phoneScreenshots/.
# Usage: tools/screenshots.sh
set -euo pipefail
cd "$(dirname "$0")/.."

CHROME="${CHROME:-$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)}"
if [ -z "$CHROME" ]; then echo "Chrome not found"; exit 1; fi
PORT="${PORT:-8770}"
OUT=$(mktemp -d)

# Temporary page: sets a few storage keys so the screenshots show a used app,
# not an empty one, then goes to the target page.
cat > www/_shot.html <<'HTML'
<!doctype html><meta charset=utf-8><title>shot</title>
<script>
var p = new URLSearchParams(location.search);
['tower-defence','sudoku','minesweeper','dots'].forEach(function(g){
  try { localStorage.setItem('chogan.'+g+'.tutSeen','true'); } catch(e){}
});
// The welcome screen would cover every shot unless asked for explicitly
try { if (!p.get('welcome')) localStorage.setItem('chogan.app.welcomeSeen','true'); } catch(e){}
try {
  localStorage.setItem('chogan.app.settings', JSON.stringify({lang:p.get('lang')||'fa',theme:p.get('theme')||'light',sfx:true,music:true,haptics:true}));
  localStorage.setItem('chogan.app.coins','245');
  localStorage.setItem('chogan.app.league', JSON.stringify({season:'2026-08-29',tier:2,points:412,history:[],lastResult:null}));
  localStorage.setItem('chogan.app.counters', JSON.stringify({coinsEarned:640,dailyDone:12}));
  localStorage.setItem('chogan.app.stats', JSON.stringify({plays:37,timeMs:5400000,byGame:{'tower-defence':{plays:12,wins:6,timeMs:2400000,best:{wave:20}},'sudoku':{plays:14,wins:11,timeMs:2100000,best:{'time-medium':412000}},'minesweeper':{plays:7,wins:5,timeMs:600000,best:{'time-medium':233000}},'dots':{plays:4,wins:3,timeMs:300000,best:{margin:7}}},daily:{},streak:{count:5,best:9,last:new Date().toISOString().slice(0,10)}}));
  localStorage.setItem('chogan.app.achievements', JSON.stringify({'first-play':1,'play-10':1,'sd-win':1,'ms-win':1,'dt-win':1,'td-win':1,'streak-3':1,'coins-100':1,'sampler':1,'daily-1':1,'tier-silver':1}));
} catch(e){}
location.replace(p.get('to'));
</script>
HTML

python3 -m http.server "$PORT" -d www --bind 127.0.0.1 >/dev/null 2>&1 &
SRV=$!
cleanup() { kill $SRV 2>/dev/null || true; rm -f www/_shot.html; }
trap cleanup EXIT
sleep 1

shot() {
  "$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
    --virtual-time-budget=8000 --window-size=440,900 --force-device-scale-factor=2.4 \
    --screenshot="$OUT/$4/$1.png" \
    "http://127.0.0.1:$PORT/_shot.html?theme=$3&lang=$4${5:+&welcome=1}&to=$2" >/dev/null 2>&1
  echo "  $4/$1.png"
}

# Each language gets its own screenshots; a Persian UI inside the English
# metadata only confuses people.
TODAY=$(date +%Y-%m-%d)
for lang in fa en zh; do
  mkdir -p "$OUT/$lang"
  shot 1 "index.html" light "$lang"
  shot 2 "games%2Ftower-defence%2Findex.html" light "$lang"
  shot 3 "games%2Fsudoku%2Findex.html" light "$lang"
  shot 4 "games%2Fminesweeper%2Findex.html%3Fdaily%3D$TODAY" light "$lang"
  shot 5 "games%2Fdots%2Findex.html" light "$lang"
  shot 6 "index.html" dark "$lang"
  shot 7 "index.html" light "$lang" welcome
done

copy_to() {
  dir="fastlane/metadata/android/$1/images/phoneScreenshots"
  mkdir -p "$dir"
  rm -f "$dir"/*.png
  cp "$OUT/$2"/*.png "$dir/"
}
copy_to fa fa
copy_to en-US en
copy_to zh-CN zh
echo "Screenshots taken per language and placed in the metadata"
