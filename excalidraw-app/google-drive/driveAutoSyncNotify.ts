const DRIVE_AUTO_SYNC_FAIL_MESSAGE =
  "Google Drive auto-sync failed. Open My scenes and use Backup now.";

let notifyAutoSyncFailed: (() => void) | null = null;

export const registerDriveAutoSyncNotifier = (fn: (() => void) | null): void => {
  notifyAutoSyncFailed = fn;
};

export const notifyDriveAutoSyncFailed = (): void => {
  notifyAutoSyncFailed?.();
};

export const driveAutoSyncFailToastMessage = (): string =>
  DRIVE_AUTO_SYNC_FAIL_MESSAGE;
