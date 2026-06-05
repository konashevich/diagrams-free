import { MIME_TYPES } from "@excalidraw/common";

import {
  DRIVE_API_BASE,
  DRIVE_FOLDER_CACHE_KEY,
  DRIVE_MANIFEST_VERSION,
  getDriveRootFolderName,
  getGoogleApiKey,
} from "./constants";
import { DriveApiError } from "./errors";
import { getAccessToken, handleDriveAuthFailure } from "./auth";
import {
  DRIVE_MANIFEST_FILENAME,
  DRIVE_SCENES_FOLDER,
  DRIVE_SHARED_FOLDER,
  DRIVE_VAULT_FOLDER,
  driveSceneFilename,
} from "./paths";

import type { DriveFolderIds, DriveManifest } from "./types";

const FOLDER_MIME = "application/vnd.google-apps.folder";

const readFolderCache = (): DriveFolderIds | null => {
  try {
    const raw = sessionStorage.getItem(DRIVE_FOLDER_CACHE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as DriveFolderIds;
  } catch {
    return null;
  }
};

const writeFolderCache = (ids: DriveFolderIds): void => {
  sessionStorage.setItem(DRIVE_FOLDER_CACHE_KEY, JSON.stringify(ids));
};

export const clearDriveFolderCache = (): void => {
  sessionStorage.removeItem(DRIVE_FOLDER_CACHE_KEY);
};

const driveFetch = async (
  path: string,
  init: RequestInit = {},
): Promise<Response> => {
  const token = getAccessToken();
  if (!token) {
    throw new DriveApiError("Not signed in to Google.", 401);
  }

  const response = await fetch(`${DRIVE_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    let message = `Google Drive request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      if (body.error?.message) {
        message = body.error.message;
      }
    } catch {
      // ignore parse errors
    }
    if (response.status === 401) {
      handleDriveAuthFailure();
    }
    if (response.status === 404 && readFolderCache()) {
      clearDriveFolderCache();
    }
    throw new DriveApiError(message, response.status);
  }

  return response;
};

const findChildFolder = async (
  parentId: string,
  name: string,
): Promise<string | null> => {
  const q = encodeURIComponent(
    `'${parentId}' in parents and name='${name.replace(/'/g, "\\'")}' and mimeType='${FOLDER_MIME}' and trashed=false`,
  );
  const response = await driveFetch(
    `/files?q=${q}&fields=files(id,name)&pageSize=1&spaces=drive`,
  );
  const data = (await response.json()) as { files?: { id: string }[] };
  return data.files?.[0]?.id ?? null;
};

const createFolder = async (
  name: string,
  parentId: string,
): Promise<string> => {
  const response = await driveFetch("/files?fields=id", {
    method: "POST",
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME,
      parents: [parentId],
    }),
  });
  const data = (await response.json()) as { id: string };
  return data.id;
};

const ensureChildFolder = async (
  parentId: string,
  name: string,
): Promise<string> => {
  const existing = await findChildFolder(parentId, name);
  if (existing) {
    return existing;
  }
  return createFolder(name, parentId);
};

const ensureRootFolder = async (): Promise<string> => {
  const rootName = getDriveRootFolderName();
  const q = encodeURIComponent(
    `name='${rootName.replace(/'/g, "\\'")}' and mimeType='${FOLDER_MIME}' and trashed=false and 'root' in parents`,
  );
  const response = await driveFetch(
    `/files?q=${q}&fields=files(id,name)&pageSize=1&spaces=drive`,
  );
  const data = (await response.json()) as { files?: { id: string }[] };
  if (data.files?.[0]?.id) {
    return data.files[0].id;
  }
  return createFolder(rootName, "root");
};

const buildDriveFolderStructure = async (): Promise<DriveFolderIds> => {
  const rootId = await ensureRootFolder();
  const vaultId = await ensureChildFolder(rootId, DRIVE_VAULT_FOLDER);
  const scenesId = await ensureChildFolder(vaultId, DRIVE_SCENES_FOLDER);
  const sharedId = await ensureChildFolder(rootId, DRIVE_SHARED_FOLDER);

  const ids: DriveFolderIds = { rootId, vaultId, scenesId, sharedId };
  writeFolderCache(ids);
  return ids;
};

export const ensureDriveFolderStructure = async (): Promise<DriveFolderIds> => {
  const cached = readFolderCache();
  if (cached) {
    return cached;
  }
  return buildDriveFolderStructure();
};

/** Retry once after clearing stale folder cache (404 from Drive API). */
export const withDriveFolderRetry = async <T>(
  fn: () => Promise<T>,
): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof DriveApiError && error.status === 404) {
      clearDriveFolderCache();
      return fn();
    }
    throw error;
  }
};

const findFileInParent = async (
  parentId: string,
  name: string,
): Promise<string | null> => {
  const q = encodeURIComponent(
    `'${parentId}' in parents and name='${name.replace(/'/g, "\\'")}' and trashed=false`,
  );
  const response = await driveFetch(
    `/files?q=${q}&fields=files(id,name)&pageSize=1&spaces=drive`,
  );
  const data = (await response.json()) as { files?: { id: string }[] };
  return data.files?.[0]?.id ?? null;
};

export const uploadTextFile = async (options: {
  parentId: string;
  name: string;
  content: string;
  mimeType?: string;
  existingFileId?: string | null;
}): Promise<string> => {
  const mimeType = options.mimeType ?? MIME_TYPES.excalidraw;
  const metadata = {
    name: options.name,
    mimeType,
    ...(options.existingFileId ? {} : { parents: [options.parentId] }),
  };

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" }),
  );
  form.append(
    "file",
    new Blob([options.content], { type: mimeType }),
    options.name,
  );

  const token = getAccessToken();
  if (!token) {
    throw new DriveApiError("Not signed in to Google.", 401);
  }

  const url = options.existingFileId
    ? `${DRIVE_API_BASE}/files/${options.existingFileId}?uploadType=multipart&fields=id`
    : `${DRIVE_API_BASE}/files?uploadType=multipart&fields=id`;

  const response = await fetch(url, {
    method: options.existingFileId ? "PATCH" : "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!response.ok) {
    if (response.status === 401) {
      handleDriveAuthFailure();
    }
    throw new DriveApiError(
      `Upload failed (${response.status})`,
      response.status,
    );
  }

  const data = (await response.json()) as { id: string };
  return data.id;
};

export const downloadFileText = async (fileId: string): Promise<string> => {
  const response = await driveFetch(
    `/files/${fileId}?alt=media`,
  );
  return response.text();
};

export const readDriveManifest = async (
  vaultFolderId: string,
): Promise<DriveManifest | null> => {
  const manifestFileId = await findFileInParent(
    vaultFolderId,
    DRIVE_MANIFEST_FILENAME,
  );
  if (!manifestFileId) {
    return null;
  }
  const text = await downloadFileText(manifestFileId);
  try {
    const manifest = JSON.parse(text) as DriveManifest;
    if (
      typeof manifest.version !== "number" ||
      !Array.isArray(manifest.scenes)
    ) {
      return null;
    }
    return manifest;
  } catch {
    return null;
  }
};

export const writeDriveManifest = async (
  vaultFolderId: string,
  manifest: DriveManifest,
  existingFileId?: string | null,
): Promise<string> => {
  return uploadTextFile({
    parentId: vaultFolderId,
    name: DRIVE_MANIFEST_FILENAME,
    content: JSON.stringify(manifest, null, 2),
    mimeType: "application/json",
    existingFileId,
  });
};

export const uploadVaultSceneFile = async (options: {
  scenesFolderId: string;
  sceneId: string;
  content: string;
  existingFileId?: string | null;
}): Promise<string> => {
  return uploadTextFile({
    parentId: options.scenesFolderId,
    name: driveSceneFilename(options.sceneId),
    content: options.content,
    existingFileId: options.existingFileId,
  });
};

export const createEmptyManifest = (): DriveManifest => ({
  version: DRIVE_MANIFEST_VERSION,
  updatedAt: Date.now(),
  scenes: [],
});

export const findManifestFileId = async (
  vaultFolderId: string,
): Promise<string | null> =>
  findFileInParent(vaultFolderId, DRIVE_MANIFEST_FILENAME);

export const downloadFileTextWithApiKey = async (
  fileId: string,
): Promise<string> => {
  const apiKey = getGoogleApiKey();
  if (!apiKey) {
    throw new DriveApiError(
      "Public share download is not configured (missing API key).",
      0,
    );
  }
  const url = `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media&key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new DriveApiError(
      `Could not download shared file (${response.status}).`,
      response.status,
    );
  }
  return response.text();
};

const createPermission = async (
  fileId: string,
  body: { type: string; role: string; emailAddress?: string },
): Promise<void> => {
  await driveFetch(`/files/${fileId}/permissions`, {
    method: "POST",
    body: JSON.stringify(body),
  });
};

export const setFilePermissionAnyoneReader = async (
  fileId: string,
): Promise<void> => {
  await createPermission(fileId, { type: "anyone", role: "reader" });
};

export const setFilePermissionUserReader = async (
  fileId: string,
  emailAddress: string,
): Promise<void> => {
  await createPermission(fileId, {
    type: "user",
    role: "reader",
    emailAddress,
  });
};
