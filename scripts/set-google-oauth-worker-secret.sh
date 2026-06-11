#!/usr/bin/env bash
# Set GOOGLE_CLIENT_SECRET on the Cloudflare OAuth Worker (not in GitHub / SPA).
#
# Usage (preferred): save GCP JSON under docs/google-oauth/client_secret_*.json
#   ./scripts/set-google-oauth-worker-secret.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CF_ENV="${CLOUDFLARE_ENV:-/mnt/merged_ssd/Cloudflare/account.env}"
WORKER_DIR="${ROOT}/workers/diagrams-free-oauth"

# shellcheck source=/dev/null
source "${ROOT}/scripts/google-oauth-load-secret.sh"
google_oauth_load_secret "$ROOT" || true

if [[ -z "${GOOGLE_CLIENT_SECRET:-}" ]]; then
  cat <<EOF >&2
GOOGLE_CLIENT_SECRET is not set.

Save OAuth client JSON from GCP to:
  docs/google-oauth/client_secret_*.json

Or create docs/google-oauth/secrets.env (see secrets.env.example).

Then run: ./scripts/set-google-oauth-worker-secret.sh
EOF
  exit 1
fi

if [[ -f "$CF_ENV" ]]; then
  # shellcheck source=/dev/null
  source "$CF_ENV"
fi

: "${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?Set CLOUDFLARE_ACCOUNT_ID}"

export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID

cd "$WORKER_DIR"
echo "$GOOGLE_CLIENT_SECRET" | npx wrangler secret put GOOGLE_CLIENT_SECRET

echo "GOOGLE_CLIENT_SECRET set on diagrams-free-oauth Worker."
echo "Retry Sign in with Google on https://diagrams.free"
