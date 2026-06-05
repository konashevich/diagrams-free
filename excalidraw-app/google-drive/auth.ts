import {
  DRIVE_FILE_SCOPE,
  DRIVE_FOLDER_CACHE_KEY,
  DRIVE_TOKEN_EXPIRY_STORAGE_KEY,
  DRIVE_TOKEN_STORAGE_KEY,
  GIS_SCRIPT_URL,
  getGoogleClientId,
  isGoogleDriveEnabled,
} from "./constants";
import { DriveAuthError, DriveNotConfiguredError } from "./errors";

import type { DriveAuthSession } from "./types";

let gisLoadPromise: Promise<void> | null = null;

const loadGisScript = (): Promise<void> => {
  if (typeof window === "undefined") {
    return Promise.reject(new DriveAuthError("Google sign-in requires a browser."));
  }
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  if (!gisLoadPromise) {
    gisLoadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(
        `script[src="${GIS_SCRIPT_URL}"]`,
      );
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () =>
          reject(new DriveAuthError("Could not load Google sign-in.")),
        );
        return;
      }
      const script = document.createElement("script");
      script.src = GIS_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new DriveAuthError("Could not load Google sign-in."));
      document.head.appendChild(script);
    });
  }
  return gisLoadPromise;
};

const readStoredSession = (): DriveAuthSession | null => {
  const accessToken = sessionStorage.getItem(DRIVE_TOKEN_STORAGE_KEY);
  const expiryRaw = sessionStorage.getItem(DRIVE_TOKEN_EXPIRY_STORAGE_KEY);
  if (!accessToken || !expiryRaw) {
    return null;
  }
  const expiresAt = Number(expiryRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return null;
  }
  return { accessToken, expiresAt };
};

const persistSession = (accessToken: string, expiresInSeconds: number): void => {
  const expiresAt = Date.now() + expiresInSeconds * 1000 - 60_000;
  sessionStorage.setItem(DRIVE_TOKEN_STORAGE_KEY, accessToken);
  sessionStorage.setItem(DRIVE_TOKEN_EXPIRY_STORAGE_KEY, String(expiresAt));
};

const clearStoredSession = (): void => {
  sessionStorage.removeItem(DRIVE_TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(DRIVE_TOKEN_EXPIRY_STORAGE_KEY);
};

const fetchUserEmail = async (accessToken: string): Promise<string | undefined> => {
  try {
    const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      return undefined;
    }
    const data = (await response.json()) as { email?: string };
    return data.email;
  } catch {
    return undefined;
  }
};

export const getAccessToken = (): string | null =>
  readStoredSession()?.accessToken ?? null;

export const isSignedInToGoogle = (): boolean => !!getAccessToken();

export const getGoogleAccountEmail = async (): Promise<string | undefined> => {
  const token = getAccessToken();
  if (!token) {
    return undefined;
  }
  return fetchUserEmail(token);
};

export const signInWithGoogle = async (): Promise<DriveAuthSession> => {
  if (!isGoogleDriveEnabled()) {
    throw new DriveNotConfiguredError();
  }
  const clientId = getGoogleClientId();
  if (!clientId) {
    throw new DriveNotConfiguredError();
  }

  await loadGisScript();

  return new Promise((resolve, reject) => {
    try {
      const tokenClient = window.google!.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_FILE_SCOPE,
        callback: async (response) => {
          if (response.error || !response.access_token) {
            reject(
              new DriveAuthError(
                response.error_description || response.error || undefined,
              ),
            );
            return;
          }
          const expiresIn = response.expires_in ?? 3600;
          persistSession(response.access_token, expiresIn);
          const email = await fetchUserEmail(response.access_token);
          resolve({
            accessToken: response.access_token,
            expiresAt: Date.now() + expiresIn * 1000,
            email,
          });
        },
      });
      tokenClient.requestAccessToken({
        prompt: readStoredSession() ? "" : "consent",
      });
    } catch (error) {
      reject(
        error instanceof Error
          ? error
          : new DriveAuthError("Google sign-in could not start."),
      );
    }
  });
};

export const signOutFromGoogle = (): void => {
  const token = getAccessToken();
  if (token && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(token, () => {});
  }
  clearStoredSession();
  sessionStorage.removeItem(DRIVE_FOLDER_CACHE_KEY);
};

/** Clear session after expired or revoked token (401 from Drive API). */
export const handleDriveAuthFailure = (): void => {
  signOutFromGoogle();
};
