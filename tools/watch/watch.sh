#!/usr/bin/env bash
# Local issue watcher for choganhq/chogan, run by chogan-watch.timer every hour on the hour.
# Replaces the cloud routine, which ran in Anthropic's cloud without this
# machine's rules files, GPG key or dashboard and so could never do the work.
# Only starts Claude when GitHub has something new, so quiet runs cost nothing.
set -uo pipefail

# HERE is the private state folder (approved.md, waiting.md, runs.md, prompt.md, logs). It is
# not in the repo (public) and lives on the shared disk, symlinked at this path (2026-11-20).
HERE=${WATCH_STATE:-/home/dev/projects/personal/chogan/watch}
REPO=${WATCH_REPO:-/home/dev/projects/personal/chogan/chogan}
GH_REPO=choganhq/chogan
STAMP="$HERE/last-run"
LOG="$HERE/logs/$(date +%F_%H%M).log"
export PATH="/home/dev/.nvm/versions/node/v26.8.1/bin:/home/dev/.local/bin:/usr/local/bin:/usr/bin:/bin"

# The owner wants issues built only between 17:00 and 07:00 local time (decided
# 2026-10-19). The timer only fires inside that window, but Persistent=true
# catches up a missed run at boot, which can be mid-morning, so check here too.
# FORCE=1 runs anyway (a manual run the owner asked for).
# Saturday and Sunday are open all day (owner, 2026-10-24): the window runs from
# Friday 17:00 to Monday 07:00.
# Since 2026-11-02 the timer fires hourly on the hour, the last weekday run at
# 07:00 (owner: «۵ عصر تا ۷ صبح»), so the first ten minutes of 07:00 still count.
hour=$((10#$(date +%H)))
minute=$((10#$(date +%M)))
dow=$(date +%u)
if [ "$hour" -eq 7 ] && [ "$minute" -lt 10 ]; then last_run=1; else last_run=0; fi
if [ "${FORCE:-}" != 1 ] && [ "$dow" -lt 6 ] && [ "$last_run" = 0 ] && [ "$hour" -ge 7 ] && [ "$hour" -lt 17 ]; then
  echo "outside the 17:00-07:00 window; not running"
  exit 0
fi

exec 9>"$HERE/.lock"
flock -n 9 || { echo "another watcher run is still going"; exit 0; }

log() { echo "[$(date -Is)] $*" | tee -a "$LOG"; }

# Never work over the owner's own session. Since 2026-11-20 this runs in the container
# `services`, while interactive sessions work on `claude`, so the local checkout says nothing
# about them. GitHub does: an open pull request (Dependabot's aside) or a push in the last 15
# minutes means someone is busy. A branch left on the remote does not count: parked branches
# such as issue/949-pachinko stay there for weeks. The window before a first push is not
# covered; the worst case is one issue built twice, which the PR check then shows.
branch=$(git -C "$REPO" rev-parse --abbrev-ref HEAD)
if [ "$branch" != "main" ] || [ -n "$(git -C "$REPO" status --porcelain)" ]; then
  log "skipped: working tree is busy (branch $branch or uncommitted changes)"
  echo "- $(date '+%F %H:%M') skipped: working tree busy (branch $branch)" >>"$HERE/runs.md"
  exit 0
fi
worktrees=$(git -C "$REPO" worktree list --porcelain | grep -c '^worktree ')
if [ "$worktrees" -gt 1 ]; then
  log "skipped: $((worktrees - 1)) extra worktree(s) in use"
  echo "- $(date '+%F %H:%M') skipped: $((worktrees - 1)) extra worktree(s) in use" >>"$HERE/runs.md"
  exit 0
fi
open_prs=$(gh pr list -R "$GH_REPO" --state open --json number,headRefName \
  --jq '[.[] | select(.headRefName | startswith("dependabot/") | not)] | length') || { log "gh failed (open PRs)"; exit 1; }
recent_pushes=$(gh api "repos/$GH_REPO/events?per_page=30" \
  --jq "[.[] | select(.type == \"PushEvent\") | select(.created_at > \"$(date -u -d '-15 minutes' +%FT%TZ)\")] | length") || { log "gh failed (events)"; exit 1; }
if [ "$open_prs" -gt 0 ] || [ "$recent_pushes" -gt 0 ]; then
  log "skipped: someone is busy on GitHub (open PRs=$open_prs, pushes in the last 15 min=$recent_pushes)"
  echo "- $(date '+%F %H:%M') skipped: busy on GitHub (open PRs=$open_prs, recent pushes=$recent_pushes)" >>"$HERE/runs.md"
  exit 0
fi
# This clone is only the watcher's: bring it to the current main before looking at anything
git -C "$REPO" fetch -q origin && git -C "$REPO" merge -q --ff-only origin/main || { log "could not fast-forward main"; exit 1; }

since=$(cat "$STAMP" 2>/dev/null || date -u -d '-2 hours 15 minutes' +%FT%TZ)
now=$(date -u +%FT%TZ)

# New or edited issues and PRs since the last run
n_issues=$(gh api "repos/$GH_REPO/issues?state=open&since=$since&per_page=100" \
  --jq "[.[] | select(.created_at >= \"$since\" or .updated_at >= \"$since\")] | length") || { log "gh failed (issues)"; exit 1; }
# Comments from people since the last run (the agent's own replies don't count)
n_comments=$(gh api "repos/$GH_REPO/issues/comments?since=$since&per_page=100" \
  --jq '[.[] | select((.body | startswith("<!-- agent-reply -->") or startswith("Diff review")) | not) | select(.user.type != "Bot")] | length') || { log "gh failed (comments)"; exit 1; }
# Open issues nobody has worked yet (a failed earlier run must not lose them)
n_unworked=0
for n in $(gh issue list -R "$GH_REPO" --state open --json number,labels,assignees \
    --jq '.[] | select([.labels[].name] | index("needs-owner") or index("needs-info") | not) | .number'); do
  # parked for the owner in waiting.md: not new until someone comments again
  grep -q "issues/$n)" "$HERE/waiting.md" 2>/dev/null && continue
  if ! gh api "repos/$GH_REPO/issues/$n/comments?per_page=100" --jq '.[].body' | grep -q '<!-- agent-reply -->'; then
    n_unworked=$((n_unworked + 1))
  fi
done

# Owner-approved items not yet done (approved.md); a release item has no issue to count
n_approved=$(grep -c '^- \[ \]' "$HERE/approved.md" 2>/dev/null)

if [ "$n_issues" -eq 0 ] && [ "$n_comments" -eq 0 ] && [ "$n_unworked" -eq 0 ] && [ "${n_approved:-0}" -eq 0 ]; then
  log "nothing new since $since"
  echo "$now" > "$STAMP"
  exit 0
fi

log "new since $since: issues=$n_issues comments=$n_comments unworked=$n_unworked approved=${n_approved:-0}; starting Claude"
[ "${DRYRUN:-}" = 1 ] && { log "dry run: not starting Claude"; exit 0; }
cd /home/dev/projects/personal/chogan
# Each run is a named, saved session: `claude --resume` in this folder lists it, and its
# full transcript stays in ~/.claude/projects/ so any run can be reviewed later
sid=$(cat /proc/sys/kernel/random/uuid)
name="chogan-watch $(date '+%F %H:%M')"
log "session $sid ($name)"
OUT="$HERE/logs/$(date +%F_%H%M).out"
{ cat "$HERE/prompt.md"; echo; echo "Look at activity since: $since (UTC)."
  echo "Work window: issues are built between 17:00 and 07:00 local time on weekdays, and all day on Saturday and Sunday (date +%u is 6 or 7). Before starting each new issue, check the time; from 07:00 Monday to Friday, finish the issue in progress (merge, verify, report) but do not start another, and end the run with the usual summary. Exception: a weekday run that starts between 07:00 and 07:09 is the window's last run and may start one issue and finish it."; } \
  | claude -p --permission-mode auto --model claude-opus-5-5 --session-id "$sid" --name "$name" \
      --add-dir /home/dev/projects/personal/projects-dashboard >"$OUT" 2>&1
rc=$?
cat "$OUT" >>"$LOG"
log "claude exited $rc"
# One entry per run in runs.md, newest last: when, why, which session, and the run's own summary
{
  echo "## $(date '+%F %H:%M') — exit $rc"
  echo "- trigger: issues=$n_issues comments=$n_comments unworked=$n_unworked approved=${n_approved:-0} (since $since)"
  echo "- session: \`$sid\` (\`claude --resume $sid\` in /home/dev/projects/personal/chogan)"
  echo "- log: \`$LOG\`"
  echo
  tail -c 4000 "$OUT"
  echo
} >>"$HERE/runs.md"
rm -f "$OUT"
# Advance the window only after a successful run, so a failure is retried next time
[ $rc -eq 0 ] && echo "$now" > "$STAMP"
ls -1t "$HERE"/logs/*.log 2>/dev/null | tail -n +61 | xargs -r rm --
exit $rc
