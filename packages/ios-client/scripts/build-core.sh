#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CORE="$(cd "$ROOT/../fishjam-core" && pwd)"
BUILD="$ROOT/build/core"
HEADERS="$BUILD/headers"
BINDINGS="$BUILD/swift"
OUT="$ROOT/Core/FishjamCore.xcframework"
GENERATED="$ROOT/FishjamClient/Generated"
TARGET_ROOT="$CORE/target"

rm -rf "$OUT" "$HEADERS" "$BINDINGS"
mkdir -p "$HEADERS" "$BINDINGS" "$GENERATED" "$ROOT/Core"

export IPHONEOS_DEPLOYMENT_TARGET=15.0
export CARGO_TARGET_DIR="$TARGET_ROOT"

# Only the static library: a dylib cannot link because `fishjam_ios_log` lives in this SDK.
for target in aarch64-apple-ios aarch64-apple-ios-sim; do
  cargo rustc --manifest-path "$CORE/Cargo.toml" --release --lib --crate-type staticlib --target "$target"
done

(cd "$CORE" && cargo run --features bindgen --bin uniffi-bindgen -- \
  generate --library "$TARGET_ROOT/aarch64-apple-ios/release/libfishjam_core.a" \
  --language swift --out-dir "$BINDINGS")

cp "$BINDINGS/fishjam_coreFFI.h" "$HEADERS/fishjam_coreFFI.h"
cp "$BINDINGS/fishjam_coreFFI.modulemap" "$HEADERS/module.modulemap"
# The core types stay internal to FishjamClient; the SDK exposes its own types.
perl -pe 's/\b(public|open) //g' "$BINDINGS/fishjam_core.swift" > "$GENERATED/fishjam_core.swift"

xcodebuild -create-xcframework \
  -library "$TARGET_ROOT/aarch64-apple-ios/release/libfishjam_core.a" -headers "$HEADERS" \
  -library "$TARGET_ROOT/aarch64-apple-ios-sim/release/libfishjam_core.a" -headers "$HEADERS" \
  -output "$OUT"

echo "wrote $OUT and $GENERATED/fishjam_core.swift"
