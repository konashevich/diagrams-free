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

let sessionStoreQueue: Promise<void> = Promise.resolve();

const isValidSession = (
  session: StoredDriveSession | null,
): session is StoredDriveSession =>
  !!session &&
  !!session.accessToken &&
  Number.isFinite(session.expiresAt) &&
  session.expiresAt > Date.now();

const enqueueSessionStoreOp = <T>(op: () => Promise<T>): Promise<T> => {
  const result = sessionStoreQueue.then(op, op);
  sessionStoreQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
};

/** Raw expiry timestamp (ms), including expired sessions — for UI timers. */
export const readSessionExpiresAtMs = (): number | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = localStorage.getItem(DRIVE_TOKEN_EXPIRY_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  const expiresAt = Number(raw);
  return Number.isFinite(expiresAt) ? expiresAt : null;
};

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
  if (!isValidSession(session)) {
    clearSessionFromLocalStorage();
    return null;
  }
  return session;
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
  const expiresAt = Number(legacyExpiry);
  sessionStorage.removeItem(DRIVE_TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(DRIVE_TOKEN_EXPIRY_STORAGE_KEY);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return;
  }
  writeSessionToLocalStorage({ accessToken: legacyToken, expiresAt });
};

export const readSessionFromIdb = async (): Promise<StoredDriveSession | null> => {
  try {
    const session =
      (await get<StoredDriveSession>(IDB_SESSION_KEY, driveAuthStore)) ?? null;
    if (!isValidSession(session)) {
      if (session) {
        await clearSessionFromIdb();
      }
      return null;
    }
    return session;
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

export const clearDriveAuthSession = async (): Promise<void> => {
  await enqueueSessionStoreOp(async () => {
    clearSessionFromLocalStorage();
    await clearSessionFromIdb();
  });
};
