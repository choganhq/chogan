# Issue watcher

Runs in the container `services` (CT 104 on hm-pve) as the user units in this folder, never on
`claude`, a laptop or anywhere else (owner, 2026-11-20).

- `watch.sh` — the hourly check; starts `claude -p` only when GitHub has something new.
- `chogan-watch.service` / `.timer` — install with `cp` into `~/.config/systemd/user/`, then
  `systemctl --user daemon-reload && systemctl --user enable --now chogan-watch.timer`.
- Private state (`approved.md`, `waiting.md`, `runs.md`, `prompt.md`, `logs/`) is not in the repo.
  It lives in `/media/wd-elements-hdd/chogan-watch/` and `/home/dev/projects/personal/chogan/watch`
  is a symlink to it on both `claude` and `services`.
- It treats an open non-Dependabot PR or a push in the last 15 minutes as "someone is busy".
