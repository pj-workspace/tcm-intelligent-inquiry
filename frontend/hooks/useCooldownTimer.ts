/**
 * @fileoverview 通用秒级倒计时 Hook，用于验证码重发等冷却场景。
 */
"use client";

import { useCallback, useEffect, useState } from "react";

/** 发送验证码等场景的秒级倒计时。 */
export function useCooldownTimer() {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return undefined;
    const id = window.setTimeout(() => {
      setLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearTimeout(id);
  }, [left]);
  const start = useCallback((seconds: number) => {
    setLeft(seconds);
  }, []);
  return { left, start };
}
