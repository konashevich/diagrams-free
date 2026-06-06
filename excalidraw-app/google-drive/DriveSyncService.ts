import { MIME_TYPES } from "@excalidraw/common";

import { sceneVaultStore, buildVaultScene } from "../scene-vault/SceneVaultStore";
import { serializeVaultSceneForDownload } from "../scene-vault/sceneExport";
import { parseExcalidrawFileForVault } from "../scene-vault/sceneImport";

import {
  createEmptyManifest,
  ensureDriveFolderStructure,
  findManifestFileId,
  flatDriveSyncLocation,
  readDriveManifest,
  resolveDriveSyncLocation,
  uploadVaultSceneFile,
  withDriveFolderRetry,
  writeDriveManifest,
  downloadFileText,
} from "./api";
import { getAccessToken, ensureAccessToken, isGoogleDriveLinked } from "./auth";
import { DriveAuthError, DriveNotConfiguredError } from "./errors";

import type { DriveManifest, DriveSyncResult } from "./types";

export class DriveSyncService {
  private async assertReady(): Promise<void> {
    if (!isGoogleDriveLinked()) {
      throw new DriveAuthError("Sign in with Google first.");
    }
    await ensureAccessToken();
    if (!getAccessToken()) {
      throw new DriveAuthError();
    }
  }

  async backupVaultToDrive(): Promise<DriveSyncResult> {
    await this.assertReady();

    return withDriveFolderRetry(() => this.backupVaultToDriveInner());
  }

  private async backupVaultToDriveInner(): Promise<DriveSyncResult> {
    const folders = await ensureDriveFolderStructure();
    const syncLocation = flatDriveSyncLocation(folders);
    const legacyLocation = await resolveDriveSyncLocation(folders);
    const scenes = await sceneVaultStore.listScenes();

    let existingManifest = await readDriveManifest(
      syncLocation.manifestFolderId,
    );
    if (
      !existingManifest &&
      legacyLocation.manifestFolderId !== syncLocation.manifestFolderId
    ) {
      existingManifest = await readDriveManifest(
        legacyLocation.manifestFolderId,
      );
    }
    existingManifest ??= createEmptyManifest();

    const manifestFileId = await findManifestFileId(
      syncLocation.manifestFolderId,
    );

    const existingById = new Map(
      existingManifest.scenes.map((entry) => [entry.id, entry]),
    );
    const manifestById = new Map<string, (typeof existingManifest.scenes)[0]>();

    for (const meta of scenes) {
      const scene = await sceneVaultStore.getScene(meta.id);
      if (!scene) {
        continue;
      }
      const content = serializeVaultSceneForDownload(scene);
      const previous = existingById.get(meta.id);
      const driveFileId = await uploadVaultSceneFile({
        scenesFolderId: syncLocation.scenesFolderId,
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
    }

    const nextManifest = {
      version: existingManifest.version,
      updatedAt: Date.now(),
      scenes: [...manifestById.values()].sort(
        (a, b) => b.updatedAt - a.updatedAt,
      ),
    };

    await writeDriveManifest(
      syncLocation.manifestFolderId,
      nextManifest,
      manifestFileId,
    );

    return {
      uploadedScenes: scenes.length,
      restoredScenes: 0,
      syncedAt: nextManifest.updatedAt,
    };
  }

  async restoreVaultFromDrive(): Promise<DriveSyncResult> {
    await this.assertReady();

    return withDriveFolderRetry(() => this.restoreVaultFromDriveInner());
  }

  private async restoreVaultFromDriveInner(): Promise<DriveSyncResult> {
    const folders = await ensureDriveFolderStructure();
    const syncLocation = await resolveDriveSyncLocation(folders);
    const manifest = await readDriveManifest(syncLocation.manifestFolderId);
    if (!manifest?.scenes.length) {
      return { uploadedScenes: 0, restoredScenes: 0, syncedAt: Date.now() };
    }

    let restoredScenes = 0;

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
    }

    return {
      uploadedScenes: 0,
      restoredScenes,
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
