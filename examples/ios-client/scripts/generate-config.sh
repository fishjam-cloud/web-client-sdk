#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$(cd "$ROOT/../.." && pwd)/.env"
OUT="$ROOT/FishjamExample/FishjamConfig.swift"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy .env.example to .env." >&2
  exit 1
fi

fishjam_id=""
sdk_api_url=""
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%%#*}"
  line="${line#"${line%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"
  [[ -z "$line" ]] && continue
  key="${line%%=*}"
  value="${line#*=}"
  value="${value%\"}"
  value="${value#\"}"
  case "$key" in
    FISHJAM_ID) fishjam_id="$value" ;;
    FISHJAM_SDK_API_URL) sdk_api_url="$value" ;;
  esac
done < "$ENV_FILE"

if [[ -z "$fishjam_id" || -z "$sdk_api_url" ]]; then
  echo "Set FISHJAM_ID and FISHJAM_SDK_API_URL in $ENV_FILE" >&2
  exit 1
fi

escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

cat > "$OUT" <<EOF
// Generated from .env by scripts/generate-config.sh.
enum FishjamConfig {
    static let fishjamId = "$(escape "$fishjam_id")"
    static let sdkApiUrl = "$(escape "$sdk_api_url")"
}
EOF
