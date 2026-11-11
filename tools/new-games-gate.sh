#!/usr/bin/env bash
# New games reach main only through staging (#762).
#
# On a pull request into main, every game id that www/games.json adds compared
# with main must already be on the staging branch, where the owner tried it on
# staging.playchogan.com before it went to every player.
#
# Exit 0: nothing to check (not a PR into main), no new game, every new game is
#         on staging, or the staging branch does not exist yet (a warning says
#         the gate is off until it does).
# Exit 1: a new game is not on staging; the ids are listed.
# Exit 2: cannot test (remote unreachable, a games.json unreadable).
#
# GATE_REMOTE names the remote (default origin); the tests point it at a scratch
# repository.
set -uo pipefail

if [ "${GITHUB_EVENT_NAME:-}" != "pull_request" ] || [ "${GITHUB_BASE_REF:-}" != "main" ]; then
  echo "new-games-gate: not a pull request into main (${GITHUB_EVENT_NAME:-local}, base ${GITHUB_BASE_REF:-none}); nothing to check"
  exit 0
fi

remote="${GATE_REMOTE:-origin}"
git ls-remote --exit-code --heads "$remote" staging >/dev/null
rc=$?
if [ "$rc" -eq 2 ]; then
  echo "::warning::new-games-gate: no staging branch on $remote yet, so new games are not gated. Create it from main to turn the gate on."
  exit 0
elif [ "$rc" -ne 0 ]; then
  echo "new-games-gate: cannot reach $remote (git ls-remote exit $rc)" >&2
  exit 2
fi

if ! git fetch --quiet --no-tags "$remote" "+refs/heads/main:refs/gate/main" "+refs/heads/staging:refs/gate/staging"; then
  echo "new-games-gate: cannot fetch main and staging from $remote" >&2
  exit 2
fi

ids() {
  # $1: a git revision, or "WORKTREE" for the checked-out games.json
  if [ "$1" = WORKTREE ]; then cat www/games.json; else git show "${1}:www/games.json"; fi |
    node -e '
      let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
        const list = JSON.parse(s);
        if (!Array.isArray(list) || !list.length) throw new Error("empty or not a list");
        for (const g of list) { if (!g || typeof g.id !== "string") throw new Error("entry without id"); console.log(g.id); }
      });'
}

head_ids=$(ids WORKTREE) || { echo "new-games-gate: cannot read www/games.json of this pull request" >&2; exit 2; }
main_ids=$(ids refs/gate/main) || { echo "new-games-gate: cannot read www/games.json on main" >&2; exit 2; }
staging_ids=$(ids refs/gate/staging) || { echo "new-games-gate: cannot read www/games.json on staging" >&2; exit 2; }

new=$(comm -23 <(sort -u <<<"$head_ids") <(sort -u <<<"$main_ids"))
if [ -z "$new" ]; then
  echo "new-games-gate: no new game in this pull request"
  exit 0
fi
missing=$(comm -23 <(sort -u <<<"$new") <(sort -u <<<"$staging_ids"))
if [ -n "$missing" ]; then
  echo "new-games-gate: these new games are not on the staging branch yet; merge them into staging and try them on https://staging.playchogan.com/ first:" >&2
  sed 's/^/  - /' <<<"$missing" >&2
  exit 1
fi
echo "new-games-gate: every new game is on staging:"
sed 's/^/  - /' <<<"$new"
exit 0
