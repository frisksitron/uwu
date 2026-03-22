#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_ROOT/.difft-build"
OUT_DIR="$PROJECT_ROOT/resources/bin"

echo "Building difftastic from source..."

# Clean previous build
rm -rf "$BUILD_DIR"

# Clone difftastic main branch (shallow + submodules)
git clone --depth 1 --recurse-submodules https://github.com/Wilfred/difftastic.git "$BUILD_DIR"

cd "$BUILD_DIR"

# Fix Windows symlinks: vendored *-src entries are text files pointing to
# subdirectories inside submodules, but git on Windows stores them as plain
# text files instead of real symlinks. Replace them with directory copies.
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
  cd vendored_parsers
  for f in *-src; do
    if [ -f "$f" ] && [ ! -d "$f" ]; then
      target=$(cat "$f")
      rm "$f"
      cp -r "$target" "$f"
    fi
  done
  cd "$BUILD_DIR"
fi

# Build
mkdir -p "$OUT_DIR"

if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS: build universal binary (ARM64 + x86_64)
  rustup target add x86_64-apple-darwin aarch64-apple-darwin
  cargo build --release --target x86_64-apple-darwin
  cargo build --release --target aarch64-apple-darwin
  lipo -create \
    target/x86_64-apple-darwin/release/difft \
    target/aarch64-apple-darwin/release/difft \
    -output "$OUT_DIR/difft"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
  # Windows
  cargo build --release
  cp target/release/difft.exe "$OUT_DIR/difft.exe"
else
  # Linux / other
  cargo build --release
  cp target/release/difft "$OUT_DIR/difft"
fi

# Clean up source
rm -rf "$BUILD_DIR"

echo "difft built successfully -> $OUT_DIR"
