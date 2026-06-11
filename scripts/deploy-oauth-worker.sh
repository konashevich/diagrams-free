#!/usr/bin/env bash
# Deploy diagrams.free Google OAuth proxy to Cloudflare Workers.
# Requires: account API token with Workers Scripts + KV + Routes (see workers/diagrams-free-oauth/README.md)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKER_DIR="${ROOT}/workers/diagrams-free-oauth"
CF_ENV="${CLOUDFLARE_ENV:-/mnt/merged_ssd/Cloudflare/account.env}"

if [[ -f "$CF_ENV" ]]; then
  # shellcheck source=/dev/null
  source "$CF_ENV"
fi

: "${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN (Workers + KV permissions)}"
: "${CLOUDFLARE_ACCOUNT_ID:?Set CLOUDFLARE_ACCOUNT_ID}"

export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID

cd "$WORKER_DIR"
npm install --no-save 2>/dev/null || npm install

if ! grep -q 'REPLACE_AFTER_KV_CREATE' wrangler.toml; then
  echo "KV namespace already configured in wrangler.toml"
else
  echo "Creating KV namespace..."
  KV_OUT="$(npx wrangler kv namespace create OAUTH_KV 2>&1)"
  echo "$KV_OUT"
  KV_ID="$(echo "$KV_OUT" | grep -oE 'id = "[a-f0-9]+"' | head -1 | grep -oE '[a-f0-9]+')"
  if [[ -z "$KV_ID" ]]; then
    echo "Failed to create KV namespace" >&2
    exit 1
  fi
  sed -i "s/REPLACE_AFTER_KV_CREATE/${KV_ID}/g" wrangler.toml
  echo "KV namespace id: ${KV_ID}"
fi

if [[ -z "${SESSION_SIGNING_KEY:-}" ]]; then
  SESSION_SIGNING_KEY="$(openssl rand -hex 32)"
  echo "Generated SESSION_SIGNING_KEY (also set as Worker secret)"
fi

echo "$SESSION_SIGNING_KEY" | npx wrangler secret put SESSION_SIGNING_KEY

if [[ -n "${GOOGLE_CLIENT_SECRET:-}" ]]; then
  echo "$GOOGLE_CLIENT_SECRET" | npx wrangler secret put GOOGLE_CLIENT_SECRET
else
  echo "Note: GOOGLE_CLIENT_SECRET not set — using PKCE-only token exchange."
fi

npx wrangler deploy

echo ""
echo "Deployed. Next:"
echo "  1. GCP OAuth client → add redirect URI: https://diagrams.free/oauth-callback.html"
echo "  2. gh secret set VITE_APP_GOOGLE_OAUTH_PROXY_URL -b 'https://api.diagrams.free' -R konashevich/diagrams-free"
echo "  3. Push to master to rebuild the SPA"
