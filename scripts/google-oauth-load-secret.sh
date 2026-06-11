#!/usr/bin/env bash
# Source this file to set GOOGLE_CLIENT_SECRET from operator files (never committed).
# Priority: env var → docs/google-oauth/secrets.env → docs/google-oauth/client_secret*.json

google_oauth_load_secret() {
  local root="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
  local oauth_dir="${root}/docs/google-oauth"
  local secrets_env="${oauth_dir}/secrets.env"

  if [[ -n "${GOOGLE_CLIENT_SECRET:-}" ]]; then
    return 0
  fi

  if [[ -f "$secrets_env" ]]; then
    # shellcheck source=/dev/null
    source "$secrets_env"
  fi
  if [[ -n "${GOOGLE_CLIENT_SECRET:-}" ]]; then
    return 0
  fi

  local json_file=""
  shopt -s nullglob
  local candidates=("${oauth_dir}"/client_secret*.json)
  shopt -u nullglob
  if ((${#candidates[@]} > 0)); then
    json_file="${candidates[0]}"
  fi

  if [[ -z "$json_file" || ! -f "$json_file" ]]; then
    return 1
  fi

  GOOGLE_CLIENT_SECRET="$(
    python3 - "$json_file" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as f:
    data = json.load(f)

secret = data.get("web", {}).get("client_secret") or data.get("installed", {}).get(
    "client_secret"
)
if not secret:
    raise SystemExit("client_secret not found in JSON")
print(secret)
PY
  )"
  export GOOGLE_CLIENT_SECRET
}
