#!/usr/bin/env bash
# Marks the staging web build so nobody mistakes it for the real app (#762).
# Called by the staging job after tools/stamp-version.sh, never by the Pages job.
#
# It appends a small script to the published version.js, which every page loads:
# a "STAGING" label in a corner and a "[STAGING]" prefix on the tab title. The
# repository copy and the production build never carry it.
#
# It refuses unless version.js was stamped for staging first. Run by mistake on a
# production build, it would put the label in front of every player.
set -euo pipefail

f="${1:?usage: stamp-staging.sh <path/to/version.js>}"
[ -f "$f" ] || { echo "stamp-staging: no such file: $f" >&2; exit 1; }

env=$(sed -n "s/^self\.APP_ENV = '\([a-z]*\)';$/\1/p" "$f" | tail -n 1)
[ "$env" = "staging" ] || { echo "stamp-staging: $f is stamped for '${env:-<none>}', not staging; run tools/stamp-version.sh with APP_ENV=staging first" >&2; exit 1; }
if grep -q "ch-staging" "$f"; then echo "stamp-staging: $f already carries the staging marker" >&2; exit 1; fi

cat >> "$f" <<'EOF'

// Staging marker, stamped by tools/stamp-staging.sh on the staging build only (#762).
(function () {
  // The service worker imports this file too, and has no document.
  if (typeof document === 'undefined') return;
  function mark() {
    if (!/^\[STAGING\] /.test(document.title)) document.title = '[STAGING] ' + document.title;
    if (document.getElementById('ch-staging') || !document.body) return;
    var el = document.createElement('div');
    el.id = 'ch-staging';
    el.setAttribute('aria-hidden', 'true');
    el.textContent = 'STAGING ' + String(self.APP_BUILD || '').slice(0, 7);
    // Taps go through it, so it never blocks a game control.
    el.style.cssText = 'position:fixed;left:0;bottom:env(safe-area-inset-bottom,0);z-index:2147483647;' +
      'padding:2px 8px;font:700 11px/1.5 system-ui,sans-serif;letter-spacing:.08em;direction:ltr;' +
      'color:#fff;background:#c2410c;border-top-right-radius:6px;opacity:.9;pointer-events:none';
    document.body.appendChild(el);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mark);
  else mark();
})();
EOF
echo "stamp-staging: marker added to $f"
