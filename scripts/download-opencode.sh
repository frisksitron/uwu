#!/usr/bin/env bash
set -euo pipefail

OPENCODE_VERSION="v1.2.27"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
OUT_DIR="$PROJECT_ROOT/resources/bin"
BASE_URL="https://github.com/anomalyco/opencode/releases/download/${OPENCODE_VERSION}"

# Determine platform
case "$OSTYPE" in
  darwin*)  PLATFORM="darwin" ;;
  msys*|cygwin*|win32*) PLATFORM="windows" ;;
  *)        PLATFORM="linux" ;;
esac

mkdir -p "$OUT_DIR"

# Download and extract a single opencode binary
# Usage: download_opencode <platform> <arch> <dest>
download_opencode() {
  local plat="$1" arch="$2" dest="$3"
  local asset url tmpdir

  if [ "$plat" = "linux" ]; then
    asset="opencode-${plat}-${arch}.tar.gz"
  else
    asset="opencode-${plat}-${arch}.zip"
  fi

  url="${BASE_URL}/${asset}"
  tmpdir=$(mktemp -d)

  echo "Downloading opencode ${OPENCODE_VERSION} (${plat}/${arch})..."
  curl -fSL "$url" -o "$tmpdir/$asset"

  if [[ "$asset" == *.tar.gz ]]; then
    tar -xzf "$tmpdir/$asset" -C "$tmpdir"
  else
    unzip -o "$tmpdir/$asset" -d "$tmpdir"
  fi

  if [ "$plat" = "windows" ]; then
    cp "$tmpdir/opencode.exe" "$dest"
  else
    cp "$tmpdir/opencode" "$dest"
    chmod +x "$dest"
  fi

  rm -rf "$tmpdir"
}

if [ "$PLATFORM" = "darwin" ]; then
  # macOS: download both architectures and create universal binary with lipo
  download_opencode darwin x64 "$OUT_DIR/opencode-x64"
  download_opencode darwin arm64 "$OUT_DIR/opencode-arm64"
  lipo -create "$OUT_DIR/opencode-x64" "$OUT_DIR/opencode-arm64" -output "$OUT_DIR/opencode"
  rm "$OUT_DIR/opencode-x64" "$OUT_DIR/opencode-arm64"
elif [ "$PLATFORM" = "windows" ]; then
  download_opencode windows x64 "$OUT_DIR/opencode.exe"
else
  ARCH=$(uname -m)
  case "$ARCH" in
    x86_64|amd64) ARCH="x64" ;;
    aarch64|arm64) ARCH="arm64" ;;
  esac
  download_opencode linux "$ARCH" "$OUT_DIR/opencode"
fi

echo "opencode ${OPENCODE_VERSION} -> $OUT_DIR"
