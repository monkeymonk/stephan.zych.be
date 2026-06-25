#!/usr/bin/env bash
# Capture the SSH TUI to WebP stills via VHS (charmbracelet/vhs).
# Requires: go, vhs (+ its ttyd & ffmpeg deps). Run from anywhere:
#   ./scripts/screenshot-tui.sh
#
# Routes stills to the two asset buckets:
#   assets/tui.webp                       — README hero (home screen)
#   content/assets/screenshots/tui-*.webp — content images (blog list, reader)
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo"

tmp=".vhs-tmp"
rm -rf "$tmp"; mkdir -p "$tmp" assets content/assets/screenshots

echo "› building tui binary"
(cd tui && go build -trimpath -o tui .)

echo "› recording tui.tape"
vhs scripts/tui.tape

# raw PNG (from tape) → routed WebP
declare -A route=(
  [tui-home]="assets/tui.webp"
  [tui-blog]="content/assets/screenshots/tui-blog.webp"
  [tui-reader]="content/assets/screenshots/tui-reader.webp"
)
for name in "${!route[@]}"; do
  src="$tmp/$name.png"
  [ -f "$src" ] || { echo "!! missing $src"; exit 1; }
  ffmpeg -y -loglevel error -i "$src" -c:v libwebp -quality 90 "${route[$name]}"
  echo "✓ $name → ${route[$name]}"
done

rm -rf "$tmp"
