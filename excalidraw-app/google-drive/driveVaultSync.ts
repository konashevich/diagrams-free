import { debounce } from "@excalidraw/common";

import {
  isDriveAutoSyncEnabled,
  isGoogleDriveEnabled,
  setDriveLastSyncAt,
} from "./constants";
import { notifyDriveAutoSyncFailed } from "./driveAutoSyncNotify";
import { driveSyncService } from "./DriveSyncService";
import { getAccessToken, isGoogleDriveLinked, tryRefreshAccessToken } from "./auth";
import { DriveApiError } from "./errors";

const DRIVE_SYNC_DEBOUNCE_MS = 2500;

const isDriveAutoSyncAuthError = (error: unknown): boolean =>
  error instanceof DriveApiError &&
  (error.status === 401 || error.status === 403);

const debouncedDriveBackup = debounce(() => {
  if (
    !isGoogleDriveEnabled() ||
    !isGoogleDriveLinked() ||
    !isDriveAutoSyncEnabled()
  ) {
    return;
  }
  void (async () => {
    if (!(await tryRefreshAccessToken()) || !getAccessToken()) {
      return;
    }
    return driveSyncService
    .backupVaultToDrive()
    .then((result) => {
      setDriveLastSyncAt(result.syncedAt);
    })
    .catch((error) => {
      console.error("[google-drive] auto-sync failed:", error);
      if (isDriveAutoSyncAuthError(error)) {
        notifyDriveAutoSyncFailed();
      }
    });
  })();
}, DRIVE_SYNC_DEBOUNCE_MS);

export const scheduleDriveVaultSync = (): void => {
  debouncedDriveBackup();
};

/** Flush debounced backup and run an immediate backup when Drive auto-sync is on. */
export const flushDriveVaultSync = async (): Promise<void> => {
  debouncedDriveBackup.flush();
  if (
    !isGoogleDriveEnabled() ||
    !isGoogleDriveLinked() ||
    !isDriveAutoSyncEnabled()
  ) {
    return;
  }
  if (!(await tryRefreshAccessToken()) || !getAccessToken()) {
    return;
  }
  try {
    const result = await driveSyncService.backupVaultToDrive();
    setDriveLastSyncAt(result.syncedAt);
  } catch (error) {
    console.error("[google-drive] flush backup failed:", error);
    if (error instanceof DriveApiError) {
      notifyDriveAutoSyncFailed();
    }
  }
};
