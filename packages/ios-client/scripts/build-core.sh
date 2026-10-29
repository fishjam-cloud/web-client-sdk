#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CORE="$(cd "$ROOT/../fishjam-core" && pwd)"
BUILD="$ROOT/build/core"
HEADERS="$BUILD/headers"
OUT="$ROOT/Core/FishjamCore.xcframework"
TARGET_ROOT="$CORE/target"

rm -rf "$OUT" "$HEADERS"
mkdir -p "$HEADERS" "$ROOT/Core"

cp "$CORE/include/fishjam.h" "$HEADERS/fishjam.h"
cat > "$HEADERS/module.modulemap" <<'EOF'
module FishjamCore {
    header "fishjam.h"
    export *
}
EOF

export IPHONEOS_DEPLOYMENT_TARGET=15.0
export CARGO_TARGET_DIR="$TARGET_ROOT"

cargo build --manifest-path "$CORE/Cargo.toml" --release --target aarch64-apple-ios
cargo build --manifest-path "$CORE/Cargo.toml" --release --target aarch64-apple-ios-sim

xcodebuild -create-xcframework \
  -library "$TARGET_ROOT/aarch64-apple-ios/release/libfishjam_core.a" -headers "$HEADERS" \
  -library "$TARGET_ROOT/aarch64-apple-ios-sim/release/libfishjam_core.a" -headers "$HEADERS" \
  -output "$OUT"

echo "wrote $OUT"
