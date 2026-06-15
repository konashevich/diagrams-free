import type { DriveMergeResult } from "./types";

const DRIVE_AUTO_SYNC_FAIL_MESSAGE =
  "Google Drive auto-sync failed. Open My scenes and use Sync now.";

const DRIVE_AUTO_MERGE_FAIL_MESSAGE =
  "Google Drive background sync failed. Open My scenes and use Sync now.";

let notifyAutoSyncFailed: (() => void) | null = null;
let notifyAutoMergeSuccess: ((result: DriveMergeResult) => void) | null = null;
let notifyAutoMergeFailed: (() => void) | null = null;
let notifyActiveSceneNeedsReload: ((sceneId: string | null) => void) | null =
  null;

export const registerDriveAutoSyncNotifier = (fn: (() => void) | null): void => {
  notifyAutoSyncFailed = fn;
};

export const registerDriveAutoMergeSuccessNotifier = (
  fn: ((result: DriveMergeResult) => void) | null,
): void => {
  notifyAutoMergeSuccess = fn;
};

export const registerDriveAutoMergeFailedNotifier = (
  fn: (() => void) | null,
): void => {
  notifyAutoMergeFailed = fn;
};

export const registerDriveActiveSceneNeedsReloadNotifier = (
  fn: ((sceneId: string | null) => void) | null,
): void => {
  notifyActiveSceneNeedsReload = fn;
};

let notifyDriveLinkedHandler: (() => void) | null = null;

export const registerDriveLinkedHandler = (
  fn: (() => void) | null,
): (() => void) => {
  notifyDriveLinkedHandler = fn;
  return () => {
    if (notifyDriveLinkedHandler === fn) {
      notifyDriveLinkedHandler = null;
    }
  };
};

export const notifyDriveLinked = (): void => {
  notifyDriveLinkedHandler?.();
};

export const notifyDriveAutoSyncFailed = (): void => {
  notifyAutoSyncFailed?.();
};

export const notifyDriveAutoMergeSuccess = (result: DriveMergeResult): void => {
  notifyAutoMergeSuccess?.(result);
};

export const notifyDriveAutoMergeFailed = (): void => {
  notifyAutoMergeFailed?.();
};

export const notifyDriveActiveSceneNeedsReload = (
  sceneId: string | null,
): void => {
  notifyActiveSceneNeedsReload?.(sceneId);
};

export const driveAutoSyncFailToastMessage = (): string =>
  DRIVE_AUTO_SYNC_FAIL_MESSAGE;

export const driveAutoMergeFailToastMessage = (): string =>
  DRIVE_AUTO_MERGE_FAIL_MESSAGE;

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
    message += ". Reload the open scene using the banner above the canvas.";
  }
  return message;
};
