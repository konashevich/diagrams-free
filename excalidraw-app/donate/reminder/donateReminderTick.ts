import {
  getReminderEligibilityWithPendingMs,
  isDonateReminderShownToday,
  isDonateReminderSuppressed,
} from "./donateReminderService";
import type { DonateReminderState } from "./donateReminderState";

/** Tab-visible active time accrues while the document is visible (not hidden). */
export const isTabVisibleForReminder = (
  visibilityState: DocumentVisibilityState,
): boolean => visibilityState === "visible";

export type DonateReminderTickInput = {
  visibilityState: DocumentVisibilityState;
  state: DonateReminderState;
  pendingActiveMs: number;
  canvasUsedThisTab: boolean;
  tickMs: number;
};

export type DonateReminderTickResult = {
  pendingActiveMs: number;
  accrueTime: boolean;
  attemptReminder: boolean;
};

export const advanceDonateReminderTick = (
  input: DonateReminderTickInput,
): DonateReminderTickResult => {
  const idle = {
    pendingActiveMs: input.pendingActiveMs,
    accrueTime: false,
    attemptReminder: false,
  };

  if (isDonateReminderSuppressed(input.state)) {
    return idle;
  }

  if (!isTabVisibleForReminder(input.visibilityState)) {
    return idle;
  }

  const pendingActiveMs = input.pendingActiveMs + input.tickMs;

  if (isDonateReminderShownToday(input.state)) {
    return {
      pendingActiveMs,
      accrueTime: true,
      attemptReminder: false,
    };
  }

  const attemptReminder =
    input.canvasUsedThisTab &&
    getReminderEligibilityWithPendingMs(input.state, pendingActiveMs) !== null;

  return {
    pendingActiveMs,
    accrueTime: true,
    attemptReminder,
  };
};
