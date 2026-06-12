import { debounce } from "@excalidraw/common";
import { useEffect, useRef } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import {
  driveMergeService,
  isDriveAutoSyncEnabled,
  isGoogleDriveEnabled,
  isGoogleDriveLinked,
  notifyDriveAutoMergeSuccess,
  withDriveAccess,
} from "../google-drive";

const AUTO_MERGE_INTERVAL_MS = 5 * 60 * 1000;

type Options = {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  enabled: boolean;
  confirmActiveSceneReload?: () => Promise<boolean>;
};

export const useDriveAutoMerge = ({
  excalidrawAPI,
  enabled,
  confirmActiveSceneReload,
}: Options): void => {
  const lastMergeAtRef = useRef(0);
  const mergingRef = useRef(false);
  const confirmRef = useRef(confirmActiveSceneReload);
  confirmRef.current = confirmActiveSceneReload;

  useEffect(() => {
    if (!enabled || !isGoogleDriveEnabled() || !excalidrawAPI) {
      return;
    }

    const runMerge = async (options?: { force?: boolean }) => {
      if (
        !isGoogleDriveLinked() ||
        !isDriveAutoSyncEnabled() ||
        mergingRef.current
      ) {
        return;
      }
      const now = Date.now();
      if (
        !options?.force &&
        now - lastMergeAtRef.current < AUTO_MERGE_INTERVAL_MS
      ) {
        return;
      }
      mergingRef.current = true;
      try {
        const result = await withDriveAccess(() =>
          driveMergeService.mergeVaultWithDrive({
            excalidrawAPI,
            confirmActiveSceneReload: confirmRef.current,
          }),
        );
        lastMergeAtRef.current = Date.now();
        if (
          result.pulled > 0 ||
          result.pushed > 0 ||
          result.activeSceneNeedsReload
        ) {
          notifyDriveAutoMergeSuccess(result);
        }
      } catch (error) {
        console.error("[google-drive] auto-merge failed:", error);
      } finally {
        mergingRef.current = false;
      }
    };

    const debouncedVisibleMerge = debounce(() => {
      if (document.visibilityState === "visible") {
        void runMerge();
      }
    }, 2000);

    const onVisible = () => {
      debouncedVisibleMerge();
    };

    document.addEventListener("visibilitychange", onVisible);

    return () => {
      debouncedVisibleMerge.cancel();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, excalidrawAPI]);
};

export const runDriveMergeNow = async (
  excalidrawAPI: ExcalidrawImperativeAPI,
  confirmActiveSceneReload?: () => Promise<boolean>,
) => {
  const result = await withDriveAccess(() =>
    driveMergeService.mergeVaultWithDrive({
      excalidrawAPI,
      confirmActiveSceneReload,
    }),
  );
  return result;
};
