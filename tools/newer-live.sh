#!/usr/bin/env bash
# Says whether the site already serves a newer commit than the one about to be
# deployed. Two pushes 22 seconds apart: the newer run deployed first, the older
# one deployed over it and a new game vanished from staging with both runs green
# (#1183).
#
# Stdout is exactly one line, superseded=true or superseded=false; explanations go
# to stderr. Only a proven newer commit that is still on the branch skips the
# deploy; whenever that cannot be shown it deploys. A manual run always deploys.
set -uo pipefail

url="${1:-}"
sha="${GITHUB_SHA:-}"
branch="${GITHUB_REF_NAME:-}"
say() { echo "newer-live: $1" >&2; }
no() { say "$1"; echo "superseded=false"; exit 0; }

[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { say "invalid deploy commit: '$sha'"; exit 2; }
[ -n "$url" ] && [ -n "$branch" ] || { say "need the version.js URL and GITHUB_REF_NAME"; exit 2; }
[ "${GITHUB_EVENT_NAME:-}" = "workflow_dispatch" ] && no "manual run; deploying"

# a random parameter so an edge cache cannot answer with the old file
case "$url" in http*) url="${url}?newer=${RANDOM}" ;; esac
body=$(curl -fsS --max-time 15 "$url") || no "cannot read the live version; deploying"
live=$(printf '%s\n' "$body" | sed -n "s/^self\.APP_COMMIT = '\([0-9a-f]\{40\}\)';$/\1/p" | tail -n 1)
[ -n "$live" ] || no "the live version names no commit; deploying"
[ "$live" != "$sha" ] || no "the live commit is this one; deploying"
git merge-base --is-ancestor "$sha" "$live" 2>/dev/null || no "live ${live} is not newer than ${sha}; deploying"
# after a branch is reset, the live commit is no longer on it and must be replaced
git merge-base --is-ancestor "$live" "origin/${branch}" 2>/dev/null || no "live ${live} is not on ${branch}; deploying"
say "the site already serves ${live}, newer than ${sha}; skipping this deploy"
echo "superseded=true"
