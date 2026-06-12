import { MIME_TYPES } from "@excalidraw/common";
import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";
import { loadFromBlob } from "@excalidraw/excalidraw/data/blob";
import { clearAppStateForDatabase } from "@excalidraw/excalidraw/appState";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ImportedDataState } from "@excalidraw/excalidraw/data/types";

import {
  downloadFileText,
  downloadFileTextWithApiKey,
  ensureDriveFolderStructure,
  setFilePermissionAnyoneReader,
  uploadTextFile,
  withDriveFolderRetry,
} from "./api";
import { ensureAccessToken, getAccessToken, isGoogleDriveLinked } from "./auth";
import { DriveAuthError } from "./errors";
import { buildShareUrl } from "./shareLink";

/** v1: anyone-with-link only (`drive.file` scope cannot open email-restricted files for recipients). */
export type DriveSharePermission = { type: "anyone" };

export type DriveShareResult = {
  url: string;
  fileId: string;
};

const shareFilename = (): string =>
  `share-${Date.now()}.excalidraw`;

export class DriveShareService {
  private async assertReady(): Promise<void> {
    if (!isGoogleDriveLinked()) {
      throw new DriveAuthError("Sign in with Google to share.");
    }
    await ensureAccessToken();
    if (!getAccessToken()) {
      throw new DriveAuthError("Sign in with Google to share.");
    }
  }

  serializeScene(api: ExcalidrawImperativeAPI): string {
    const elements = api.getSceneElementsIncludingDeleted();
    const appState = clearAppStateForDatabase(api.getAppState());
    const files = api.getFiles();
    return serializeAsJSON(elements, appState, files, "local");
  }

  async createShareLink(api: ExcalidrawImperativeAPI): Promise<DriveShareResult> {
    await this.assertReady();

    const content = this.serializeScene(api);
    const parsed = JSON.parse(content) as { elements?: unknown[] };
    if (!parsed.elements?.length) {
      throw new Error("Cannot share an empty canvas.");
    }

    return withDriveFolderRetry(async () => {
      const folders = await ensureDriveFolderStructure();
      const fileId = await uploadTextFile({
        parentId: folders.sharedId,
        name: shareFilename(),
        content,
      });

      await setFilePermissionAnyoneReader(fileId);

      return { url: buildShareUrl(fileId), fileId };
    });
  }

  async loadSharedScene(fileId: string): Promise<ImportedDataState> {
    let content: string;
    const token = getAccessToken();
    try {
      content = token
        ? await downloadFileText(fileId)
        : await downloadFileTextWithApiKey(fileId);
    } catch (firstError) {
      if (token) {
        try {
          content = await downloadFileTextWithApiKey(fileId);
        } catch {
          throw new Error(
            "Could not open this shared drawing. Check the link or sign in with a Google account that has access.",
          );
        }
      } else {
        throw new Error(
          firstError instanceof Error
            ? firstError.message
            : "Could not open this shared drawing.",
        );
      }
    }

    const blob = new Blob([content], { type: MIME_TYPES.excalidraw });
    return loadFromBlob(blob, null, null);
  }
}

export const driveShareService = new DriveShareService();
