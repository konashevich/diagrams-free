import { clear, createStore } from "idb-keyval";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CaptureUpdateAction } from "@excalidraw/element";
import { rectangleFixture } from "@excalidraw/excalidraw/tests/fixtures/elementFixture";

import { serializeVaultSceneForDownload } from "./sceneExport";
import { SceneVaultService } from "./SceneVaultService";
import { SceneVaultStore } from "./SceneVaultStore";
import type { VaultScenePayload } from "./types";
import { setVaultOperationContext } from "./vaultGuards";

vi.mock("../data/LocalData", () => ({
  LocalData: {
    flushSave: vi.fn(),
  },
}));

vi.mock("./sceneFonts", () => ({
  ensureSceneFontsApplied: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./vaultSync", () => ({
  flushVaultSync: vi.fn().mockResolvedValue(undefined),
  scheduleDeferredDriveBackup: vi.fn(),
  cancelVaultSync: vi.fn(),
}));

const testStore = createStore("scene-vault-flow-db", "scene-vault-flow-store");

const payloadA = (): VaultScenePayload => ({
  elements: [{ ...rectangleFixture, id: "flow-a" }],
  appState: { viewBackgroundColor: "#ffffff" },
  files: {},
});

const payloadB = (): VaultScenePayload => ({
  elements: [{ ...rectangleFixture, id: "flow-b" }],
  appState: { viewBackgroundColor: "#eeeeee" },
  files: {},
});

const makeAPI = (payload: VaultScenePayload) =>
  ({
    getSceneElementsIncludingDeleted: () => payload.elements,
    getAppState: () => ({
      ...payload.appState,
      theme: "light",
      openSidebar: null,
    }),
    getFiles: () => payload.files,
    resetScene: vi.fn(),
    updateScene: vi.fn(),
    addFiles: vi.fn(),
  }) as unknown as import("@excalidraw/excalidraw/types").ExcalidrawImperativeAPI;

describe("scene vault flow", () => {
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

  it("new → draw → new → open previous → download", async () => {
    const api1 = makeAPI(payloadA());
    const first = await service.archiveCurrentScene(api1);
    expect(first).not.toBeNull();

    await service.newCanvas(api1);
    expect(await store.getActiveSceneId()).toBeNull();
    expect(await store.listScenes()).toHaveLength(1);

    const api2 = makeAPI(payloadB());
    const second = await service.archiveCurrentScene(api2);
    expect(second).not.toBeNull();
    expect(await store.listScenes()).toHaveLength(2);

    const firstId = first!.id;
    const api3 = makeAPI(payloadB());
    const opened = await service.openScene(api3, firstId);
    expect(opened).toBe(true);
    expect(api3.updateScene).toHaveBeenCalledWith(
      expect.objectContaining({
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      }),
    );

    const scene = await store.getScene(firstId);
    expect(scene).not.toBeNull();
    const json = serializeVaultSceneForDownload(scene!);
    expect(JSON.parse(json).elements[0].id).toBe("flow-a");
  });
});
