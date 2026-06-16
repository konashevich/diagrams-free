import { beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultDonateReminderState } from "./donateReminderState";
import {
  DONATE_REMINDER_ACTIVE_MS_THRESHOLD,
  DONATE_REMINDER_MIN_SESSION_COUNT,
  resetDonateReminderStateForTests,
} from "./donateReminderService";
import {
  advanceDonateReminderTick,
  isTabVisibleForReminder,
} from "./donateReminderTick";

vi.mock("../donateConfig", () => ({
  isDonateEnabled: () => true,
}));

const baseState = () => createDefaultDonateReminderState();

const tickInput = (
  overrides: Partial<Parameters<typeof advanceDonateReminderTick>[0]> = {},
) => ({
  visibilityState: "visible" as DocumentVisibilityState,
  state: baseState(),
  pendingActiveMs: 0,
  canvasUsedThisTab: true,
  tickMs: 1000,
  ...overrides,
});

describe("isTabVisibleForReminder", () => {
  it("requires visible document", () => {
    expect(isTabVisibleForReminder("visible")).toBe(true);
    expect(isTabVisibleForReminder("hidden")).toBe(false);
  });
});

describe("advanceDonateReminderTick", () => {
  beforeEach(() => {
    resetDonateReminderStateForTests();
  });

  it("does not accrue when suppressed", () => {
    const result = advanceDonateReminderTick(
      tickInput({
        state: { ...baseState(), suppressRecurring: true },
      }),
    );

    expect(result.accrueTime).toBe(false);
    expect(result.attemptReminder).toBe(false);
  });

  it("attempts first reminder at 60 minutes with no prior show", () => {
    const result = advanceDonateReminderTick(
      tickInput({
        state: {
          ...baseState(),
          activeMsSinceLastReminder: DONATE_REMINDER_ACTIVE_MS_THRESHOLD - 1000,
        },
      }),
    );

    expect(result.attemptReminder).toBe(true);
  });

  it("does not attempt regular reminder before 5 sessions since last show", () => {
    const result = advanceDonateReminderTick(
      tickInput({
        state: {
          ...baseState(),
          lastReminderShownAt: "2026-01-01T00:00:00.000Z",
          sessionsSinceLastReminder: DONATE_REMINDER_MIN_SESSION_COUNT - 1,
          activeMsSinceLastReminder: DONATE_REMINDER_ACTIVE_MS_THRESHOLD,
        },
      }),
    );

    expect(result.attemptReminder).toBe(false);
  });

  it("attempts regular reminder when 5 sessions and 60 minutes since last show", () => {
    const result = advanceDonateReminderTick(
      tickInput({
        state: {
          ...baseState(),
          lastReminderShownAt: "2026-01-01T00:00:00.000Z",
          sessionsSinceLastReminder: DONATE_REMINDER_MIN_SESSION_COUNT,
          activeMsSinceLastReminder: DONATE_REMINDER_ACTIVE_MS_THRESHOLD,
        },
      }),
    );

    expect(result.attemptReminder).toBe(true);
  });

  it("waits for 60 minutes when 5 sessions are ready first", () => {
    const result = advanceDonateReminderTick(
      tickInput({
        state: {
          ...baseState(),
          lastReminderShownAt: "2026-01-01T00:00:00.000Z",
          sessionsSinceLastReminder: DONATE_REMINDER_MIN_SESSION_COUNT,
          activeMsSinceLastReminder: DONATE_REMINDER_ACTIVE_MS_THRESHOLD - 2000,
        },
      }),
    );

    expect(result.attemptReminder).toBe(false);
  });

  it("requires canvas use before attempting", () => {
    const result = advanceDonateReminderTick(
      tickInput({
        canvasUsedThisTab: false,
        state: {
          ...baseState(),
          activeMsSinceLastReminder: DONATE_REMINDER_ACTIVE_MS_THRESHOLD,
        },
      }),
    );

    expect(result.attemptReminder).toBe(false);
  });
});
