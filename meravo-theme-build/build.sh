#!/usr/bin/env bash
# Rebuilds meravo-theme/assets/theme.css. Uses the Tailwind already
# installed for the storefront (run `npm ci` in frontend/ once first).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
"$here/../frontend/node_modules/.bin/tailwindcss" \
  -c "$here/tailwind.config.cjs" \
  -i "$here/theme.src.css" \
  -o "$here/../meravo-theme/assets/theme.css" \
  --minify
