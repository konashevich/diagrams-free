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
  DONATE_REMINDER_MIN_SESSION_COUNT,
  DONATE_REMINDER_STATE_SYNCED_EVENT,
  getReminderEligibility,
  isDonateReminderShownToday,
  isDonateReminderSuppressed,
  persistDonateReminderShownToDrive,
  prepareDonateReminderState,
  tryMarkDonateReminderShownLocal,
  type ReminderTrigger,
} from "./donateReminderService";
import {
  DONATE_REMINDER_STORAGE_KEY,
  readLocalDonateReminderState,
} from "./donateReminderState";
import { advanceDonateReminderTick } from "./donateReminderTick";

const TIMER_TICK_MS = 1000;
const ACTIVE_MS_FLUSH_INTERVAL_MS = 30 * 1000;
const DAY_WATCHDOG_MS = 60 * 1000;

type Options = {
  onOpenDonateModal: () => void;
};

const noop = () => {};

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
  const onOpenDonateModalRef = useRef(onOpenDonateModal);

  onOpenDonateModalRef.current = onOpenDonateModal;
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

  const trySessionTrigger = useCallback(() => {
    if (!hasCanvasBeenUsedThisTab()) {
      return;
    }
    if (sessionTriggerFiredRef.current) {
      return;
    }
    const state = readLocalDonateReminderState();
    if (state.sessionCount < DONATE_REMINDER_MIN_SESSION_COUNT) {
      return;
    }
    if (showReminder("trigger_fifth_session")) {
      sessionTriggerFiredRef.current = true;
    }
  }, [showReminder]);

  const stopTimer = useCallback(() => {
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
    timerRunningRef.current = false;
    flushPendingActiveMs();
  }, [flushPendingActiveMs]);

  const stopTimerRef = useRef(stopTimer);
  stopTimerRef.current = stopTimer;

  const runTimerTick = useCallback(() => {
    resetTriggerRefsForNewDay();

    const state = readLocalDonateReminderState();
    if (isDonateReminderSuppressed(state)) {
      stopTimerRef.current();
      return;
    }

    const tick = advanceDonateReminderTick({
      visibilityState: document.visibilityState,
      hasFocus: document.hasFocus(),
      state,
      sessionActiveMs: sessionActiveMsRef.current,
      pendingActiveMs: pendingActiveMsRef.current,
      activeUseTriggerFired: activeUseTriggerFiredRef.current,
      sessionTriggerFired: sessionTriggerFiredRef.current,
      canvasUsedThisTab: hasCanvasBeenUsedThisTab(),
      tickMs: TIMER_TICK_MS,
    });

    if (!tick.accrueTime) {
      return;
    }

    sessionActiveMsRef.current = tick.sessionActiveMs;
    pendingActiveMsRef.current = tick.pendingActiveMs;

    const now = Date.now();
    if (
      now - lastActiveFlushAtRef.current >=
      ACTIVE_MS_FLUSH_INTERVAL_MS
    ) {
      flushPendingActiveMs();
    }

    if (tick.attemptTrigger60m) {
      if (showReminder("trigger_60m")) {
        activeUseTriggerFiredRef.current = true;
      }
      return;
    }

    if (tick.attemptFifthSession) {
      trySessionTrigger();
    }
  }, [
    flushPendingActiveMs,
    resetTriggerRefsForNewDay,
    showReminder,
    trySessionTrigger,
  ]);

  const runTimerTickRef = useRef(runTimerTick);
  runTimerTickRef.current = runTimerTick;

  const startActiveTimer = useCallback(() => {
    if (isDonateReminderSuppressed(readLocalDonateReminderState())) {
      stopTimerRef.current();
      return;
    }
    if (timerRunningRef.current) {
      return;
    }
    timerRunningRef.current = true;
    tickIntervalRef.current = setInterval(() => {
      runTimerTickRef.current();
    }, TIMER_TICK_MS);
  }, []);

  const maybeStartActiveTimer = useCallback(() => {
    if (!hasCanvasBeenUsedThisTab()) {
      return;
    }
    if (isDonateReminderSuppressed(readLocalDonateReminderState())) {
      stopTimerRef.current();
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
  }, [blockTriggersForToday, maybeStartActiveTimer, resetTriggerRefsForNewDay, trySessionTrigger]);

  const onReminderStateExternalChangeRef = useRef(onReminderStateExternalChange);
  onReminderStateExternalChangeRef.current = onReminderStateExternalChange;

  const flushPendingActiveMsRef = useRef(flushPendingActiveMs);
  flushPendingActiveMsRef.current = flushPendingActiveMs;

  const maybeStartActiveTimerRef = useRef(maybeStartActiveTimer);
  maybeStartActiveTimerRef.current = maybeStartActiveTimer;

  const trySessionTriggerRef = useRef(trySessionTrigger);
  trySessionTriggerRef.current = trySessionTrigger;

  const resetTriggerRefsForNewDayRef = useRef(resetTriggerRefsForNewDay);
  resetTriggerRefsForNewDayRef.current = resetTriggerRefsForNewDay;

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

    resetTriggerRefsForNewDayRef.current();
    bumpDonateReminderSessionCount();
    trySessionTriggerRef.current();

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        flushPendingActiveMsRef.current();
        return;
      }
      onReminderStateExternalChangeRef.current();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const onWindowFocus = () => {
      onReminderStateExternalChangeRef.current();
    };
    window.addEventListener("focus", onWindowFocus);

    const onPageHide = () => {
      flushPendingActiveMsRef.current();
    };
    window.addEventListener("pagehide", onPageHide);

    const onStorage = (event: StorageEvent) => {
      if (event.key !== DONATE_REMINDER_STORAGE_KEY) {
        return;
      }
      onReminderStateExternalChangeRef.current();
    };
    window.addEventListener("storage", onStorage);

    const onStateSynced = () => {
      onReminderStateExternalChangeRef.current();
    };
    window.addEventListener(
      DONATE_REMINDER_STATE_SYNCED_EVENT,
      onStateSynced,
    );

    const onCanvasUsed = () => {
      maybeStartActiveTimerRef.current();
    };
    window.addEventListener(CANVAS_USED_SESSION_EVENT, onCanvasUsed);

    dayWatchdogIntervalRef.current = setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }
      onReminderStateExternalChangeRef.current();
    }, DAY_WATCHDOG_MS);

    maybeStartActiveTimerRef.current();

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
      stopTimerRef.current();
    };
  }, [ready]);

  const handleSupport = useCallback(() => {
    trackDonateReminderSupportClick();
    trackDonateModalOpen("reminder");
    setIsOpen(false);
    onOpenDonateModalRef.current();
  }, []);

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
