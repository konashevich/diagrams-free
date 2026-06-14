import { clear, createStore } from "idb-keyval";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { rectangleFixture } from "@excalidraw/excalidraw/tests/fixtures/elementFixture";

import { SceneVaultService } from "./SceneVaultService";
import { SceneVaultStore } from "./SceneVaultStore";
import type { VaultScenePayload } from "./types";
import { setVaultOperationContext } from "./vaultGuards";

vi.mock("../data/LocalData", () => ({
  LocalData: { flushSave: vi.fn() },
}));

vi.mock("./vaultSync", () => ({
  flushVaultSync: vi.fn().mockResolvedValue(undefined),
  scheduleDeferredDriveBackup: vi.fn(),
}));

vi.mock("./sceneFonts", () => ({
  ensureSceneFontsApplied: vi.fn().mockResolvedValue(undefined),
}));

const testStore = createStore(
  "scene-vault-open-test-db",
  "scene-vault-open-test-store",
);

const makeAPI = (payload: VaultScenePayload) =>
  ({
    getSceneElementsIncludingDeleted: () => payload.elements,
    getAppState: () => ({ ...payload.appState, theme: "light", openSidebar: null }),
    getFiles: () => payload.files,
    resetScene: vi.fn(),
    updateScene: vi.fn(),
    addFiles: vi.fn(),
  }) as unknown as import("@excalidraw/excalidraw/types").ExcalidrawImperativeAPI;

describe("SceneVaultService.openScene without active id", () => {
  let store: SceneVaultStore;
  let service: SceneVaultService;

  beforeEach(async () => {
    await clear(testStore);
    store = new SceneVaultStore({ store: testStore });
    service = new SceneVaultService(store);
    setVaultOperationContext({
      isCollaborating: false,
      isExternalScene: false,
    });
  });

  it("does not create an extra vault entry when opening with no active id", async () => {
    const target = await store.createScene({
      title: "Target",
      payload: {
        elements: [{ ...rectangleFixture, id: "target" }],
        appState: {},
        files: {},
      },
    });

    const api = makeAPI({
      elements: [{ ...rectangleFixture, id: "ephemeral" }],
      appState: {},
      files: {},
    });

    expect(await store.getActiveSceneId()).toBeNull();

    await service.openScene(api, target.id);

    expect(await store.listScenes()).toHaveLength(1);
    expect(await store.getActiveSceneId()).toBe(target.id);
  });
});
