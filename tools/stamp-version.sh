#!/usr/bin/env bash
# Stamps the deploy identity onto the published version.js. Called by the Pages job.
#
# The copy in the repository is never stamped: F-Droid builds from source and
# reads APP_VERSION from main, so these fields exist only in the published file.
#
# Inputs are validated before they are written into JavaScript. Any value used to
# be appended unchecked; a broken commit or an environment name with a quote would
# have shipped broken or injected JavaScript to every user. Nothing is appended
# until every value is valid.
set -euo pipefail

f="${1:?usage: stamp-version.sh <path/to/version.js>}"
[ -f "$f" ] || { echo "stamp-version: no such file: $f" >&2; exit 1; }

sha="${GITHUB_SHA:-}"
run="${GITHUB_RUN_ID:-}"
attempt="${GITHUB_RUN_ATTEMPT:-}"
env="${APP_ENV:-}"

[[ "$sha" =~ ^[0-9a-f]{40}$ ]]  || { echo "stamp-version: GITHUB_SHA must be a 40-character hex commit, got: '$sha'" >&2; exit 1; }
[[ "$run" =~ ^[0-9]+$ ]]        || { echo "stamp-version: GITHUB_RUN_ID must be a number, got: '$run'" >&2; exit 1; }
[[ "$attempt" =~ ^[0-9]+$ ]]    || { echo "stamp-version: GITHUB_RUN_ATTEMPT must be a number, got: '$attempt'" >&2; exit 1; }
[[ "$env" =~ ^[a-z]+$ ]]        || { echo "stamp-version: APP_ENV must be lowercase Latin letters only, got: '$env'" >&2; exit 1; }

{
  printf '\n// Deploy identity, stamped by tools/stamp-version.sh. Present only in the published build.\n'
  # APP_BUILD keeps its 12-character form because the service worker cache name is built from it
  printf "self.APP_BUILD = '%s';\n" "${sha:0:12}"
  printf "self.APP_COMMIT = '%s';\n" "$sha"
  printf "self.APP_ENV = '%s';\n" "$env"
  printf "self.APP_DEPLOY = '%s-%s';\n" "$run" "$attempt"
} >> "$f"
tail -n 6 "$f"
