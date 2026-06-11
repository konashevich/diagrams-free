import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  mergeDonateReminderState,
  readLocalDonateReminderState,
} from "./donateReminderState";
import {
  consumeDonateThanksUrl,
  DONATE_THANKS_TOAST_KEY,
  getReminderEligibility,
  isDonateReminderSuppressed,
  resetDonateReminderStateForTests,
} from "./donateReminderService";

vi.mock("../donateConfig", () => ({
  isDonateEnabled: () => true,
}));

vi.mock("./donateReminderDriveSync", () => ({
  loadDonateReminderStateFromDrive: vi.fn(),
  saveDonateReminderStateToDrive: vi.fn(),
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
        suppressRecurring: false,
        suppressUntil: "2026-01-01T00:00:00.000Z",
        snoozeUntil: null,
        lastReminderShownAt: "2026-06-01T00:00:00.000Z",
      },
      {
        ...local,
        sessionCount: 5,
        suppressRecurring: true,
        suppressUntil: "2025-01-01T00:00:00.000Z",
        snoozeUntil: "2026-12-01T00:00:00.000Z",
        lastReminderShownAt: "2026-05-01T00:00:00.000Z",
      },
    );

    expect(merged.sessionCount).toBe(5);
    expect(merged.suppressRecurring).toBe(true);
    expect(merged.suppressUntil).toBe("2026-01-01T00:00:00.000Z");
    expect(merged.snoozeUntil).toBe("2026-12-01T00:00:00.000Z");
    expect(merged.lastReminderShownAt).toBe("2026-06-01T00:00:00.000Z");
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
        { trigger30mReady: true, checkSecondSession: false },
      ),
    ).toBeNull();

    expect(
      getReminderEligibility(
        {
          ...state,
          lastReminderShownAt: new Date().toISOString(),
        },
        { trigger30mReady: false, checkSecondSession: true },
      ),
    ).toBeNull();
  });

  it("allows trigger B from session count and trigger A directly", () => {
    const state = readLocalDonateReminderState();
    expect(
      getReminderEligibility(
        { ...state, sessionCount: 2 },
        { trigger30mReady: false, checkSecondSession: true },
      ),
    ).toBe("trigger_second_session");

    expect(
      getReminderEligibility(state, {
        trigger30mReady: true,
        checkSecondSession: false,
      }),
    ).toBe("trigger_30m");
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
