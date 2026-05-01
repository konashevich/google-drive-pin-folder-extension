#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
PACKAGE="$DIST_DIR/gdrive-sidebar-pinner-$(node -p "require('$ROOT_DIR/manifest.json').version").zip"

mkdir -p "$DIST_DIR"
rm -f "$PACKAGE"

cd "$ROOT_DIR"
zip -qr "$PACKAGE" \
  manifest.json \
  content.js \
  styles.css \
  icons/icon16.png \
  icons/icon48.png \
  icons/icon128.png

echo "$PACKAGE"
