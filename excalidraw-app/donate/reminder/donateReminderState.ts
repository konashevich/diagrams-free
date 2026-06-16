export const DONATE_REMINDER_STORAGE_KEY =
  "diagrams-free-donate-reminder-state";

export const DONATE_REMINDER_SESSION_BUMP_KEY =
  "diagrams-free-donate-reminder-session-bumped";

export type DonateReminderState = {
  schema: 1;
  /** Lifetime tab sessions (analytics / Drive merge). */
  sessionCount: number;
  /** Tab sessions since the last reminder was shown. */
  sessionsSinceLastReminder: number;
  /** Tab-visible active time (ms) since the last reminder was shown. */
  activeMsSinceLastReminder: number;
  lastReminderShownAt: string | null;
  snoozeUntil: string | null;
  suppressUntil: string | null;
  suppressRecurring: boolean;
  updatedAt: string;
};

export const createDefaultDonateReminderState = (): DonateReminderState => ({
  schema: 1,
  sessionCount: 0,
  sessionsSinceLastReminder: 0,
  activeMsSinceLastReminder: 0,
  lastReminderShownAt: null,
  snoozeUntil: null,
  suppressUntil: null,
  suppressRecurring: false,
  updatedAt: new Date().toISOString(),
});

const parseState = (raw: unknown): DonateReminderState | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const data = raw as Partial<DonateReminderState>;
  if (data.schema !== 1) {
    return null;
  }
  return {
    schema: 1,
    sessionCount:
      typeof data.sessionCount === "number" && data.sessionCount >= 0
        ? data.sessionCount
        : 0,
    sessionsSinceLastReminder:
      typeof data.sessionsSinceLastReminder === "number" &&
      data.sessionsSinceLastReminder >= 0
        ? data.sessionsSinceLastReminder
        : 0,
    activeMsSinceLastReminder:
      typeof data.activeMsSinceLastReminder === "number" &&
      data.activeMsSinceLastReminder >= 0
        ? data.activeMsSinceLastReminder
        : 0,
    lastReminderShownAt:
      typeof data.lastReminderShownAt === "string"
        ? data.lastReminderShownAt
        : null,
    snoozeUntil: typeof data.snoozeUntil === "string" ? data.snoozeUntil : null,
    suppressUntil:
      typeof data.suppressUntil === "string" ? data.suppressUntil : null,
    suppressRecurring: data.suppressRecurring === true,
    updatedAt:
      typeof data.updatedAt === "string"
        ? data.updatedAt
        : new Date().toISOString(),
  };
};

export const readLocalDonateReminderState = (): DonateReminderState => {
  try {
    const raw = localStorage.getItem(DONATE_REMINDER_STORAGE_KEY);
    if (!raw) {
      return createDefaultDonateReminderState();
    }
    return parseState(JSON.parse(raw)) ?? createDefaultDonateReminderState();
  } catch {
    return createDefaultDonateReminderState();
  }
};

export const writeLocalDonateReminderState = (
  state: DonateReminderState,
): void => {
  const next = { ...state, updatedAt: new Date().toISOString() };
  localStorage.setItem(DONATE_REMINDER_STORAGE_KEY, JSON.stringify(next));
};

const laterIso = (a: string | null, b: string | null): string | null => {
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }
  return new Date(a) >= new Date(b) ? a : b;
};

const reminderShownAtMs = (iso: string | null): number =>
  iso ? new Date(iso).getTime() : 0;

/** Keep per-reminder counters from the side that matches the latest reminder show. */
export const mergeCounterSinceLastReminder = (
  local: DonateReminderState,
  remote: DonateReminderState,
  mergedLastReminderShownAt: string | null,
  pick: (state: DonateReminderState) => number,
): number => {
  if (!mergedLastReminderShownAt) {
    return Math.max(pick(local), pick(remote));
  }

  const mergedMs = reminderShownAtMs(mergedLastReminderShownAt);
  const localMs = reminderShownAtMs(local.lastReminderShownAt);
  const remoteMs = reminderShownAtMs(remote.lastReminderShownAt);

  if (localMs === mergedMs && remoteMs === mergedMs) {
    return Math.max(pick(local), pick(remote));
  }
  if (localMs === mergedMs) {
    return pick(local);
  }
  if (remoteMs === mergedMs) {
    return pick(remote);
  }
  return 0;
};

export const mergeActiveMsSinceLastReminder = (
  local: DonateReminderState,
  remote: DonateReminderState,
  mergedLastReminderShownAt: string | null,
): number =>
  mergeCounterSinceLastReminder(
    local,
    remote,
    mergedLastReminderShownAt,
    (state) => state.activeMsSinceLastReminder,
  );

export const mergeSessionsSinceLastReminder = (
  local: DonateReminderState,
  remote: DonateReminderState,
  mergedLastReminderShownAt: string | null,
): number =>
  mergeCounterSinceLastReminder(
    local,
    remote,
    mergedLastReminderShownAt,
    (state) => state.sessionsSinceLastReminder,
  );

export const mergeDonateReminderState = (
  local: DonateReminderState,
  remote: DonateReminderState | null,
): DonateReminderState => {
  if (!remote) {
    return local;
  }
  const lastReminderShownAt = laterIso(
    local.lastReminderShownAt,
    remote.lastReminderShownAt,
  );
  return {
    schema: 1,
    sessionCount: Math.max(local.sessionCount, remote.sessionCount),
    sessionsSinceLastReminder: mergeSessionsSinceLastReminder(
      local,
      remote,
      lastReminderShownAt,
    ),
    activeMsSinceLastReminder: mergeActiveMsSinceLastReminder(
      local,
      remote,
      lastReminderShownAt,
    ),
    lastReminderShownAt,
    snoozeUntil: laterIso(local.snoozeUntil, remote.snoozeUntil),
    suppressUntil: laterIso(local.suppressUntil, remote.suppressUntil),
    suppressRecurring: local.suppressRecurring || remote.suppressRecurring,
    updatedAt: new Date().toISOString(),
  };
};

export const parseDonateReminderStateJson = (
  text: string,
): DonateReminderState | null => {
  try {
    return parseState(JSON.parse(text));
  } catch {
    return null;
  }
};
