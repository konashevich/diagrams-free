import { MIME_TYPES } from "@excalidraw/common";

import { sceneVaultStore, buildVaultScene } from "../scene-vault/SceneVaultStore";
import { serializeVaultSceneForDownload } from "../scene-vault/sceneExport";
import { parseExcalidrawFileForVault } from "../scene-vault/sceneImport";

import {
  createEmptyManifest,
  ensureDriveFolderStructure,
  findManifestFileId,
  findSceneFileInFolder,
  nestedDriveSyncLocation,
  readDriveManifest,
  readMergedDriveManifest,
  uploadVaultSceneFile,
  withDriveFolderRetry,
  writeDriveManifest,
  downloadFileText,
} from "./api";
import {
  manifestScenesEqual,
  manifestScenesForLocalIds,
} from "./driveManifest";
import { cleanupDriveVaultOrphans } from "./driveGarbageCollect";
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
    const scenes = await sceneVaultStore.listScenes();

    const writeManifest = await readDriveManifest(
      writeLocation.manifestFolderId,
    );
    const existingManifest =
      (await readMergedDriveManifest(folders)) ?? createEmptyManifest();

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
      const nestedSceneFileId = await findSceneFileInFolder(
        writeLocation.scenesFolderId,
        meta.id,
      );
      const previousInNested =
        !!previous?.driveFileId &&
        !!nestedSceneFileId &&
        previous.driveFileId === nestedSceneFileId;

      if (previous && previous.updatedAt >= meta.updatedAt && previousInNested) {
        manifestById.set(meta.id, previous);
        continue;
      }
      const content = serializeVaultSceneForDownload(scene);
      const driveFileId = await uploadVaultSceneFile({
        scenesFolderId: writeLocation.scenesFolderId,
        sceneId: meta.id,
        content,
        existingFileId: nestedSceneFileId,
      });
      manifestById.set(meta.id, {
        id: meta.id,
        title: meta.title,
        updatedAt: meta.updatedAt,
        driveFileId,
      });
      uploadedScenes += 1;
    }

    const nextScenes = [...manifestById.values()]
      .filter((entry) => localIds.has(entry.id))
      .sort((a, b) => b.updatedAt - a.updatedAt);

    const priorWriteScenes = manifestScenesForLocalIds(writeManifest, localIds);
    const manifestChanged =
      uploadedScenes > 0 ||
      !manifestScenesEqual(nextScenes, priorWriteScenes);

    let syncedAt = writeManifest?.updatedAt ?? existingManifest.updatedAt;
    if (manifestChanged) {
      const nextManifest = {
        version: existingManifest.version,
        updatedAt: Date.now(),
        scenes: nextScenes,
      };
      await writeDriveManifest(
        writeLocation.manifestFolderId,
        nextManifest,
        manifestFileId,
      );
      syncedAt = nextManifest.updatedAt;
      setDriveRemoteManifestAt(syncedAt);
      invalidateDriveRemoteManifestCache();
    }

    if (manifestChanged || uploadedScenes > 0) {
      setDriveLastSyncAt(syncedAt);
      setDriveLastPushAt(syncedAt);
    }
    setDriveLastPushRevision(getVaultContentRevision());

    if (nextScenes.length > 0 || manifestChanged) {
      try {
        await cleanupDriveVaultOrphans({
          folders,
          writeLocation,
          scenes: nextScenes,
          manifestFileId,
        });
      } catch (error) {
        console.warn("[google-drive] Drive garbage collection failed:", error);
      }
    }

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
    const manifest = await readMergedDriveManifest(folders);
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
