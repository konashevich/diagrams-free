# AGENTS.md

Guidance for AI agents working on **diagrams.free** — a fork of [Excalidraw](https://github.com/excalidraw/excalidraw) (MIT). Live site: **[https://diagrams.free](https://diagrams.free)**. Repo: [konashevich/diagrams-free](https://github.com/konashevich/diagrams-free).

This is **not** the official Excalidraw product. The app has been fully rebranded to **diagrams.free** (see [docs/diagrams-free-branding-and-ip-clearance.md](docs/diagrams-free-branding-and-ip-clearance.md)): new logo/favicon/OG assets, **Nanum Pen Script** (Google Font, OFL) as the default hand-drawn font, and removal of Excalidraw trademarks and official cloud backends from production builds.

---

## What makes this fork different

Stock Excalidraw keeps one implicit “current scene” in the browser; reset/new overwrites it. **diagrams.free** adds:

- **Scene vault** — local, browser-only multi-canvas storage (“My scenes”) in IndexedDB; reset/new **archives** instead of destroying work.
- **Private by default** — vault data stays on the device unless the user exports or uses sync/share they enable.
- **Fully free** — no subscription; no Excalidraw+ or official excalidraw.com backends in production.
- **Google Drive sync & share** (in progress, early stage) — planned backup/restore of the vault and share links via the user’s Drive; see plan below.
- **GitHub Pages hosting** on custom domain **diagrams.free** — static SPA, no app server. See [docs/github-pages-hosting.md](docs/github-pages-hosting.md).
- **Shape libraries** — browse/install still points at Excalidraw’s public catalog (`libraries.excalidraw.com`); personal libraries stay in the browser. A self-hosted or independent catalog may come later. See [docs/libraries-overview.md](docs/libraries-overview.md).
- **Google Analytics 4** — production visit statistics via GA4 measurement ID **`G-H31J97S7ZC`** (not diagram content). See [Google Analytics 4](#google-analytics-4-production) below.
- **Default hand-drawn font** — **Nanum Pen Script** (Google Font, SIL OFL), self-hosted as woff2; replaces upstream Excalifont/Virgil as the canvas default. Excalifont remains in the font picker.

Full user-facing summary: [README.md](README.md).

---

## Project structure

The **product** is **diagrams.free**, but the **repo layout** still uses upstream Excalidraw folder and package names (`excalidraw-app/`, `@excalidraw/*`). That is intentional — easier to merge upstream fixes. Do not read those names as the public brand.

| Path | Role |
|------|------|
| `excalidraw-app/` | **Start here for fork work** — vault, Drive, branding, deploy, menus |
| `packages/excalidraw/` | Editor React library (npm: `@excalidraw/excalidraw`); shared with upstream |
| `packages/common`, `element`, `math`, `utils` | Low-level editor packages (`@excalidraw/*`) |
| `docs/` | Design plans, hosting, branding, OAuth |
| `examples/` | Upstream integration samples (usually not needed for diagrams.free) |

**Prefer `excalidraw-app/`** for diagrams.free features. Touch `packages/*` only for editor-core changes or when unavoidable.

---

## Scene vault (implemented)

**Flag:** `VITE_APP_SCENE_VAULT=true` (on in production and development).

**Design doc:** [docs/scene-vault-design.md](docs/scene-vault-design.md)

**Concept:**

- **Active canvas** — still autosaves via existing `LocalData` (`localStorage` + IndexedDB files store), same as upstream.
- **Vault** — separate IndexedDB database (`scene-vault-db`) holds named snapshots (elements, appState, embedded files).
- **New canvas / Reset canvas** — flush current scene into vault, then clear editor (no silent data loss).
- **My scenes** — Open, Rename, Duplicate, Delete, Download (`.excalidraw`), Import file into vault.
- **Flush before switch** — always `LocalData.flushSave()` before archive or load.
- **No backend** for vault; `.excalidraw` export remains compatible with stock Excalidraw.

Key code areas: `excalidraw-app/` vault service, vault UI dialog, `LocalData.ts`.

When the flag is `false`, behavior matches upstream Excalidraw.

---

## Default hand-drawn font

**Font:** Nanum Pen Script (Google Fonts, SIL OFL)  
**Source archive:** [docs/Nanum_Pen_Script.zip](docs/Nanum_Pen_Script.zip)  
**Bundled assets:** `packages/excalidraw/fonts/NanumPenScript/` (`NanumPenScript-Regular.woff2` + `index.ts`)

| Item | Location / value |
|------|------------------|
| Font family name | `"Nanum Pen Script"` |
| `FONT_FAMILY` ID | `4` (keep when swapping fonts — existing scenes use this ID) |
| Default constant | `DEFAULT_FONT_FAMILY` in `packages/common/src/constants.ts` |
| Metrics | `packages/common/src/font-metadata.ts` |
| Registration | `packages/excalidraw/fonts/Fonts.ts` → `init("Nanum Pen Script", ...)` |
| Font picker default | `packages/excalidraw/components/FontPicker/FontPicker.tsx` |
| Welcome-screen hints | `packages/excalidraw/components/welcome-screen/WelcomeScreen.scss` (`.excalifont` class) |
| License attribution | [NOTICE](./NOTICE) |

**Agent notes:**

- Fonts are **bundled locally** (woff2); production does not load canvas fonts from `fonts.googleapis.com`.
- **Excalifont** (ID `5`) stays in the picker as an alternate hand-drawn face.
- To replace the default font: convert TTF → woff2 (project has `fonteditor-core` + `wawoff2`), add a folder under `packages/excalidraw/fonts/`, wire through the files above, update NOTICE, and remove the old font folder entirely — no legacy fallbacks.
- CJK fallback for hand-drawn fonts uses **Xiaolai** via `getFontFamilyFallbacks()` in `constants.ts`.

---

## Google Drive sync & share (in progress)

**Flag:** `VITE_APP_GOOGLE_DRIVE` (`false` in production until GCP secrets + verification).

**GCP project:** `diagrams-free` · **Console account:** `konashevich@gmail.com` · **Support:** `support@diagrams.free`

**Plan (status + agent playbook):** [docs/google-drive-sync-and-share-plan.md](docs/google-drive-sync-and-share-plan.md)  
**OAuth setup:** [docs/google-oauth-setup.md](docs/google-oauth-setup.md)

**Code today:** `excalidraw-app/google-drive/` — auth (OAuth proxy when `VITE_APP_GOOGLE_OAUTH_PROXY_URL` set; else GIS token model), backup/restore, share, auto-sync. **Worker:** `workers/diagrams-free-oauth/`. **OAuth sessions:** [docs/google-drive-oauth-sessions.md](docs/google-drive-oauth-sessions.md).

**Concept:**

| Feature | Idea |
|---------|------|
| **Sync** | Sign in with Google → backup/restore **My scenes** to `diagrams.free/vault/` on the user’s Drive. Local vault stays authoritative while editing; Drive is a replica (debounced auto-sync planned). |
| **Share** | Export scene → upload to `diagrams.free/shared/` → link like `https://diagrams.free/#share={driveFileId}`. Access controlled by Google Drive sharing only (plaintext `.excalidraw`, no app-level encryption). |
| **Hosting** | Static app on GitHub Pages; **Google Drive is the only cloud storage** — no scene blob server. |
| **Scope** | `drive.file` only; OAuth/API key restricted to `https://diagrams.free`. |

Replaces official share/collab (`json.excalidraw.com`, Firebase) which do not work on third-party origins.

Implement remaining work per plan §9 (terminal `gcloud` + browser for Console). Do not enable production flag until §12 smoke tests pass on https://diagrams.free.

---

## Google Analytics 4 (production)

**Service:** [Google Analytics 4](https://analytics.google.com/) (visit statistics only — not diagram content).

**Implementation plan:** [docs/ga4-analytics-plan.md](docs/ga4-analytics-plan.md) (events, funnels, Phase 1/2).

**Measurement ID:** `G-H31J97S7ZC`

| Item | Location / value |
|------|------------------|
| Enable flag | `VITE_APP_ENABLE_TRACKING=true` in `.env.production` |
| Measurement ID env | `VITE_APP_GA_MEASUREMENT_ID=G-H31J97S7ZC` in `.env.production` |
| gtag snippet | `excalidraw-app/index.html` (injected at build time via EJS; **production only**) |
| EJS data | `excalidraw-app/vite.config.mts` → `ViteEjsPlugin` |
| Custom events | `packages/excalidraw/analytics.ts` → `trackEvent()` → `window.gtag`; categories: `command_palette`, `export`, `load`, `engagement` |
| Engagement helpers | `excalidraw-app/analytics/engagement.ts` — `canvas_used`, `meaningful_session`, `new_canvas` |
| Consent Mode v2 | `excalidraw-app/index.html` — denied in EEA/UK until accept; granted elsewhere |
| EU/UK banner | `excalidraw-app/components/CookieConsentBanner.tsx` + `excalidraw-app/analytics/cookieConsent.ts` |
| EEA/UK region list | `excalidraw-app/analytics/consentRegions.ts` |
| Privacy policy | [public/privacy/index.html](public/privacy/index.html) → https://diagrams.free/privacy/ |

**Agent notes:**

- The gtag script does **not** load in local dev (`yarn start`) — only when `mode === "production"` and both env vars are set.
- Do not add diagram, vault, or file contents to analytics events.
- To disable analytics in a build, set `VITE_APP_ENABLE_TRACKING=false` or clear `VITE_APP_GA_MEASUREMENT_ID`.
- Upstream `trackEvent` / SimpleAnalytics (`sa_event`) remain as a fallback in `analytics.ts` but are unused in production.
- **EEA/UK visitors** must be able to reject analytics; do not auto-grant without consent in those regions. Geo lookup uses `api.country.is` (documented in privacy policy).

---

## Stripe donations (optional)

**Plan:** [docs/stripe-donate-plan.md](docs/stripe-donate-plan.md) · **Operator setup:** [docs/stripe-donate-setup.md](docs/stripe-donate-setup.md)

| Item | Location / value |
|------|------------------|
| Feature flag | `VITE_APP_DONATE_ENABLED=true` + 7 `VITE_APP_STRIPE_DONATE_*` Payment Link URLs (GitHub Actions secrets on deploy) |
| UI | `excalidraw-app/donate/` — menu **Support diagrams.free**, two-column modal |
| Stripe API keys | `docs/stripe/secrets.env` (gitignored) — **local link creation only**; never in client bundle |
| Create links | `node docs/stripe/create-payment-links.mjs` → `docs/stripe/generated-vite.env` |
| GitHub secrets | `bash docs/stripe/sync-github-secrets.sh` |

**Agent notes:** Static site uses Payment Link redirects only — no `sk_live` in Vite env. Thank-you return: `https://diagrams.free/?donate=thanks&kind=once` or `&kind=monthly` (suppresses donation reminders).

### Donation reminder (implemented — scope closed)

**Design doc:** [docs/donate-reminder-plan.md](docs/donate-reminder-plan.md) — read **Scope lock** first.

**No backend for this feature:** no Stripe webhooks, no Apps Script for payment truth, no “Phase D”. Suppress via return URL `?donate=thanks&kind=once|monthly` only; optional Drive JSON sync (`drive.file`). Monthly cancel in Stripe does **not** clear suppress — accepted limit.

**Code:** `excalidraw-app/donate/reminder/`

**Operator:** `node docs/stripe/update-payment-link-redirects.mjs` (fix redirects on existing links). Do not suggest webhook work when reviewing or extending reminders.

---

## Hosting & deployment

- **URL:** https://diagrams.free  
- **Deploy:** push to `master` → GitHub Actions → build → GitHub Pages ([`.github/workflows/deploy-github-pages.yml`](.github/workflows/deploy-github-pages.yml))  
- **Vite `base`:** `/` (custom apex domain)  
- **Production env:** `.env.production` — scene vault on, official Excalidraw backends empty, GA4 (`G-H31J97S7ZC`) when tracking enabled, diagrams.free branding  

Details: [docs/github-pages-hosting.md](docs/github-pages-hosting.md).

---

## Development workflow

1. **Fork features** — work in `excalidraw-app/` (vault, Drive, branding, menus).
2. **Editor core** — work in `packages/*` only when changing shared library behavior.
3. **Testing** — run `yarn test:update` before committing; `yarn test:typecheck` for TypeScript.
4. **Formatting** — `yarn fix` for lint/format.

### Commands

```bash
yarn install
yarn start                    # dev server (see VITE_APP_PORT in .env.development)
yarn test:typecheck
yarn test:update
yarn fix
yarn build:app:docker         # production build (CI uses this)
```

Optional local overrides in `.env.development.local` (not committed), e.g. `VITE_APP_SCENE_VAULT=true`, `VITE_APP_GOOGLE_DRIVE=true` with Google client ID.

If `yarn install` fails with `ENOSPC`, set `TMPDIR` and `YARN_CACHE_FOLDER` to a writable path (see [README.md](README.md)).

---

## Architecture notes

- **Yarn workspaces** monorepo; internal packages use path aliases (see `vitest.config.mts`).
- **Build:** esbuild for packages, Vite for the app.
- **TypeScript** throughout with strict configuration.
- **Attribution:** MIT upstream code retained with [NOTICE](./NOTICE); product identity is **diagrams.free**, not Excalidraw.

---

## Key documentation index

| Topic | Doc |
|-------|-----|
| Scene vault design | [docs/scene-vault-design.md](docs/scene-vault-design.md) |
| Google Drive sync/share plan | [docs/google-drive-sync-and-share-plan.md](docs/google-drive-sync-and-share-plan.md) |
| GitHub Pages / domain | [docs/github-pages-hosting.md](docs/github-pages-hosting.md) |
| Branding & IP clearance | [docs/diagrams-free-branding-and-ip-clearance.md](docs/diagrams-free-branding-and-ip-clearance.md) |
| Privacy policy (GA4, Drive, local data) | [public/privacy/index.html](public/privacy/index.html) |
| GA4 product analytics plan | [docs/ga4-analytics-plan.md](docs/ga4-analytics-plan.md) |
| Contact us / feedback form | [docs/contact-us-plan.md](docs/contact-us-plan.md) · `clasp_projects/diagrams-free-contact/` |
| Shape libraries | [docs/libraries-overview.md](docs/libraries-overview.md) |
| Upstream editor development | [docs.excalidraw.com](https://docs.excalidraw.com/docs/introduction/development) |

Support: [support@diagrams.free](mailto:support@diagrams.free). Issues: [github.com/konashevich/diagrams-free](https://github.com/konashevich/diagrams-free).

---

## Google Cloud (Drive OAuth)

| Field | Value |
|-------|-------|
| Project ID | `diagrams-free` |
| Project number | `658308114676` |
| Console account | `konashevich@gmail.com` |
