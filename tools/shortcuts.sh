#!/usr/bin/env bash
# Shortcuts of the installed web app (#112): one shortcut per game from
# www/games.json in www/manifest.webmanifest, and a 192px PNG icon next to its
# icon.svg. Shortcut icons do not accept SVG, so they are rendered from icon.svg
# with headless Chrome. Chrome reads at most ten shortcuts and warns about the
# rest, so only the first ten games in games.json order (the menu order) get one.
# Run after adding or renaming a game; tools/test.js catches any mismatch.
# Usage: tools/shortcuts.sh
set -euo pipefail
cd "$(dirname "$0")/.."

CHROME="${CHROME:-$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)}"
if [ -z "$CHROME" ]; then echo "shortcuts.sh: Chrome not found" >&2; exit 2; fi
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

MAX=10
ids=$(python3 -I -c 'import json; print("\n".join(g["id"] for g in json.load(open("www/games.json"))["games"][:'$MAX']))')
[ -n "$ids" ] || { echo "shortcuts.sh: games.json is empty" >&2; exit 2; }
for f in www/games/*/icon-192.png; do
  [ -e "$f" ] || continue
  printf '%s\n' $ids | grep -qx "$(basename "$(dirname "$f")")" || { rm -f "$f"; echo "removed $f"; }
done

for id in $ids; do
  svg="$PWD/www/games/$id/icon.svg"
  png="www/games/$id/icon-192.png"
  [ -f "$svg" ] || { echo "shortcuts.sh: missing $svg" >&2; exit 1; }
  printf '<!doctype html><style>html,body{margin:0;background:transparent}img{display:block}</style><img src="file://%s" width="192" height="192">' "$svg" > "$TMP/$id.html"
  rm -f "$png"
  "$CHROME" --headless --disable-gpu --hide-scrollbars --no-first-run --user-data-dir="$TMP/profile" \
    --default-background-color=00000000 --window-size=192,192 \
    --screenshot="$PWD/$png" "file://$TMP/$id.html" >/dev/null 2>&1
  [ -s "$png" ] || { echo "shortcuts.sh: $png was not created" >&2; exit 1; }
  echo "$png"
done

python3 -I - <<'PY'
import json
games = json.load(open('www/games.json', encoding='utf-8'))['games'][:10]
path = 'www/manifest.webmanifest'
shortcuts = [{
    'name': g['name']['en'],
    'name_localized': {
        'fa': {'value': g['name']['fa'], 'lang': 'fa', 'dir': 'rtl'},
        'zh-Hans': {'value': g['name']['zh'], 'lang': 'zh-Hans', 'dir': 'ltr'},
        'de': {'value': g['name']['de'], 'lang': 'de', 'dir': 'ltr'},
    },
    'url': g['path'],
    'icons': [{'src': 'games/%s/icon-192.png' % g['id'], 'sizes': '192x192', 'type': 'image/png'}],
} for g in games]
# Only the shortcuts section, the file's last key, is rewritten; the rest of the
# manifest stays untouched. Anything that fits on one line stays on one line, like
# the file's hand-written format, so each diff shows only the changed shortcuts.
def inline(v):
    if isinstance(v, dict):
        return '{ ' + ', '.join(json.dumps(k, ensure_ascii=False) + ': ' + inline(x) for k, x in v.items()) + ' }' if v else '{}'
    if isinstance(v, list):
        return '[' + ', '.join(inline(x) for x in v) + ']'
    return json.dumps(v, ensure_ascii=False)
def fmt(v, ind=0, lead=0):
    one = inline(v)
    if not isinstance(v, (dict, list)) or ind + lead + len(one) <= 100:
        return one
    pad = ' ' * (ind + 2)
    if isinstance(v, list):
        items = [pad + fmt(x, ind + 2) for x in v]
    else:
        items = [pad + json.dumps(k, ensure_ascii=False) + ': ' + fmt(x, ind + 2, len(k) + 4) for k, x in v.items()]
    return ('[' if isinstance(v, list) else '{') + '\n' + ',\n'.join(items) + '\n' + ' ' * ind + (']' if isinstance(v, list) else '}')
text = open(path, encoding='utf-8').read()
cut = text.find('\n  "shortcuts": [')
text = (text[:cut] if cut >= 0 else text.rstrip().rstrip('}').rstrip()).rstrip(',')
text += ',\n  "shortcuts": ' + fmt(shortcuts, 2, len('shortcuts') + 4) + '\n}\n'
man = json.loads(text)
assert list(man)[-1] == 'shortcuts' and man['shortcuts'] == shortcuts, 'shortcuts must be the last key of the manifest'
with open(path, 'w', encoding='utf-8') as f:
    f.write(text)
print('%s: %d shortcuts' % (path, len(games)))
PY
