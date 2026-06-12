/** Google Drive sync — gated by env (see docs/google-oauth/README.md). */

export const GOOGLE_DRIVE_ENV_KEY = "VITE_APP_GOOGLE_DRIVE";
export const GOOGLE_CLIENT_ID_ENV_KEY = "VITE_APP_GOOGLE_CLIENT_ID";
export const GOOGLE_OAUTH_PROXY_URL_ENV_KEY = "VITE_APP_GOOGLE_OAUTH_PROXY_URL";
export const GOOGLE_API_KEY_ENV_KEY = "VITE_APP_GOOGLE_API_KEY";
export const GOOGLE_DRIVE_FOLDER_ENV_KEY = "VITE_APP_GOOGLE_DRIVE_FOLDER";

export const DEFAULT_DRIVE_ROOT_FOLDER = "diagrams.free";

export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

/** Non-sensitive; enables account email + login_hint for silent re-auth. */
export const GOOGLE_OPENID_SCOPES = "openid email profile";

export const DRIVE_OAUTH_SCOPES = `${DRIVE_FILE_SCOPE} ${GOOGLE_OPENID_SCOPES}`;

export const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";

export const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";

/** Multipart/resumable uploads must use the upload host, not drive/v3. */
export const DRIVE_UPLOAD_API_BASE =
  "https://www.googleapis.com/upload/drive/v3";

/** Drive accepts standard MIME types; excalidraw JSON is stored as application/json. */
export const DRIVE_FILE_MIME_TYPE = "application/json";

export const DRIVE_MANIFEST_VERSION = 1;

export const DRIVE_FOLDER_CACHE_KEY = "diagrams-free:drive-folder-ids-v3";

/** Google OAuth access token (~1h); stored in localStorage to survive PWA restarts. */
export const DRIVE_TOKEN_STORAGE_KEY = "diagrams-free:google-access-token";

export const DRIVE_TOKEN_EXPIRY_STORAGE_KEY =
  "diagrams-free:google-access-token-expiry";

/** Persists across browser sessions — user granted Drive access for this app. */
export const DRIVE_LINKED_STORAGE_KEY = "diagrams-free:google-drive-linked";

export const DRIVE_ACCOUNT_EMAIL_STORAGE_KEY =
  "diagrams-free:google-account-email";

/** Default on when signed in; user can disable in vault panel. */
export const DRIVE_AUTO_SYNC_STORAGE_KEY = "diagrams-free:drive-auto-sync";

export const DRIVE_LAST_SYNC_STORAGE_KEY = "diagrams-free:drive-last-sync-at";

export const DRIVE_LAST_PUSH_AT_STORAGE_KEY = "diagrams-free:drive-last-push-at";

export const DRIVE_LAST_PULL_AT_STORAGE_KEY = "diagrams-free:drive-last-pull-at";

export const DRIVE_REMOTE_MANIFEST_AT_STORAGE_KEY =
  "diagrams-free:drive-remote-manifest-at";

export const DRIVE_LAST_PUSH_REVISION_STORAGE_KEY =
  "diagrams-free:drive-last-push-revision";

export const VAULT_CONTENT_REVISION_STORAGE_KEY =
  "diagrams-free:vault-content-revision";

export const getDriveRootFolderName = (): string =>
  import.meta.env.VITE_APP_GOOGLE_DRIVE_FOLDER?.trim() ||
  DEFAULT_DRIVE_ROOT_FOLDER;

export const getGoogleClientId = (): string | undefined =>
  import.meta.env.VITE_APP_GOOGLE_CLIENT_ID?.trim() || undefined;

export const getGoogleOAuthProxyUrl = (): string | undefined =>
  import.meta.env.VITE_APP_GOOGLE_OAUTH_PROXY_URL?.trim() || undefined;

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

const readNumericStorage = (key: string): number | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = localStorage.getItem(key);
  if (!raw) {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

const writeNumericStorage = (key: string, value: number): void => {
  localStorage.setItem(key, String(value));
};

export const getDriveLastPushAt = (): number | null =>
  readNumericStorage(DRIVE_LAST_PUSH_AT_STORAGE_KEY);

export const setDriveLastPushAt = (timestamp: number): void => {
  writeNumericStorage(DRIVE_LAST_PUSH_AT_STORAGE_KEY, timestamp);
};

export const getDriveLastPullAt = (): number | null =>
  readNumericStorage(DRIVE_LAST_PULL_AT_STORAGE_KEY);

export const setDriveLastPullAt = (timestamp: number): void => {
  writeNumericStorage(DRIVE_LAST_PULL_AT_STORAGE_KEY, timestamp);
};

export const getDriveRemoteManifestAt = (): number | null =>
  readNumericStorage(DRIVE_REMOTE_MANIFEST_AT_STORAGE_KEY);

export const setDriveRemoteManifestAt = (timestamp: number): void => {
  writeNumericStorage(DRIVE_REMOTE_MANIFEST_AT_STORAGE_KEY, timestamp);
};

export const getDriveLastPushRevision = (): number =>
  readNumericStorage(DRIVE_LAST_PUSH_REVISION_STORAGE_KEY) ?? 0;

export const setDriveLastPushRevision = (revision: number): void => {
  writeNumericStorage(DRIVE_LAST_PUSH_REVISION_STORAGE_KEY, revision);
};

export const getVaultContentRevision = (): number =>
  readNumericStorage(VAULT_CONTENT_REVISION_STORAGE_KEY) ?? 0;

export const incrementVaultContentRevision = (): number => {
  const next = getVaultContentRevision() + 1;
  writeNumericStorage(VAULT_CONTENT_REVISION_STORAGE_KEY, next);
  return next;
};
