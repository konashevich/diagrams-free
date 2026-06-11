import { useCallback, useEffect, useState } from "react";

import DialogActionButton from "@excalidraw/excalidraw/components/DialogActionButton";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { syncDonateReminderWithDrive } from "../donate/reminder/donateReminderService";
import { isDonateEnabled } from "../donate/donateConfig";
import { flushVaultSync } from "../scene-vault/vaultSync";

import {
  DriveApiError,
  driveSyncService,
  ensureAccessToken,
  getDriveLastSyncAt,
  getGoogleAccountEmail,
  handleDriveAuthFailure,
  hasValidAccessToken,
  hydrateDriveAuthSession,
  isDriveAutoSyncEnabled,
  isGoogleDriveEnabled,
  isSignedInToGoogle,
  preloadGoogleDriveAuth,
  setDriveAutoSyncEnabled,
  setDriveLastSyncAt,
  signInWithGoogle,
  signOutFromGoogle,
} from "../google-drive";

type Props = {
  excalidrawAPI: ExcalidrawImperativeAPI;
  disabled?: boolean;
  onSyncComplete: () => void;
};

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

export const GoogleDrivePanel = ({
  excalidrawAPI,
  disabled,
  onSyncComplete,
}: Props) => {
  const [signedIn, setSignedIn] = useState(isSignedInToGoogle());
  const [sessionReady, setSessionReady] = useState(hasValidAccessToken());
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(() =>
    getDriveLastSyncAt(),
  );
  const [autoSync, setAutoSync] = useState(isDriveAutoSyncEnabled());

  const refreshAccount = useCallback(async () => {
    if (!isSignedInToGoogle()) {
      setSignedIn(false);
      setSessionReady(false);
      setEmail(null);
      return;
    }
    setSignedIn(true);
    await hydrateDriveAuthSession();
    setSessionReady(hasValidAccessToken());
    const accountEmail = await getGoogleAccountEmail();
    setEmail(accountEmail ?? null);
  }, []);

  useEffect(() => {
    if (!isGoogleDriveEnabled()) {
      return;
    }
    void preloadGoogleDriveAuth();
    void refreshAccount();
  }, [refreshAccount]);

  if (!isGoogleDriveEnabled()) {
    return null;
  }

  const run = async (action: () => Promise<{ syncedAt: number }>) => {
    setBusy(true);
    setError(null);
    try {
      await ensureAccessToken();
      setSessionReady(true);
      const result = await action();
      setLastSyncAt(result.syncedAt);
      setDriveLastSyncAt(result.syncedAt);
      onSyncComplete();
    } catch (err) {
      console.error("[google-drive]", err);
      if (err instanceof DriveApiError && err.status === 401) {
        handleDriveAuthFailure();
        try {
          await ensureAccessToken();
          setSessionReady(true);
          const result = await action();
          setLastSyncAt(result.syncedAt);
          setDriveLastSyncAt(result.syncedAt);
          onSyncComplete();
          const accountEmail = await getGoogleAccountEmail();
          setEmail(accountEmail ?? null);
          return;
        } catch (retryErr) {
          console.error("[google-drive] retry after 401", retryErr);
          setSignedIn(false);
          setSessionReady(false);
          setEmail(null);
          setError("Google sign-in expired. Please sign in again.");
        }
      } else {
        setError(
          err instanceof Error ? err.message : "Google Drive sync failed.",
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
      const session = await signInWithGoogle();
      setSignedIn(true);
      setSessionReady(true);
      setEmail(session.email ?? null);
      if (isDonateEnabled()) {
        void syncDonateReminderWithDrive();
      }
    } catch (err) {
      console.error("[google-drive]", err);
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = () => {
    signOutFromGoogle();
    setSignedIn(false);
    setSessionReady(false);
    setEmail(null);
    setError(null);
  };

  const handleBackup = () => {
    void run(async () => {
      await flushVaultSync(excalidrawAPI, { skipDrive: true });
      return driveSyncService.backupVaultToDrive();
    });
  };

  const handleRestore = () => {
    void run(async () => driveSyncService.restoreVaultFromDrive());
  };

  const isDisabled = disabled || busy;

  return (
    <section className="scene-vault-dialog__drive" aria-label="Google Drive backup">
      <h3 className="scene-vault-dialog__drive-title">Google Drive</h3>
      <p className="scene-vault-dialog__drive-hint">
        Back up My scenes to your Google Drive under{" "}
        <code>diagrams.free/</code>. Same Google account on another device can
        restore them.
      </p>

      {signedIn ? (
        <p className="scene-vault-dialog__drive-account">
          Connected{email ? ` as ${email}` : ""}
          {!sessionReady
            ? " — Google may ask you to confirm when you back up or share"
            : ""}
        </p>
      ) : (
        <p className="scene-vault-dialog__drive-account">Not signed in</p>
      )}

      {error ? (
        <p className="scene-vault-dialog__error" role="alert">
          {error}
        </p>
      ) : null}

      <p className="scene-vault-dialog__drive-meta">
        Last sync: {formatSyncTime(lastSyncAt)}
      </p>

      {signedIn ? (
        <label className="scene-vault-dialog__drive-autosync">
          <input
            type="checkbox"
            checked={autoSync}
            disabled={isDisabled}
            onChange={(event) => {
              const enabled = event.target.checked;
              setAutoSync(enabled);
              setDriveAutoSyncEnabled(enabled);
            }}
          />
          Auto-sync My scenes to Drive after edits
        </label>
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
              label="Backup now"
              onClick={handleBackup}
              disabled={isDisabled}
            />
            <DialogActionButton
              label="Restore from Drive"
              onClick={handleRestore}
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
