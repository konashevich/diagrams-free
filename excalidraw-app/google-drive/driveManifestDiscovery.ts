import {
  collectDriveSyncCandidates,
  listFilesInParent,
  readMergedDriveManifest,
} from "./api";
import { DRIVE_MANIFEST_VERSION } from "./constants";
import { sceneIdFromDriveSceneFilename } from "./paths";

import type { DriveFolderIds, DriveManifest, DriveManifestSceneEntry } from "./types";

const parseDriveModifiedTime = (modifiedTime?: string): number => {
  if (!modifiedTime) {
    return 0;
  }
  const ms = Date.parse(modifiedTime);
  return Number.isFinite(ms) ? ms : 0;
};

/**
 * Merge manifest.json entries with `.excalidraw` files found in every known
 * scenes folder. Fixes pull when a scene file exists on Drive but manifest is
 * missing, stale, or points at another folder tree.
 */
export const resolveDriveManifestForPull = async (
  folders: DriveFolderIds,
): Promise<DriveManifest | null> => {
  const manifest = await readMergedDriveManifest(folders);
  const byId = new Map<string, DriveManifestSceneEntry>(
    (manifest?.scenes ?? []).map((entry) => [entry.id, entry]),
  );

  const candidates = await collectDriveSyncCandidates(folders);
  const sceneFolderIds = new Set<string>([folders.scenesId]);
  for (const candidate of candidates) {
    sceneFolderIds.add(candidate.location.scenesFolderId);
  }

  for (const folderId of sceneFolderIds) {
    const files = await listFilesInParent(folderId);
    for (const file of files) {
      const sceneId = sceneIdFromDriveSceneFilename(file.name);
      if (!sceneId) {
        continue;
      }
      const modifiedAt = parseDriveModifiedTime(file.modifiedTime);
      const existing = byId.get(sceneId);
      if (!existing) {
        byId.set(sceneId, {
          id: sceneId,
          title: sceneId.slice(0, 8),
          updatedAt: modifiedAt,
          driveFileId: file.id,
        });
        continue;
      }
      if (
        existing.driveFileId !== file.id &&
        modifiedAt >= existing.updatedAt
      ) {
        byId.set(sceneId, {
          ...existing,
          updatedAt: Math.max(existing.updatedAt, modifiedAt),
          driveFileId: file.id,
        });
      }
    }
  }

  if (byId.size === 0) {
    return manifest;
  }

  const scenes = [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  return {
    version: manifest?.version ?? DRIVE_MANIFEST_VERSION,
    updatedAt: Math.max(manifest?.updatedAt ?? 0, ...scenes.map((s) => s.updatedAt)),
    scenes,
  };
};
