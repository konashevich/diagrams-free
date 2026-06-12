import { useState } from "react";

import { ToolButton } from "@excalidraw/excalidraw/components/ToolButton";
import { RetryIcon } from "@excalidraw/excalidraw/components/icons";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import {
  driveAccessRefreshFailedMessage,
  formatDriveMergeSuccessMessage,
  isDriveAccessRefreshError,
  isGoogleDriveEnabled,
  isGoogleDriveLinked,
} from "../google-drive";

import { runDriveMergeNow } from "./useDriveAutoMerge";
import { useDriveSyncStatus } from "./useDriveSyncStatus";

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
      return "Google Drive sync paused — sign in from My scenes";
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
  const [isSyncing, setIsSyncing] = useState(false);
  const status = useDriveSyncStatus({ isSyncing });

  if (!isGoogleDriveEnabled() || !isGoogleDriveLinked()) {
    return null;
  }

  const handleClick = () => {
    if (isSyncing) {
      return;
    }
    setIsSyncing(true);
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
        setIsSyncing(false);
      });
  };

  return (
    <ToolButton
      type="button"
      className={`drive-sync-button drive-sync-button--${status}`}
      aria-label={statusLabel(status)}
      title={statusLabel(status)}
      icon={RetryIcon}
      onClick={handleClick}
      selected={status === "stale" || status === "updates_available"}
    />
  );
};
