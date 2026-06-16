import { beforeEach, describe, expect, it } from "vitest";

import { createDefaultDonateReminderState } from "./donateReminderState";
import {
  DONATE_REMINDER_ACTIVE_MS_THRESHOLD,
  DONATE_REMINDER_MIN_SESSION_COUNT,
  resetDonateReminderStateForTests,
} from "./donateReminderService";
import {
  advanceDonateReminderTick,
  isWindowFocusedAndVisible,
} from "./donateReminderTick";

const baseState = () => createDefaultDonateReminderState();

const tickInput = (
  overrides: Partial<Parameters<typeof advanceDonateReminderTick>[0]> = {},
) => ({
  visibilityState: "visible" as DocumentVisibilityState,
  hasFocus: true,
  state: baseState(),
  sessionActiveMs: 0,
  pendingActiveMs: 0,
  activeUseTriggerFired: false,
  sessionTriggerFired: false,
  canvasUsedThisTab: true,
  tickMs: 1000,
  ...overrides,
});

describe("isWindowFocusedAndVisible", () => {
  it("requires visible and focused", () => {
    expect(isWindowFocusedAndVisible("visible", true)).toBe(true);
    expect(isWindowFocusedAndVisible("visible", false)).toBe(false);
    expect(isWindowFocusedAndVisible("hidden", true)).toBe(false);
  });
});

describe("advanceDonateReminderTick", () => {
  beforeEach(() => {
    resetDonateReminderStateForTests();
  });

  it("does not accrue when suppressed", () => {
    const result = advanceDonateReminderTick(
      tickInput({
        state: {
          ...baseState(),
          suppressRecurring: true,
        },
      }),
    );

    expect(result.accrueTime).toBe(false);
    expect(result.sessionActiveMs).toBe(0);
    expect(result.attemptTrigger60m).toBe(false);
    expect(result.attemptFifthSession).toBe(false);
  });

  it("does not accrue when hidden or unfocused", () => {
    expect(
      advanceDonateReminderTick(
        tickInput({ visibilityState: "hidden" }),
      ).accrueTime,
    ).toBe(false);
    expect(
      advanceDonateReminderTick(tickInput({ hasFocus: false })).accrueTime,
    ).toBe(false);
  });

  it("accrues but skips triggers when reminder already shown today", () => {
    const result = advanceDonateReminderTick(
      tickInput({
        state: {
          ...baseState(),
          lastReminderShownAt: new Date().toISOString(),
        },
      }),
    );

    expect(result.accrueTime).toBe(true);
    expect(result.sessionActiveMs).toBe(1000);
    expect(result.attemptTrigger60m).toBe(false);
    expect(result.attemptFifthSession).toBe(false);
  });

  it("attempts trigger 60m when session and cumulative thresholds are met", () => {
    const result = advanceDonateReminderTick(
      tickInput({
        sessionActiveMs: DONATE_REMINDER_ACTIVE_MS_THRESHOLD - 1000,
        pendingActiveMs: 0,
        state: {
          ...baseState(),
          activeMsSinceLastReminder: DONATE_REMINDER_ACTIVE_MS_THRESHOLD - 1000,
        },
      }),
    );

    expect(result.attemptTrigger60m).toBe(true);
    expect(result.attemptFifthSession).toBe(false);
  });

  it("requires canvas use for fifth-session trigger", () => {
    const result = advanceDonateReminderTick(
      tickInput({
        sessionActiveMs: 0,
        pendingActiveMs: 0,
        canvasUsedThisTab: false,
        state: {
          ...baseState(),
          sessionCount: DONATE_REMINDER_MIN_SESSION_COUNT,
          activeMsSinceLastReminder: DONATE_REMINDER_ACTIVE_MS_THRESHOLD,
        },
      }),
    );

    expect(result.attemptFifthSession).toBe(false);
  });

  it("attempts fifth-session trigger when eligible", () => {
    const result = advanceDonateReminderTick(
      tickInput({
        sessionActiveMs: 0,
        state: {
          ...baseState(),
          sessionCount: DONATE_REMINDER_MIN_SESSION_COUNT,
          activeMsSinceLastReminder: DONATE_REMINDER_ACTIVE_MS_THRESHOLD,
        },
      }),
    );

    expect(result.attemptTrigger60m).toBe(false);
    expect(result.attemptFifthSession).toBe(true);
  });

  it("prefers trigger 60m over fifth-session when both qualify", () => {
    const result = advanceDonateReminderTick(
      tickInput({
        sessionActiveMs: DONATE_REMINDER_ACTIVE_MS_THRESHOLD - 1000,
        state: {
          ...baseState(),
          sessionCount: DONATE_REMINDER_MIN_SESSION_COUNT,
          activeMsSinceLastReminder: DONATE_REMINDER_ACTIVE_MS_THRESHOLD - 1000,
        },
      }),
    );

    expect(result.attemptTrigger60m).toBe(true);
    expect(result.attemptFifthSession).toBe(false);
  });
});
