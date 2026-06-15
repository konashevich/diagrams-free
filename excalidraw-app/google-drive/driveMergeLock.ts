import type { DriveMergeResult } from "./types";

let mergeInFlight: Promise<DriveMergeResult> | null = null;
let syncBusy = false;

export const isDriveSyncBusy = (): boolean => syncBusy;

/** One vault merge at a time — prevents sign-in + auto-merge + peek from stampeding Drive. */
export const runDriveMergeSerialized = <T extends DriveMergeResult>(
  fn: () => Promise<T>,
): Promise<T> => {
  if (mergeInFlight) {
    return mergeInFlight as Promise<T>;
  }
  syncBusy = true;
  mergeInFlight = fn().finally(() => {
    mergeInFlight = null;
    syncBusy = false;
  }) as Promise<DriveMergeResult>;
  return mergeInFlight as Promise<T>;
};
