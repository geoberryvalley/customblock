#!/usr/bin/env bash
# Build Chrome and Firefox zip packages for Artblock.
# Run from the repo root. Outputs artblock-{chrome,firefox}-v<version>.zip.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

VERSION=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
INCLUDE=(LICENSE background content styles popup icons)

build() {
  local target="$1"      # chrome | firefox
  local manifest="$2"    # path to manifest file to use
  local out="artblock-${target}-v${VERSION}.zip"

  rm -f "$out"
  local stage
  stage=$(mktemp -d)
  trap 'rm -rf "$stage"' RETURN

  cp "$manifest" "$stage/manifest.json"
  for item in "${INCLUDE[@]}"; do cp -R "$item" "$stage/"; done
  find "$stage" -name .DS_Store -delete

  (cd "$stage" && zip -qr "$ROOT/$out" .)
  rm -rf "$stage"
  echo "built $out ($(du -h "$out" | cut -f1))"
}

build chrome manifest.json
build firefox manifest.firefox.json
