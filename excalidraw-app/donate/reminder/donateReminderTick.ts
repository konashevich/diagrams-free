import {
  DONATE_REMINDER_ACTIVE_MS_THRESHOLD,
  DONATE_REMINDER_MIN_SESSION_COUNT,
  isDonateReminderShownToday,
  isDonateReminderSuppressed,
} from "./donateReminderService";
import type { DonateReminderState } from "./donateReminderState";

export const isWindowFocusedAndVisible = (
  visibilityState: DocumentVisibilityState,
  hasFocus: boolean,
): boolean => visibilityState === "visible" && hasFocus;

export type DonateReminderTickInput = {
  visibilityState: DocumentVisibilityState;
  hasFocus: boolean;
  state: DonateReminderState;
  sessionActiveMs: number;
  pendingActiveMs: number;
  activeUseTriggerFired: boolean;
  sessionTriggerFired: boolean;
  canvasUsedThisTab: boolean;
  tickMs: number;
};

export type DonateReminderTickResult = {
  sessionActiveMs: number;
  pendingActiveMs: number;
  accrueTime: boolean;
  attemptTrigger60m: boolean;
  attemptFifthSession: boolean;
};

export const advanceDonateReminderTick = (
  input: DonateReminderTickInput,
): DonateReminderTickResult => {
  const idle = {
    sessionActiveMs: input.sessionActiveMs,
    pendingActiveMs: input.pendingActiveMs,
    accrueTime: false,
    attemptTrigger60m: false,
    attemptFifthSession: false,
  };

  if (isDonateReminderSuppressed(input.state)) {
    return idle;
  }

  if (!isWindowFocusedAndVisible(input.visibilityState, input.hasFocus)) {
    return idle;
  }

  const sessionActiveMs = input.sessionActiveMs + input.tickMs;
  const pendingActiveMs = input.pendingActiveMs + input.tickMs;
  const accumulatedActiveMs =
    input.state.activeMsSinceLastReminder + pendingActiveMs;

  if (isDonateReminderShownToday(input.state)) {
    return {
      sessionActiveMs,
      pendingActiveMs,
      accrueTime: true,
      attemptTrigger60m: false,
      attemptFifthSession: false,
    };
  }

  const attemptTrigger60m =
    !input.activeUseTriggerFired &&
    sessionActiveMs >= DONATE_REMINDER_ACTIVE_MS_THRESHOLD &&
    accumulatedActiveMs >= DONATE_REMINDER_ACTIVE_MS_THRESHOLD;

  const attemptFifthSession =
    !attemptTrigger60m &&
    !input.sessionTriggerFired &&
    input.canvasUsedThisTab &&
    accumulatedActiveMs >= DONATE_REMINDER_ACTIVE_MS_THRESHOLD &&
    input.state.sessionCount >= DONATE_REMINDER_MIN_SESSION_COUNT;

  return {
    sessionActiveMs,
    pendingActiveMs,
    accrueTime: true,
    attemptTrigger60m,
    attemptFifthSession,
  };
};
