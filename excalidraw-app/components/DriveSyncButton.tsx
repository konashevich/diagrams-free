import { useState } from "react";

import { Button } from "@excalidraw/excalidraw";
import { RetryIcon } from "@excalidraw/excalidraw/components/icons";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import {
  driveAccessRefreshFailedMessage,
  formatDriveMergeSuccessMessage,
  isDriveAccessRefreshError,
  isGoogleDriveEnabled,
} from "../google-drive";

import { GoogleDriveBwIcon } from "./icons/GoogleDriveBwIcon";
import {
  runDriveMergeNow,
  signInAndMergeDrive,
} from "./useDriveAutoMerge";
import { useDriveSyncStatus } from "./useDriveSyncStatus";
import { useGoogleDriveLinked } from "./useGoogleDriveLinked";

import "./DriveSyncButton.scss";

type Props = {
  excalidrawAPI: ExcalidrawImperativeAPI;
  confirmActiveSceneReload?: () => Promise<boolean>;
  onError?: (message: string) => void;
  onSuccess?: (message: string) => void;
};

const statusLabel = (status: ReturnType<typeof useDriveSyncStatus>): string => {
  switch (status) {
    case "syncing":
      return "Syncing with Google Drive…";
    case "stale":
      return "Local changes not backed up to Google Drive — click to sync";
    case "updates_available":
      return "Updates available from Google Drive — click to sync";
    case "paused":
      return "Google Drive sync paused — click to reconnect";
    default:
      return "Synced with Google Drive — click to sync now";
  }
};

export const DriveSyncButton = ({
  excalidrawAPI,
  confirmActiveSceneReload,
  onError,
  onSuccess,
}: Props) => {
  const [isBusy, setIsBusy] = useState(false);
  const linked = useGoogleDriveLinked();
  const status = useDriveSyncStatus({ isSyncing: isBusy && linked });

  if (!isGoogleDriveEnabled()) {
    return null;
  }

  const handleSignIn = () => {
    if (isBusy) {
      return;
    }
    setIsBusy(true);
    void signInAndMergeDrive(excalidrawAPI, confirmActiveSceneReload)
      .then(({ result }) => {
        onSuccess?.(formatDriveMergeSuccessMessage(result));
      })
      .catch((error) => {
        console.error("[google-drive] sign-in from toolbar", error);
        if (isDriveAccessRefreshError(error)) {
          onError?.(driveAccessRefreshFailedMessage);
        } else {
          onError?.(
            error instanceof Error ? error.message : "Google sign-in failed.",
          );
        }
      })
      .finally(() => {
        setIsBusy(false);
      });
  };

  const handleSync = () => {
    if (isBusy || status === "syncing") {
      return;
    }
    setIsBusy(true);
    void runDriveMergeNow(excalidrawAPI, confirmActiveSceneReload)
      .then((result) => {
        onSuccess?.(formatDriveMergeSuccessMessage(result));
      })
      .catch((error) => {
        console.error("[google-drive] manual sync", error);
        if (isDriveAccessRefreshError(error)) {
          onError?.(driveAccessRefreshFailedMessage);
        } else {
          onError?.(
            error instanceof Error ? error.message : "Google Drive sync failed.",
          );
        }
      })
      .finally(() => {
        setIsBusy(false);
      });
  };

  if (!linked) {
    return (
      <Button
        type="button"
        className="drive-sync-button drive-sync-button--sign-in"
        aria-label="Sign in with Google to sync My scenes"
        title="Sign in with Google to sync My scenes"
        onSelect={handleSignIn}
        disabled={isBusy}
      >
        <GoogleDriveBwIcon />
      </Button>
    );
  }

  return (
    <Button
      type="button"
      className={`drive-sync-button drive-sync-button--${status}`}
      aria-label={statusLabel(status)}
      title={statusLabel(status)}
      onSelect={handleSync}
      disabled={status === "syncing" || isBusy}
    >
      {RetryIcon}
    </Button>
  );
};
