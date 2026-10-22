#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROTO_DIR="$(cd "$ROOT/../fishjam-core/proto" && pwd)"
OUT="$ROOT/FishjamClient/Generated"

mkdir -p "$OUT"
protoc --swift_out="$OUT" --swift_opt=Visibility=Internal -I "$PROTO_DIR" "$PROTO_DIR/sdk_api.proto"
