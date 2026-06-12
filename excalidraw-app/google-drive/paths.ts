import { getDriveRootFolderName } from "./constants";

export const driveRootFolderName = (): string => getDriveRootFolderName();

/** Legacy nested layout — only used when reading older backups. */
export const DRIVE_VAULT_FOLDER = "vault";
export const DRIVE_SCENES_FOLDER = "scenes";
export const DRIVE_APP_FOLDER = "app";
export const DRIVE_SHARED_FOLDER = "shared";
export const DRIVE_MANIFEST_FILENAME = "manifest.json";
export const DONATE_REMINDER_STATE_FILENAME = "donate-reminder-state.json";

export const driveSceneFilename = (sceneId: string): string =>
  `${sceneId}.excalidraw`;

export const driveSharedFilename = (shareId: string): string =>
  `${shareId}.excalidraw`;
