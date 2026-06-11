import {
  DRIVE_ACCOUNT_EMAIL_STORAGE_KEY,
  DRIVE_FOLDER_CACHE_KEY,
  DRIVE_LINKED_STORAGE_KEY,
  DRIVE_OAUTH_SCOPES,
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
let driveAuthInitPromise: Promise<boolean> | null = null;
const pendingTokenRequests = new Map<string, Promise<DriveAuthSession>>();

const isGisReady = (): boolean => !!window.google?.accounts?.oauth2;

const waitForGisReady = (
  resolve: () => void,
  reject: (error: DriveAuthError) => void,
): void => {
  let attempts = 0;
  const poll = () => {
    if (isGisReady()) {
      resolve();
      return;
    }
    if (++attempts < 50) {
      setTimeout(poll, 20);
    } else {
      reject(new DriveAuthError("Could not load Google sign-in."));
    }
  };
  poll();
};

const loadGisScript = (): Promise<void> => {
  if (typeof window === "undefined") {
    return Promise.reject(new DriveAuthError("Google sign-in requires a browser."));
  }
  if (isGisReady()) {
    return Promise.resolve();
  }
  if (!gisLoadPromise) {
    gisLoadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(
        `script[src="${GIS_SCRIPT_URL}"]`,
      ) as HTMLScriptElement | null;

      if (existing) {
        if (isGisReady()) {
          resolve();
          return;
        }
        existing.addEventListener("load", () =>
          waitForGisReady(resolve, reject),
        );
        existing.addEventListener("error", () =>
          reject(new DriveAuthError("Could not load Google sign-in.")),
        );
        waitForGisReady(resolve, reject);
        return;
      }

      const script = document.createElement("script");
      script.src = GIS_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.onload = () => waitForGisReady(resolve, reject);
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

/** Hydrate stored token + preload GIS once per app load. */
export const initDriveAuth = (): Promise<boolean> => {
  if (!isGoogleDriveEnabled()) {
    return Promise.resolve(false);
  }
  if (!driveAuthInitPromise) {
    driveAuthInitPromise = (async () => {
      void preloadGoogleDriveAuth();
      return hydrateDriveAuthSessionFromIdb();
    })();
  }
  return driveAuthInitPromise;
};

export const hydrateDriveAuthSession = (): Promise<boolean> => initDriveAuth();

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

type SignInOptions = {
  /** Show Google consent — for reconnect or new scope approval. */
  forceConsent?: boolean;
};

const tokenRequestKey = (options: RequestTokenOptions): string =>
  `${options.prompt}\0${options.loginHint ?? ""}`;

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

const isConsentRequiredError = (error: unknown): boolean => {
  if (!(error instanceof DriveAuthError)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return message.includes("consent_required");
};

const requestGoogleAccessToken = (
  options: RequestTokenOptions,
): Promise<DriveAuthSession> => {
  const key = tokenRequestKey(options);
  const existing = pendingTokenRequests.get(key);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    if (!isGoogleDriveEnabled()) {
      throw new DriveNotConfiguredError();
    }
    const clientId = getGoogleClientId();
    if (!clientId) {
      throw new DriveNotConfiguredError();
    }

    if (!isGisReady()) {
      await loadGisScript();
    }

    return new Promise<DriveAuthSession>((resolve, reject) => {
      try {
        const tokenClient = window.google!.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: DRIVE_OAUTH_SCOPES,
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
    pendingTokenRequests.delete(key);
  });

  pendingTokenRequests.set(key, promise);
  return promise;
};

const refreshLinkedAccessToken = async (loginHint?: string): Promise<string> => {
  try {
    const session = await requestGoogleAccessToken({
      prompt: "none",
      loginHint,
    });
    return session.accessToken;
  } catch (error) {
    if (!isInteractionRequiredError(error)) {
      if (error instanceof DriveAuthError) {
        await clearDriveAuthSession();
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
    if (!isConsentRequiredError(error)) {
      if (error instanceof DriveAuthError) {
        await clearDriveAuthSession();
      }
      throw error;
    }
  }

  const session = await requestGoogleAccessToken({
    prompt: "consent",
    loginHint,
  });
  return session.accessToken;
};

/** First-time or explicit sign-in (may show Google consent). */
export const signInWithGoogle = async (
  options?: SignInOptions,
): Promise<DriveAuthSession> => {
  const loginHint = readStoredAccountEmail();
  if (options?.forceConsent) {
    return requestGoogleAccessToken({ prompt: "consent", loginHint });
  }
  const prompt = isGoogleDriveLinked() ? "" : "consent";
  try {
    return await requestGoogleAccessToken({ prompt, loginHint });
  } catch (error) {
    if (isGoogleDriveLinked() && isConsentRequiredError(error)) {
      return requestGoogleAccessToken({ prompt: "consent", loginHint });
    }
    throw error;
  }
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

  await initDriveAuth();

  const hydrated = getAccessToken();
  if (hydrated) {
    return hydrated;
  }

  if (!isGoogleDriveLinked()) {
    throw new DriveAuthError("Sign in with Google first.");
  }

  return refreshLinkedAccessToken(readStoredAccountEmail());
};

export const signOutFromGoogle = async (): Promise<void> => {
  const token = getAccessToken();
  if (token && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(token, () => {});
  }
  await clearDriveAuthSession();
  clearGoogleDriveLinked();
  localStorage.removeItem(DRIVE_FOLDER_CACHE_KEY);
  sessionStorage.removeItem(DRIVE_FOLDER_CACHE_KEY);
  driveAuthInitPromise = null;
};

/** Drop expired token after 401; keep linked state so silent refresh can run. */
export const handleDriveAuthFailure = (): void => {
  void clearDriveAuthSession();
  localStorage.removeItem(DRIVE_FOLDER_CACHE_KEY);
  sessionStorage.removeItem(DRIVE_FOLDER_CACHE_KEY);
};
