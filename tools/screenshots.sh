#!/usr/bin/env bash
# Takes the F-Droid and Google Play metadata screenshots with headless Chrome.
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

# Google Play's feature graphic (1024×500), drawn from the app's own icon and the
# first eight game icons so it never drifts from what the app looks like (#163)
cat > www/_feature.html <<'HTML'
<!doctype html><meta charset=utf-8><title>feature</title>
<link rel="stylesheet" href="lib/chogan.css">
<style>
  html, body { margin: 0; width: 1024px; height: 500px; overflow: hidden; }
  body { background: linear-gradient(135deg, #FBF6EF 0%, #F6E3D6 100%); font-family: Vazirmatn, system-ui, sans-serif;
    display: flex; align-items: center; gap: 48px; padding: 0 64px; box-sizing: border-box; }
  .logo { width: 168px; height: 168px; border-radius: 40px; box-shadow: 0 12px 32px rgba(120, 70, 40, .18); }
  h1 { margin: 0; font-size: 72px; line-height: 1; color: #2B2622; letter-spacing: -1px; }
  h1 span { font-size: 56px; margin-inline-start: 18px; color: #E07A5F; }
  p { margin: 14px 0 26px; font-size: 26px; color: #5C524A; }
  .games { display: grid; grid-template-columns: repeat(8, 56px); gap: 12px; }
  .games img { width: 56px; height: 56px; border-radius: 14px; background: #fff; box-shadow: 0 4px 12px rgba(120, 70, 40, .12); }
</style>
<img class="logo" src="icon-512.png" alt="">
<div>
  <h1>Chogan<span>چوگان</span></h1>
  <p>Short, finishable games. Free, offline, no ads.</p>
  <div class="games" id="g"></div>
</div>
<script>
fetch('games.json').then(function (r) { return r.json(); }).then(function (d) {
  d.games.slice(0, 8).forEach(function (g) { var i = new Image(); i.src = g.icon; document.getElementById('g').appendChild(i); });
});
</script>
HTML

python3 -m http.server "$PORT" -d www --bind 127.0.0.1 >/dev/null 2>&1 &
SRV=$!
cleanup() { kill $SRV 2>/dev/null || true; rm -f www/_shot.html www/_feature.html; }
trap cleanup EXIT
sleep 1

shot() {
  "$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
    --virtual-time-budget=8000 --window-size=450,900 --force-device-scale-factor=2.4 \
    --screenshot="$OUT/$4/$1.png" \
    "http://127.0.0.1:$PORT/_shot.html?theme=$3&lang=$4${5:+&welcome=1}&to=$2" >/dev/null 2>&1
  echo "  $4/$1.png"
}

# Each language gets its own screenshots; a Persian UI inside the English
# metadata only confuses people. 450×900 at 2.4 gives 1080×2160, exactly the
# 2:1 Google Play allows; 440 wide gave 1056×2160, which Play rejects (#163).
TODAY=$(date +%Y-%m-%d)
for lang in fa en zh de; do
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
copy_to de-DE de
mkdir -p fastlane/metadata/android/en-US/images
"$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars --virtual-time-budget=5000 \
  --window-size=1024,500 --screenshot="fastlane/metadata/android/en-US/images/featureGraphic.png" \
  "http://127.0.0.1:$PORT/_feature.html" >/dev/null 2>&1
echo "  en-US/images/featureGraphic.png"
echo "Screenshots taken per language and placed in the metadata"
