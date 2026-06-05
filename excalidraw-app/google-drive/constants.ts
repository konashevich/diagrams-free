/** Google Drive sync — gated by env (see docs/google-drive-sync-and-share-plan.md). */

export const GOOGLE_DRIVE_ENV_KEY = "VITE_APP_GOOGLE_DRIVE";
export const GOOGLE_CLIENT_ID_ENV_KEY = "VITE_APP_GOOGLE_CLIENT_ID";
export const GOOGLE_API_KEY_ENV_KEY = "VITE_APP_GOOGLE_API_KEY";
export const GOOGLE_DRIVE_FOLDER_ENV_KEY = "VITE_APP_GOOGLE_DRIVE_FOLDER";

export const DEFAULT_DRIVE_ROOT_FOLDER = "diagrams.free";

export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";

export const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";

export const DRIVE_MANIFEST_VERSION = 1;

export const DRIVE_FOLDER_CACHE_KEY = "diagrams-free:drive-folder-ids";

export const DRIVE_TOKEN_STORAGE_KEY = "diagrams-free:google-access-token";

export const DRIVE_TOKEN_EXPIRY_STORAGE_KEY =
  "diagrams-free:google-access-token-expiry";

/** Default on when signed in; user can disable in vault panel. */
export const DRIVE_AUTO_SYNC_STORAGE_KEY = "diagrams-free:drive-auto-sync";

export const DRIVE_LAST_SYNC_STORAGE_KEY = "diagrams-free:drive-last-sync-at";

export const getDriveRootFolderName = (): string =>
  import.meta.env.VITE_APP_GOOGLE_DRIVE_FOLDER?.trim() ||
  DEFAULT_DRIVE_ROOT_FOLDER;

export const getGoogleClientId = (): string | undefined =>
  import.meta.env.VITE_APP_GOOGLE_CLIENT_ID?.trim() || undefined;

export const getGoogleApiKey = (): string | undefined =>
  import.meta.env.VITE_APP_GOOGLE_API_KEY?.trim() || undefined;

export const isGoogleDriveEnabled = (): boolean =>
  import.meta.env.VITE_APP_GOOGLE_DRIVE === "true" && !!getGoogleClientId();

export const isDriveAutoSyncEnabled = (): boolean => {
  if (typeof window === "undefined") {
    return true;
  }
  return localStorage.getItem(DRIVE_AUTO_SYNC_STORAGE_KEY) !== "false";
};

export const setDriveAutoSyncEnabled = (enabled: boolean): void => {
  localStorage.setItem(
    DRIVE_AUTO_SYNC_STORAGE_KEY,
    enabled ? "true" : "false",
  );
};

export const getDriveLastSyncAt = (): number | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = localStorage.getItem(DRIVE_LAST_SYNC_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

export const setDriveLastSyncAt = (timestamp: number): void => {
  localStorage.setItem(DRIVE_LAST_SYNC_STORAGE_KEY, String(timestamp));
};
