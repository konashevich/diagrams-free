export const PRODUCT_NAME = "diagrams.free";

export const SITE_URL =
  import.meta.env.VITE_APP_SITE_URL?.trim() || "https://diagrams.free";

export const GITHUB_REPO =
  import.meta.env.VITE_APP_GITHUB_REPO?.trim() ||
  "https://github.com/konashevich/excalidraw-save";

export const UPSTREAM_EXCALIDRAW_URL = "https://github.com/excalidraw/excalidraw";

/** Empty env disables the feature in production; dev/test keep upstream defaults. */
const isEnvFeatureEnabled = (value: string | undefined): boolean => {
  if (value?.trim()) {
    return true;
  }
  return !import.meta.env.PROD;
};

export const isPlusEnabled = (): boolean =>
  isEnvFeatureEnabled(import.meta.env.VITE_APP_PLUS_LP);

export const isOfficialShareBackendEnabled = (): boolean =>
  isEnvFeatureEnabled(import.meta.env.VITE_APP_BACKEND_V2_POST_URL);

export const isCollabBackendEnabled = (): boolean =>
  isEnvFeatureEnabled(import.meta.env.VITE_APP_WS_SERVER_URL);

export const isAIBackendEnabled = (): boolean =>
  isEnvFeatureEnabled(import.meta.env.VITE_APP_AI_BACKEND);

export const isOfficialLibraryEnabled = (): boolean =>
  isEnvFeatureEnabled(import.meta.env.VITE_APP_LIBRARY_URL);
