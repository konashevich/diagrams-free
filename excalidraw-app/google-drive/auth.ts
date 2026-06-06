import {
  DRIVE_ACCOUNT_EMAIL_STORAGE_KEY,
  DRIVE_FILE_SCOPE,
  DRIVE_FOLDER_CACHE_KEY,
  DRIVE_LINKED_STORAGE_KEY,
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

const readStoredAccountEmail = (): string | undefined => {
  if (typeof window === "undefined") {
    return undefined;
  }
  return localStorage.getItem(DRIVE_ACCOUNT_EMAIL_STORAGE_KEY)?.trim() || undefined;
};

const persistAccountEmail = (email: string | undefined): void => {
  if (typeof window === "undefined") {
    return;
  }
  if (email) {
    localStorage.setItem(DRIVE_ACCOUNT_EMAIL_STORAGE_KEY, email);
  } else {
    localStorage.removeItem(DRIVE_ACCOUNT_EMAIL_STORAGE_KEY);
  }
};

export const isGoogleDriveLinked = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  if (localStorage.getItem(DRIVE_LINKED_STORAGE_KEY) === "true") {
    return true;
  }
  // Same-tab upgrade: active token but linked flag not yet written.
  if (readStoredSession()) {
    markGoogleDriveLinked();
    return true;
  }
  return false;
};

const markGoogleDriveLinked = (): void => {
  localStorage.setItem(DRIVE_LINKED_STORAGE_KEY, "true");
};

const clearGoogleDriveLinked = (): void => {
  localStorage.removeItem(DRIVE_LINKED_STORAGE_KEY);
  localStorage.removeItem(DRIVE_ACCOUNT_EMAIL_STORAGE_KEY);
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

/** True when the user linked Google Drive and did not sign out. */
export const isSignedInToGoogle = (): boolean => isGoogleDriveLinked();

export const getGoogleAccountEmail = async (): Promise<string | undefined> => {
  const cached = readStoredAccountEmail();
  const token = getAccessToken();
  if (!token) {
    return cached;
  }
  const email = await fetchUserEmail(token);
  if (email) {
    persistAccountEmail(email);
  }
  return email ?? cached;
};

type RequestTokenOptions = {
  /** Empty string = silent refresh when Google already granted access. */
  prompt: "" | "consent";
};

const requestGoogleAccessToken = async (
  options: RequestTokenOptions,
): Promise<DriveAuthSession> => {
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
          markGoogleDriveLinked();
          const email = await fetchUserEmail(response.access_token);
          persistAccountEmail(email);
          resolve({
            accessToken: response.access_token,
            expiresAt: Date.now() + expiresIn * 1000,
            email,
          });
        },
      });
      tokenClient.requestAccessToken({ prompt: options.prompt });
    } catch (error) {
      reject(
        error instanceof Error
          ? error
          : new DriveAuthError("Google sign-in could not start."),
      );
    }
  });
};

/** First-time or explicit sign-in (may show Google consent). */
export const signInWithGoogle = async (): Promise<DriveAuthSession> => {
  const prompt = isGoogleDriveLinked() ? "" : "consent";
  return requestGoogleAccessToken({ prompt });
};

/**
 * Returns a valid access token, silently refreshing when the user linked
 * Google Drive on a previous visit. Tokens live in sessionStorage (~1h);
 * the linked flag in localStorage keeps the user signed in across days.
 */
export const ensureAccessToken = async (): Promise<string> => {
  const existing = getAccessToken();
  if (existing) {
    return existing;
  }

  if (!isGoogleDriveLinked()) {
    throw new DriveAuthError("Sign in with Google first.");
  }

  try {
    const session = await requestGoogleAccessToken({ prompt: "" });
    return session.accessToken;
  } catch (error) {
    if (error instanceof DriveAuthError) {
      clearStoredSession();
    }
    throw error;
  }
};

export const signOutFromGoogle = (): void => {
  const token = getAccessToken();
  if (token && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(token, () => {});
  }
  clearStoredSession();
  clearGoogleDriveLinked();
  sessionStorage.removeItem(DRIVE_FOLDER_CACHE_KEY);
};

/** Drop expired token after 401; keep linked state so silent refresh can run. */
export const handleDriveAuthFailure = (): void => {
  clearStoredSession();
  sessionStorage.removeItem(DRIVE_FOLDER_CACHE_KEY);
};
