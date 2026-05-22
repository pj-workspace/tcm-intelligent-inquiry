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

interface UseBrainstormScrollOptions {
  steps: BrainstormStep[];
  isOpen: boolean;
}

interface UseBrainstormScrollReturn {
  scrollRef: RefObject<HTMLDivElement | null>;
  edgeFade: EdgeFadeState;
  onScroll: () => void;
  onWheel: (e: WheelEvent<HTMLDivElement>) => void;
}

export function useBrainstormScroll({
  steps,
  isOpen,
}: UseBrainstormScrollOptions): UseBrainstormScrollReturn {
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoFollowRef = useRef(true);
  const lastScrollTopRef = useRef(0);
  /** 用于检测「刚从收起变为展开」，此时应强制滚到底 */
  const wasOpenRef = useRef(false);
  const [edgeFade, setEdgeFade] = useState<EdgeFadeState>({
    top: false,
    bottom: false,
  });

  const scrollToEnd = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    lastScrollTopRef.current = el.scrollTop;
    setEdgeFade(getEdgeFadeState(el));
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const currentTop = el.scrollTop;
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
  }, []);

  const onWheel = useCallback((e: WheelEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    const atTop = el.scrollTop === 0;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) return;
    e.stopPropagation();
  }, []);

  // 刚从收起展开：把内部 scroll 拉到底，让最新 step 可见。
  // 仅做"同步 + 单次 rAF"两次 scrollToEnd——之前的 4 次（rAF1 → rAF2 → setTimeout 280ms）
  // 会在用户展开后立刻想上滑时把他强制扯回底部。
  useLayoutEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }
    const justOpened = !wasOpenRef.current;
    wasOpenRef.current = true;
    if (!justOpened) return;
    autoFollowRef.current = true;
    scrollToEnd();
    let cancelled = false;
    const raf1 = requestAnimationFrame(() => {
      if (cancelled) return;
      scrollToEnd();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
    };
  }, [isOpen, scrollToEnd]);

  // 外层头脑风暴滚动区：内容变化时，**仅当 autoFollow 仍开启**才滚到底。
  // 不再因"距底部很近"就自动重启 autoFollow ——用户已经主动上滑（onScroll 把
  // autoFollow 关了）后，新 step 来不再把他拽回去。
  useEffect(() => {
    if (!isOpen) return;
    const el = scrollRef.current;
    if (!el) return;
    if (autoFollowRef.current) {
      el.scrollTop = el.scrollHeight;
      lastScrollTopRef.current = el.scrollTop;
    }
    setEdgeFade(getEdgeFadeState(el));
  }, [steps, isOpen, scrollToEnd]);

  useEffect(() => {
    if (!isOpen) return;
    const el = scrollRef.current;
    if (!el) return;
    setEdgeFade(getEdgeFadeState(el));
  }, [isOpen]);

  return { scrollRef, edgeFade, onScroll, onWheel };
}
