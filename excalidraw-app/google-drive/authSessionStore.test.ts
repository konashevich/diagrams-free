import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DRIVE_TOKEN_EXPIRY_STORAGE_KEY,
  DRIVE_TOKEN_STORAGE_KEY,
} from "./constants";
import {
  clearDriveAuthSession,
  hydrateDriveAuthSessionFromIdb,
  persistDriveAuthSession,
  readSessionFromLocalStorage,
  writeSessionToIdb,
} from "./authSessionStore";

describe("authSessionStore", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearDriveAuthSession();
  });

  it("persists and reads a valid session from localStorage", () => {
    persistDriveAuthSession("token-abc", 3600);
    const session = readSessionFromLocalStorage();
    expect(session?.accessToken).toBe("token-abc");
    expect(session?.expiresAt).toBeGreaterThan(Date.now());
  });

  it("hydrates localStorage from IndexedDB when localStorage is empty", async () => {
    const expiresAt = Date.now() + 3_600_000;
    await writeSessionToIdb({ accessToken: "idb-token", expiresAt });

    expect(readSessionFromLocalStorage()).toBeNull();

    const hydrated = await hydrateDriveAuthSessionFromIdb();
    expect(hydrated).toBe(true);
    expect(localStorage.getItem(DRIVE_TOKEN_STORAGE_KEY)).toBe("idb-token");
    expect(localStorage.getItem(DRIVE_TOKEN_EXPIRY_STORAGE_KEY)).toBe(
      String(expiresAt),
    );
  });

  it("migrates legacy sessionStorage tokens into localStorage", async () => {
    const expiresAt = Date.now() + 3_600_000;
    sessionStorage.setItem(DRIVE_TOKEN_STORAGE_KEY, "legacy-token");
    sessionStorage.setItem(DRIVE_TOKEN_EXPIRY_STORAGE_KEY, String(expiresAt));

    await hydrateDriveAuthSessionFromIdb();

    expect(localStorage.getItem(DRIVE_TOKEN_STORAGE_KEY)).toBe("legacy-token");
    expect(sessionStorage.getItem(DRIVE_TOKEN_STORAGE_KEY)).toBeNull();
  });
});
