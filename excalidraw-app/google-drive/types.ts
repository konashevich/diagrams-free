export type DriveFolderIds = {
  rootId: string;
  vaultId: string;
  scenesId: string;
  sharedId: string;
};

/** Where manifest.json and vault scene files live (flat root or legacy vault/scenes). */
export type DriveSyncLocation = {
  manifestFolderId: string;
  scenesFolderId: string;
};

export type DriveManifestSceneEntry = {
  id: string;
  title: string;
  updatedAt: number;
  driveFileId: string;
};

export type DriveManifest = {
  version: number;
  updatedAt: number;
  scenes: DriveManifestSceneEntry[];
};

export type DriveAuthSession = {
  accessToken: string;
  expiresAt: number;
  email?: string;
};

export type DriveSyncResult = {
  uploadedScenes: number;
  restoredScenes: number;
  syncedAt: number;
};

export type DriveMergeResult = {
  pulled: number;
  pushed: number;
  syncedAt: number;
  remoteManifestUpdatedAt: number | null;
  /** Scene ids updated from Drive during pull. */
  pulledSceneIds: string[];
  /** Active scene updated on Drive but not reloaded (background merge). */
  activeSceneNeedsReload?: string | null;
};

export type DriveSyncStatus =
  | "synced"
  | "stale"
  | "updates_available"
  | "paused"
  | "syncing";
