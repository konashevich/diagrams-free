import {
  DRIVE_ACCOUNT_EMAIL_STORAGE_KEY,
  DRIVE_FILE_SCOPE,
  DRIVE_FOLDER_CACHE_KEY,
  DRIVE_LINKED_STORAGE_KEY,
  GIS_SCRIPT_URL,
  getGoogleClientId,
  isGoogleDriveEnabled,
} from "./constants";
import {
  clearDriveAuthSession,
  hydrateDriveAuthSessionFromIdb,
  persistDriveAuthSession,
  readSessionFromLocalStorage,
} from "./authSessionStore";
import { DriveAuthError, DriveNotConfiguredError } from "./errors";

import type { DriveAuthSession } from "./types";

let gisLoadPromise: Promise<void> | null = null;
let pendingTokenRequest: Promise<DriveAuthSession> | null = null;

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

/** Preload GIS so token requests run inside the same user gesture as Backup/Share clicks. */
export const preloadGoogleDriveAuth = (): Promise<void> => {
  if (!isGoogleDriveEnabled()) {
    return Promise.resolve();
  }
  return loadGisScript().catch(() => {});
};

export const hydrateDriveAuthSession = (): Promise<boolean> =>
  hydrateDriveAuthSessionFromIdb();

const readStoredSession = (): DriveAuthSession | null => {
  const session = readSessionFromLocalStorage();
  if (!session) {
    return null;
  }
  return { accessToken: session.accessToken, expiresAt: session.expiresAt };
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

export const hasValidAccessToken = (): boolean => !!getAccessToken();

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
  /** none = silent; empty string = skip consent when already granted; consent = first link. */
  prompt: "none" | "" | "consent";
  loginHint?: string;
};

const isInteractionRequiredError = (error: unknown): boolean => {
  if (!(error instanceof DriveAuthError)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes("interaction_required") ||
    message.includes("login_required") ||
    message.includes("consent_required") ||
    message.includes("user logged out")
  );
};

const requestGoogleAccessToken = (
  options: RequestTokenOptions,
): Promise<DriveAuthSession> => {
  if (pendingTokenRequest) {
    return pendingTokenRequest;
  }

  pendingTokenRequest = (async () => {
    if (!isGoogleDriveEnabled()) {
      throw new DriveNotConfiguredError();
    }
    const clientId = getGoogleClientId();
    if (!clientId) {
      throw new DriveNotConfiguredError();
    }

    await loadGisScript();

    return new Promise<DriveAuthSession>((resolve, reject) => {
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
            const session = persistDriveAuthSession(
              response.access_token,
              expiresIn,
            );
            markGoogleDriveLinked();
            const email = await fetchUserEmail(response.access_token);
            persistAccountEmail(email);
            resolve({
              accessToken: session.accessToken,
              expiresAt: session.expiresAt,
              email,
            });
          },
        });

        const requestOptions: {
          prompt?: string;
          login_hint?: string;
        } = {};
        if (options.prompt !== undefined) {
          requestOptions.prompt = options.prompt;
        }
        if (options.loginHint) {
          requestOptions.login_hint = options.loginHint;
        }
        tokenClient.requestAccessToken(requestOptions);
      } catch (error) {
        reject(
          error instanceof Error
            ? error
            : new DriveAuthError("Google sign-in could not start."),
        );
      }
    });
  })().finally(() => {
    pendingTokenRequest = null;
  });

  return pendingTokenRequest;
};

/** First-time or explicit sign-in (may show Google consent). */
export const signInWithGoogle = async (): Promise<DriveAuthSession> => {
  const loginHint = readStoredAccountEmail();
  const prompt = isGoogleDriveLinked() ? "" : "consent";
  return requestGoogleAccessToken({ prompt, loginHint });
};

/**
 * Returns a valid access token, refreshing via Google OAuth when needed.
 * Call only from an explicit user action (sign-in, backup, share, etc.) —
 * background auto-sync must use {@link getAccessToken} instead.
 */
export const ensureAccessToken = async (): Promise<string> => {
  const existing = getAccessToken();
  if (existing) {
    return existing;
  }

  if (!isGoogleDriveLinked()) {
    throw new DriveAuthError("Sign in with Google first.");
  }

  const loginHint = readStoredAccountEmail();

  try {
    const session = await requestGoogleAccessToken({
      prompt: "none",
      loginHint,
    });
    return session.accessToken;
  } catch (error) {
    if (!isInteractionRequiredError(error)) {
      if (error instanceof DriveAuthError) {
        clearDriveAuthSession();
      }
      throw error;
    }
  }

  try {
    const session = await requestGoogleAccessToken({
      prompt: "",
      loginHint,
    });
    return session.accessToken;
  } catch (error) {
    if (error instanceof DriveAuthError) {
      clearDriveAuthSession();
    }
    throw error;
  }
};

export const signOutFromGoogle = (): void => {
  const token = getAccessToken();
  if (token && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(token, () => {});
  }
  clearDriveAuthSession();
  clearGoogleDriveLinked();
  localStorage.removeItem(DRIVE_FOLDER_CACHE_KEY);
  sessionStorage.removeItem(DRIVE_FOLDER_CACHE_KEY);
};

/** Drop expired token after 401; keep linked state so silent refresh can run. */
export const handleDriveAuthFailure = (): void => {
  clearDriveAuthSession();
  localStorage.removeItem(DRIVE_FOLDER_CACHE_KEY);
  sessionStorage.removeItem(DRIVE_FOLDER_CACHE_KEY);
};
