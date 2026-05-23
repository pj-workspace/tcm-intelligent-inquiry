"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

export type TransientScrollbarState = {
  visible: boolean;
  thumbTop: number;
  thumbHeight: number;
};

const HIDDEN_SCROLLBAR: TransientScrollbarState = {
  visible: false,
  thumbTop: 0,
  thumbHeight: 0,
};

type UseTransientScrollbarOptions = {
  hideDelayMs?: number;
  minThumbHeight?: number;
};

/**
 * 原生滚动条被全局隐藏时，用轻量 overlay thumb 表达滚动位置。
 * 仅在滚动/自动定位后短暂显示，避免常驻 UI 噪音。
 */
export function useTransientScrollbar(
  scrollRef: RefObject<HTMLElement | null>,
  {
    hideDelayMs = 750,
    minThumbHeight = 28,
  }: UseTransientScrollbarOptions = {},
) {
  const hideTimerRef = useRef<number | null>(null);
  const [scrollbar, setScrollbar] =
    useState<TransientScrollbarState>(HIDDEN_SCROLLBAR);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current == null) return;
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }, []);

  const refreshScrollbar = useCallback(
    (show: boolean = true) => {
      const el = scrollRef.current;
      if (!el) return;

      const scrollableHeight = el.scrollHeight - el.clientHeight;
      if (scrollableHeight <= 1) {
        clearHideTimer();
        setScrollbar(HIDDEN_SCROLLBAR);
        return;
      }

      const rawThumbHeight = (el.clientHeight / el.scrollHeight) * el.clientHeight;
      const thumbHeight = Math.min(
        el.clientHeight,
        Math.max(minThumbHeight, rawThumbHeight),
      );
      const maxThumbTop = Math.max(0, el.clientHeight - thumbHeight);
      const thumbTop =
        scrollableHeight > 0
          ? (el.scrollTop / scrollableHeight) * maxThumbTop
          : 0;

      setScrollbar({
        visible: show,
        thumbTop,
        thumbHeight,
      });

      if (!show) return;
      clearHideTimer();
      hideTimerRef.current = window.setTimeout(() => {
        setScrollbar((prev) => ({ ...prev, visible: false }));
        hideTimerRef.current = null;
      }, hideDelayMs);
    },
    [clearHideTimer, hideDelayMs, minThumbHeight, scrollRef],
  );

  const hideScrollbar = useCallback(() => {
    clearHideTimer();
    setScrollbar((prev) =>
      prev.visible ? { ...prev, visible: false } : prev,
    );
  }, [clearHideTimer]);

  useEffect(() => clearHideTimer, [clearHideTimer]);

  return { scrollbar, refreshScrollbar, hideScrollbar };
}
