import type { DriveMergeResult } from "./types";

const DRIVE_AUTO_SYNC_FAIL_MESSAGE =
  "Google Drive auto-sync failed. Open My scenes and use Sync now.";

let notifyAutoSyncFailed: (() => void) | null = null;
let notifyAutoMergeSuccess: ((result: DriveMergeResult) => void) | null = null;

export const registerDriveAutoSyncNotifier = (fn: (() => void) | null): void => {
  notifyAutoSyncFailed = fn;
};

export const registerDriveAutoMergeSuccessNotifier = (
  fn: ((result: DriveMergeResult) => void) | null,
): void => {
  notifyAutoMergeSuccess = fn;
};

export const notifyDriveAutoSyncFailed = (): void => {
  notifyAutoSyncFailed?.();
};

export const notifyDriveAutoMergeSuccess = (result: DriveMergeResult): void => {
  notifyAutoMergeSuccess?.(result);
};

export const driveAutoSyncFailToastMessage = (): string =>
  DRIVE_AUTO_SYNC_FAIL_MESSAGE;

export const formatDriveMergeSuccessMessage = (
  result: DriveMergeResult,
): string => {
  const parts: string[] = [];
  if (result.pulled > 0) {
    parts.push(
      `${result.pulled} scene${result.pulled === 1 ? "" : "s"} updated from Drive`,
    );
  }
  if (result.pushed > 0) {
    parts.push(
      `${result.pushed} scene${result.pushed === 1 ? "" : "s"} backed up to Drive`,
    );
  }
  if (!parts.length) {
    return "My scenes are up to date with Google Drive.";
  }
  let message = parts.join("; ");
  if (result.activeSceneNeedsReload) {
    message +=
      ". The open scene was updated on Drive — use Sync in the toolbar to reload it.";
  }
  return message;
};
