import { useCallback, useEffect, useState } from "react";

import DialogActionButton from "@excalidraw/excalidraw/components/DialogActionButton";
import { helpIcon } from "@excalidraw/excalidraw/components/icons";
import { Tooltip } from "@excalidraw/excalidraw/components/Tooltip";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import {
  driveSyncService,
  driveAccessRefreshFailedMessage,
  formatDriveMergeSuccessMessage,
  getDriveLastPullAt,
  getDriveLastPushAt,
  getDriveLastSyncAt,
  getGoogleAccountEmail,
  hasValidAccessToken,
  warmDriveAccessToken,
  isDriveAccessRefreshError,
  isDriveAutoSyncEnabled,
  isGoogleDriveEnabled,
  isSignedInToGoogle,
  setDriveAutoSyncEnabled,
  setDriveLastSyncAt,
  signInWithGoogle,
  signOutFromGoogle,
  withDriveAccess,
} from "../google-drive";
import { useDriveSessionMonitor } from "./useDriveSessionMonitor";
import { runDriveMergeNow, signInAndMergeDrive } from "./useDriveAutoMerge";

type Props = {
  excalidrawAPI: ExcalidrawImperativeAPI;
  disabled?: boolean;
  onSyncComplete: () => void;
  confirmActiveSceneReload?: () => Promise<boolean>;
  onMergeSuccess?: (message: string) => void;
};

const DRIVE_INFO_TOOLTIP =
  "Back up and merge My scenes with your Google Drive under diagrams.free/vault/. Returning to this tab or clicking Sync merges changes from other devices. Auto-backup only controls pushing edits to Drive.";

const formatSyncTime = (timestamp: number | null): string => {
  if (!timestamp) {
    return "Never";
  }
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return "";
  }
};

const driveAccountStatus = (
  signedIn: boolean,
  email: string | null,
): string => {
  if (!signedIn) {
    return "Not signed in";
  }
  return email ? `Connected as ${email}` : "Connected";
};

export const GoogleDrivePanel = ({
  excalidrawAPI,
  disabled,
  onSyncComplete,
  confirmActiveSceneReload,
  onMergeSuccess,
}: Props) => {
  const [signedIn, setSignedIn] = useState(isSignedInToGoogle());
  const [sessionReady, setSessionReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastPushAt, setLastPushAt] = useState<number | null>(() =>
    getDriveLastPushAt(),
  );
  const [lastPullAt, setLastPullAt] = useState<number | null>(() =>
    getDriveLastPullAt(),
  );
  const [autoSync, setAutoSync] = useState(isDriveAutoSyncEnabled());

  const onSessionReadyChange = useCallback((ready: boolean) => {
    setSessionReady(ready);
  }, []);

  useDriveSessionMonitor(onSessionReadyChange);

  const refreshTimestamps = useCallback(() => {
    setLastPushAt(getDriveLastPushAt() ?? getDriveLastSyncAt());
    setLastPullAt(getDriveLastPullAt());
  }, []);

  const refreshAccount = useCallback(async () => {
    if (!isSignedInToGoogle()) {
      setSignedIn(false);
      setSessionReady(false);
      setEmail(null);
      return;
    }
    setSignedIn(true);
    await warmDriveAccessToken();
    setSessionReady(hasValidAccessToken());
    const accountEmail = await getGoogleAccountEmail();
    setEmail(accountEmail ?? null);
    refreshTimestamps();
  }, [refreshTimestamps]);

  useEffect(() => {
    if (!isGoogleDriveEnabled()) {
      return;
    }
    void refreshAccount();
  }, [refreshAccount]);

  if (!isGoogleDriveEnabled()) {
    return null;
  }

  const applyMergeResult = (syncedAt: number, message?: string) => {
    setLastPushAt(syncedAt);
    setLastPullAt(syncedAt);
    setDriveLastSyncAt(syncedAt);
    refreshTimestamps();
    onSyncComplete();
    if (message) {
      onMergeSuccess?.(message);
    }
  };

  const runMerge = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await runDriveMergeNow(
        excalidrawAPI,
        confirmActiveSceneReload,
      );
      setSessionReady(true);
      applyMergeResult(
        result.syncedAt,
        formatDriveMergeSuccessMessage(result),
      );
    } catch (err) {
      console.error("[google-drive]", err);
      if (isDriveAccessRefreshError(err)) {
        setSessionReady(false);
        setError(driveAccessRefreshFailedMessage);
      } else {
        setError(
          err instanceof Error ? err.message : "Google Drive sync failed.",
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const runBackupOnly = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await withDriveAccess(async () => {
        const { flushVaultSync } = await import("../scene-vault/vaultSync");
        await flushVaultSync(excalidrawAPI, { skipDrive: true });
        return driveSyncService.backupVaultToDrive();
      });
      setSessionReady(true);
      applyMergeResult(result.syncedAt);
    } catch (err) {
      console.error("[google-drive]", err);
      if (isDriveAccessRefreshError(err)) {
        setSessionReady(false);
        setError(driveAccessRefreshFailedMessage);
      } else {
        setError(
          err instanceof Error ? err.message : "Google Drive backup failed.",
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      const { session, result } = await signInAndMergeDrive(
        excalidrawAPI,
        confirmActiveSceneReload,
      );
      setSignedIn(true);
      setSessionReady(true);
      setEmail(session.email ?? null);
      applyMergeResult(
        result.syncedAt,
        formatDriveMergeSuccessMessage(result),
      );
    } catch (err) {
      console.error("[google-drive]", err);
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleReconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      const session = await signInWithGoogle({ forceConsent: true });
      setSignedIn(true);
      setSessionReady(true);
      setEmail(session.email ?? null);
    } catch (err) {
      console.error("[google-drive]", err);
      setError(err instanceof Error ? err.message : "Google reconnect failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = () => {
    void signOutFromGoogle().then(() => {
      setSignedIn(false);
      setSessionReady(false);
      setEmail(null);
      setError(null);
    });
  };

  const isDisabled = disabled || busy;
  const autoSyncPaused = signedIn && !sessionReady;

  return (
    <section className="scene-vault-dialog__drive" aria-label="Google Drive backup">
      <div className="scene-vault-dialog__drive-header">
        <div className="scene-vault-dialog__drive-heading">
          <h3 className="scene-vault-dialog__drive-title">Google Drive</h3>
          <Tooltip label={DRIVE_INFO_TOOLTIP} long>
            <button
              type="button"
              className="scene-vault-dialog__drive-info"
              aria-label="About Google Drive backup"
            >
              {helpIcon}
            </button>
          </Tooltip>
        </div>
        <span className="scene-vault-dialog__drive-status">
          {driveAccountStatus(signedIn, email)}
        </span>
      </div>

      {signedIn && !sessionReady ? (
        <p className="scene-vault-dialog__drive-hint">
          Google may ask you to confirm when you sync or share.
        </p>
      ) : null}

      {error ? (
        <p className="scene-vault-dialog__error" role="alert">
          {error}
        </p>
      ) : null}

      {signedIn ? (
        <details className="scene-vault-dialog__drive-sync-report">
          <summary>Sync report</summary>
          <p className="scene-vault-dialog__drive-meta">
            Last backed up to Drive: {formatSyncTime(lastPushAt)}
          </p>
          <p className="scene-vault-dialog__drive-meta">
            Last merged from Drive: {formatSyncTime(lastPullAt)}
          </p>
        </details>
      ) : null}

      {signedIn ? (
        <>
          <label className="scene-vault-dialog__drive-autosync">
            <input
              type="checkbox"
              checked={autoSync}
              disabled={isDisabled || autoSyncPaused}
              onChange={(event) => {
                const enabled = event.target.checked;
                setAutoSync(enabled);
                setDriveAutoSyncEnabled(enabled);
              }}
            />
            Automatically back up to Drive after edits
          </label>
          {autoSyncPaused ? (
            <>
              <p className="scene-vault-dialog__drive-hint">
                Auto-backup is paused until you sync once to refresh Google
                access.
              </p>
              <DialogActionButton
                label="Reconnect Google"
                onClick={handleReconnect}
                disabled={isDisabled}
              />
            </>
          ) : null}
        </>
      ) : null}

      <div className="scene-vault-dialog__drive-actions">
        {!signedIn ? (
          <DialogActionButton
            label="Sign in with Google"
            onClick={handleSignIn}
            disabled={isDisabled}
          />
        ) : (
          <>
            <DialogActionButton
              label="Sync now"
              onClick={() => void runMerge()}
              disabled={isDisabled}
            />
            <DialogActionButton
              label="Back up only"
              onClick={() => void runBackupOnly()}
              disabled={isDisabled}
            />
            <DialogActionButton
              label="Sign out"
              onClick={handleSignOut}
              disabled={isDisabled}
            />
          </>
        )}
      </div>
    </section>
  );
};
