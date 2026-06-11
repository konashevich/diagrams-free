import { createStore, del, get, set } from "idb-keyval";

import {
  DRIVE_TOKEN_EXPIRY_STORAGE_KEY,
  DRIVE_TOKEN_STORAGE_KEY,
} from "./constants";

export type StoredDriveSession = {
  accessToken: string;
  expiresAt: number;
};

const driveAuthStore = createStore("diagrams-free-drive-auth", "session");

const IDB_SESSION_KEY = "oauth-session";

const isValidSession = (session: StoredDriveSession | null): session is StoredDriveSession =>
  !!session &&
  !!session.accessToken &&
  Number.isFinite(session.expiresAt) &&
  session.expiresAt > Date.now();

export const readSessionFromLocalStorage = (): StoredDriveSession | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const accessToken = localStorage.getItem(DRIVE_TOKEN_STORAGE_KEY);
  const expiryRaw = localStorage.getItem(DRIVE_TOKEN_EXPIRY_STORAGE_KEY);
  if (!accessToken || !expiryRaw) {
    return null;
  }

  const expiresAt = Number(expiryRaw);
  const session = { accessToken, expiresAt };
  return isValidSession(session) ? session : null;
};

export const writeSessionToLocalStorage = (session: StoredDriveSession): void => {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem(DRIVE_TOKEN_STORAGE_KEY, session.accessToken);
  localStorage.setItem(DRIVE_TOKEN_EXPIRY_STORAGE_KEY, String(session.expiresAt));
  sessionStorage.removeItem(DRIVE_TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(DRIVE_TOKEN_EXPIRY_STORAGE_KEY);
};

export const clearSessionFromLocalStorage = (): void => {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.removeItem(DRIVE_TOKEN_STORAGE_KEY);
  localStorage.removeItem(DRIVE_TOKEN_EXPIRY_STORAGE_KEY);
  sessionStorage.removeItem(DRIVE_TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(DRIVE_TOKEN_EXPIRY_STORAGE_KEY);
};

const migrateTokenFromSessionStorage = (): void => {
  if (typeof window === "undefined") {
    return;
  }
  const legacyToken = sessionStorage.getItem(DRIVE_TOKEN_STORAGE_KEY);
  const legacyExpiry = sessionStorage.getItem(DRIVE_TOKEN_EXPIRY_STORAGE_KEY);
  if (!legacyToken || !legacyExpiry) {
    return;
  }
  writeSessionToLocalStorage({
    accessToken: legacyToken,
    expiresAt: Number(legacyExpiry),
  });
};

export const readSessionFromIdb = async (): Promise<StoredDriveSession | null> => {
  try {
    const session = (await get<StoredDriveSession>(IDB_SESSION_KEY, driveAuthStore)) ?? null;
    return isValidSession(session) ? session : null;
  } catch {
    return null;
  }
};

export const writeSessionToIdb = async (session: StoredDriveSession): Promise<void> => {
  try {
    await set(IDB_SESSION_KEY, session, driveAuthStore);
  } catch {
    // IndexedDB may be unavailable in private mode; localStorage remains primary.
  }
};

export const clearSessionFromIdb = async (): Promise<void> => {
  try {
    await del(IDB_SESSION_KEY, driveAuthStore);
  } catch {
    // ignore
  }
};

/** Restore a valid token from IndexedDB when localStorage was cleared (PWA restart). */
export const hydrateDriveAuthSessionFromIdb = async (): Promise<boolean> => {
  migrateTokenFromSessionStorage();
  if (readSessionFromLocalStorage()) {
    return true;
  }
  const idbSession = await readSessionFromIdb();
  if (!idbSession) {
    return false;
  }
  writeSessionToLocalStorage(idbSession);
  return true;
};

export const persistDriveAuthSession = (
  accessToken: string,
  expiresInSeconds: number,
): StoredDriveSession => {
  const expiresAt = Date.now() + expiresInSeconds * 1000 - 60_000;
  const session = { accessToken, expiresAt };
  writeSessionToLocalStorage(session);
  void writeSessionToIdb(session);
  return session;
};

export const clearDriveAuthSession = (): void => {
  clearSessionFromLocalStorage();
  void clearSessionFromIdb();
};
