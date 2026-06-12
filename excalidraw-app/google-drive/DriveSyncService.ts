import { MIME_TYPES } from "@excalidraw/common";

import { sceneVaultStore, buildVaultScene } from "../scene-vault/SceneVaultStore";
import { serializeVaultSceneForDownload } from "../scene-vault/sceneExport";
import { parseExcalidrawFileForVault } from "../scene-vault/sceneImport";

import {
  createEmptyManifest,
  ensureDriveFolderStructure,
  findManifestFileId,
  nestedDriveSyncLocation,
  readDriveManifest,
  resolveDriveSyncLocation,
  uploadVaultSceneFile,
  withDriveFolderRetry,
  writeDriveManifest,
  downloadFileText,
} from "./api";
import {
  getVaultContentRevision,
  setDriveLastPushAt,
  setDriveLastPushRevision,
  setDriveLastSyncAt,
  setDriveRemoteManifestAt,
} from "./constants";
import { runDriveIoSerialized } from "./driveIoLock";
import { invalidateDriveRemoteManifestCache } from "./driveSyncStatus";
import { getAccessToken, isGoogleDriveLinked } from "./auth";
import { DriveAuthError, DriveNotConfiguredError } from "./errors";

import type { DriveManifest, DriveSyncResult } from "./types";

export type DrivePullResult = {
  restoredScenes: number;
  pulledSceneIds: string[];
  remoteManifestUpdatedAt: number | null;
};

export type DrivePullPushResult = {
  pull: DrivePullResult;
  push: DriveSyncResult;
};

export class DriveSyncService {
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

  async backupVaultToDrive(): Promise<DriveSyncResult> {
    this.assertReady();
    return runDriveIoSerialized(() =>
      withDriveFolderRetry(() => this.backupVaultToDriveInner()),
    );
  }

  private async backupVaultToDriveInner(): Promise<DriveSyncResult> {
    const folders = await ensureDriveFolderStructure();
    const writeLocation = nestedDriveSyncLocation(folders);
    const readLocation = await resolveDriveSyncLocation(folders);
    const scenes = await sceneVaultStore.listScenes();

    let existingManifest = await readDriveManifest(
      writeLocation.manifestFolderId,
    );
    if (
      !existingManifest &&
      readLocation.manifestFolderId !== writeLocation.manifestFolderId
    ) {
      existingManifest = await readDriveManifest(
        readLocation.manifestFolderId,
      );
    }
    existingManifest ??= createEmptyManifest();

    const manifestFileId = await findManifestFileId(
      writeLocation.manifestFolderId,
    );

    const existingById = new Map(
      existingManifest.scenes.map((entry) => [entry.id, entry]),
    );
    const manifestById = new Map<string, (typeof existingManifest.scenes)[0]>();
    const localIds = new Set(scenes.map((meta) => meta.id));
    let uploadedScenes = 0;

    for (const meta of scenes) {
      const scene = await sceneVaultStore.getScene(meta.id);
      if (!scene) {
        continue;
      }
      const previous = existingById.get(meta.id);
      if (previous && previous.updatedAt >= meta.updatedAt) {
        manifestById.set(meta.id, previous);
        continue;
      }
      const content = serializeVaultSceneForDownload(scene);
      const driveFileId = await uploadVaultSceneFile({
        scenesFolderId: writeLocation.scenesFolderId,
        sceneId: meta.id,
        content,
        existingFileId: previous?.driveFileId,
      });
      manifestById.set(meta.id, {
        id: meta.id,
        title: meta.title,
        updatedAt: meta.updatedAt,
        driveFileId,
      });
      uploadedScenes += 1;
    }

    const nextManifest = {
      version: existingManifest.version,
      updatedAt: Date.now(),
      scenes: [...manifestById.values()]
        .filter((entry) => localIds.has(entry.id))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    };

    await writeDriveManifest(
      writeLocation.manifestFolderId,
      nextManifest,
      manifestFileId,
    );

    const syncedAt = nextManifest.updatedAt;
    setDriveLastSyncAt(syncedAt);
    setDriveLastPushAt(syncedAt);
    setDriveRemoteManifestAt(syncedAt);
    invalidateDriveRemoteManifestCache();
    setDriveLastPushRevision(getVaultContentRevision());

    return {
      uploadedScenes,
      restoredScenes: 0,
      syncedAt,
    };
  }

  async pullVaultFromDrive(): Promise<DrivePullResult> {
    this.assertReady();
    return runDriveIoSerialized(() =>
      withDriveFolderRetry(() => this.pullVaultFromDriveInner()),
    );
  }

  private async pullVaultFromDriveInner(): Promise<DrivePullResult> {
    const folders = await ensureDriveFolderStructure();
    const readLocation = await resolveDriveSyncLocation(folders);
    const manifest = await readDriveManifest(readLocation.manifestFolderId);
    if (!manifest?.scenes.length) {
      return {
        restoredScenes: 0,
        pulledSceneIds: [],
        remoteManifestUpdatedAt: manifest?.updatedAt ?? null,
      };
    }

    let restoredScenes = 0;
    const pulledSceneIds: string[] = [];

    for (const entry of manifest.scenes) {
      const local = await sceneVaultStore.getScene(entry.id);
      if (local && local.updatedAt >= entry.updatedAt) {
        continue;
      }

      const content = await downloadFileText(entry.driveFileId);
      const file = new File([content], `${entry.id}.excalidraw`, {
        type: MIME_TYPES.excalidraw,
      });
      const { payload, suggestedTitle } =
        await parseExcalidrawFileForVault(file);

      const scene = buildVaultScene({
        id: entry.id,
        title: entry.title || suggestedTitle,
        createdAt: local?.createdAt ?? entry.updatedAt,
        updatedAt: entry.updatedAt,
        payload,
      });
      await sceneVaultStore.upsertScene(scene);
      restoredScenes += 1;
      pulledSceneIds.push(entry.id);
    }

    return {
      restoredScenes,
      pulledSceneIds,
      remoteManifestUpdatedAt: manifest.updatedAt,
    };
  }

  /** Pull then push under a single Drive I/O lock (for merge). */
  async pullAndPushVault(): Promise<DrivePullPushResult> {
    this.assertReady();
    return runDriveIoSerialized(async () => {
      const pull = await withDriveFolderRetry(() =>
        this.pullVaultFromDriveInner(),
      );
      const push = await withDriveFolderRetry(() =>
        this.backupVaultToDriveInner(),
      );
      return { pull, push };
    });
  }

  /** @deprecated Use pullVaultFromDrive or mergeVaultWithDrive. */
  async restoreVaultFromDrive(): Promise<DriveSyncResult> {
    const pull = await this.pullVaultFromDrive();
    return {
      uploadedScenes: 0,
      restoredScenes: pull.restoredScenes,
      syncedAt: Date.now(),
    };
  }
}

export const driveSyncService = new DriveSyncService();

export const isDriveSyncAvailable = (): boolean => {
  try {
    return (
      import.meta.env.VITE_APP_GOOGLE_DRIVE === "true" &&
      !!import.meta.env.VITE_APP_GOOGLE_CLIENT_ID?.trim()
    );
  } catch {
    return false;
  }
};

export { DriveNotConfiguredError };
