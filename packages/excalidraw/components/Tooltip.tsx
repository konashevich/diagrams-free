import React, { useEffect, useRef, useState } from "react";

import "./Tooltip.scss";

export const getTooltipDiv = () => {
  const existingDiv = document.querySelector<HTMLDivElement>(
    ".excalidraw-tooltip",
  );
  if (existingDiv) {
    return existingDiv;
  }
  const div = document.createElement("div");
  document.body.appendChild(div);
  div.classList.add("excalidraw-tooltip");
  return div;
};

export const hideTooltip = () => {
  getTooltipDiv().classList.remove("excalidraw-tooltip--visible");
};

export const updateTooltipPosition = (
  tooltip: HTMLDivElement,
  item: {
    left: number;
    top: number;
    width: number;
    height: number;
  },
  position: "bottom" | "top" = "bottom",
) => {
  const tooltipRect = tooltip.getBoundingClientRect();

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const margin = 5;

  let left = item.left + item.width / 2 - tooltipRect.width / 2;
  if (left < 0) {
    left = margin;
  } else if (left + tooltipRect.width >= viewportWidth) {
    left = viewportWidth - tooltipRect.width - margin;
  }

  let top: number;

  if (position === "bottom") {
    top = item.top + item.height + margin;
    if (top + tooltipRect.height >= viewportHeight) {
      top = item.top - tooltipRect.height - margin;
    }
  } else {
    top = item.top - tooltipRect.height - margin;
    if (top < 0) {
      top = item.top + item.height + margin;
    }
  }

  Object.assign(tooltip.style, {
    top: `${top}px`,
    left: `${left}px`,
  });
};

const updateTooltip = (
  item: HTMLDivElement,
  tooltip: HTMLDivElement,
  label: string,
  long: boolean,
) => {
  tooltip.classList.add("excalidraw-tooltip--visible");
  tooltip.style.minWidth = long ? "50ch" : "10ch";
  tooltip.style.maxWidth = long ? "50ch" : "15ch";

  tooltip.textContent = label;

  const itemRect = item.getBoundingClientRect();
  updateTooltipPosition(tooltip, itemRect);
};

export const showTooltipForElement = (
  item: HTMLDivElement,
  label: string,
  long = false,
) => {
  updateTooltip(item, getTooltipDiv(), label, long);
};

type TooltipProps = {
  children: React.ReactNode;
  label: string;
  long?: boolean;
  style?: React.CSSProperties;
  disabled?: boolean;
  /** Tap/click toggles the tooltip until dismissed (useful on touch devices). */
  clickToToggle?: boolean;
};

export const Tooltip = ({
  children,
  label,
  long = false,
  style,
  disabled,
  clickToToggle = false,
}: TooltipProps) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    return () => hideTooltip();
  }, []);

  useEffect(() => {
    if (!pinned) {
      return;
    }
    const dismissPinned = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        hideTooltip();
        setPinned(false);
      }
    };
    document.addEventListener("pointerdown", dismissPinned);
    return () => document.removeEventListener("pointerdown", dismissPinned);
  }, [pinned]);

  if (disabled) {
    return null;
  }

  const show = () => {
    if (wrapperRef.current) {
      showTooltipForElement(wrapperRef.current, label, long);
    }
  };

  const hide = () => {
    if (!pinned) {
      hideTooltip();
    }
  };

  return (
    <div
      ref={wrapperRef}
      className="excalidraw-tooltip-wrapper"
      onPointerEnter={show}
      onPointerLeave={hide}
      onFocusCapture={show}
      onBlurCapture={(event) => {
        if (!wrapperRef.current?.contains(event.relatedTarget as Node)) {
          hideTooltip();
          setPinned(false);
        }
      }}
      onClick={() => {
        if (!clickToToggle) {
          return;
        }
        if (pinned) {
          hideTooltip();
          setPinned(false);
          return;
        }
        show();
        setPinned(true);
      }}
      style={style}
    >
      {children}
    </div>
  );
};
