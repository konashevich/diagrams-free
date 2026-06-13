import {
  DRIVE_API_BASE,
  DRIVE_FILE_MIME_TYPE,
  DRIVE_FOLDER_CACHE_KEY,
  DRIVE_MANIFEST_VERSION,
  DRIVE_UPLOAD_API_BASE,
  getDriveRootFolderName,
  getGoogleApiKey,
} from "./constants";
import { DriveApiError } from "./errors";
import { getAccessToken, handleDriveAuthFailure } from "./auth";
import { mergeDriveManifests } from "./driveManifest";
import {
  DONATE_REMINDER_STATE_FILENAME,
  DRIVE_APP_FOLDER,
  DRIVE_MANIFEST_FILENAME,
  DRIVE_SCENES_FOLDER,
  DRIVE_SHARED_FOLDER,
  DRIVE_VAULT_FOLDER,
  driveSceneFilename,
} from "./paths";

import type { DriveFolderIds, DriveManifest, DriveSyncLocation } from "./types";

const FOLDER_MIME = "application/vnd.google-apps.folder";

const isAuthCredentialError = (status: number, message: string): boolean => {
  if (status !== 401) {
    return false;
  }
  const lower = message.toLowerCase();
  return (
    lower.includes("invalid credentials") ||
    lower.includes("invalid authentication") ||
    lower.includes("login required") ||
    lower.includes("unauthorized") ||
    lower.includes("token has been expired") ||
    lower.includes("token has been revoked")
  );
};

const maybeClearSessionOnAuthError = (status: number, message: string): void => {
  if (isAuthCredentialError(status, message)) {
    handleDriveAuthFailure();
  }
};

const readFolderCache = (): DriveFolderIds | null => {
  try {
    let raw = localStorage.getItem(DRIVE_FOLDER_CACHE_KEY);
    if (!raw) {
      raw = sessionStorage.getItem(DRIVE_FOLDER_CACHE_KEY);
      if (raw) {
        localStorage.setItem(DRIVE_FOLDER_CACHE_KEY, raw);
        sessionStorage.removeItem(DRIVE_FOLDER_CACHE_KEY);
      }
    }
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as DriveFolderIds;
  } catch {
    return null;
  }
};

const writeFolderCache = (ids: DriveFolderIds): void => {
  localStorage.setItem(DRIVE_FOLDER_CACHE_KEY, JSON.stringify(ids));
  sessionStorage.removeItem(DRIVE_FOLDER_CACHE_KEY);
};

export const clearDriveFolderCache = (): void => {
  localStorage.removeItem(DRIVE_FOLDER_CACHE_KEY);
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
      maybeClearSessionOnAuthError(response.status, message);
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

const isCompleteFolderIds = (ids: DriveFolderIds | null): ids is DriveFolderIds =>
  !!ids?.rootId && !!ids.vaultId && !!ids.scenesId && !!ids.sharedId;

const buildDriveFolderStructure = async (): Promise<DriveFolderIds> => {
  const rootId = await ensureRootFolder();
  const vaultId = await ensureChildFolder(rootId, DRIVE_VAULT_FOLDER);
  const scenesId = await ensureChildFolder(vaultId, DRIVE_SCENES_FOLDER);
  const sharedId = await ensureChildFolder(rootId, DRIVE_SHARED_FOLDER);
  const ids: DriveFolderIds = { rootId, vaultId, scenesId, sharedId };
  writeFolderCache(ids);
  return ids;
};

/** Preferred write location: nested vault/scenes. */
export const nestedDriveSyncLocation = (
  folders: DriveFolderIds,
): DriveSyncLocation => ({
  manifestFolderId: folders.vaultId,
  scenesFolderId: folders.scenesId,
});

/** @deprecated Use nestedDriveSyncLocation for writes. */
export const flatDriveSyncLocation = (
  folders: DriveFolderIds,
): DriveSyncLocation => nestedDriveSyncLocation(folders);

/** Prefer the manifest with more scenes; tie-break by newer updatedAt. */
export const pickBestDriveSyncLocation = (
  candidates: { location: DriveSyncLocation; manifest: DriveManifest | null }[],
): DriveSyncLocation | null => {
  if (candidates.length === 0) {
    return null;
  }
  const score = (manifest: DriveManifest | null): [number, number] => {
    if (!manifest) {
      return [-1, 0];
    }
    return [manifest.scenes.length, manifest.updatedAt ?? 0];
  };
  candidates.sort((a, b) => {
    const [scenesB, updatedAtB] = score(b.manifest);
    const [scenesA, updatedAtA] = score(a.manifest);
    if (scenesB !== scenesA) {
      return scenesB - scenesA;
    }
    return updatedAtB - updatedAtA;
  });
  return candidates[0].location;
};

type DriveSyncCandidate = {
  location: DriveSyncLocation;
  manifest: DriveManifest | null;
};

/** Gather every manifest that exists (nested, flat root, legacy vault/scenes). */
const collectDriveSyncCandidates = async (
  folders: DriveFolderIds,
): Promise<DriveSyncCandidate[]> => {
  const { rootId, vaultId, scenesId } = folders;
  const candidates: DriveSyncCandidate[] = [];

  if (
    vaultId &&
    (await findFileInParent(vaultId, DRIVE_MANIFEST_FILENAME))
  ) {
    candidates.push({
      location: {
        manifestFolderId: vaultId,
        scenesFolderId: scenesId ?? vaultId,
      },
      manifest: await readDriveManifest(vaultId),
    });
  }

  if (await findFileInParent(rootId, DRIVE_MANIFEST_FILENAME)) {
    candidates.push({
      location: { manifestFolderId: rootId, scenesFolderId: rootId },
      manifest: await readDriveManifest(rootId),
    });
  }

  const legacyVaultId = await findChildFolder(rootId, DRIVE_VAULT_FOLDER);
  if (
    legacyVaultId &&
    legacyVaultId !== vaultId &&
    (await findFileInParent(legacyVaultId, DRIVE_MANIFEST_FILENAME))
  ) {
    const legacyScenesId =
      (await findChildFolder(legacyVaultId, DRIVE_SCENES_FOLDER)) ??
      legacyVaultId;
    candidates.push({
      location: {
        manifestFolderId: legacyVaultId,
        scenesFolderId: legacyScenesId,
      },
      manifest: await readDriveManifest(legacyVaultId),
    });
  }

  return candidates;
};

/** Write target resolution: prefer the manifest with the most scenes (legacy reads). */
export const resolveDriveSyncLocation = async (
  folders: DriveFolderIds,
): Promise<DriveSyncLocation> => {
  const candidates = await collectDriveSyncCandidates(folders);
  return (
    pickBestDriveSyncLocation(candidates) ?? nestedDriveSyncLocation(folders)
  );
};

/**
 * Merge every existing manifest into one authoritative view (newest entry per
 * scene id, max updatedAt). Used by peek/pull so that during a flat→nested
 * migration we never miss updates that live in a different manifest.
 */
export const readMergedDriveManifest = async (
  folders: DriveFolderIds,
): Promise<DriveManifest | null> => {
  const candidates = await collectDriveSyncCandidates(folders);
  return mergeDriveManifests(...candidates.map((candidate) => candidate.manifest));
};

export const ensureDriveFolderStructure = async (): Promise<DriveFolderIds> => {
  const cached = readFolderCache();
  if (isCompleteFolderIds(cached)) {
    return cached;
  }
  return buildDriveFolderStructure();
};

/** Remote manifest timestamp without downloading scene files. */
export const peekRemoteManifestUpdatedAt = async (): Promise<number | null> => {
  const folders = await ensureDriveFolderStructure();
  const manifest = await readMergedDriveManifest(folders);
  return manifest?.updatedAt ?? null;
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

const parseDriveErrorMessage = async (
  response: Response,
  fallback: string,
): Promise<string> => {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    if (body.error?.message) {
      return body.error.message;
    }
  } catch {
    // ignore parse errors
  }
  return fallback;
};

export const uploadTextFile = async (options: {
  parentId: string;
  name: string;
  content: string;
  mimeType?: string;
  existingFileId?: string | null;
}): Promise<string> => {
  const mimeType = options.mimeType ?? DRIVE_FILE_MIME_TYPE;
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
    ? `${DRIVE_UPLOAD_API_BASE}/files/${options.existingFileId}?uploadType=multipart&fields=id`
    : `${DRIVE_UPLOAD_API_BASE}/files?uploadType=multipart&fields=id`;

  const response = await fetch(url, {
    method: options.existingFileId ? "PATCH" : "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!response.ok) {
    const message = await parseDriveErrorMessage(
      response,
      `Upload failed (${response.status})`,
    );
    if (response.status === 401) {
      maybeClearSessionOnAuthError(response.status, message);
    }
    throw new DriveApiError(message, response.status);
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

export type DriveListedFile = {
  id: string;
  name: string;
};

/** List non-trashed files in a folder (paginated). */
export const listFilesInParent = async (
  parentId: string,
): Promise<DriveListedFile[]> => {
  const files: DriveListedFile[] = [];
  let pageToken: string | undefined;

  do {
    const q = encodeURIComponent(`'${parentId}' in parents and trashed=false`);
    const pageTokenQuery = pageToken
      ? `&pageToken=${encodeURIComponent(pageToken)}`
      : "";
    const response = await driveFetch(
      `/files?q=${q}&fields=nextPageToken,files(id,name)&pageSize=200&spaces=drive${pageTokenQuery}`,
    );
    const data = (await response.json()) as {
      files?: DriveListedFile[];
      nextPageToken?: string;
    };
    if (data.files?.length) {
      files.push(...data.files);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return files;
};

export const trashDriveFile = async (fileId: string): Promise<void> => {
  await driveFetch(`/files/${fileId}`, {
    method: "PATCH",
    body: JSON.stringify({ trashed: true }),
  });
};

export const trashDriveFiles = async (fileIds: string[]): Promise<number> => {
  const uniqueIds = [...new Set(fileIds)];
  let trashed = 0;
  for (const fileId of uniqueIds) {
    try {
      await trashDriveFile(fileId);
      trashed += 1;
    } catch (error) {
      console.warn("[google-drive] could not trash Drive file:", fileId, error);
    }
  }
  return trashed;
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
  const resolvedFileId =
    existingFileId ??
    (await findFileInParent(vaultFolderId, DRIVE_MANIFEST_FILENAME));
  return uploadTextFile({
    parentId: vaultFolderId,
    name: DRIVE_MANIFEST_FILENAME,
    content: JSON.stringify(manifest, null, 2),
    mimeType: "application/json",
    existingFileId: resolvedFileId,
  });
};

export const uploadVaultSceneFile = async (options: {
  scenesFolderId: string;
  sceneId: string;
  content: string;
  existingFileId?: string | null;
}): Promise<string> => {
  const name = driveSceneFilename(options.sceneId);
  const resolvedFileId =
    options.existingFileId ??
    (await findFileInParent(options.scenesFolderId, name));
  return uploadTextFile({
    parentId: options.scenesFolderId,
    name,
    content: options.content,
    existingFileId: resolvedFileId,
  });
};

/** Scene file in a folder, if present (used to avoid PATCHing flat-root copies). */
export const findSceneFileInFolder = async (
  folderId: string,
  sceneId: string,
): Promise<string | null> =>
  findFileInParent(folderId, driveSceneFilename(sceneId));

export const createEmptyManifest = (): DriveManifest => ({
  version: DRIVE_MANIFEST_VERSION,
  updatedAt: Date.now(),
  scenes: [],
});

export const findManifestFileId = async (
  vaultFolderId: string,
): Promise<string | null> =>
  findFileInParent(vaultFolderId, DRIVE_MANIFEST_FILENAME);

export const ensureChildFolder = async (
  parentId: string,
  name: string,
): Promise<string> => {
  const existing = await findChildFolder(parentId, name);
  if (existing) {
    return existing;
  }
  return createFolder(name, parentId);
};

export const ensureDriveAppFolderId = async (): Promise<string> => {
  const { rootId } = await ensureDriveFolderStructure();
  return ensureChildFolder(rootId, DRIVE_APP_FOLDER);
};

export const findDonateReminderStateFileId = async (
  appFolderId: string,
): Promise<string | null> =>
  findFileInParent(appFolderId, DONATE_REMINDER_STATE_FILENAME);

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
