/// <reference types="vite-plugin-pwa/vanillajs" />
/// <reference types="vite-plugin-pwa/info" />
/// <reference types="vite-plugin-svgr/client" />
interface ImportMetaEnv {
  // The port to run the dev server
  VITE_APP_PORT: string;

  VITE_APP_BACKEND_V2_GET_URL: string;
  VITE_APP_BACKEND_V2_POST_URL: string;

  // collaboration WebSocket server (https: string
  VITE_APP_WS_SERVER_URL: string;

  // set this only if using the collaboration workflow we use on excalidraw.com
  VITE_APP_PORTAL_URL: string;
  VITE_APP_AI_BACKEND: string;

  VITE_APP_FIREBASE_CONFIG: string;

  // whether to disable live reload / HMR. Usuaully what you want to do when
  // debugging Service Workers.
  VITE_APP_DEV_DISABLE_LIVE_RELOAD: string;

  VITE_APP_DISABLE_SENTRY: string;

  // Set this flag to false if you want to open the overlay by default
  VITE_APP_COLLAPSE_OVERLAY: string;

  // Enable eslint in dev server
  VITE_APP_ENABLE_ESLINT: string;

  // Enable PWA in dev server
  VITE_APP_ENABLE_PWA: string;

  VITE_APP_GIT_SHA: string;

  /** Enable local multi-canvas scene vault (diagrams-free fork). Must be "true". */
  VITE_APP_SCENE_VAULT: string;

  VITE_APP_SITE_URL: string;
  VITE_APP_GITHUB_REPO: string;

  /** Google Drive vault backup (diagrams-free). Requires client ID. */
  VITE_APP_GOOGLE_DRIVE: string;
  VITE_APP_GOOGLE_CLIENT_ID: string;
  VITE_APP_GOOGLE_API_KEY: string;
  VITE_APP_GOOGLE_DRIVE_FOLDER: string;
  /** Cloudflare Worker OAuth proxy (e.g. https://api.diagrams.free). */
  VITE_APP_GOOGLE_OAUTH_PROXY_URL: string;

  VITE_APP_ENABLE_TRACKING: string;
  /** Google Analytics 4 measurement ID (e.g. G-XXXXXXXXXX). */
  VITE_APP_GA_MEASUREMENT_ID: string;

  MODE: string;

  DEV: string;
  PROD: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
