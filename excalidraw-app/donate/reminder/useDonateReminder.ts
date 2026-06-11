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
  applyDonateReminderSnoozeMonth,
  bumpDonateReminderSessionCount,
  consumeDonateThanksUrl,
  getReminderEligibility,
  markDonateReminderShownLocal,
  persistDonateReminderShownToDrive,
  prepareDonateReminderState,
  type ReminderTrigger,
} from "./donateReminderService";
import { readLocalDonateReminderState } from "./donateReminderState";

const ACTIVE_MS_THRESHOLD = 30 * 60 * 1000;
const TIMER_TICK_MS = 1000;

type Options = {
  onOpenDonateModal: () => void;
};

const noop = () => {};

export const useDonateReminder = ({ onOpenDonateModal }: Options) => {
  const [isOpen, setIsOpen] = useState(false);
  const [ready, setReady] = useState(!isDonateEnabled());
  const activeMsRef = useRef(0);
  const timerRunningRef = useRef(false);
  const trigger30mFiredRef = useRef(false);
  const secondSessionCheckedRef = useRef(false);
  const isOpenRef = useRef(false);
  const visibilityVisibleRef = useRef(
    typeof document !== "undefined"
      ? document.visibilityState === "visible"
      : true,
  );
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const showReminder = useCallback((trigger: ReminderTrigger) => {
    if (isOpenRef.current) {
      return;
    }
    const state = readLocalDonateReminderState();
    const eligible = getReminderEligibility(state, {
      trigger30mReady: trigger === "trigger_30m",
      checkSecondSession: trigger === "trigger_second_session",
    });
    if (!eligible) {
      return;
    }
    markDonateReminderShownLocal();
    trackDonateReminderShown(trigger);
    void persistDonateReminderShownToDrive();
    setIsOpen(true);
  }, []);

  const stopTimer = useCallback(() => {
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
    timerRunningRef.current = false;
  }, []);

  const startActiveTimer = useCallback(() => {
    if (timerRunningRef.current || trigger30mFiredRef.current) {
      return;
    }
    timerRunningRef.current = true;
    tickIntervalRef.current = setInterval(() => {
      if (!visibilityVisibleRef.current) {
        return;
      }
      activeMsRef.current += TIMER_TICK_MS;
      if (
        !trigger30mFiredRef.current &&
        activeMsRef.current >= ACTIVE_MS_THRESHOLD
      ) {
        trigger30mFiredRef.current = true;
        stopTimer();
        showReminder("trigger_30m");
      }
    }, TIMER_TICK_MS);
  }, [showReminder, stopTimer]);

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

    const state = readLocalDonateReminderState();
    if (!secondSessionCheckedRef.current && state.sessionCount >= 2) {
      secondSessionCheckedRef.current = true;
      showReminder("trigger_second_session");
    }

    const onVisibilityChange = () => {
      visibilityVisibleRef.current = document.visibilityState === "visible";
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
  }, [ready, showReminder, startActiveTimer, stopTimer]);

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
