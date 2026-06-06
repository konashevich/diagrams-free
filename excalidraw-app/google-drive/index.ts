export {
  DEFAULT_DRIVE_ROOT_FOLDER,
  DRIVE_FILE_SCOPE,
  getDriveLastSyncAt,
  getDriveRootFolderName,
  getGoogleApiKey,
  getGoogleClientId,
  isDriveAutoSyncEnabled,
  isGoogleDriveEnabled,
  setDriveAutoSyncEnabled,
  setDriveLastSyncAt,
} from "./constants";

export type {
  DriveAuthSession,
  DriveFolderIds,
  DriveManifest,
  DriveManifestSceneEntry,
  DriveSyncResult,
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
  isGoogleDriveLinked,
  isSignedInToGoogle,
  signInWithGoogle,
  signOutFromGoogle,
} from "./auth";

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
  flushDriveVaultSync,
  scheduleDriveVaultSync,
} from "./driveVaultSync";
