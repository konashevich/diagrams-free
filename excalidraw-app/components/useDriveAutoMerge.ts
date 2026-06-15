import { debounce } from "@excalidraw/common";
import { useEffect, useRef } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { syncDonateReminderWithDrive } from "../donate/reminder/donateReminderService";
import { isDonateEnabled } from "../donate/donateConfig";
import {
  driveMergeService,
  getAccessToken,
  initDriveAuth,
  isGoogleDriveEnabled,
  isGoogleDriveLinked,
  notifyDriveAutoMergeSuccess,
  notifyDriveAutoMergeFailed,
  registerDriveLinkedHandler,
  runDriveMergeSerialized,
  signInWithGoogle,
  warmDriveAccessToken,
  withDriveAccess,
} from "../google-drive";

import type { DriveAuthSession, DriveMergeResult } from "../google-drive/types";

const AUTO_MERGE_INTERVAL_MS = 5 * 60 * 1000;

export type SignInAndMergeDriveResult = {
  session: DriveAuthSession;
  result: DriveMergeResult;
};

/** Same flow as My scenes → Sign in with Google, then merge vault with Drive. */
export const signInAndMergeDrive = async (
  excalidrawAPI: ExcalidrawImperativeAPI,
  confirmActiveSceneReload?: () => Promise<boolean>,
): Promise<SignInAndMergeDriveResult> => {
  const session = await signInWithGoogle();
  if (isDonateEnabled()) {
    void syncDonateReminderWithDrive();
  }
  const result = await runDriveMergeNow(excalidrawAPI, confirmActiveSceneReload);
  return { session, result };
};

type Options = {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  enabled: boolean;
};

export const useDriveAutoMerge = ({
  excalidrawAPI,
  enabled,
}: Options): void => {
  const lastMergeAtRef = useRef(0);
  const mergingRef = useRef(false);

  useEffect(() => {
    if (!enabled || !isGoogleDriveEnabled() || !excalidrawAPI) {
      return;
    }

    const runMerge = async (options?: { force?: boolean }) => {
      if (!isGoogleDriveLinked() || mergingRef.current) {
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
        await initDriveAuth();
        await warmDriveAccessToken();
        if (!isGoogleDriveLinked() || !getAccessToken()) {
          return;
        }
        const result = await withDriveAccess(() =>
          runDriveMergeSerialized(() =>
            driveMergeService.mergeVaultWithDrive({ excalidrawAPI }),
          ),
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
        notifyDriveAutoMergeFailed();
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

    const unregisterLinked = registerDriveLinkedHandler(() => {
      void runMerge({ force: true });
    });

    void initDriveAuth().then(() => {
      if (isGoogleDriveLinked()) {
        void runMerge({ force: true });
      }
    });

    return () => {
      debouncedVisibleMerge.cancel();
      document.removeEventListener("visibilitychange", onVisible);
      unregisterLinked();
    };
  }, [enabled, excalidrawAPI]);
};

export const runDriveMergeNow = async (
  excalidrawAPI: ExcalidrawImperativeAPI,
  confirmActiveSceneReload?: () => Promise<boolean>,
) => {
  const result = await withDriveAccess(() =>
    runDriveMergeSerialized(() =>
      driveMergeService.mergeVaultWithDrive({
        excalidrawAPI,
        confirmActiveSceneReload,
      }),
    ),
  );
  return result;
};
