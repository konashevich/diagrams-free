import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { flushVaultSync } from "../scene-vault/vaultSync";
import { sceneVaultService } from "../scene-vault/SceneVaultService";
import { sceneVaultStore } from "../scene-vault/SceneVaultStore";

import {
  getVaultContentRevision,
  setDriveLastPullAt,
  setDriveLastPushAt,
  setDriveLastPushRevision,
  setDriveLastSyncAt,
  setDriveRemoteManifestAt,
} from "./constants";
import { driveSyncService } from "./DriveSyncService";
import { invalidateDriveRemoteManifestCache } from "./driveSyncStatus";
import { getAccessToken, isGoogleDriveLinked } from "./auth";
import { DriveAuthError } from "./errors";

import type { DriveMergeResult } from "./types";

export type DriveMergeOptions = {
  excalidrawAPI?: ExcalidrawImperativeAPI;
  /** When provided, manual sync may prompt before reloading the active scene. */
  confirmActiveSceneReload?: () => Promise<boolean>;
};

export class DriveMergeService {
  private assertReady(): void {
    if (!isGoogleDriveLinked()) {
      throw new DriveAuthError("Sign in with Google first.");
    }
    if (!getAccessToken()) {
      throw new DriveAuthError(
        "Google sign-in expired. Use Sync now or Sign in with Google.",
      );
    }
  }

  async mergeVaultWithDrive(
    options: DriveMergeOptions = {},
  ): Promise<DriveMergeResult> {
    this.assertReady();

    const { excalidrawAPI, confirmActiveSceneReload } = options;

    if (excalidrawAPI) {
      await flushVaultSync(excalidrawAPI, { skipDrive: true });
    }

    const { pull, push } = await driveSyncService.pullAndPushVault();

    const syncedAt = push.syncedAt;
    setDriveLastSyncAt(syncedAt);
    setDriveLastPullAt(syncedAt);
    setDriveRemoteManifestAt(syncedAt);
    invalidateDriveRemoteManifestCache();
    setDriveLastPushAt(syncedAt);
    setDriveLastPushRevision(getVaultContentRevision());

    let activeSceneNeedsReload: string | null = null;
    const activeSceneId = await sceneVaultStore.getActiveSceneId();
    if (
      excalidrawAPI &&
      activeSceneId &&
      pull.pulledSceneIds.includes(activeSceneId)
    ) {
      if (confirmActiveSceneReload) {
        const shouldReload = await confirmActiveSceneReload();
        if (shouldReload) {
          await sceneVaultService.openScene(excalidrawAPI, activeSceneId);
        } else {
          activeSceneNeedsReload = activeSceneId;
        }
      } else {
        activeSceneNeedsReload = activeSceneId;
      }
    }

    return {
      pulled: pull.restoredScenes,
      pushed: push.uploadedScenes,
      syncedAt,
      remoteManifestUpdatedAt: syncedAt,
      pulledSceneIds: pull.pulledSceneIds,
      activeSceneNeedsReload,
    };
  }
}

export const driveMergeService = new DriveMergeService();
