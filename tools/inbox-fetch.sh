#!/usr/bin/env bash
# Download one report from the private inbox (#757) and, with --delete, remove it.
#
#   tools/inbox-fetch.sh [--delete] <release id or report-… tag> <empty directory>
#
# The web form at playchogan.com/report/ stores a report's files as assets of a draft
# release in choganhq/inbox (INBOX_REPO overrides). This writes report.md (the release
# body: kind, language, contact, description) and every asset into the directory.
# --delete then deletes the release (and its tag, if it ever got one) and checks that
# it is really gone. Nothing is deleted unless every download succeeded.
#
# Exit 0: done. 1: a download or the deletion failed, or the release is still there.
# 2: wrong arguments, the directory is not empty, or the release was not found.
set -euo pipefail

REPO="${INBOX_REPO:-choganhq/inbox}"
DELETE=0
args=()
for a in "$@"; do
  case "$a" in
    --delete) DELETE=1 ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) args+=("$a") ;;
  esac
done
if [ "${#args[@]}" -ne 2 ]; then
  echo "usage: tools/inbox-fetch.sh [--delete] <release id or tag> <empty directory>" >&2
  exit 2
fi
ref="${args[0]}"
dir="${args[1]}"

if [ -e "$dir" ] && [ ! -d "$dir" ]; then echo "not a directory: $dir" >&2; exit 2; fi
mkdir -p "$dir"
if [ -n "$(ls -A "$dir")" ]; then echo "directory is not empty: $dir" >&2; exit 2; fi

# JSON is read with node, which this repository already needs for its tests.
field() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s);const r=new Function("v","return ("+process.argv[1]+")")(v);process.stdout.write(r==null?"":String(r))})' "$1"; }

if [[ "$ref" =~ ^[0-9]+$ ]]; then
  id="$ref"
else
  # Drafts have no tag yet (GitHub shows "untagged-<hex>" and keeps the report id only in the
  # release name), so /releases/tags/<tag> cannot find them; search the list by name.
  # One page is enough: the Worker caps reports at 30 a day and deletes them after 3 days.
  id="$(gh api "repos/$REPO/releases?per_page=100" | REF="$ref" field 'v.find(r => r.name === process.env.REF || r.tag_name === process.env.REF)?.id')"
fi
if [ -z "$id" ]; then echo "no release $ref in $REPO" >&2; exit 2; fi

rel="$(gh api "repos/$REPO/releases/$id")" || { echo "no release $id in $REPO" >&2; exit 2; }
tag="$(printf '%s' "$rel" | field 'v.tag_name')"
name="$(printf '%s' "$rel" | field 'v.name')"
draft="$(printf '%s' "$rel" | field 'v.draft')"
case "$name" in report-*) ;; *) echo "release $id ($name) is not a form report; refusing" >&2; exit 2 ;; esac

printf '%s\n' "$(printf '%s' "$rel" | field 'v.body')" > "$dir/report.md"
echo "report.md"

# One "id size name" line per asset. Names come from the Worker (shot-N.png, video.mp4),
# but they are checked again so nothing can write outside the directory.
assets="$(printf '%s' "$rel" | field 'v.assets.map(a => a.id + " " + a.size + " " + a.name).join("\n")')"
fail=0
while read -r aid size name; do
  [ -n "${aid:-}" ] || continue
  if ! [[ "$name" =~ ^[a-z0-9][a-z0-9.-]{0,40}$ ]]; then echo "skipped odd asset name: $name" >&2; fail=1; continue; fi
  gh api -H 'Accept: application/octet-stream' "repos/$REPO/releases/assets/$aid" > "$dir/$name"
  got="$(wc -c < "$dir/$name" | tr -d ' ')"
  if [ "$got" != "$size" ]; then echo "$name: got $got bytes, expected $size" >&2; fail=1; continue; fi
  echo "$name ($size bytes)"
done <<< "$assets"
if [ "$fail" -ne 0 ]; then echo "some files failed; nothing was deleted" >&2; exit 1; fi

if [ "$DELETE" -eq 1 ]; then
  gh api -X DELETE "repos/$REPO/releases/$id" > /dev/null
  if [ "$draft" != "true" ]; then
    # A published release leaves its tag behind; a draft never had one.
    gh api -X DELETE "repos/$REPO/git/refs/tags/$tag" > /dev/null || echo "tag $tag was not there" >&2
  fi
  # Read it back: a deletion is only done when GitHub no longer has it.
  if gh api "repos/$REPO/releases/$id" > /dev/null 2>&1; then
    echo "release $id is still there after the delete" >&2
    exit 1
  fi
  echo "deleted release $id ($tag) from $REPO, checked gone"
fi
