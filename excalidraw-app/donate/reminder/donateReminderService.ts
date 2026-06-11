import { isDonateEnabled } from "../donateConfig";
import { isGoogleDriveLinked } from "../../google-drive/auth";
import { isGoogleDriveEnabled } from "../../google-drive/constants";

import {
  createDefaultDonateReminderState,
  DONATE_REMINDER_SESSION_BUMP_KEY,
  mergeDonateReminderState,
  readLocalDonateReminderState,
  writeLocalDonateReminderState,
  type DonateReminderState,
} from "./donateReminderState";
import {
  loadDonateReminderStateFromDrive,
  saveDonateReminderStateToDrive,
} from "./donateReminderDriveSync";

export const DONATE_THANKS_TOAST_KEY = "diagrams-free-donate-thanks-toast";

let donateThanksUrlConsumed = false;

export type ReminderTrigger = "trigger_30m" | "trigger_second_session";

export type DonationKind = "once" | "monthly";

const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const isFutureIso = (iso: string | null): boolean => {
  if (!iso) {
    return false;
  }
  return new Date(iso).getTime() > Date.now();
};

const isSameLocalCalendarDay = (iso: string | null): boolean => {
  if (!iso) {
    return false;
  }
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
};

export const isDonateReminderSuppressed = (
  state: DonateReminderState,
): boolean => {
  if (state.suppressRecurring) {
    return true;
  }
  if (isFutureIso(state.suppressUntil)) {
    return true;
  }
  if (isFutureIso(state.snoozeUntil)) {
    return true;
  }
  return false;
};

export const getReminderEligibility = (
  state: DonateReminderState,
  options: {
    trigger30mReady: boolean;
    checkSecondSession: boolean;
  },
): ReminderTrigger | null => {
  if (!isDonateEnabled()) {
    return null;
  }
  if (isDonateReminderSuppressed(state)) {
    return null;
  }
  if (isSameLocalCalendarDay(state.lastReminderShownAt)) {
    return null;
  }
  if (options.trigger30mReady) {
    return "trigger_30m";
  }
  if (options.checkSecondSession && state.sessionCount >= 2) {
    return "trigger_second_session";
  }
  return null;
};

export const bumpDonateReminderSessionCount = (): DonateReminderState => {
  try {
    if (sessionStorage.getItem(DONATE_REMINDER_SESSION_BUMP_KEY)) {
      return readLocalDonateReminderState();
    }
    sessionStorage.setItem(DONATE_REMINDER_SESSION_BUMP_KEY, "1");
  } catch {
    // continue
  }
  const state = readLocalDonateReminderState();
  const next = { ...state, sessionCount: state.sessionCount + 1 };
  writeLocalDonateReminderState(next);
  return next;
};

const persistState = async (state: DonateReminderState): Promise<void> => {
  writeLocalDonateReminderState(state);
  try {
    await saveDonateReminderStateToDrive(state);
  } catch (error) {
    console.error("[donate-reminder] Drive save failed:", error);
  }
};

export const recordDonateReminderShown = async (): Promise<void> => {
  const state = readLocalDonateReminderState();
  await persistState({
    ...state,
    lastReminderShownAt: new Date().toISOString(),
  });
};

export const applyDonateReminderSnoozeMonth = async (): Promise<void> => {
  const state = readLocalDonateReminderState();
  await persistState({
    ...state,
    snoozeUntil: new Date(Date.now() + SNOOZE_MS).toISOString(),
  });
};

const buildSuppressedState = (
  state: DonateReminderState,
  kind: DonationKind,
): DonateReminderState =>
  kind === "monthly"
    ? { ...state, suppressRecurring: true }
    : {
        ...state,
        suppressUntil: new Date(Date.now() + ONE_YEAR_MS).toISOString(),
      };

/** Synchronous localStorage write — use before reminder eligibility on Stripe return. */
export const applyDonationSuppressLocal = (kind: DonationKind): void => {
  const state = readLocalDonateReminderState();
  writeLocalDonateReminderState(buildSuppressedState(state, kind));
};

const stripDonateThanksParamsFromUrl = (): void => {
  const params = new URLSearchParams(window.location.search);
  params.delete("donate");
  params.delete("kind");
  params.delete("session_id");
  const nextSearch = params.toString();
  const nextUrl =
    window.location.pathname +
    (nextSearch ? `?${nextSearch}` : "") +
    window.location.hash;
  window.history.replaceState(null, "", nextUrl);
};

/**
 * Parse `?donate=thanks` on first call per page load. Applies suppress locally
 * before any reminder check; queues thank-you toast for when the editor is ready.
 */
export const consumeDonateThanksUrl = (): DonationKind | null => {
  if (
    donateThanksUrlConsumed ||
    typeof window === "undefined" ||
    !isDonateEnabled()
  ) {
    return null;
  }
  donateThanksUrlConsumed = true;

  const params = new URLSearchParams(window.location.search);
  if (params.get("donate") !== "thanks") {
    return null;
  }

  const kind = params.get("kind");
  let appliedKind: DonationKind | null = null;
  if (kind === "once" || kind === "monthly") {
    applyDonationSuppressLocal(kind);
    appliedKind = kind;
    void persistState(readLocalDonateReminderState());
  }

  stripDonateThanksParamsFromUrl();

  try {
    sessionStorage.setItem(DONATE_THANKS_TOAST_KEY, "1");
  } catch {
    // ignore
  }

  return appliedKind;
};

export const applyDonationSuppress = async (
  kind: DonationKind,
): Promise<void> => {
  applyDonationSuppressLocal(kind);
  await persistState(readLocalDonateReminderState());
};

/** Await Drive merge before first reminder eligibility when signed in. */
export const prepareDonateReminderState = async (): Promise<void> => {
  if (!isDonateEnabled()) {
    return;
  }
  if (isGoogleDriveEnabled() && isGoogleDriveLinked()) {
    await syncDonateReminderWithDrive();
  }
};

export const syncDonateReminderWithDrive = async (): Promise<void> => {
  try {
    const remote = await loadDonateReminderStateFromDrive();
    const local = readLocalDonateReminderState();
    const merged = mergeDonateReminderState(local, remote);
    writeLocalDonateReminderState(merged);
    await saveDonateReminderStateToDrive(merged);
  } catch (error) {
    console.error("[donate-reminder] Drive sync failed:", error);
  }
};

export const resetDonateReminderStateForTests = (): void => {
  writeLocalDonateReminderState(createDefaultDonateReminderState());
  try {
    sessionStorage.removeItem(DONATE_REMINDER_SESSION_BUMP_KEY);
  } catch {
    // ignore
  }
};
