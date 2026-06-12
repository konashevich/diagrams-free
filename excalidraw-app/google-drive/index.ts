export {
  DEFAULT_DRIVE_ROOT_FOLDER,
  DRIVE_FILE_SCOPE,
  DRIVE_OAUTH_SCOPES,
  getDriveLastPullAt,
  getDriveLastPushAt,
  getDriveLastSyncAt,
  getDriveRemoteManifestAt,
  getDriveRootFolderName,
  getGoogleApiKey,
  getGoogleClientId,
  getGoogleOAuthProxyUrl,
  getVaultContentRevision,
  isDriveAutoSyncEnabled,
  isGoogleDriveEnabled,
  setDriveAutoSyncEnabled,
  setDriveLastPullAt,
  setDriveLastPushAt,
  setDriveLastSyncAt,
  setDriveRemoteManifestAt,
} from "./constants";

export type {
  DriveAuthSession,
  DriveFolderIds,
  DriveManifest,
  DriveManifestSceneEntry,
  DriveMergeResult,
  DriveSyncResult,
  DriveSyncStatus,
} from "./types";

export {
  DriveApiError,
  DriveAuthError,
  DriveNotConfiguredError,
} from "./errors";

export {
  driveRootFolderName,
  DRIVE_MANIFEST_FILENAME,
  driveSceneFilename,
} from "./paths";

export {
  ensureAccessToken,
  getAccessToken,
  getGoogleAccountEmail,
  handleDriveAuthFailure,
  hasValidAccessToken,
  hydrateDriveAuthSession,
  initDriveAuth,
  isGoogleDriveLinked,
  isSignedInToGoogle,
  preloadGoogleDriveAuth,
  signInWithGoogle,
  signOutFromGoogle,
  tryRefreshAccessToken,
  warmDriveAccessToken,
} from "./auth";

export { isOAuthProxyEnabled } from "./oauthProxy";

export {
  clearDriveFolderCache,
  ensureDriveFolderStructure,
  readDriveManifest,
  withDriveFolderRetry,
  writeDriveManifest,
} from "./api";

export {
  DriveSyncService,
  driveSyncService,
  isDriveSyncAvailable,
} from "./DriveSyncService";

export {
  DriveMergeService,
  driveMergeService,
} from "./DriveMergeService";
export type { DriveMergeOptions } from "./DriveMergeService";

export {
  computeDriveSyncStatus,
  getCachedRemoteManifestAt,
  invalidateDriveRemoteManifestCache,
  peekDriveRemoteManifest,
} from "./driveSyncStatus";

export {
  DriveShareService,
  driveShareService,
} from "./DriveShareService";
export type {
  DriveSharePermission,
  DriveShareResult,
} from "./DriveShareService";

export {
  buildShareUrl,
  isDriveShareLink,
  parseShareFileIdFromLocation,
} from "./shareLink";

export {
  driveAutoSyncFailToastMessage,
  formatDriveMergeSuccessMessage,
  notifyDriveAutoMergeSuccess,
  notifyDriveAutoSyncFailed,
  registerDriveAutoMergeSuccessNotifier,
  registerDriveAutoSyncNotifier,
} from "./driveAutoSyncNotify";

export {
  driveAccessRefreshFailedMessage,
  isDriveAccessRefreshError,
  withDriveAccess,
} from "./withDriveAccess";

export {
  flushDriveVaultSync,
  scheduleDriveVaultSync,
} from "./driveVaultSync";
