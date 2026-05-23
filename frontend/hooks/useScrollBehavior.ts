/**
 * @fileoverview 主聊天区滚动行为：自动跟随、回到底部 FAB 与 transient 滚动条。
 */
"use client";

import type { MutableRefObject } from "react";
import { useRef, useState, useCallback, startTransition } from "react";
import { useTransientScrollbar } from "@/hooks/useTransientScrollbar";

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
  const {
    scrollbar: mainScrollbar,
    refreshScrollbar: refreshMainScrollbar,
    hideScrollbar: hideMainScrollbar,
  } = useTransientScrollbar(scrollViewportRef);

  const updateScrollState = useCallback(() => {
    const el = scrollViewportRef.current;
    if (!el) return;
    const currentTop = el.scrollTop;
    refreshMainScrollbar();
    const prevTop = lastMainScrollTopRef.current;
    // distance 以 messagesEndRef 的 bottom 为锚，而非 `scrollHeight` 最底。
    // messagesEndRef 紧跟最后一条消息，用它做锚点可以避开输入框 padding 对底部判断的干扰。
    const endEl = messagesEndRef.current;
    const usefulBottom = endEl
      ? endEl.offsetTop + endEl.offsetHeight
      : el.scrollHeight;
    const distance = usefulBottom - currentTop - el.clientHeight;
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
  }, [hasStartedRef, refreshMainScrollbar]);

  /**
   * 滚到最后一条消息后的稳定锚点，而不是滚到整个 scrollHeight。
   * 底部安全距离只由 messagesEndRef 提供，避免再和滚动容器 padding-bottom 叠加出空白。
   */
  const scrollToBottom = useCallback(
    (smooth: boolean) => {
      const endEl = messagesEndRef.current;
      if (endEl) {
        endEl.scrollIntoView({
          behavior: smooth ? "smooth" : "auto",
          block: "end",
        });
        requestAnimationFrame(updateScrollState);
        return;
      }
      const el = scrollViewportRef.current;
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
        requestAnimationFrame(updateScrollState);
      }
    },
    [updateScrollState]
  );

  const markUserScrollIntent = useCallback(() => {
    autoFollowMainRef.current = false;
  }, []);

  const resetScrollState = useCallback(() => {
    scrollFabVisibleRef.current = false;
    setShowScrollToBottom(false);
    hideMainScrollbar();
    autoFollowMainRef.current = true;
    isNearBottomRef.current = true;
    lastMainScrollTopRef.current = 0;
  }, [hideMainScrollbar]);

  return {
    scrollViewportRef,
    messagesEndRef,
    autoFollowMainRef,
    isNearBottomRef,
    mainScrollbar,
    showScrollToBottom,
    updateScrollState,
    scrollToBottom,
    markUserScrollIntent,
    resetScrollState,
  };
}
