#!/usr/bin/env bash
# Talks to the Google Play Developer API as the service account in
# PLAY_SERVICE_ACCOUNT_JSON (#159). No third-party action ever sees the key: the
# OAuth token comes from a JWT signed here with openssl, and the API is plain curl.
#
# Usage:
#   tools/play-api.sh check
#       Opens an edit, prints the tracks, deletes the edit. Changes nothing.
#   tools/play-api.sh upload <file.aab> <track> <versionCode> [status]
#       Uploads the bundle, sets <track> to that version code with [status]
#       (default draft: Play only accepts drafts until the app is first published),
#       and commits the edit.
#   tools/play-api.sh listing <metadata dir>
#       Sends the store listing from fastlane-style metadata (one folder per Play
#       language: title.txt, short_description.txt, full_description.txt and
#       images/{icon.png,featureGraphic.png,phoneScreenshots/*.png}). Sets the
#       default language to en-US, replaces every image type it has files for,
#       removes listings for languages it has no folder for, and commits.
#
# Env: PLAY_SERVICE_ACCOUNT_JSON (the key file's content), PLAY_PACKAGE
#   (default io.github.choganhq.chogan), PLAY_API (base URL, overridable for tests),
#   PLAY_TOKEN (skip the OAuth exchange; tests only).
# Exit 0: done. Exit 1: the API refused or returned something unexpected.
# Exit 2: cannot run (missing input or tool).
set -euo pipefail

cannot() { echo "play-api: cannot run: $1" >&2; exit 2; }
fail() { echo "play-api: $1" >&2; exit 1; }

PKG="${PLAY_PACKAGE:-io.github.choganhq.chogan}"
API="${PLAY_API:-https://androidpublisher.googleapis.com}"
mode="${1:-}"
case "$mode" in check|upload|listing) ;; *) cannot "mode must be check, upload or listing, got '${mode}'" ;; esac
for t in curl openssl python3; do command -v "$t" >/dev/null 2>&1 || cannot "$t is missing"; done
[[ "$PKG" =~ ^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$ ]] || cannot "invalid package name '$PKG'"

WORK=$(mktemp -d)
# The private key is written to WORK; it must be gone however the script ends
trap 'rm -rf "$WORK"' EXIT

json() { python3 -c "import json,sys; d=json.load(sys.stdin); print(d$1)"; }
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

token() {
  if [ -n "${PLAY_TOKEN:-}" ]; then printf '%s' "$PLAY_TOKEN"; return; fi
  [ -n "${PLAY_SERVICE_ACCOUNT_JSON:-}" ] || cannot "PLAY_SERVICE_ACCOUNT_JSON is not set"
  local email uri now head claims sig resp
  printf '%s' "$PLAY_SERVICE_ACCOUNT_JSON" > "$WORK/sa.json"
  email=$(json "['client_email']" < "$WORK/sa.json") || cannot "service account JSON has no client_email"
  uri=$(json ".get('token_uri','https://oauth2.googleapis.com/token')" < "$WORK/sa.json")
  json "['private_key']" < "$WORK/sa.json" > "$WORK/key.pem" || cannot "service account JSON has no private_key"
  now=$(date +%s)
  head=$(printf '{"alg":"RS256","typ":"JWT"}' | b64url)
  claims=$(printf '{"iss":"%s","scope":"https://www.googleapis.com/auth/androidpublisher","aud":"%s","iat":%d,"exp":%d}' \
    "$email" "$uri" "$now" $((now + 600)) | b64url)
  sig=$(printf '%s.%s' "$head" "$claims" | openssl dgst -sha256 -sign "$WORK/key.pem" | b64url)
  rm -f "$WORK/key.pem"
  resp=$(curl -sS -X POST "$uri" \
    --data-urlencode 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer' \
    --data-urlencode "assertion=$head.$claims.$sig") || fail "token request failed"
  printf '%s' "$resp" | json "['access_token']" 2>/dev/null \
    || fail "no access token: $(printf '%s' "$resp" | head -c 300)"
}

# call METHOD PATH [curl args...] → body on stdout; non-2xx fails with the API's message
call() {
  local method=$1 path=$2; shift 2
  local code
  code=$(curl -sS -o "$WORK/body" -w '%{http_code}' -X "$method" -H "Authorization: Bearer $TOKEN" "$@" "$API$path") \
    || fail "$method $path: request failed"
  case "$code" in 2??) cat "$WORK/body" ;; *) fail "$method $path → HTTP $code: $(head -c 500 "$WORK/body")" ;; esac
}

TOKEN=$(token)
BASE="/androidpublisher/v3/applications/$PKG"
EDIT=$(call POST "$BASE/edits" -H 'Content-Type: application/json' -d '{}' | json "['id']") || fail "no edit id"
echo "Edit $EDIT opened for $PKG"

if [ "$mode" = check ]; then
  call GET "$BASE/edits/$EDIT/tracks" | python3 -c '
import json,sys
d=json.load(sys.stdin)
for t in d.get("tracks",[]):
    rel=["%s:%s" % (r.get("status"), ",".join(r.get("versionCodes",[]))) for r in t.get("releases",[])]
    print("track %-12s %s" % (t["track"], " ".join(rel) or "(no releases)"))'
  call DELETE "$BASE/edits/$EDIT" >/dev/null
  echo "Edit $EDIT deleted; nothing changed"
  exit 0
fi

if [ "$mode" = listing ]; then
  dir="${2:-}"
  [ -d "$dir" ] || { call DELETE "$BASE/edits/$EDIT" >/dev/null; cannot "metadata folder '$dir' missing"; }
  langs=()
  for d in "$dir"/*/; do
    lang=$(basename "$d")
    [[ "$lang" =~ ^[a-z]{2,3}(-[A-Z]{2})?$ ]] || continue
    [ -s "$d/title.txt" ] || continue
    langs+=("$lang")
    # The text goes through python so quotes and newlines are escaped correctly
    python3 - "$d" "$lang" > "$WORK/listing.json" <<'PY'
import json, sys, pathlib
d = pathlib.Path(sys.argv[1]); read = lambda n: (d / n).read_text(encoding='utf-8').strip()
t, s, f = read('title.txt'), read('short_description.txt'), read('full_description.txt')
assert len(t) <= 30 and len(s) <= 80 and len(f) <= 4000, 'text over Play limits'
print(json.dumps({'language': sys.argv[2], 'title': t, 'shortDescription': s, 'fullDescription': f}, ensure_ascii=False))
PY
    call PUT "$BASE/edits/$EDIT/listings/$lang" -H 'Content-Type: application/json; charset=utf-8' --data-binary "@$WORK/listing.json" >/dev/null
    n=0
    for type in icon featureGraphic phoneScreenshots; do
      if [ "$type" = phoneScreenshots ]; then files=("$d"images/phoneScreenshots/*.png); else files=("$d"images/$type.png); fi
      [ -e "${files[0]}" ] || continue
      call DELETE "$BASE/edits/$EDIT/listings/$lang/$type" >/dev/null
      for f in "${files[@]}"; do
        call POST "/upload$BASE/edits/$EDIT/listings/$lang/$type?uploadType=media" -H 'Content-Type: image/png' --data-binary "@$f" >/dev/null
        n=$((n + 1))
      done
    done
    echo "Listing $lang: text and $n images"
  done
  [ "${#langs[@]}" -gt 0 ] || cannot "no language folders with title.txt in '$dir'"
  printf '%s\n' "${langs[@]}" | grep -qx 'en-US' || cannot "an en-US listing is required as the default language"
  call PATCH "$BASE/edits/$EDIT/details" -H 'Content-Type: application/json' \
    -d '{"defaultLanguage":"en-US","contactEmail":"choganhq@gmail.com","contactWebsite":"https://choganhq.github.io/chogan/"}' >/dev/null
  # The app was created with en-GB as its default; a listing nobody maintains would drift
  # Read into a variable first: a failure inside a for-list would be ignored
  olds=$(call GET "$BASE/edits/$EDIT/listings" | python3 -c 'import json,sys; [print(l["language"]) for l in json.load(sys.stdin).get("listings",[])]')
  for old in $olds; do
    printf '%s\n' "${langs[@]}" | grep -qx "$old" && continue
    call DELETE "$BASE/edits/$EDIT/listings/$old" >/dev/null
    echo "Removed listing $old"
  done
  call POST "$BASE/edits/$EDIT:commit" >/dev/null
  echo "Committed listing: ${langs[*]}"
  exit 0
fi

aab="${2:-}"; track="${3:-}"; vc="${4:-}"; status="${5:-draft}"
[ -s "$aab" ] || cannot "bundle '$aab' missing or empty"
[[ "$track" =~ ^[a-z][a-z0-9:_-]*$ ]] || cannot "invalid track '$track'"
[[ "$vc" =~ ^[0-9]+$ ]] || cannot "versionCode must be a number, got '$vc'"
[[ "$status" =~ ^(draft|completed)$ ]] || cannot "status must be draft or completed, got '$status'"

got=$(call POST "/upload$BASE/edits/$EDIT/bundles?uploadType=media" \
  -H 'Content-Type: application/octet-stream' --data-binary "@$aab" | json "['versionCode']")
[ "$got" = "$vc" ] || fail "Play read versionCode $got from the bundle, expected $vc"
echo "Bundle uploaded, versionCode $got"
call PUT "$BASE/edits/$EDIT/tracks/$track" -H 'Content-Type: application/json' \
  -d "{\"track\":\"$track\",\"releases\":[{\"versionCodes\":[\"$vc\"],\"status\":\"$status\"}]}" >/dev/null
call POST "$BASE/edits/$EDIT:commit" >/dev/null
echo "Committed: $track → versionCode $vc ($status)"
