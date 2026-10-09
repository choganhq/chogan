#!/usr/bin/env bash
# Decides whether a push to main changes the published web app.
#
# Every deploy renames the service worker cache and makes every user fetch the
# shell again, so a merge that only touched docs or Android must not deploy.
# This logic first lived inside the YAML where no test could reach it, although
# it is exactly the decision that decides whether users get the new version.
#
# Stdout is exactly one line, deploy=true or deploy=false; explanations go to
# stderr. When the comparison is impossible it deploys: an extra deploy is cheaper
# than a missed one. When the deploy commit itself is invalid, exit 2.
set -uo pipefail

event="${GITHUB_EVENT_NAME:-}"
before="${BEFORE:-}"
after="${GITHUB_SHA:-}"
PATHS=(www/ tools/stamp-version.sh tools/verify-deploy.sh tools/web-changed.sh .github/workflows/test.yml)

say() { echo "$1" >&2; }

if ! [[ "$after" =~ ^[0-9a-f]{40}$ ]] || ! git cat-file -e "${after}^{commit}" 2>/dev/null; then
  say "web-changed: invalid deploy commit: '$after'"; exit 2
fi

if [ "$event" = "workflow_dispatch" ]; then
  say "Manual run; deploying"; echo "deploy=true"; exit 0
fi

if ! [[ "$before" =~ ^[0-9a-f]{40}$ ]] || [[ "$before" =~ ^0+$ ]] || ! git cat-file -e "${before}^{commit}" 2>/dev/null; then
  say "Previous commit not available ('$before'); deploying"; echo "deploy=true"; exit 0
fi

# If diff itself fails, an empty output is not taken as "no change"
if ! changed=$(git diff --name-only "$before" "$after" -- "${PATHS[@]}" 2>/dev/null); then
  say "Could not compare $before..$after; deploying"; echo "deploy=true"; exit 0
fi

if [ -z "$changed" ]; then
  say "Web app unchanged; skipping the deploy"; echo "deploy=false"
else
  say "Changed paths that deploy:"; printf '%s\n' "$changed" >&2; echo "deploy=true"
fi
