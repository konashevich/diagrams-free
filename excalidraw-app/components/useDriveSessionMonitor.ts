import { useEffect } from "react";

import {
  hasValidAccessToken,
  initDriveAuth,
  isGoogleDriveEnabled,
} from "../google-drive";
import { readSessionExpiresAtMs } from "../google-drive/authSessionStore";

/** Keep session-ready UI in sync when tokens expire or the tab becomes visible again. */
export const useDriveSessionMonitor = (
  onSessionReadyChange: (ready: boolean) => void,
): void => {
  useEffect(() => {
    if (!isGoogleDriveEnabled()) {
      return;
    }

    let expiryTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleExpiryCheck = () => {
      if (expiryTimer) {
        clearTimeout(expiryTimer);
        expiryTimer = undefined;
      }
      const expiresAt = readSessionExpiresAtMs();
      if (!expiresAt || expiresAt <= Date.now()) {
        return;
      }
      expiryTimer = setTimeout(() => {
        onSessionReadyChange(hasValidAccessToken());
      }, expiresAt - Date.now() + 100);
    };

    const sync = async () => {
      await initDriveAuth();
      onSessionReadyChange(hasValidAccessToken());
      scheduleExpiryCheck();
    };

    void sync();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void sync();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (expiryTimer) {
        clearTimeout(expiryTimer);
      }
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [onSessionReadyChange]);
};
