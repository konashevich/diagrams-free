import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DRIVE_LAST_PUSH_REVISION_STORAGE_KEY,
  DRIVE_REMOTE_MANIFEST_AT_STORAGE_KEY,
  VAULT_CONTENT_REVISION_STORAGE_KEY,
} from "./constants";
import { computeDriveSyncStatus } from "./driveSyncStatus";

vi.mock("./auth", () => ({
  hasValidAccessToken: () => true,
  isGoogleDriveLinked: () => true,
}));

vi.mock("./constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./constants")>();
  return {
    ...actual,
    isDriveAutoSyncEnabled: () => true,
  };
});

describe("computeDriveSyncStatus", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("returns syncing when in flight", () => {
    expect(computeDriveSyncStatus({ isSyncing: true })).toBe("syncing");
  });

  it("returns stale when vault revision is ahead of last push", () => {
    localStorage.setItem(VAULT_CONTENT_REVISION_STORAGE_KEY, "5");
    localStorage.setItem(DRIVE_LAST_PUSH_REVISION_STORAGE_KEY, "2");
    expect(computeDriveSyncStatus()).toBe("stale");
  });

  it("returns updates_available when remote manifest is newer than stored", () => {
    localStorage.setItem(DRIVE_REMOTE_MANIFEST_AT_STORAGE_KEY, "100");
    expect(
      computeDriveSyncStatus({ remoteManifestAt: 200 }),
    ).toBe("updates_available");
  });

  it("returns synced when revisions match", () => {
    localStorage.setItem(VAULT_CONTENT_REVISION_STORAGE_KEY, "3");
    localStorage.setItem(DRIVE_LAST_PUSH_REVISION_STORAGE_KEY, "3");
    localStorage.setItem(DRIVE_REMOTE_MANIFEST_AT_STORAGE_KEY, "500");
    expect(
      computeDriveSyncStatus({ remoteManifestAt: 500 }),
    ).toBe("synced");
  });

  it("returns synced after merge when remote manifest matches stored push time", () => {
    localStorage.setItem(DRIVE_REMOTE_MANIFEST_AT_STORAGE_KEY, "200");
    localStorage.setItem(VAULT_CONTENT_REVISION_STORAGE_KEY, "4");
    localStorage.setItem(DRIVE_LAST_PUSH_REVISION_STORAGE_KEY, "4");
    expect(
      computeDriveSyncStatus({ remoteManifestAt: 200 }),
    ).toBe("synced");
  });
});
