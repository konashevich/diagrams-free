import { debounce } from "@excalidraw/common";

import {
  isDriveAutoSyncEnabled,
  isGoogleDriveEnabled,
  setDriveLastSyncAt,
} from "./constants";
import { notifyDriveAutoSyncFailed } from "./driveAutoSyncNotify";
import { driveSyncService } from "./DriveSyncService";
import { getAccessToken, isGoogleDriveLinked } from "./auth";
import { DriveApiError } from "./errors";

const DRIVE_SYNC_DEBOUNCE_MS = 2500;

const debouncedDriveBackup = debounce(() => {
  if (
    !isGoogleDriveEnabled() ||
    !isGoogleDriveLinked() ||
    !isDriveAutoSyncEnabled() ||
    !getAccessToken()
  ) {
    return;
  }
  void driveSyncService
    .backupVaultToDrive()
    .then((result) => {
      setDriveLastSyncAt(result.syncedAt);
    })
    .catch((error) => {
      console.error("[google-drive] auto-sync failed:", error);
      if (error instanceof DriveApiError) {
        notifyDriveAutoSyncFailed();
      }
    });
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
    !isDriveAutoSyncEnabled() ||
    !getAccessToken()
  ) {
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
