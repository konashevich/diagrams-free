import { useCallback, useEffect, useState } from "react";

import { useAtomValue } from "../app-jotai";
import { sceneVaultListRevisionAtom } from "../scene-vault/vaultState";

import {
  computeDriveSyncStatus,
  getCachedRemoteManifestAt,
  invalidateDriveRemoteManifestCache,
  peekDriveRemoteManifest,
} from "../google-drive/driveSyncStatus";
import { getDriveRemoteManifestAt } from "../google-drive";
import { isGoogleDriveEnabled } from "../google-drive";

import type { DriveSyncStatus } from "../google-drive/types";

const REMOTE_PEEK_INTERVAL_MS = 60_000;

export const useDriveSyncStatus = (options?: {
  isSyncing?: boolean;
}): DriveSyncStatus => {
  const listRevision = useAtomValue(sceneVaultListRevisionAtom);
  const [remoteManifestAt, setRemoteManifestAt] = useState<number | null>(null);

  const refreshRemote = useCallback(async () => {
    if (!isGoogleDriveEnabled()) {
      return;
    }
    const remoteAt = await peekDriveRemoteManifest();
    setRemoteManifestAt(remoteAt);
  }, []);

  useEffect(() => {
    invalidateDriveRemoteManifestCache();
    setRemoteManifestAt(
      getDriveRemoteManifestAt() ?? getCachedRemoteManifestAt(),
    );
    void refreshRemote();
    const interval = window.setInterval(() => {
      void refreshRemote();
    }, REMOTE_PEEK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshRemote();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshRemote, listRevision]);

  return computeDriveSyncStatus({
    isSyncing: options?.isSyncing,
    remoteManifestAt,
  });
};
