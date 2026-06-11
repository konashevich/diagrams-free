import { trackEvent } from "@excalidraw/excalidraw/analytics";

const CANVAS_USED_KEY = "diagrams-free-canvas-used";

/** Fired once per tab when the user first uses the canvas (see trackCanvasUsedOnce). */
export const CANVAS_USED_SESSION_EVENT = "diagrams-free-canvas-used";
const MEANINGFUL_SESSION_KEY = "diagrams-free-meaningful-session";
const SESSION_START_KEY = "diagrams-free-session-start";

/** Rule A: canvas_used + ≥30s since session start (see docs/ga4-analytics-plan.md). */
const MEANINGFUL_SESSION_MS = 30_000;

let meaningfulSessionTimer: ReturnType<typeof setTimeout> | undefined;

export type NewCanvasAnalyticsSource =
  | "menu"
  | "command_palette"
  | "clear_canvas_dialog"
  | "vault_dialog";

const trackEngagement = (action: string, label?: string) => {
  trackEvent("engagement", action, label);
};

const readSessionStartMs = (): number => {
  try {
    const raw = sessionStorage.getItem(SESSION_START_KEY);
    if (raw) {
      const parsed = Number(raw);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
    const now = Date.now();
    sessionStorage.setItem(SESSION_START_KEY, String(now));
    return now;
  } catch {
    return Date.now();
  }
};

const scheduleMeaningfulSessionCheck = () => {
  try {
    if (sessionStorage.getItem(MEANINGFUL_SESSION_KEY)) {
      return;
    }
    if (!sessionStorage.getItem(CANVAS_USED_KEY)) {
      return;
    }
  } catch {
    return;
  }

  if (meaningfulSessionTimer) {
    clearTimeout(meaningfulSessionTimer);
  }

  const sessionStart = readSessionStartMs();
  const remaining = MEANINGFUL_SESSION_MS - (Date.now() - sessionStart);

  const fireMeaningfulSession = () => {
    try {
      if (sessionStorage.getItem(MEANINGFUL_SESSION_KEY)) {
        return;
      }
      if (!sessionStorage.getItem(CANVAS_USED_KEY)) {
        return;
      }
      sessionStorage.setItem(MEANINGFUL_SESSION_KEY, "1");
    } catch {
      return;
    }
    trackEngagement("meaningful_session", "A");
  };

  if (remaining <= 0) {
    fireMeaningfulSession();
  } else {
    meaningfulSessionTimer = setTimeout(fireMeaningfulSession, remaining);
  }
};

/** Call once when the app shell mounts (production analytics). */
export const initSessionEngagementTracking = () => {
  readSessionStartMs();
};

/** First real canvas use in this browser tab session. */
export const trackCanvasUsedOnce = (source: string) => {
  try {
    if (sessionStorage.getItem(CANVAS_USED_KEY)) {
      return;
    }
    sessionStorage.setItem(CANVAS_USED_KEY, "1");
  } catch {
    return;
  }

  window.dispatchEvent(new CustomEvent(CANVAS_USED_SESSION_EVENT));
  trackEngagement("canvas_used", source);
  scheduleMeaningfulSessionCheck();
};

/** User archived a non-empty scene and started a new canvas. */
export const trackNewCanvas = (
  source: NewCanvasAnalyticsSource,
  hadContent: boolean,
) => {
  if (!hadContent) {
    return;
  }
  trackEngagement("new_canvas", source);
};

export const trackDonateModalOpen = (source: string) => {
  trackEngagement("donate_modal_open", source);
};

export const trackDonateCheckout = (
  kind: "once" | "monthly",
  tier: string,
) => {
  trackEngagement("donate_checkout", `${kind}_${tier}`);
};

/** Whether the user has drawn or created on the canvas this tab session. */
export const hasCanvasBeenUsedThisTab = (): boolean => {
  try {
    return sessionStorage.getItem(CANVAS_USED_KEY) === "1";
  } catch {
    return false;
  }
};

export const trackDonateReminderShown = (
  trigger: "trigger_30m" | "trigger_second_session",
) => {
  trackEngagement("donate_reminder_shown", trigger);
};

export const trackDonateReminderSnoozeMonth = () => {
  trackEngagement("donate_reminder_snooze_month");
};

export const trackDonateReminderSupportClick = () => {
  trackEngagement("donate_reminder_support_click");
};

export const trackDonateSuppressApplied = (
  label: "once_1y" | "recurring",
) => {
  trackEngagement("donate_suppress_applied", label);
};
