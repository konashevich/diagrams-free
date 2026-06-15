import { describe, expect, it, vi } from "vitest";

import { resolveDriveManifestForPull } from "./driveManifestDiscovery";

import type { DriveFolderIds, DriveManifest } from "./types";

vi.mock("./api", () => ({
  readMergedDriveManifest: vi.fn(),
  collectDriveSyncCandidates: vi.fn(),
  listFilesInParent: vi.fn(),
}));

import {
  collectDriveSyncCandidates,
  listFilesInParent,
  readMergedDriveManifest,
} from "./api";

const folders: DriveFolderIds = {
  rootId: "root",
  vaultId: "vault",
  scenesId: "scenes",
  sharedId: "shared",
};

describe("resolveDriveManifestForPull", () => {
  it("discovers scene files when manifest is empty", async () => {
    vi.mocked(readMergedDriveManifest).mockResolvedValue(null);
    vi.mocked(collectDriveSyncCandidates).mockResolvedValue([]);
    vi.mocked(listFilesInParent).mockResolvedValue([
      {
        id: "file-abc",
        name: "abc12345.excalidraw",
        modifiedTime: "2026-06-13T10:00:00.000Z",
      },
    ]);

    const manifest = await resolveDriveManifestForPull(folders);
    expect(manifest?.scenes).toHaveLength(1);
    expect(manifest?.scenes[0]).toMatchObject({
      id: "abc12345",
      driveFileId: "file-abc",
    });
  });

  it("merges manifest entries with files found in candidate folders", async () => {
    const existing: DriveManifest = {
      version: 1,
      updatedAt: 100,
      scenes: [
        {
          id: "scene-a",
          title: "A",
          updatedAt: 100,
          driveFileId: "old-file",
        },
      ],
    };
    vi.mocked(readMergedDriveManifest).mockResolvedValue(existing);
    vi.mocked(collectDriveSyncCandidates).mockResolvedValue([
      {
        location: { manifestFolderId: "legacy-vault", scenesFolderId: "legacy-scenes" },
        manifest: existing,
      },
    ]);
    vi.mocked(listFilesInParent).mockImplementation(async (folderId) => {
      if (folderId === "scenes") {
        return [];
      }
      return [
        {
          id: "new-file",
          name: "scene-a.excalidraw",
          modifiedTime: "2026-06-13T12:00:00.000Z",
        },
      ];
    });

    const manifest = await resolveDriveManifestForPull(folders);
    expect(manifest?.scenes[0]?.driveFileId).toBe("new-file");
  });
});
