import { CaptureUpdateAction } from "@excalidraw/element";
import {
  restoreAppState,
  restoreElements,
} from "@excalidraw/excalidraw/data/restore";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { LocalData } from "../data/LocalData";

import { cloneVaultPayload } from "./clonePayload";
import { parseExcalidrawFileForVault } from "./sceneImport";
import { captureSceneFromAPICloned } from "./sceneCapture";
import { downloadVaultSceneAsFile } from "./sceneExport";
import { sceneVaultStore, type SceneVaultStore } from "./SceneVaultStore";
import type { VaultScene } from "./types";
import { duplicateSceneTitle, isSceneNonEmpty } from "./utils";
import {
  trackNewCanvas,
  type NewCanvasAnalyticsSource,
} from "../analytics/engagement";

import { assertVaultEditingAllowed, isVaultEditingAllowed } from "./vaultGuards";
import { cancelVaultSync, flushVaultSync } from "./vaultSync";

export type { NewCanvasAnalyticsSource };

export class SceneVaultService {
  constructor(private readonly store: SceneVaultStore = sceneVaultStore) {}

  private async flushBeforeVaultIO(
    api: ExcalidrawImperativeAPI,
  ): Promise<void> {
    await flushVaultSync(api);
    LocalData.flushSave();
  }

  private clearedPayloadFrom(
    payload: ReturnType<typeof captureSceneFromAPICloned>,
  ) {
    return {
      elements: [],
      appState: payload.appState,
      files: {},
    };
  }

  /** Persist the current canvas into the active vault entry (or create one). */
  private async persistActiveCanvas(
    api: ExcalidrawImperativeAPI,
  ): Promise<VaultScene | null> {
    const payload = captureSceneFromAPICloned(api);
    const activeId = await this.store.getActiveSceneId();

    if (!isSceneNonEmpty(payload)) {
      if (activeId) {
        return this.store.upsertScenePayload(
          this.clearedPayloadFrom(payload),
          { id: activeId },
        );
      }
      return null;
    }

    if (activeId) {
      return this.store.upsertScenePayload(payload, { id: activeId });
    }

    const scene = await this.store.createScene({ payload });
    await this.store.setActiveSceneId(scene.id);
    return scene;
  }

  async archiveCurrentScene(
    api: ExcalidrawImperativeAPI,
  ): Promise<VaultScene | null> {
    assertVaultEditingAllowed();
    await this.flushBeforeVaultIO(api);
    return this.persistActiveCanvas(api);
  }

  async openScene(
    api: ExcalidrawImperativeAPI,
    sceneId: string,
  ): Promise<boolean> {
    assertVaultEditingAllowed();
    if ((await this.store.getActiveSceneId()) === sceneId) {
      return true;
    }

    await this.flushBeforeVaultIO(api);

    const activeId = await this.store.getActiveSceneId();
    if (activeId) {
      await this.persistActiveCanvas(api);
    }

    const scene = await this.store.getScene(sceneId);
    if (!scene) {
      return false;
    }

    const payload = cloneVaultPayload(scene.payload);
    const currentAppState = api.getAppState();

    api.resetScene();
    api.updateScene({
      elements: restoreElements(payload.elements, null, {
        repairBindings: true,
        deleteInvisibleElements: true,
      }),
      appState: restoreAppState(
        {
          ...payload.appState,
          theme: currentAppState.theme,
          isLoading: false,
        },
        currentAppState,
      ),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });

    if (Object.keys(payload.files).length > 0) {
      api.addFiles(Object.values(payload.files));
    }

    await this.store.setActiveSceneId(sceneId);
    LocalData.flushSave();
    return true;
  }

  async newCanvas(
    api: ExcalidrawImperativeAPI,
    analyticsSource: NewCanvasAnalyticsSource = "menu",
  ): Promise<void> {
    assertVaultEditingAllowed();
    await this.flushBeforeVaultIO(api);
    const hadContent = isSceneNonEmpty(captureSceneFromAPICloned(api));
    await this.persistActiveCanvas(api);
    api.resetScene();
    await this.store.setActiveSceneId(null);
    LocalData.flushSave();
    trackNewCanvas(analyticsSource, hadContent);
  }

  /** Clear the canvas and remove the active vault entry without archiving. */
  async resetCanvas(api: ExcalidrawImperativeAPI): Promise<void> {
    assertVaultEditingAllowed();
    cancelVaultSync();
    const activeId = await this.store.getActiveSceneId();
    if (activeId) {
      await this.store.deleteScene(activeId);
    }
    api.resetScene();
    await this.store.setActiveSceneId(null);
    LocalData.flushSave();
  }

  async deleteScene(
    sceneId: string,
    api?: ExcalidrawImperativeAPI,
  ): Promise<void> {
    assertVaultEditingAllowed();
    const activeId = await this.store.getActiveSceneId();
    await this.store.deleteScene(sceneId);

    if (activeId === sceneId && api) {
      api.resetScene();
      await this.store.setActiveSceneId(null);
      LocalData.flushSave();
    }
  }

  async downloadScene(sceneId: string): Promise<void> {
    const scene = await this.store.getScene(sceneId);
    if (!scene) {
      throw new Error("Scene not found");
    }
    downloadVaultSceneAsFile(scene);
  }

  async renameScene(sceneId: string, title: string): Promise<VaultScene> {
    assertVaultEditingAllowed();
    const trimmed = title.trim();
    if (!trimmed) {
      throw new Error("Title cannot be empty.");
    }

    const scene = await this.store.getScene(sceneId);
    if (!scene) {
      throw new Error("Scene not found");
    }

    const updated: VaultScene = {
      ...scene,
      title: trimmed,
      updatedAt: Date.now(),
    };
    await this.store.upsertScene(updated);
    return updated;
  }

  async duplicateScene(sceneId: string): Promise<VaultScene> {
    assertVaultEditingAllowed();
    const scene = await this.store.getScene(sceneId);
    if (!scene) {
      throw new Error("Scene not found");
    }

    return this.store.createScene({
      title: duplicateSceneTitle(scene.title),
      payload: cloneVaultPayload(scene.payload),
    });
  }

  /** Add a `.excalidraw` file to the vault without replacing the active canvas. */
  async importSceneFromFile(file: File): Promise<VaultScene> {
    assertVaultEditingAllowed();
    const { payload, suggestedTitle } = await parseExcalidrawFileForVault(file);
    return this.store.createScene({
      title: suggestedTitle,
      payload,
    });
  }

  /** Import the current canvas into the vault (e.g. from a shared link scene). */
  async saveCanvasToVault(
    api: ExcalidrawImperativeAPI,
    title?: string,
  ): Promise<VaultScene> {
    const payload = captureSceneFromAPICloned(api);
    const scene = await this.store.createScene({
      title: title?.trim() || undefined,
      payload,
    });
    await this.store.setActiveSceneId(scene.id);
    LocalData.flushSave();
    return scene;
  }

  /**
   * Persists the active editor state into the vault entry for {@link activeSceneId}.
   * Creates a new vault entry when the canvas becomes non-empty and none is active.
   */
  async syncActiveScene(api: ExcalidrawImperativeAPI): Promise<void> {
    if (!isVaultEditingAllowed()) {
      return;
    }
    const payload = captureSceneFromAPICloned(api);

    const activeId = await this.store.getActiveSceneId();

    if (!isSceneNonEmpty(payload)) {
      if (activeId) {
        await this.store.upsertScenePayload(
          this.clearedPayloadFrom(payload),
          { id: activeId },
        );
      }
      return;
    }

    if (activeId) {
      await this.store.upsertScenePayload(payload, { id: activeId });
      return;
    }

    const scene = await this.store.createScene({ payload });
    await this.store.setActiveSceneId(scene.id);
  }
}

export const sceneVaultService = new SceneVaultService();
