import {
  getDriveLastPushRevision,
  getDriveRemoteManifestAt,
  getVaultContentRevision,
} from "./constants";
import { hasValidAccessToken, isGoogleDriveLinked } from "./auth";
import { peekRemoteManifestUpdatedAt } from "./api";

import type { DriveSyncStatus } from "./types";

let remotePeekInFlight: Promise<number | null> | null = null;
let cachedRemoteManifestAt: number | null = null;

export const peekDriveRemoteManifest = async (): Promise<number | null> => {
  if (!isGoogleDriveLinked() || !hasValidAccessToken()) {
    return null;
  }
  if (!remotePeekInFlight) {
    remotePeekInFlight = peekRemoteManifestUpdatedAt()
      .then((value) => {
        cachedRemoteManifestAt = value;
        return value;
      })
      .catch(() => null)
      .finally(() => {
        remotePeekInFlight = null;
      });
  }
  return remotePeekInFlight;
};

export const getCachedRemoteManifestAt = (): number | null =>
  cachedRemoteManifestAt;

export const invalidateDriveRemoteManifestCache = (): void => {
  remotePeekInFlight = null;
  cachedRemoteManifestAt = getDriveRemoteManifestAt();
};

export const computeDriveSyncStatus = (options?: {
  isSyncing?: boolean;
  remoteManifestAt?: number | null;
}): DriveSyncStatus => {
  if (options?.isSyncing) {
    return "syncing";
  }
  if (!isGoogleDriveLinked()) {
    return "paused";
  }
  if (!hasValidAccessToken()) {
    return "paused";
  }

  const lastKnownRemote = getDriveRemoteManifestAt();
  const peekedRemote = options?.remoteManifestAt ?? cachedRemoteManifestAt;

  if (
    peekedRemote != null &&
    (lastKnownRemote == null || peekedRemote > lastKnownRemote)
  ) {
    return "updates_available";
  }

  const vaultRevision = getVaultContentRevision();
  const lastPushRevision = getDriveLastPushRevision();
  if (vaultRevision > lastPushRevision) {
    return "stale";
  }

  return "synced";
};
