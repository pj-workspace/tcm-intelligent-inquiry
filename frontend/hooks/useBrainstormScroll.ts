/**
 * @fileoverview 头脑风暴 trace 面板滚动：展开定位、流式跟随与边缘渐隐。
 */
"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { WheelEvent, RefObject } from "react";
import type { BrainstormStep, EdgeFadeState } from "@/types/brainstorm";
import { getEdgeFadeState } from "@/lib/brainstorm-utils";
import {
  useTransientScrollbar,
  type TransientScrollbarState,
} from "@/hooks/useTransientScrollbar";

interface UseBrainstormScrollOptions {
  steps: BrainstormStep[];
  isOpen: boolean;
  isStreaming: boolean;
}

interface UseBrainstormScrollReturn {
  scrollRef: RefObject<HTMLDivElement | null>;
  edgeFade: EdgeFadeState;
  scrollbar: TransientScrollbarState;
  onScroll: () => void;
  onWheel: (e: WheelEvent<HTMLDivElement>) => void;
}

/** 管理头脑风暴步骤列表的滚动容器、边缘渐隐与 wheel 冒泡隔离。 */
export function useBrainstormScroll({
  steps,
  isOpen,
  isStreaming,
}: UseBrainstormScrollOptions): UseBrainstormScrollReturn {
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoFollowRef = useRef(true);
  const lastScrollTopRef = useRef(0);
  /** 用于检测「刚从收起变为展开」，此时按 trace 状态选择默认位置 */
  const wasOpenRef = useRef(false);
  const [edgeFade, setEdgeFade] = useState<EdgeFadeState>({
    top: false,
    bottom: false,
  });
  const { scrollbar, refreshScrollbar } = useTransientScrollbar(scrollRef, {
    minThumbHeight: 22,
  });

  const scrollToEnd = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    lastScrollTopRef.current = el.scrollTop;
    setEdgeFade(getEdgeFadeState(el));
    refreshScrollbar();
  }, [refreshScrollbar]);

  const scrollToStart = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
    lastScrollTopRef.current = 0;
    setEdgeFade(getEdgeFadeState(el));
    refreshScrollbar();
  }, [refreshScrollbar]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const currentTop = el.scrollTop;
    refreshScrollbar();
    const prevTop = lastScrollTopRef.current;
    const userScrolledUp = currentTop < prevTop - 2;
    if (userScrolledUp) {
      // 用户一旦手动上滚 → 锁死跟随关闭，直到 trace 重新折叠/展开（justOpened 路径）
      // 才会重新激活。这避免了用户已经在底部附近手动滚一点点 → 新 step 来又被拉回的"被扯回去"体验。
      autoFollowRef.current = false;
    }
    lastScrollTopRef.current = currentTop;
    const nextFade = getEdgeFadeState(el);
    setEdgeFade((prev) =>
      prev.top === nextFade.top && prev.bottom === nextFade.bottom
        ? prev
        : nextFade
    );
  }, [refreshScrollbar]);

  const onWheel = useCallback((e: WheelEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    const atTop = el.scrollTop === 0;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) return;
    e.stopPropagation();
  }, []);

  // 刚从收起展开：
  // - 流式中：拉到底，让最新 step 可见；
  // - 已完成：回到顶部，符合用户回看完整 trace 的阅读预期。
  useLayoutEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }
    const justOpened = !wasOpenRef.current;
    wasOpenRef.current = true;
    if (!justOpened) return;
    autoFollowRef.current = isStreaming;
    const settleScroll = isStreaming ? scrollToEnd : scrollToStart;
    settleScroll();
    let cancelled = false;
    const raf1 = requestAnimationFrame(() => {
      if (cancelled) return;
      settleScroll();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
    };
  }, [isOpen, isStreaming, scrollToEnd, scrollToStart]);

  // 外层头脑风暴滚动区：内容变化时，**仅当 autoFollow 仍开启**才滚到底。
  // 不再因"距底部很近"就自动重启 autoFollow ——用户已经主动上滑（onScroll 把
  // autoFollow 关了）后，新 step 来不再把他拽回去。
  useEffect(() => {
    if (!isOpen) return;
    const el = scrollRef.current;
    if (!el) return;
    if (isStreaming && autoFollowRef.current) {
      el.scrollTop = el.scrollHeight;
      lastScrollTopRef.current = el.scrollTop;
      refreshScrollbar();
    }
    setEdgeFade(getEdgeFadeState(el));
  }, [steps, isOpen, isStreaming, refreshScrollbar]);

  useEffect(() => {
    if (!isOpen) return;
    const el = scrollRef.current;
    if (!el) return;
    setEdgeFade(getEdgeFadeState(el));
    refreshScrollbar(false);
  }, [isOpen, refreshScrollbar]);

  return { scrollRef, edgeFade, scrollbar, onScroll, onWheel };
}
