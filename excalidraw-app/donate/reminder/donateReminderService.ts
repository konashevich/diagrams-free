import { isDonateEnabled } from "../donateConfig";
import {
  hydrateDriveAuthSession,
  isGoogleDriveLinked,
} from "../../google-drive/auth";
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

export const DONATE_REMINDER_STATE_SYNCED_EVENT =
  "diagrams-free-donate-reminder-state-synced";

export const DONATE_THANKS_TOAST_KEY = "diagrams-free-donate-thanks-toast";

/** Drop a queued thank-you toast if the editor never becomes ready. */
export const DONATE_THANKS_TOAST_TTL_MS = 5 * 60 * 1000;

let donateThanksUrlConsumed = false;

export type ReminderTrigger = "trigger_60m" | "trigger_fifth_session";

export type DonationKind = "once" | "monthly";

/** Minimum tab-visible active ms since last reminder (first and regular modes). */
export const DONATE_REMINDER_ACTIVE_MS_THRESHOLD = 60 * 60 * 1000;

/** Minimum tab sessions since last reminder (regular mode only). */
export const DONATE_REMINDER_MIN_SESSION_COUNT = 5;

/** Debounced Drive backup while active time accrues (no sync event — avoids feedback loops). */
const ACTIVE_MS_DRIVE_SAVE_DEBOUNCE_MS = 5 * 60 * 1000;

let activeMsDriveSaveTimer: ReturnType<typeof setTimeout> | null = null;

const scheduleActiveMsDriveSave = (): void => {
  if (activeMsDriveSaveTimer) {
    clearTimeout(activeMsDriveSaveTimer);
  }
  activeMsDriveSaveTimer = setTimeout(() => {
    activeMsDriveSaveTimer = null;
    void flushDonateReminderActiveMsToDrive();
  }, ACTIVE_MS_DRIVE_SAVE_DEBOUNCE_MS);
};

/** Merge local with Drive, persist both (no sync event — avoids feedback loops). */
const saveDonateReminderStateWithDriveMerge = async (
  local: DonateReminderState,
): Promise<void> => {
  writeLocalDonateReminderState(local);
  if (!isDonateEnabled() || !isGoogleDriveEnabled()) {
    return;
  }
  await hydrateDriveAuthSession();
  if (!isGoogleDriveLinked()) {
    return;
  }
  try {
    const remote = await loadDonateReminderStateFromDrive();
    const merged = mergeDonateReminderState(local, remote);
    writeLocalDonateReminderState(merged);
    await saveDonateReminderStateToDrive(merged);
  } catch (error) {
    console.error("[donate-reminder] Drive save failed:", error);
  }
};

/** Merge local active time with Drive before save (no sync event — avoids feedback loops). */
export const flushDonateReminderActiveMsToDrive = async (): Promise<void> => {
  await saveDonateReminderStateWithDriveMerge(readLocalDonateReminderState());
};

export const cancelActiveMsDriveSave = (): void => {
  if (activeMsDriveSaveTimer) {
    clearTimeout(activeMsDriveSaveTimer);
    activeMsDriveSaveTimer = null;
  }
};
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

export const isDonateReminderShownToday = (
  state: DonateReminderState,
): boolean => isSameLocalCalendarDay(state.lastReminderShownAt);

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
  if (state.activeMsSinceLastReminder < DONATE_REMINDER_ACTIVE_MS_THRESHOLD) {
    return null;
  }
  if (state.lastReminderShownAt === null) {
    return "trigger_60m";
  }
  if (state.sessionsSinceLastReminder >= DONATE_REMINDER_MIN_SESSION_COUNT) {
    return "trigger_fifth_session";
  }
  return null;
};

/** Eligibility using persisted + pending active ms (timer tick / pre-flush). */
export const getReminderEligibilityWithPendingMs = (
  state: DonateReminderState,
  pendingActiveMs: number,
): ReminderTrigger | null =>
  getReminderEligibility({
    ...state,
    activeMsSinceLastReminder:
      state.activeMsSinceLastReminder + Math.max(0, pendingActiveMs),
  });

export const addDonateReminderActiveMs = (ms: number): number => {
  if (ms <= 0) {
    return readLocalDonateReminderState().activeMsSinceLastReminder;
  }
  const state = readLocalDonateReminderState();
  const activeMsSinceLastReminder = state.activeMsSinceLastReminder + ms;
  writeLocalDonateReminderState({ ...state, activeMsSinceLastReminder });
  scheduleActiveMsDriveSave();
  return activeMsSinceLastReminder;
};

/**
 * Atomically mark reminder shown if `lastReminderShownAt` still matches
 * `expectedLastReminderShownAt` (guards cross-tab double-show races).
 */
export const tryMarkDonateReminderShownLocal = (
  expectedLastReminderShownAt: string | null,
): boolean => {
  const state = readLocalDonateReminderState();
  if (state.lastReminderShownAt !== expectedLastReminderShownAt) {
    return false;
  }
  if (isSameLocalCalendarDay(state.lastReminderShownAt)) {
    return false;
  }
  writeLocalDonateReminderState({
    ...state,
    lastReminderShownAt: new Date().toISOString(),
    activeMsSinceLastReminder: 0,
    sessionsSinceLastReminder: 0,
  });
  cancelActiveMsDriveSave();
  return true;
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
  const next = {
    ...state,
    sessionCount: state.sessionCount + 1,
    sessionsSinceLastReminder: state.sessionsSinceLastReminder + 1,
  };
  writeLocalDonateReminderState(next);
  return next;
};

const persistState = async (state: DonateReminderState): Promise<void> => {
  await saveDonateReminderStateWithDriveMerge(state);
};

/** Test helper — production uses `tryMarkDonateReminderShownLocal` (cross-tab safe). */
export const markDonateReminderShownLocal = (): void => {
  const state = readLocalDonateReminderState();
  writeLocalDonateReminderState({
    ...state,
    lastReminderShownAt: new Date().toISOString(),
    activeMsSinceLastReminder: 0,
    sessionsSinceLastReminder: 0,
  });
  cancelActiveMsDriveSave();
};

export const persistDonateReminderShownToDrive = async (): Promise<void> => {
  await saveDonateReminderStateWithDriveMerge(readLocalDonateReminderState());
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
    sessionStorage.setItem(DONATE_THANKS_TOAST_KEY, String(Date.now()));
  } catch {
    // ignore
  }

  return appliedKind;
};

export const clearExpiredDonateThanksToast = (): void => {
  try {
    const raw = sessionStorage.getItem(DONATE_THANKS_TOAST_KEY);
    if (!raw) {
      return;
    }
    const queuedAt = Number(raw);
    if (!Number.isFinite(queuedAt) || Date.now() - queuedAt > DONATE_THANKS_TOAST_TTL_MS) {
      sessionStorage.removeItem(DONATE_THANKS_TOAST_KEY);
    }
  } catch {
    // ignore
  }
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
  if (!isGoogleDriveEnabled()) {
    return;
  }
  await hydrateDriveAuthSession();
  if (isGoogleDriveLinked()) {
    await syncDonateReminderWithDrive();
  }
};

const notifyDonateReminderStateSynced = (): void => {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(DONATE_REMINDER_STATE_SYNCED_EVENT));
};

export const syncDonateReminderWithDrive = async (): Promise<void> => {
  try {
    const remote = await loadDonateReminderStateFromDrive();
    const local = readLocalDonateReminderState();
    const merged = mergeDonateReminderState(local, remote);
    writeLocalDonateReminderState(merged);
    await saveDonateReminderStateToDrive(merged);
    notifyDonateReminderStateSynced();
  } catch (error) {
    console.error("[donate-reminder] Drive sync failed:", error);
  }
};

export const resetDonateReminderStateForTests = (): void => {
  donateThanksUrlConsumed = false;
  cancelActiveMsDriveSave();
  writeLocalDonateReminderState(createDefaultDonateReminderState());
  try {
    sessionStorage.removeItem(DONATE_REMINDER_SESSION_BUMP_KEY);
    sessionStorage.removeItem(DONATE_THANKS_TOAST_KEY);
  } catch {
    // ignore
  }
};
