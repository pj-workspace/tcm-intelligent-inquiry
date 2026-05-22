"use client";

import type { MutableRefObject } from "react";
import { useRef, useState, useCallback, startTransition } from "react";

/** 生成中：距底部小于该值则恢复自动跟随（略宽松，避免正文开始时跟丢） */
const BOTTOM_SCROLL_THRESHOLD = 200;
/** 空闲时：距底部小于该值视为在底部，用于隐藏「回到底部」、滚动事件里恢复跟随 */
const BOTTOM_LOCK_THRESHOLD = 72;
/** FAB：离开底部超过该距离（px）才显示，避免贴底临界抖动 */
const FAB_SHOW_DISTANCE_PX = 76;
/** FAB：距底部小于该距离（px）必隐藏；与上一项形成滞回带 */
const FAB_HIDE_DISTANCE_PX = 52;

/** `hasStartedRef` 由页面在 `useChat` 之后同步，避免 hook 调用顺序（scroll 需在 chat 之前）导致写死 false */
export function useScrollBehavior(hasStartedRef: MutableRefObject<boolean>) {
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const autoFollowMainRef = useRef(true);
  const isNearBottomRef = useRef(true);
  const lastMainScrollTopRef = useRef(0);
  /** 与 React state 同步，用于 FAB 滞回带内保持上一帧可见性 */
  const scrollFabVisibleRef = useRef(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollViewportRef.current;
    if (!el) return;
    const currentTop = el.scrollTop;
    const prevTop = lastMainScrollTopRef.current;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const userScrolledUp = currentTop < prevTop - 2;
    const atBottom = distance <= BOTTOM_LOCK_THRESHOLD;
    const isNearBottom = distance <= BOTTOM_SCROLL_THRESHOLD;
    // 内容高度骤降（如头脑风暴收起）时 scrollTop 会被钳位变小，并非用户上滑
    if (userScrolledUp && distance > BOTTOM_LOCK_THRESHOLD) {
      autoFollowMainRef.current = false;
    } else if (atBottom) {
      autoFollowMainRef.current = true;
    }
    lastMainScrollTopRef.current = currentTop;
    isNearBottomRef.current = isNearBottom;

    const started = hasStartedRef.current;
    let nextFab = scrollFabVisibleRef.current;
    if (!started) {
      nextFab = false;
    } else if (distance >= FAB_SHOW_DISTANCE_PX) {
      nextFab = true;
    } else if (distance <= FAB_HIDE_DISTANCE_PX) {
      nextFab = false;
    }

    if (nextFab !== scrollFabVisibleRef.current) {
      scrollFabVisibleRef.current = nextFab;
      // 收起：同步更新，避免低优先级过渡与滚到底「撞帧」造成一顿；展开：仍用 transition 让滚动优先
      if (nextFab) {
        startTransition(() => setShowScrollToBottom(true));
      } else {
        setShowScrollToBottom(false);
      }
    }
  }, [hasStartedRef]);

  const scrollToBottom = useCallback(
    (smooth: boolean) => {
      const el = scrollViewportRef.current;
      if (!el) {
        messagesEndRef.current?.scrollIntoView({
          behavior: smooth ? "smooth" : "auto",
          block: "end",
        });
        return;
      }
      el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
      requestAnimationFrame(updateScrollState);
    },
    [updateScrollState]
  );

  const resetScrollState = useCallback(() => {
    scrollFabVisibleRef.current = false;
    setShowScrollToBottom(false);
    autoFollowMainRef.current = true;
    isNearBottomRef.current = true;
    lastMainScrollTopRef.current = 0;
  }, []);

  return {
    scrollViewportRef,
    messagesEndRef,
    autoFollowMainRef,
    isNearBottomRef,
    showScrollToBottom,
    updateScrollState,
    scrollToBottom,
    resetScrollState,
  };
}
