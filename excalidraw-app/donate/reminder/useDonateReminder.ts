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
  getReminderEligibility,
  markDonateReminderShownLocal,
  persistDonateReminderShownToDrive,
  prepareDonateReminderState,
  type ReminderTrigger,
} from "./donateReminderService";
import { readLocalDonateReminderState } from "./donateReminderState";

const TIMER_TICK_MS = 1000;
const ACTIVE_MS_FLUSH_INTERVAL_MS = 30 * 1000;

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
  const visibilityVisibleRef = useRef(
    typeof document !== "undefined"
      ? document.visibilityState === "visible"
      : true,
  );
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

  const showReminder = useCallback((trigger: ReminderTrigger) => {
    if (isOpenRef.current) {
      return;
    }
    flushPendingActiveMs();
    const state = readLocalDonateReminderState();
    const eligible = getReminderEligibility(state, {
      triggerActiveUseReady: trigger === "trigger_60m",
      checkSecondSession: trigger === "trigger_second_session",
    });
    if (!eligible) {
      return;
    }
    markDonateReminderShownLocal();
    trackDonateReminderShown(trigger);
    void persistDonateReminderShownToDrive();
    setIsOpen(true);
  }, [flushPendingActiveMs]);

  const trySessionTrigger = useCallback(() => {
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
    sessionTriggerFiredRef.current = true;
    showReminder("trigger_second_session");
  }, [getAccumulatedActiveMs, showReminder]);

  const stopTimer = useCallback(() => {
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
    timerRunningRef.current = false;
    flushPendingActiveMs();
  }, [flushPendingActiveMs]);

  const startActiveTimer = useCallback(() => {
    if (timerRunningRef.current || activeUseTriggerFiredRef.current) {
      return;
    }
    timerRunningRef.current = true;
    tickIntervalRef.current = setInterval(() => {
      if (!visibilityVisibleRef.current) {
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

      if (
        !activeUseTriggerFiredRef.current &&
        sessionActiveMsRef.current >= DONATE_REMINDER_ACTIVE_MS_THRESHOLD
      ) {
        activeUseTriggerFiredRef.current = true;
        stopTimer();
        showReminder("trigger_60m");
        return;
      }

      trySessionTrigger();
    }, TIMER_TICK_MS);
  }, [flushPendingActiveMs, showReminder, stopTimer, trySessionTrigger]);

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

    bumpDonateReminderSessionCount();
    trySessionTrigger();

    const onVisibilityChange = () => {
      const visible = document.visibilityState === "visible";
      visibilityVisibleRef.current = visible;
      if (!visible) {
        flushPendingActiveMs();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const onCanvasUsed = () => {
      startActiveTimer();
    };
    window.addEventListener(CANVAS_USED_SESSION_EVENT, onCanvasUsed);
    if (hasCanvasBeenUsedThisTab()) {
      startActiveTimer();
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener(CANVAS_USED_SESSION_EVENT, onCanvasUsed);
      stopTimer();
    };
  }, [
    ready,
    flushPendingActiveMs,
    showReminder,
    startActiveTimer,
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
