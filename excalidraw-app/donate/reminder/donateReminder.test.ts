import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  mergeActiveMsSinceLastReminder,
  mergeDonateReminderState,
  readLocalDonateReminderState,
} from "./donateReminderState";
import {
  addDonateReminderActiveMs,
  consumeDonateThanksUrl,
  DONATE_REMINDER_ACTIVE_MS_THRESHOLD,
  DONATE_REMINDER_MIN_SESSION_COUNT,
  DONATE_THANKS_TOAST_KEY,
  getReminderEligibility,
  isDonateReminderShownToday,
  isDonateReminderSuppressed,
  markDonateReminderShownLocal,
  resetDonateReminderStateForTests,
  tryMarkDonateReminderShownLocal,
} from "./donateReminderService";

vi.mock("../donateConfig", () => ({
  isDonateEnabled: () => true,
}));

vi.mock("./donateReminderDriveSync", () => ({
  loadDonateReminderStateFromDrive: vi.fn(),
  saveDonateReminderStateToDrive: vi.fn().mockResolvedValue(undefined),
}));

const mockLocation = (search: string) => {
  vi.stubGlobal("location", {
    ...window.location,
    search,
    pathname: "/",
    hash: "",
  });
};

describe("donateReminderState merge", () => {
  it("merges suppress flags with OR and later timestamps", () => {
    const local = readLocalDonateReminderState();
    const merged = mergeDonateReminderState(
      {
        ...local,
        sessionCount: 2,
        activeMsSinceLastReminder: 3_600_000,
        suppressRecurring: false,
        suppressUntil: "2026-01-01T00:00:00.000Z",
        snoozeUntil: null,
        lastReminderShownAt: "2026-06-01T00:00:00.000Z",
      },
      {
        ...local,
        sessionCount: 5,
        activeMsSinceLastReminder: 1_800_000,
        suppressRecurring: true,
        suppressUntil: "2025-01-01T00:00:00.000Z",
        snoozeUntil: "2026-12-01T00:00:00.000Z",
        lastReminderShownAt: "2026-05-01T00:00:00.000Z",
      },
    );

    expect(merged.sessionCount).toBe(5);
    expect(merged.activeMsSinceLastReminder).toBe(3_600_000);
    expect(merged.suppressRecurring).toBe(true);
    expect(merged.suppressUntil).toBe("2026-01-01T00:00:00.000Z");
    expect(merged.snoozeUntil).toBe("2026-12-01T00:00:00.000Z");
    expect(merged.lastReminderShownAt).toBe("2026-06-01T00:00:00.000Z");
  });

  it("drops stale active time when the other device showed a newer reminder", () => {
    const local = readLocalDonateReminderState();
    const merged = mergeDonateReminderState(
      {
        ...local,
        activeMsSinceLastReminder: 0,
        lastReminderShownAt: "2026-06-10T12:00:00.000Z",
      },
      {
        ...local,
        activeMsSinceLastReminder: 3_600_000,
        lastReminderShownAt: null,
      },
    );

    expect(merged.activeMsSinceLastReminder).toBe(0);
    expect(merged.lastReminderShownAt).toBe("2026-06-10T12:00:00.000Z");
  });

  it("uses remote active time when remote has the newer reminder", () => {
    const local = readLocalDonateReminderState();
    const merged = mergeDonateReminderState(
      {
        ...local,
        activeMsSinceLastReminder: 3_600_000,
        lastReminderShownAt: null,
      },
      {
        ...local,
        activeMsSinceLastReminder: 1_200_000,
        lastReminderShownAt: "2026-06-10T12:00:00.000Z",
      },
    );

    expect(merged.activeMsSinceLastReminder).toBe(1_200_000);
    expect(merged.lastReminderShownAt).toBe("2026-06-10T12:00:00.000Z");
  });

  it("mergeActiveMsSinceLastReminder keeps max when both share the same reminder", () => {
    const local = readLocalDonateReminderState();
    const remote = {
      ...local,
      activeMsSinceLastReminder: 1_800_000,
      lastReminderShownAt: "2026-06-01T00:00:00.000Z",
    };
    const mergedAt = "2026-06-01T00:00:00.000Z";

    expect(
      mergeActiveMsSinceLastReminder(
        { ...local, activeMsSinceLastReminder: 3_600_000, lastReminderShownAt: mergedAt },
        remote,
        mergedAt,
      ),
    ).toBe(3_600_000);
  });
});

describe("active time tracking", () => {
  beforeEach(() => {
    resetDonateReminderStateForTests();
  });

  it("accumulates and resets activeMsSinceLastReminder on show", () => {
    expect(addDonateReminderActiveMs(1_000)).toBe(1_000);
    expect(addDonateReminderActiveMs(2_000)).toBe(3_000);
    expect(readLocalDonateReminderState().activeMsSinceLastReminder).toBe(
      3_000,
    );

    markDonateReminderShownLocal();

    const state = readLocalDonateReminderState();
    expect(state.activeMsSinceLastReminder).toBe(0);
    expect(state.lastReminderShownAt).not.toBeNull();
    expect(isDonateReminderShownToday(state)).toBe(true);
  });

  it("ignores non-positive active time increments", () => {
    addDonateReminderActiveMs(5_000);
    expect(addDonateReminderActiveMs(0)).toBe(5_000);
    expect(addDonateReminderActiveMs(-1)).toBe(5_000);
  });

  it("tryMarkDonateReminderShownLocal rejects stale expected timestamps", () => {
    const before = readLocalDonateReminderState();
    expect(tryMarkDonateReminderShownLocal(before.lastReminderShownAt)).toBe(
      true,
    );
    expect(tryMarkDonateReminderShownLocal(before.lastReminderShownAt)).toBe(
      false,
    );
    expect(tryMarkDonateReminderShownLocal(null)).toBe(false);
  });
});

describe("getReminderEligibility", () => {
  beforeEach(() => {
    resetDonateReminderStateForTests();
  });

  it("blocks when suppressed or already shown today", () => {
    const state = readLocalDonateReminderState();
    expect(
      getReminderEligibility(
        { ...state, suppressRecurring: true },
        { triggerActiveUseReady: true, checkFifthSession: false },
      ),
    ).toBeNull();

    expect(
      getReminderEligibility(
        {
          ...state,
          lastReminderShownAt: new Date().toISOString(),
        },
        { triggerActiveUseReady: false, checkFifthSession: true },
      ),
    ).toBeNull();
  });

  it("allows trigger B from session count plus active time", () => {
    const state = readLocalDonateReminderState();
    expect(
      getReminderEligibility(
        {
          ...state,
          sessionCount: DONATE_REMINDER_MIN_SESSION_COUNT,
          activeMsSinceLastReminder: DONATE_REMINDER_ACTIVE_MS_THRESHOLD - 1,
        },
        { triggerActiveUseReady: false, checkFifthSession: true },
      ),
    ).toBeNull();
    expect(
      getReminderEligibility(
        {
          ...state,
          sessionCount: DONATE_REMINDER_MIN_SESSION_COUNT - 1,
          activeMsSinceLastReminder: DONATE_REMINDER_ACTIVE_MS_THRESHOLD,
        },
        { triggerActiveUseReady: false, checkFifthSession: true },
      ),
    ).toBeNull();
    expect(
      getReminderEligibility(
        {
          ...state,
          sessionCount: DONATE_REMINDER_MIN_SESSION_COUNT,
          activeMsSinceLastReminder: DONATE_REMINDER_ACTIVE_MS_THRESHOLD,
        },
        { triggerActiveUseReady: false, checkFifthSession: true },
      ),
    ).toBe("trigger_fifth_session");
  });

  it("allows trigger A only with enough cumulative active time", () => {
    const state = readLocalDonateReminderState();
    expect(
      getReminderEligibility(state, {
        triggerActiveUseReady: true,
        checkFifthSession: false,
      }),
    ).toBeNull();
    expect(
      getReminderEligibility(
        {
          ...state,
          activeMsSinceLastReminder: DONATE_REMINDER_ACTIVE_MS_THRESHOLD,
        },
        { triggerActiveUseReady: true, checkFifthSession: false },
      ),
    ).toBe("trigger_60m");
  });
});

describe("isDonateReminderSuppressed", () => {
  it("respects recurring, until, and snooze timestamps", () => {
    const state = readLocalDonateReminderState();
    expect(isDonateReminderSuppressed({ ...state, suppressRecurring: true })).toBe(
      true,
    );
    expect(
      isDonateReminderSuppressed({
        ...state,
        suppressUntil: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    ).toBe(true);
    expect(
      isDonateReminderSuppressed({
        ...state,
        snoozeUntil: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    ).toBe(true);
  });
});

describe("consumeDonateThanksUrl", () => {
  beforeEach(() => {
    resetDonateReminderStateForTests();
    localStorage.clear();
    sessionStorage.clear();
    mockLocation("");
    vi.stubGlobal("history", {
      ...window.history,
      replaceState: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("applies once suppress and queues toast from thanks URL", () => {
    mockLocation("?donate=thanks&kind=once&session_id=cs_test");

    const kind = consumeDonateThanksUrl();

    expect(kind).toBe("once");
    expect(consumeDonateThanksUrl()).toBeNull();
    const state = readLocalDonateReminderState();
    expect(state.suppressUntil).not.toBeNull();
    expect(isDonateReminderSuppressed(state)).toBe(true);
    expect(sessionStorage.getItem(DONATE_THANKS_TOAST_KEY)).not.toBeNull();
    expect(history.replaceState).toHaveBeenCalled();
  });

  it("queues toast without suppress when kind is missing", () => {
    mockLocation("?donate=thanks");

    expect(consumeDonateThanksUrl()).toBeNull();
    expect(isDonateReminderSuppressed(readLocalDonateReminderState())).toBe(
      false,
    );
    expect(sessionStorage.getItem(DONATE_THANKS_TOAST_KEY)).not.toBeNull();
  });
});
