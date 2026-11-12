#!/usr/bin/env bash
# A game's "updated" date must move with the change (#773).
#
# The menu's "Recently updated" sort reads `updated` in www/games.json, which
# people keep by hand. Wrigglers got a light theme on 2026-11-09 and stayed
# down the list because nobody moved its date.
#
# On a pull request, every game folder www/games/<id>/ that the PR changes
# needs that game's `updated` to differ from the base branch. Skipped, as
# NEW_GAME.md says: a game the PR adds, and a change that touches more than
# GLOBAL_LIMIT game folders (a language or core-wide change).
#
# Exit 0: nothing to check, or every changed game moved its date.
# Exit 1: a changed game kept its date; the ids are listed.
# Exit 2: cannot test (base missing, games.json unreadable).
#
# GATE_REMOTE names the remote (default origin); the tests point it at a scratch
# repository.
set -uo pipefail

if [ "${GITHUB_EVENT_NAME:-}" != "pull_request" ] || [ -z "${GITHUB_BASE_REF:-}" ]; then
  echo "updated-gate: not a pull request (${GITHUB_EVENT_NAME:-local}); nothing to check"
  exit 0
fi

remote="${GATE_REMOTE:-origin}"
limit="${GLOBAL_LIMIT:-3}"
if ! git fetch --quiet --no-tags "$remote" "+refs/heads/${GITHUB_BASE_REF}:refs/gate/base"; then
  echo "updated-gate: cannot fetch ${GITHUB_BASE_REF} from $remote" >&2
  exit 2
fi
base=$(git merge-base refs/gate/base HEAD) || { echo "updated-gate: no merge base with ${GITHUB_BASE_REF}" >&2; exit 2; }

changed=$(git diff --name-only "$base" HEAD -- 'www/games/' | awk -F/ 'NF > 3 { print $3 }' | sort -u)
if [ -z "$changed" ]; then
  echo "updated-gate: no game folder changed"
  exit 0
fi
count=$(wc -l <<<"$changed")
if [ "$count" -gt "$limit" ]; then
  echo "updated-gate: $count game folders changed at once; treated as a global change, dates stay"
  exit 0
fi

dates() {
  # $1: a git revision, or WORKTREE. Prints "id date" per game.
  if [ "$1" = WORKTREE ]; then cat www/games.json; else git show "${1}:www/games.json"; fi |
    node -e '
      let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
        const list = JSON.parse(s).games;
        if (!Array.isArray(list) || !list.length) throw new Error("empty or not a list");
        for (const g of list) console.log(g.id + " " + (g.updated || ""));
      });'
}
head_dates=$(dates WORKTREE) || { echo "updated-gate: cannot read www/games.json of this pull request" >&2; exit 2; }
base_dates=$(dates "$base") || { echo "updated-gate: cannot read www/games.json on the base" >&2; exit 2; }

# A game changed twice in one day already carries the merge day on the base: the second
# pull request cannot move it again (Hillrider's scenes and world, #805 then #806, both
# 2026-11-12). GATE_TODAY lets the tests pin the day.
today="${GATE_TODAY:-$(date -u +%F)}"
stale=""
for id in $changed; do
  b=$(awk -v i="$id" '$1 == i { print $2 }' <<<"$base_dates")
  h=$(awk -v i="$id" '$1 == i { print $2 }' <<<"$head_dates")
  [ -z "$b" ] && continue   # added by this pull request
  if [ "$h" = "$b" ] && [ "$h" != "$today" ]; then stale="$stale $id"; fi
done
if [ -n "$stale" ]; then
  echo "updated-gate: these games changed but their \"updated\" in www/games.json did not move; set it to the merge day (NEW_GAME.md):" >&2
  for id in $stale; do echo "  - $id" >&2; done
  exit 1
fi
echo "updated-gate: every changed game moved its date:"
sed 's/^/  - /' <<<"$changed"
exit 0
