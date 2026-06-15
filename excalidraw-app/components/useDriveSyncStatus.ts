import { debounce } from "@excalidraw/common";
import { useCallback, useEffect, useState } from "react";

import { useAtomValue } from "../app-jotai";
import { sceneVaultListRevisionAtom } from "../scene-vault/vaultState";

import {
  computeDriveSyncStatus,
  getCachedRemoteManifestAt,
  peekDriveRemoteManifest,
} from "../google-drive/driveSyncStatus";
import { isDriveSyncBusy } from "../google-drive/driveMergeLock";
import {
  getDriveRemoteManifestAt,
  isGoogleDriveEnabled,
  isGoogleDriveLinked,
} from "../google-drive";

import type { DriveSyncStatus } from "../google-drive/types";

const REMOTE_PEEK_INTERVAL_MS = 60_000;

export const useDriveSyncStatus = (options?: {
  isSyncing?: boolean;
}): DriveSyncStatus => {
  const listRevision = useAtomValue(sceneVaultListRevisionAtom);
  const [remoteManifestAt, setRemoteManifestAt] = useState<number | null>(null);

  const refreshRemote = useCallback(async () => {
    if (
      !isGoogleDriveEnabled() ||
      !isGoogleDriveLinked() ||
      isDriveSyncBusy()
    ) {
      return;
    }
    const remoteAt = await peekDriveRemoteManifest();
    setRemoteManifestAt(remoteAt);
  }, []);

  useEffect(() => {
    setRemoteManifestAt(
      getDriveRemoteManifestAt() ?? getCachedRemoteManifestAt(),
    );
    const debouncedRefresh = debounce(() => {
      void refreshRemote();
    }, 2500);
    debouncedRefresh();
    const interval = window.setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        isGoogleDriveLinked() &&
        !isDriveSyncBusy()
      ) {
        debouncedRefresh();
      }
    }, REMOTE_PEEK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        debouncedRefresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      debouncedRefresh.cancel();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshRemote, listRevision]);

  return computeDriveSyncStatus({
    isSyncing: options?.isSyncing,
    remoteManifestAt,
  });
};
