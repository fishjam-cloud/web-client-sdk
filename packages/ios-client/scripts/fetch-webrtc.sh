#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/Vendor/WebRTC.xcframework"
SLICE="$DEST/ios-arm64_x86_64-simulator/WebRTC.framework"
if [[ -d "$SLICE" ]]; then
  exit 0
fi

mkdir -p "$ROOT/Vendor"
CACHED="$ROOT/Pods/FishjamWebRTC/WebRTC.xcframework"
if [[ -d "$CACHED/ios-arm64_x86_64-simulator/WebRTC.framework" ]]; then
  rm -rf "$DEST"
  cp -R "$CACHED" "$DEST"
  exit 0
fi

VERSION="124.0.2.4"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fsSL \
  "https://github.com/fishjam-cloud/webrtc/releases/download/v${VERSION}/FishjamWebRTC.xcframework.zip" \
  -o "$TMP/webrtc.zip"
unzip -q "$TMP/webrtc.zip" -d "$TMP/out"
FOUND="$(find "$TMP/out" -name WebRTC.xcframework -type d | head -1)"
rm -rf "$DEST"
mv "$FOUND" "$DEST"
