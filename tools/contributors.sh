#!/usr/bin/env bash
# Prints the GitHub logins of the people whose commits are in a release, other than
# the owner and bots, one per line in the order they first appear (#530). Each one
# is credited on the line of their change in the release's changelog, as
# "thanks to github.com/login" (#533, #644); run this before writing a changelog, and the tests
# check that no one found offline is left out.
#
#   tools/contributors.sh v0.18.0
#
# With `gh` signed in (GH_TOKEN in CI), GitHub's compare API names each commit's
# author, even one who commits from a private email. Without it, or with
# CONTRIBUTORS_OFFLINE=1, it reads git: authors and Co-authored-by trailers with a
# GitHub noreply address (12345+login@users.noreply.github.com).
# Exit 0: printed (maybe nothing). 2: not a release tag.
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="choganhq/chogan"
OWNER_LOGIN="margani"
tag="${1:-}"

# Offline means no network: a clone that has the tag has what it needs. Without this,
# tools/test.js made two remote calls per release and a local run took over ten minutes.
releases() {
  {
    git tag -l 'v*'
    if [ "${CONTRIBUTORS_OFFLINE:-0}" != "1" ] || ! git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
      git ls-remote --tags --refs origin 'v*' 2>/dev/null | sed 's#.*refs/tags/##'
    fi
  } | grep -v -- '-test$' | sort -u -V
}
all=$(releases)
grep -qx -- "$tag" <<<"$all" || { echo "Not a release tag: $tag" >&2; exit 2; }
prev=$(awk -v t="$tag" '$0 == t { print p; exit } { p = $0 }' <<<"$all")

# A GitHub noreply address names its login; anything else is left out offline
login_of_email() { sed -n 's/^\([0-9]*+\)\{0,1\}\([A-Za-z0-9-]*\(\[bot\]\)\{0,1\}\)@users\.noreply\.github\.com$/\2/p'; }

raw() {
  if [ "${CONTRIBUTORS_OFFLINE:-0}" != "1" ] && [ -n "$prev" ] && command -v gh >/dev/null \
     && out=$(gh api "repos/$REPO/compare/$prev...$tag" --jq '.commits[] | (.author.login // ""), (.commit.message | [scan("(?i)co-authored-by:[^<\n]*<([^>\n]+)>")] | .[][0])' 2>/dev/null); then
    printf '%s\n' "$out"
    return
  fi
  local range="$tag"; [ -n "$prev" ] && range="$prev..$tag"
  git log --format='%ae%n%(trailers:key=Co-authored-by,valueonly)' "$range" | sed -n 's/.*<\(.*\)>.*/\1/p; /^[^<]*@[^<]*$/p'
}

raw | while IFS= read -r v; do
  [ -n "$v" ] || continue
  case "$v" in *@*) v=$(printf '%s\n' "$v" | login_of_email) ;; esac
  [ -n "$v" ] || continue
  case "$v" in "$OWNER_LOGIN"|*'[bot]') continue ;; esac
  printf '%s\n' "$v"
done | awk '!seen[tolower($0)]++'
