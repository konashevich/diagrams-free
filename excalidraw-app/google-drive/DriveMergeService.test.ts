import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pullAndPushVault } = vi.hoisted(() => ({
  pullAndPushVault: vi.fn(),
}));

vi.mock("./DriveSyncService", () => ({
  driveSyncService: {
    pullAndPushVault,
  },
}));

vi.mock("./auth", () => ({
  getAccessToken: () => "token",
  isGoogleDriveLinked: () => true,
}));

vi.mock("../scene-vault/SceneVaultStore", () => ({
  sceneVaultStore: {
    getActiveSceneId: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("../scene-vault/vaultSync", () => ({
  flushVaultSync: vi.fn().mockResolvedValue(undefined),
}));

import { DriveMergeService } from "./DriveMergeService";

describe("DriveMergeService.mergeVaultWithDrive", () => {
  beforeEach(() => {
    pullAndPushVault.mockResolvedValue({
      pull: {
        restoredScenes: 2,
        pulledSceneIds: ["scene-a"],
        remoteManifestUpdatedAt: 100,
      },
      push: {
        uploadedScenes: 1,
        restoredScenes: 0,
        syncedAt: 200,
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("pulls then pushes and returns merge stats", async () => {
    const service = new DriveMergeService();
    const result = await service.mergeVaultWithDrive();

    expect(pullAndPushVault).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      pulled: 2,
      pushed: 1,
      syncedAt: 200,
      remoteManifestUpdatedAt: 200,
      pulledSceneIds: ["scene-a"],
      activeSceneNeedsReload: null,
    });
  });
});
