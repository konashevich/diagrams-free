import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  CANVAS_USED_SESSION_EVENT,
  hasCanvasBeenUsedThisTab,
  trackDonateModalOpen,
  trackDonateReminderShown,
  trackDonateReminderSnoozeMonth,
  trackDonateReminderSupportClick,
  trackDonateSuppressApplied,
} from "../../analytics/engagement";
import { isDonateEnabled } from "../donateConfig";

import {
  addDonateReminderActiveMs,
  applyDonateReminderSnoozeMonth,
  bumpDonateReminderSessionCount,
  consumeDonateThanksUrl,
  DONATE_REMINDER_ACTIVE_MS_THRESHOLD,
  DONATE_REMINDER_MIN_SESSION_COUNT,
  DONATE_REMINDER_STATE_SYNCED_EVENT,
  getReminderEligibility,
  isDonateReminderShownToday,
  persistDonateReminderShownToDrive,
  prepareDonateReminderState,
  tryMarkDonateReminderShownLocal,
  type ReminderTrigger,
} from "./donateReminderService";
import {
  DONATE_REMINDER_STORAGE_KEY,
  readLocalDonateReminderState,
} from "./donateReminderState";

const TIMER_TICK_MS = 1000;
const ACTIVE_MS_FLUSH_INTERVAL_MS = 30 * 1000;
const DAY_WATCHDOG_MS = 60 * 1000;

type Options = {
  onOpenDonateModal: () => void;
};

type TrySessionTriggerOptions = {
  requireCanvasUse?: boolean;
};

const noop = () => {};

const isWindowFocusedAndVisible = (): boolean =>
  typeof document !== "undefined" &&
  document.visibilityState === "visible" &&
  document.hasFocus();

export const useDonateReminder = ({ onOpenDonateModal }: Options) => {
  const [isOpen, setIsOpen] = useState(false);
  const [ready, setReady] = useState(!isDonateEnabled());
  const sessionActiveMsRef = useRef(0);
  const pendingActiveMsRef = useRef(0);
  const timerRunningRef = useRef(false);
  const activeUseTriggerFiredRef = useRef(false);
  const sessionTriggerFiredRef = useRef(false);
  const isOpenRef = useRef(false);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dayWatchdogIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const lastActiveFlushAtRef = useRef(0);

  isOpenRef.current = isOpen;

  useLayoutEffect(() => {
    if (!isDonateEnabled()) {
      return;
    }
    const kind = consumeDonateThanksUrl();
    if (kind) {
      trackDonateSuppressApplied(kind === "monthly" ? "recurring" : "once_1y");
    }
  }, []);

  const flushPendingActiveMs = useCallback(() => {
    if (pendingActiveMsRef.current <= 0) {
      return readLocalDonateReminderState().activeMsSinceLastReminder;
    }
    const pending = pendingActiveMsRef.current;
    pendingActiveMsRef.current = 0;
    lastActiveFlushAtRef.current = Date.now();
    return addDonateReminderActiveMs(pending);
  }, []);

  const getAccumulatedActiveMs = useCallback(() => {
    const persisted = readLocalDonateReminderState().activeMsSinceLastReminder;
    return persisted + pendingActiveMsRef.current;
  }, []);

  const blockTriggersForToday = useCallback(() => {
    const state = readLocalDonateReminderState();
    if (isDonateReminderShownToday(state)) {
      activeUseTriggerFiredRef.current = true;
      sessionTriggerFiredRef.current = true;
    }
  }, []);

  const resetTriggerRefsForNewDay = useCallback(() => {
    const state = readLocalDonateReminderState();
    if (!isDonateReminderShownToday(state)) {
      activeUseTriggerFiredRef.current = false;
      sessionTriggerFiredRef.current = false;
    }
  }, []);

  const showReminder = useCallback(
    (trigger: ReminderTrigger): boolean => {
      if (isOpenRef.current) {
        return false;
      }
      flushPendingActiveMs();
      const stateBefore = readLocalDonateReminderState();
      const eligible = getReminderEligibility(stateBefore, {
        triggerActiveUseReady: trigger === "trigger_60m",
        checkFifthSession: trigger === "trigger_fifth_session",
      });
      if (!eligible) {
        blockTriggersForToday();
        return false;
      }
      if (
        !tryMarkDonateReminderShownLocal(stateBefore.lastReminderShownAt)
      ) {
        blockTriggersForToday();
        return false;
      }
      sessionActiveMsRef.current = 0;
      trackDonateReminderShown(trigger);
      void persistDonateReminderShownToDrive();
      setIsOpen(true);
      blockTriggersForToday();
      return true;
    },
    [blockTriggersForToday, flushPendingActiveMs],
  );

  const trySessionTrigger = useCallback(
    (options?: TrySessionTriggerOptions) => {
      if (options?.requireCanvasUse && !hasCanvasBeenUsedThisTab()) {
        return;
      }
      if (sessionTriggerFiredRef.current) {
        return;
      }
      if (getAccumulatedActiveMs() < DONATE_REMINDER_ACTIVE_MS_THRESHOLD) {
        return;
      }
      const state = readLocalDonateReminderState();
      if (state.sessionCount < DONATE_REMINDER_MIN_SESSION_COUNT) {
        return;
      }
      if (showReminder("trigger_fifth_session")) {
        sessionTriggerFiredRef.current = true;
      }
    },
    [getAccumulatedActiveMs, showReminder],
  );

  const stopTimer = useCallback(() => {
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
    timerRunningRef.current = false;
    flushPendingActiveMs();
  }, [flushPendingActiveMs]);

  const startActiveTimer = useCallback(() => {
    if (timerRunningRef.current) {
      return;
    }
    timerRunningRef.current = true;
    tickIntervalRef.current = setInterval(() => {
      resetTriggerRefsForNewDay();

      if (!isWindowFocusedAndVisible()) {
        return;
      }

      sessionActiveMsRef.current += TIMER_TICK_MS;
      pendingActiveMsRef.current += TIMER_TICK_MS;

      const now = Date.now();
      if (
        now - lastActiveFlushAtRef.current >=
        ACTIVE_MS_FLUSH_INTERVAL_MS
      ) {
        flushPendingActiveMs();
      }

      const state = readLocalDonateReminderState();
      if (isDonateReminderShownToday(state)) {
        return;
      }

      if (
        !activeUseTriggerFiredRef.current &&
        sessionActiveMsRef.current >= DONATE_REMINDER_ACTIVE_MS_THRESHOLD &&
        getAccumulatedActiveMs() >= DONATE_REMINDER_ACTIVE_MS_THRESHOLD
      ) {
        if (showReminder("trigger_60m")) {
          activeUseTriggerFiredRef.current = true;
        }
        return;
      }

      trySessionTrigger();
    }, TIMER_TICK_MS);
  }, [
    flushPendingActiveMs,
    getAccumulatedActiveMs,
    resetTriggerRefsForNewDay,
    showReminder,
    trySessionTrigger,
  ]);

  const maybeStartActiveTimer = useCallback(() => {
    if (!hasCanvasBeenUsedThisTab()) {
      return;
    }
    resetTriggerRefsForNewDay();
    startActiveTimer();
  }, [resetTriggerRefsForNewDay, startActiveTimer]);

  const onReminderStateExternalChange = useCallback(() => {
    resetTriggerRefsForNewDay();
    blockTriggersForToday();
    maybeStartActiveTimer();
    trySessionTrigger();
  }, [
    blockTriggersForToday,
    maybeStartActiveTimer,
    resetTriggerRefsForNewDay,
    trySessionTrigger,
  ]);

  useEffect(() => {
    if (!isDonateEnabled()) {
      return;
    }
    let cancelled = false;
    void (async () => {
      await prepareDonateReminderState();
      if (!cancelled) {
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !isDonateEnabled()) {
      return;
    }

    resetTriggerRefsForNewDay();
    bumpDonateReminderSessionCount();
    trySessionTrigger({ requireCanvasUse: true });

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        flushPendingActiveMs();
        return;
      }
      onReminderStateExternalChange();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const onWindowFocus = () => {
      onReminderStateExternalChange();
    };
    window.addEventListener("focus", onWindowFocus);

    const onPageHide = () => {
      flushPendingActiveMs();
    };
    window.addEventListener("pagehide", onPageHide);

    const onStorage = (event: StorageEvent) => {
      if (event.key !== DONATE_REMINDER_STORAGE_KEY) {
        return;
      }
      onReminderStateExternalChange();
    };
    window.addEventListener("storage", onStorage);

    const onStateSynced = () => {
      onReminderStateExternalChange();
    };
    window.addEventListener(
      DONATE_REMINDER_STATE_SYNCED_EVENT,
      onStateSynced,
    );

    const onCanvasUsed = () => {
      maybeStartActiveTimer();
    };
    window.addEventListener(CANVAS_USED_SESSION_EVENT, onCanvasUsed);

    dayWatchdogIntervalRef.current = setInterval(() => {
      onReminderStateExternalChange();
    }, DAY_WATCHDOG_MS);

    maybeStartActiveTimer();

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onWindowFocus);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(
        DONATE_REMINDER_STATE_SYNCED_EVENT,
        onStateSynced,
      );
      window.removeEventListener(CANVAS_USED_SESSION_EVENT, onCanvasUsed);
      if (dayWatchdogIntervalRef.current) {
        clearInterval(dayWatchdogIntervalRef.current);
        dayWatchdogIntervalRef.current = null;
      }
      stopTimer();
    };
  }, [
    ready,
    flushPendingActiveMs,
    maybeStartActiveTimer,
    onReminderStateExternalChange,
    resetTriggerRefsForNewDay,
    stopTimer,
    trySessionTrigger,
  ]);

  const handleSupport = useCallback(() => {
    trackDonateReminderSupportClick();
    trackDonateModalOpen("reminder");
    setIsOpen(false);
    onOpenDonateModal();
  }, [onOpenDonateModal]);

  const handleSnoozeMonth = useCallback(() => {
    trackDonateReminderSnoozeMonth();
    void applyDonateReminderSnoozeMonth();
    setIsOpen(false);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  if (!isDonateEnabled()) {
    return {
      isOpen: false,
      handleSupport: noop,
      handleSnoozeMonth: noop,
      handleClose: noop,
    };
  }

  return {
    isOpen,
    handleSupport,
    handleSnoozeMonth,
    handleClose,
  };
};
