#!/usr/bin/env bash
set -euo pipefail

OPENCODE_VERSION="v1.2.27"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
OUT_DIR="$PROJECT_ROOT/resources/bin"

# Determine platform and architecture
case "$OSTYPE" in
  darwin*)  PLATFORM="darwin" ;;
  msys*|cygwin*|win32*) PLATFORM="windows" ;;
  *)        PLATFORM="linux" ;;
esac

ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64) ARCH="x64" ;;
  aarch64|arm64) ARCH="arm64" ;;
esac

# Build asset name and download URL
if [ "$PLATFORM" = "linux" ]; then
  ASSET="opencode-${PLATFORM}-${ARCH}.tar.gz"
else
  ASSET="opencode-${PLATFORM}-${ARCH}.zip"
fi

URL="https://github.com/anomalyco/opencode/releases/download/${OPENCODE_VERSION}/${ASSET}"

echo "Downloading opencode ${OPENCODE_VERSION} (${PLATFORM}/${ARCH})..."

# Download to temp directory
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

curl -fSL "$URL" -o "$TMPDIR/$ASSET"

# Extract
mkdir -p "$OUT_DIR"

if [[ "$ASSET" == *.tar.gz ]]; then
  tar -xzf "$TMPDIR/$ASSET" -C "$TMPDIR"
else
  unzip -o "$TMPDIR/$ASSET" -d "$TMPDIR"
fi

# Copy binary
if [ "$PLATFORM" = "windows" ]; then
  cp "$TMPDIR/opencode.exe" "$OUT_DIR/opencode.exe"
else
  cp "$TMPDIR/opencode" "$OUT_DIR/opencode"
  chmod +x "$OUT_DIR/opencode"
fi

echo "opencode ${OPENCODE_VERSION} -> $OUT_DIR"
