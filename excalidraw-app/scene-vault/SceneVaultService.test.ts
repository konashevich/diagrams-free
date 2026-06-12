import { clear, createStore } from "idb-keyval";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CaptureUpdateAction } from "@excalidraw/element";
import { rectangleFixture } from "@excalidraw/excalidraw/tests/fixtures/elementFixture";

import { SceneVaultService } from "./SceneVaultService";
import { SceneVaultStore } from "./SceneVaultStore";
import { parseExcalidrawFileForVault } from "./sceneImport";
import type { VaultScenePayload } from "./types";
import { setVaultOperationContext } from "./vaultGuards";
import { SceneVaultUnavailableError } from "./vaultErrors";

vi.mock("../data/LocalData", () => ({
  LocalData: {
    flushSave: vi.fn(),
  },
}));

vi.mock("./sceneImport", () => ({
  parseExcalidrawFileForVault: vi.fn(),
}));

const testStore = createStore(
  "scene-vault-service-test-db",
  "scene-vault-service-test-store",
);

const makeAPI = (payload: VaultScenePayload) => {
  const files = payload.files;
  return {
    getSceneElementsIncludingDeleted: () => payload.elements,
    getAppState: () => ({
      ...payload.appState,
      theme: "light",
      openSidebar: null,
    }),
    getFiles: () => files,
    resetScene: vi.fn(),
    updateScene: vi.fn(),
    addFiles: vi.fn(),
  } as unknown as import("@excalidraw/excalidraw/types").ExcalidrawImperativeAPI;
};

describe("SceneVaultService", () => {
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

  it("rejects mutations while collaborating", async () => {
    setVaultOperationContext({
      isCollaborating: true,
      isExternalScene: false,
    });
    const api = makeAPI({
      elements: [{ ...rectangleFixture }],
      appState: {},
      files: {},
    });
    await expect(service.newCanvas(api)).rejects.toThrow(
      SceneVaultUnavailableError,
    );
  });

  it("archives current scene and opens another", async () => {
    const payloadA: VaultScenePayload = {
      elements: [{ ...rectangleFixture, id: "a" }],
      appState: { viewBackgroundColor: "#fff" },
      files: {},
    };
    const payloadB: VaultScenePayload = {
      elements: [{ ...rectangleFixture, id: "b" }],
      appState: { viewBackgroundColor: "#000" },
      files: {},
    };

    const apiA = makeAPI(payloadA);
    const archived = await service.archiveCurrentScene(apiA);
    expect(archived).not.toBeNull();

    const apiB = makeAPI(payloadB);
    const sceneB = await store.createScene({ payload: payloadB, title: "B" });

    const opened = await service.openScene(apiB, sceneB.id);
    expect(opened).toBe(true);
    expect(apiB.updateScene).toHaveBeenCalledWith(
      expect.objectContaining({
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      }),
    );
    expect(await store.getActiveSceneId()).toBe(sceneB.id);
  });

  it("renames a vault scene", async () => {
    const scene = await store.createScene({
      title: "Old name",
      payload: {
        elements: [{ ...rectangleFixture, id: "r1" }],
        appState: {},
        files: {},
      },
    });

    const updated = await service.renameScene(scene.id, "New name");
    expect(updated.title).toBe("New name");

    const list = await store.listScenes();
    expect(list[0]?.title).toBe("New name");
  });

  it("duplicates a vault scene with a new id", async () => {
    const scene = await store.createScene({
      title: "Original",
      payload: {
        elements: [{ ...rectangleFixture, id: "r1" }],
        appState: {},
        files: {},
      },
    });

    const copy = await service.duplicateScene(scene.id);
    expect(copy.id).not.toBe(scene.id);
    expect(copy.title).toBe("Original (copy)");
    expect(await store.listScenes()).toHaveLength(2);
  });

  it("imports a file into the vault without changing active id", async () => {
    vi.mocked(parseExcalidrawFileForVault).mockResolvedValue({
      suggestedTitle: "imported",
      payload: {
        elements: [{ ...rectangleFixture, id: "from-file" }],
        appState: {},
        files: {},
      },
    });

    const file = new File([], "imported.excalidraw", {
      type: "application/json",
    });
    const imported = await service.importSceneFromFile(file);

    expect(imported.title).toBe("imported");
    expect(await store.getActiveSceneId()).toBeNull();
    expect(await store.listScenes()).toHaveLength(1);
  });

  it("rejects empty rename titles", async () => {
    const scene = await store.createScene({
      title: "Named",
      payload: {
        elements: [{ ...rectangleFixture }],
        appState: {},
        files: {},
      },
    });

    await expect(service.renameScene(scene.id, "   ")).rejects.toThrow(
      "Title cannot be empty.",
    );
  });

  it("persists cleared canvas to active vault entry before switching scenes", async () => {
    const payloadA: VaultScenePayload = {
      elements: [{ ...rectangleFixture, id: "a" }],
      appState: {},
      files: {},
    };
    const payloadB: VaultScenePayload = {
      elements: [{ ...rectangleFixture, id: "b" }],
      appState: {},
      files: {},
    };

    const apiA = makeAPI(payloadA);
    await service.archiveCurrentScene(apiA);
    const activeId = await store.getActiveSceneId();
    expect(activeId).not.toBeNull();

    const apiEmpty = makeAPI({
      elements: [],
      appState: {},
      files: {},
    });
    const sceneB = await store.createScene({ payload: payloadB, title: "B" });

    await service.openScene(apiEmpty, sceneB.id);

    const sceneA = await store.getScene(activeId!);
    expect(sceneA?.elementCount).toBe(0);
  });

  it("newCanvas archives then clears active id", async () => {
    const api = makeAPI({
      elements: [{ ...rectangleFixture }],
      appState: {},
      files: {},
    });

    await service.archiveCurrentScene(api);
    const activeBefore = await store.getActiveSceneId();
    expect(activeBefore).not.toBeNull();

    await service.newCanvas(api);
    expect(api.resetScene).toHaveBeenCalled();
    expect(await store.getActiveSceneId()).toBeNull();
    expect(await store.listScenes()).toHaveLength(1);
  });

  it("resetCanvas deletes active scene without archiving", async () => {
    const api = makeAPI({
      elements: [{ ...rectangleFixture }],
      appState: {},
      files: {},
    });

    await service.archiveCurrentScene(api);
    expect(await store.listScenes()).toHaveLength(1);

    await service.resetCanvas(api);
    expect(api.resetScene).toHaveBeenCalled();
    expect(await store.getActiveSceneId()).toBeNull();
    expect(await store.listScenes()).toHaveLength(0);
  });

  it("saveCanvasToVault imports the current canvas as a new vault scene", async () => {
    const api = makeAPI({
      elements: [{ ...rectangleFixture }],
      appState: {},
      files: {},
    });

    const scene = await service.saveCanvasToVault(api, "Shared copy");
    expect(scene.title).toBe("Shared copy");
    expect(await store.getActiveSceneId()).toBe(scene.id);
    expect(await store.listScenes()).toHaveLength(1);
  });
});
