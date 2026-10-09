#!/usr/bin/env bash
# Reads the published version back and checks it reports this commit, this
# environment and this deploy run. A green deploy-pages used to be taken as enough,
# but it only means the upload was accepted; a site still serving the old version
# was green too (#52).
#
# Exit 0: matches.
# Exit 1: still no match after the last try, or it could not be read at all.
# Exit 2: cannot test, because input is missing or a tool is absent. Never 0.
set -uo pipefail

url="${1:-}"; want_commit="${2:-}"; want_env="${3:-}"; want_deploy="${4:-}"
tries="${VERIFY_TRIES:-30}"; interval="${VERIFY_INTERVAL:-10}"

cannot() { echo "verify-deploy: cannot test: $1" >&2; exit 2; }
command -v curl >/dev/null 2>&1                  || cannot "curl is missing"
[[ "$url" =~ ^https?://[^[:space:]]+$ ]]          || cannot "version.js URL missing or invalid: '$url'"
[[ "$want_commit" =~ ^[0-9a-f]{40}$ ]]            || cannot "expected commit is not 40 hex characters: '$want_commit'"
[[ "$want_env" =~ ^[a-z]+$ ]]                     || cannot "expected environment name is invalid: '$want_env'"
[[ "$want_deploy" =~ ^[0-9]+-[0-9]+$ ]]           || cannot "expected deploy id must be <run>-<attempt>: '$want_deploy'"
[[ "$tries" =~ ^[1-9][0-9]*$ ]]                   || cannot "VERIFY_TRIES must be a positive number: '$tries'"
[[ "$interval" =~ ^[0-9]+$ ]]                     || cannot "VERIFY_INTERVAL must be a number: '$interval'"

body=""
field() { printf '%s\n' "$body" | sed -n "s/^self\.$1 = '\([^']*\)';$/\1/p" | tail -n 1; }

for i in $(seq 1 "$tries"); do
  # A random parameter so the Pages edge cache does not return the old version
  body=$(curl -fsS --max-time 15 "${url}?verify=${RANDOM}${i}" 2>/dev/null) || body=""
  got_commit=$(field APP_COMMIT); got_env=$(field APP_ENV); got_deploy=$(field APP_DEPLOY)
  echo "Try $i of $tries: commit=${got_commit:-<none>} env=${got_env:-<none>} deploy=${got_deploy:-<none>}"
  if [ "$got_commit" = "$want_commit" ] && [ "$got_env" = "$want_env" ] && [ "$got_deploy" = "$want_deploy" ]; then
    echo "Match: $url serves commit $want_commit, environment $want_env and deploy $want_deploy"
    exit 0
  fi
  [ "$i" -lt "$tries" ] && sleep "$interval"
done
echo "verify-deploy: no match after $tries tries. Expected: commit=$want_commit env=$want_env deploy=$want_deploy" >&2
exit 1
