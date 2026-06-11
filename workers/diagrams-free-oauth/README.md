# diagrams.free OAuth proxy (Cloudflare Worker)

Stores Google **refresh tokens** in KV; browser gets short-lived **access tokens** only.

**URL:** `https://api.diagrams.free`  
**Endpoints:** `POST /oauth/exchange`, `POST /oauth/refresh`, `POST /oauth/revoke`, `GET /health`

## Deploy

```bash
# Token: Cloudflare account API with Workers Scripts + KV + Routes (all zones)
source /mnt/merged_ssd/Cloudflare/account.env   # rotate if invalid
export GOOGLE_CLIENT_SECRET=GOCSPX-...          # optional; PKCE works without it
./scripts/deploy-oauth-worker.sh
```

## GCP

Add authorized redirect URI: `https://diagrams.free/oauth-callback.html`

## App

```bash
gh secret set VITE_APP_GOOGLE_OAUTH_PROXY_URL -b 'https://api.diagrams.free' -R konashevich/diagrams-free
```

See [docs/google-drive-oauth-sessions.md](../../docs/google-drive-oauth-sessions.md).
